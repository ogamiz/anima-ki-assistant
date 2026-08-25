(() => {
  'use strict';

  const STATS = ['FUE', 'DES', 'AGI', 'CON', 'POD', 'VOL'];
  const STORAGE_KEY = 'anima-ki-assistant-v1';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const sumStats = (obj) => STATS.reduce((sum, stat) => sum + Number(obj?.[stat] || 0), 0);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function statObject(value = 0) {
    return Object.fromEntries(STATS.map(stat => [stat, value]));
  }

  function defaultState() {
    return {
      version: 2,
      characterName: 'Personaje',
      round: 1,
      characteristics: statObject(10),
      purchasedAccumulation: statObject(0),
      accumulated: statObject(0),
      selectedAccumulation: statObject(true),
      totalKi: 60,
      spentKi: 0,
      accumulationMode: 'full',
      fullAccumulationAdvantage: false,
      agon: {
        enabled: false,
        perRound: 1,
        recoveredToday: 0,
        dailyMax: 80
      },
      techniques: [],
      history: [],
      lastRoundUndo: null
    };
  }

  let state = loadState();
  let toastTimer;

  function normalizeState(raw) {
    const base = defaultState();
    const s = { ...base, ...raw };
    s.characteristics = { ...base.characteristics, ...(raw?.characteristics || {}) };
    s.purchasedAccumulation = { ...base.purchasedAccumulation, ...(raw?.purchasedAccumulation || {}) };
    s.accumulated = { ...base.accumulated, ...(raw?.accumulated || {}) };
    s.selectedAccumulation = { ...base.selectedAccumulation, ...(raw?.selectedAccumulation || {}) };
    s.agon = { ...base.agon, ...(raw?.agon || {}) };
    s.techniques = Array.isArray(raw?.techniques) ? raw.techniques.map(t => ({
      id: t.id || uid(),
      name: t.name || 'Técnica',
      level: clamp(Number(t.level || 1), 1, 3),
      cost: { ...statObject(0), ...(t.cost || {}) },
      maintained: Boolean(t.maintained),
      maintenance: { ...statObject(0), ...(t.maintenance || {}) },
      active: Boolean(t.active)
    })) : [];
    s.history = Array.isArray(raw?.history) ? raw.history.slice(0, 200) : [];
    s.lastRoundUndo = raw?.lastRoundUndo && typeof raw.lastRoundUndo === 'object' ? {
      round: Math.max(1, Number(raw.lastRoundUndo.round || 1)),
      accumulated: { ...statObject(0), ...(raw.lastRoundUndo.accumulated || {}) },
      spentKi: Math.max(0, Number(raw.lastRoundUndo.spentKi || 0)),
      agonRecoveredToday: Math.max(0, Number(raw.lastRoundUndo.agonRecoveredToday || 0)),
      history: Array.isArray(raw.lastRoundUndo.history) ? raw.lastRoundUndo.history.slice(0, 200) : []
    } : null;
    s.version = 2;
    s.round = Math.max(1, Number(s.round || 1));
    s.totalKi = Math.max(0, Number(s.totalKi || 0));
    s.spentKi = clamp(Number(s.spentKi || 0), 0, s.totalKi);
    STATS.forEach(stat => {
      s.characteristics[stat] = clamp(Number(s.characteristics[stat] || 1), 1, 30);
      s.purchasedAccumulation[stat] = clamp(Number(s.purchasedAccumulation[stat] || 0), 0, 30);
      s.accumulated[stat] = Math.max(0, Number(s.accumulated[stat] || 0));
      s.selectedAccumulation[stat] = Boolean(s.selectedAccumulation[stat]);
    });
    repairInvariant(s);
    return s;
  }

  function repairInvariant(s = state) {
    const concentrated = sumStats(s.accumulated);
    if (concentrated + s.spentKi > s.totalKi) {
      // Preserve already concentrated Ki first; shrink spent Ki if the imported file is inconsistent.
      s.spentKi = Math.max(0, s.totalKi - concentrated);
      if (concentrated > s.totalKi) {
        let excess = concentrated - s.totalKi;
        [...STATS].reverse().forEach(stat => {
          if (excess <= 0) return;
          const take = Math.min(s.accumulated[stat], excess);
          s.accumulated[stat] -= take;
          excess -= take;
        });
      }
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : defaultState();
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function baseAccumulation(characteristic) {
    const v = Number(characteristic);
    if (v >= 16) return 4;
    if (v >= 13) return 3;
    if (v >= 10) return 2;
    return 1;
  }

  function effectiveAccumulation(stat) {
    return baseAccumulation(state.characteristics[stat]) + state.purchasedAccumulation[stat];
  }

  function concentratedKi() {
    return sumStats(state.accumulated);
  }

  function freeKi() {
    return Math.max(0, state.totalKi - state.spentKi - concentratedKi());
  }

  function activeMaintenance() {
    return state.techniques.filter(t => t.active && t.maintained).reduce((sum, t) => sum + sumStats(t.maintenance), 0);
  }

  function addHistory(delta, text, round = state.round) {
    state.history.unshift({ id: uid(), round, delta, text, ts: Date.now() });
    state.history = state.history.slice(0, 200);
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function spendFromFree(amount, reason, round = state.round) {
    amount = Math.max(0, Number(amount || 0));
    const spendable = Math.min(amount, freeKi());
    if (spendable <= 0) return 0;
    state.spentKi += spendable;
    addHistory(-spendable, reason, round);
    return spendable;
  }

  function recoverSpent(amount, reason, round = state.round) {
    amount = Math.max(0, Number(amount || 0));
    const recovered = Math.min(amount, state.spentKi);
    if (recovered <= 0) return 0;
    state.spentKi -= recovered;
    addHistory(recovered, reason, round);
    return recovered;
  }

  function applyRoundMaintenance(round) {
    const active = state.techniques.filter(t => t.active && t.maintained);
    let insufficient = [];
    active.forEach(t => {
      const cost = sumStats(t.maintenance);
      if (!cost) return;
      if (freeKi() >= cost) {
        spendFromFree(cost, `Mantenimiento · ${t.name}`, round);
      } else {
        insufficient.push(t.name);
        addHistory(0, `Mantenimiento impagado · ${t.name} (${cost} Ki)`, round);
      }
    });
    return insufficient;
  }

  function applyAgon(round) {
    if (!state.agon.enabled) return 0;
    const remainingDaily = Math.max(0, state.agon.dailyMax - state.agon.recoveredToday);
    const wanted = Math.min(state.agon.perRound, remainingDaily);
    const recovered = recoverSpent(wanted, 'Agon · Límite de la Guerra', round);
    state.agon.recoveredToday += recovered;
    return recovered;
  }

  function accumulateSelected(round) {
    let available = freeKi();
    let totalAdded = 0;
    const mode = state.fullAccumulationAdvantage ? 'full' : state.accumulationMode;

    STATS.forEach(stat => {
      if (!state.selectedAccumulation[stat] || available <= 0) return;
      let amount = effectiveAccumulation(stat);
      if (mode === 'half') amount = Math.ceil(amount / 2);
      const add = Math.min(amount, available);
      state.accumulated[stat] += add;
      available -= add;
      totalAdded += add;
      if (add > 0) addHistory(0, `Acumulación ${stat} +${add}`, round);
    });
    return totalAdded;
  }

  function makeRoundUndoSnapshot() {
    return {
      round: state.round,
      accumulated: { ...state.accumulated },
      spentKi: state.spentKi,
      agonRecoveredToday: state.agon.recoveredToday,
      history: state.history.map(item => ({ ...item }))
    };
  }

  function invalidateRoundUndo() {
    state.lastRoundUndo = null;
  }

  function undoLastRound() {
    const snapshot = state.lastRoundUndo;
    if (!snapshot) {
      toast('No hay ningún avance de asalto que deshacer.');
      return;
    }

    state.round = Math.max(1, Number(snapshot.round || 1));
    state.accumulated = { ...statObject(0), ...(snapshot.accumulated || {}) };
    state.spentKi = Math.max(0, Number(snapshot.spentKi || 0));
    state.agon.recoveredToday = Math.max(0, Number(snapshot.agonRecoveredToday || 0));
    state.history = Array.isArray(snapshot.history) ? snapshot.history.map(item => ({ ...item })) : [];
    state.lastRoundUndo = null;
    commit();
    toast('Último avance de asalto deshecho.');
  }

  function resetCombat() {
    const confirmed = confirm(
      '¿Reiniciar el combate?\n\n' +
      '• Asalto volverá a 1.\n' +
      '• Ki concentrado y gastado volverán a 0.\n' +
      '• Todo el Ki volverá a estar disponible.\n' +
      '• Se cancelarán las técnicas mantenidas.\n' +
      '• Se limpiará el historial.\n\n' +
      'Se conservarán características, técnicas, reserva máxima, ajustes y el contador diario de Agon.'
    );
    if (!confirmed) return;

    state.round = 1;
    state.accumulated = statObject(0);
    state.spentKi = 0;
    state.techniques.forEach(tech => { tech.active = false; });
    state.history = [];
    state.lastRoundUndo = null;
    commit();
    toast('Combate reiniciado. Todo el Ki está disponible.');
  }

  function advanceRound(withAccumulation) {
    state.lastRoundUndo = makeRoundUndoSnapshot();
    const currentRound = state.round;
    const insufficient = applyRoundMaintenance(currentRound);
    applyAgon(currentRound);
    const added = withAccumulation ? accumulateSelected(currentRound) : 0;
    addHistory(0, withAccumulation ? `Fin de asalto · acumulados ${added} Ki` : 'Fin de asalto · sin acumular', currentRound);
    state.round += 1;
    commit();
    if (insufficient.length) {
      toast(`Ki insuficiente para mantener: ${insufficient.join(', ')}`);
    }
  }

  function canExecute(tech) {
    if (tech.active) return false;
    return STATS.every(stat => state.accumulated[stat] >= Number(tech.cost[stat] || 0));
  }

  function executeTechnique(id) {
    const tech = state.techniques.find(t => t.id === id);
    if (!tech || !canExecute(tech)) return;

    invalidateRoundUndo();
    const cost = sumStats(tech.cost);
    // Executing consumes only the technique cost. Any excess concentration returns to free reserve.
    state.accumulated = statObject(0);
    state.spentKi += cost;
    if (tech.maintained) tech.active = true;
    addHistory(-cost, `Ejecutar · ${tech.name}`);
    commit();
    toast(tech.maintained ? `${tech.name} está mantenida.` : `${tech.name} ejecutada.`);
  }

  function cancelTechnique(id) {
    const tech = state.techniques.find(t => t.id === id);
    if (!tech) return;
    tech.active = false;
    addHistory(0, `Cancelar mantenida · ${tech.name}`);
    commit();
  }

  function renderKiGrid() {
    const grid = $('#kiGrid');
    grid.innerHTML = '';

    // Row 1: characteristics
    STATS.forEach(stat => {
      const cell = document.createElement('div');
      cell.className = 'ki-cell';
      cell.innerHTML = `
        <span class="stat-name">${stat}</span>
        <div class="big-value">${state.characteristics[stat]}</div>
        <div class="sub">Característica</div>
        <div class="stepper">
          <button data-char-stat="${stat}" data-delta="-1" aria-label="Bajar ${stat}">−</button>
          <button data-char-stat="${stat}" data-delta="1" aria-label="Subir ${stat}">+</button>
        </div>`;
      grid.appendChild(cell);
    });

    // Row 2: accumulation
    STATS.forEach(stat => {
      const base = baseAccumulation(state.characteristics[stat]);
      const purchased = state.purchasedAccumulation[stat];
      const effective = base + purchased;
      const cell = document.createElement('div');
      cell.className = `ki-cell ${state.selectedAccumulation[stat] ? 'selected' : ''}`;
      cell.innerHTML = `
        <input class="select-accum" data-select-stat="${stat}" type="checkbox" ${state.selectedAccumulation[stat] ? 'checked' : ''} aria-label="Acumular ${stat} en el próximo asalto" />
        <span class="stat-name">ACUM.</span>
        <div class="big-value">${effective}</div>
        <div class="sub">Base ${base} + Comprada ${purchased}</div>
        <div class="stepper">
          <button data-purchase-stat="${stat}" data-delta="-1" aria-label="Bajar acumulación comprada de ${stat}">−</button>
          <button data-purchase-stat="${stat}" data-delta="1" aria-label="Subir acumulación comprada de ${stat}">+</button>
        </div>`;
      grid.appendChild(cell);
    });

    // Row 3: concentrated Ki
    STATS.forEach(stat => {
      const cell = document.createElement('div');
      cell.className = 'ki-cell concentration';
      cell.innerHTML = `
        <span class="stat-name">KI ${stat}</span>
        <div class="big-value">${state.accumulated[stat]}</div>
        <div class="sub">Concentrado</div>`;
      grid.appendChild(cell);
    });
  }

  function renderReserve() {
    $('#freeKi').textContent = freeKi();
    $('#totalKi').textContent = state.totalKi;
    $('#maxKiInline').value = state.totalKi;
    $('#concentratedKi').textContent = concentratedKi();
    $('#spentKi').textContent = state.spentKi;
    $('#maintenancePerRound').textContent = `${activeMaintenance()}/as`;
    const recovery = state.agon.enabled && state.agon.recoveredToday < state.agon.dailyMax ? state.agon.perRound : 0;
    $('#recoveryPerRound').textContent = `${recovery}/as`;
  }

  function renderControls() {
    $('#characterName').value = state.characterName;
    $('#roundValue').textContent = state.round;
    $('#undoRoundBtn').disabled = !state.lastRoundUndo;
    $('#fullAccumulationAdvantage').checked = state.fullAccumulationAdvantage;
    $('#agonEnabled').checked = state.agon.enabled;
    $('#agonRecovered').textContent = state.agon.recoveredToday;
    $('#agonMax').textContent = state.agon.dailyMax;

    const halfRadio = $('input[name="accumMode"][value="half"]');
    const fullRadio = $('input[name="accumMode"][value="full"]');
    if (state.fullAccumulationAdvantage) {
      state.accumulationMode = 'full';
      fullRadio.checked = true;
      halfRadio.disabled = true;
      $('#halfModeLabel').classList.add('disabled');
    } else {
      halfRadio.disabled = false;
      $('#halfModeLabel').classList.remove('disabled');
      (state.accumulationMode === 'half' ? halfRadio : fullRadio).checked = true;
    }
  }

  function renderTechniques() {
    const list = $('#techniquesList');
    if (!state.techniques.length) {
      list.innerHTML = '<div class="empty-state">Aún no hay técnicas. Añade la primera para que la aplicación controle cuándo puede ejecutarse.</div>';
      return;
    }

    list.innerHTML = state.techniques.map(t => {
      const totalCost = sumStats(t.cost);
      const maintenance = sumStats(t.maintenance);
      const executable = canExecute(t);
      const costPills = STATS.map(stat => {
        const need = Number(t.cost[stat] || 0);
        const have = state.accumulated[stat];
        const status = need === 0 || have >= need ? 'ok' : 'miss';
        return `<div class="cost-pill ${status}"><span>${stat}</span><strong>${have}/${need}</strong></div>`;
      }).join('');

      return `<article class="tech-card ${t.active ? 'active' : ''}">
        <div class="tech-head">
          <div class="tech-title">
            <h3>${escapeHtml(t.name)}</h3>
            <div class="tech-meta">
              <span class="badge">Nivel ${t.level}</span>
              ${t.maintained ? `<span class="badge ${t.active ? 'active' : ''}">${t.active ? '● MANTENIDA' : 'Mantenida'} · ${maintenance} Ki/as</span>` : ''}
            </div>
          </div>
        </div>
        <div class="cost-lines">${costPills}</div>
        <div class="tech-footer">
          <span class="tech-cost-total">Activación: <strong>${totalCost} Ki</strong></span>
          <div class="tech-actions">
            <button class="btn ghost" data-edit-tech="${t.id}">Editar</button>
            <button class="btn ghost" data-delete-tech="${t.id}">Eliminar</button>
            ${t.active
              ? `<button class="btn secondary" data-cancel-tech="${t.id}">Cancelar</button>`
              : `<button class="btn primary" data-execute-tech="${t.id}" ${executable ? '' : 'disabled'}>Ejecutar</button>`}
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function renderHistory() {
    const list = $('#historyList');
    if (!state.history.length) {
      list.innerHTML = '<div class="empty-state">El historial aparecerá aquí durante la sesión.</div>';
      return;
    }
    list.innerHTML = state.history.map(h => {
      const delta = Number(h.delta || 0);
      const cls = delta > 0 ? 'plus' : delta < 0 ? 'minus' : 'neutral';
      const label = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '•';
      return `<div class="history-item"><span class="round">As. ${h.round}</span><span class="delta ${cls}">${label}</span><span>${escapeHtml(h.text)}</span></div>`;
    }).join('');
  }

  function renderAll() {
    renderKiGrid();
    renderReserve();
    renderControls();
    renderTechniques();
    renderHistory();
  }

  function commit() {
    repairInvariant();
    saveState();
    renderAll();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
  }

  function makeCostInputs(container, prefix, values = statObject(0)) {
    container.innerHTML = STATS.map(stat => `
      <div class="cost-field">
        <label>${stat}<input type="number" min="0" max="99" step="1" name="${prefix}-${stat}" value="${Number(values[stat] || 0)}" /></label>
      </div>`).join('');
  }

  function openTechniqueDialog(tech = null) {
    $('#techniqueDialogTitle').textContent = tech ? 'Editar técnica' : 'Añadir técnica';
    $('#techniqueId').value = tech?.id || '';
    $('#techniqueName').value = tech?.name || '';
    $('#techniqueLevel').value = tech?.level || 1;
    $('#techniqueMaintained').checked = Boolean(tech?.maintained);
    $('#maintenanceFieldset').hidden = !tech?.maintained;
    makeCostInputs($('#techniqueCosts'), 'cost', tech?.cost || statObject(0));
    makeCostInputs($('#maintenanceCosts'), 'maintenance', tech?.maintenance || statObject(0));
    $('#techniqueDialog').showModal();
  }

  function readStatInputs(prefix) {
    return Object.fromEntries(STATS.map(stat => [stat, Math.max(0, Number($(`[name="${prefix}-${stat}"]`).value || 0))]));
  }

  function exportJson() {
    const cleanName = (state.characterName || 'personaje').trim().replace(/[^a-z0-9áéíóúüñ_-]+/gi, '_');
    const exportState = { ...state, lastRoundUndo: null };
    const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanName || 'personaje'}-anima-ki.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJson(file) {
    try {
      const raw = JSON.parse(await file.text());
      state = normalizeState(raw);
      commit();
      toast('Configuración cargada correctamente.');
    } catch {
      toast('No se pudo cargar el JSON.');
    }
  }

  document.addEventListener('click', (event) => {
    const charBtn = event.target.closest('[data-char-stat]');
    if (charBtn) {
      const stat = charBtn.dataset.charStat;
      state.characteristics[stat] = clamp(state.characteristics[stat] + Number(charBtn.dataset.delta), 1, 30);
      commit(); return;
    }

    const purchaseBtn = event.target.closest('[data-purchase-stat]');
    if (purchaseBtn) {
      const stat = purchaseBtn.dataset.purchaseStat;
      state.purchasedAccumulation[stat] = clamp(state.purchasedAccumulation[stat] + Number(purchaseBtn.dataset.delta), 0, 30);
      commit(); return;
    }

    const totalBtn = event.target.closest('[data-total-delta]');
    if (totalBtn) {
      invalidateRoundUndo();
      const minimum = state.spentKi + concentratedKi();
      state.totalKi = Math.max(minimum, state.totalKi + Number(totalBtn.dataset.totalDelta));
      commit(); return;
    }

    const execBtn = event.target.closest('[data-execute-tech]');
    if (execBtn) { executeTechnique(execBtn.dataset.executeTech); return; }

    const cancelBtn = event.target.closest('[data-cancel-tech]');
    if (cancelBtn) { cancelTechnique(cancelBtn.dataset.cancelTech); return; }

    const editBtn = event.target.closest('[data-edit-tech]');
    if (editBtn) { openTechniqueDialog(state.techniques.find(t => t.id === editBtn.dataset.editTech)); return; }

    const deleteBtn = event.target.closest('[data-delete-tech]');
    if (deleteBtn) {
      const tech = state.techniques.find(t => t.id === deleteBtn.dataset.deleteTech);
      if (tech && confirm(`¿Eliminar ${tech.name}?`)) {
        state.techniques = state.techniques.filter(t => t.id !== tech.id);
        commit();
      }
      return;
    }

    const close = event.target.closest('[data-close-dialog]');
    if (close) { $(`#${close.dataset.closeDialog}`).close(); return; }
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-select-stat]')) {
      state.selectedAccumulation[event.target.dataset.selectStat] = event.target.checked;
      commit();
    }
  });

  $('#characterName').addEventListener('input', e => {
    state.characterName = e.target.value;
    saveState();
  });

  $('#maxKiInline').addEventListener('change', e => {
    invalidateRoundUndo();
    const minimum = state.spentKi + concentratedKi();
    state.totalKi = Math.max(minimum, Number(e.target.value || 0));
    commit();
  });

  $$('input[name="accumMode"]').forEach(el => el.addEventListener('change', e => {
    state.accumulationMode = e.target.value;
    commit();
  }));

  $('#fullAccumulationAdvantage').addEventListener('change', e => {
    state.fullAccumulationAdvantage = e.target.checked;
    if (e.target.checked) state.accumulationMode = 'full';
    commit();
  });

  $('#agonEnabled').addEventListener('change', e => { state.agon.enabled = e.target.checked; commit(); });
  $('#resetAgonBtn').addEventListener('click', () => { invalidateRoundUndo(); state.agon.recoveredToday = 0; addHistory(0, 'Reiniciar contador diario de Agon'); commit(); });
  $('#accumulateBtn').addEventListener('click', () => advanceRound(true));
  $('#advanceBtn').addEventListener('click', () => advanceRound(false));
  $('#undoRoundBtn').addEventListener('click', undoLastRound);
  $('#resetCombatBtn').addEventListener('click', resetCombat);
  $('#addTechniqueBtn').addEventListener('click', () => openTechniqueDialog());
  $('#adjustKiBtn').addEventListener('click', () => { $('#adjustKiForm').reset(); $('#adjustKiDialog').showModal(); });
  $('#exportBtn').addEventListener('click', exportJson);
  $('#importBtn').addEventListener('click', () => $('#importInput').click());
  $('#importInput').addEventListener('change', e => { if (e.target.files?.[0]) importJson(e.target.files[0]); e.target.value = ''; });
  $('#clearHistoryBtn').addEventListener('click', () => { invalidateRoundUndo(); state.history = []; commit(); });

  $('#techniqueMaintained').addEventListener('change', e => { $('#maintenanceFieldset').hidden = !e.target.checked; });

  $('#techniqueForm').addEventListener('submit', event => {
    event.preventDefault();
    const id = $('#techniqueId').value;
    const existing = state.techniques.find(t => t.id === id);
    const maintained = $('#techniqueMaintained').checked;
    const tech = {
      id: id || uid(),
      name: $('#techniqueName').value.trim() || 'Técnica',
      level: Number($('#techniqueLevel').value),
      cost: readStatInputs('cost'),
      maintained,
      maintenance: maintained ? readStatInputs('maintenance') : statObject(0),
      active: existing?.active && maintained ? true : false
    };
    if (existing) Object.assign(existing, tech);
    else state.techniques.push(tech);
    $('#techniqueDialog').close();
    commit();
  });

  $('#adjustKiForm').addEventListener('submit', event => {
    event.preventDefault();
    const type = $('input[name="adjustType"]:checked').value;
    const amount = Math.max(1, Number($('#adjustAmount').value || 1));
    const reason = $('#adjustReason').value.trim() || (type === 'spend' ? 'Consumo externo de Ki' : 'Recuperación de Ki');
    invalidateRoundUndo();
    if (type === 'spend') {
      const spent = spendFromFree(amount, reason);
      if (spent < amount) toast(`Solo había ${spent} Ki libre disponible.`);
    } else {
      const recovered = recoverSpent(amount, reason);
      if (recovered < amount) toast(`Solo se podían recuperar ${recovered} Ki gastados.`);
    }
    $('#adjustKiDialog').close();
    commit();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }

  renderAll();
})();
