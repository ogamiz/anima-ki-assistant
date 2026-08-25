# Anima · Asistente de Ki

Aplicación web estática y offline para gestionar Ki, acumulaciones y Técnicas de Ki de Anima Beyond Fantasy.

## Ejecutarla en iPad sin hosting externo

1. Copia esta carpeta al iPad (por ejemplo, dentro de una carpeta accesible desde a-Shell).
2. Abre a-Shell y sitúate dentro de la carpeta del proyecto.
3. Ejecuta:

   ```bash
   python3 -m http.server 8080 --bind 127.0.0.1
   ```

4. Abre Safari y entra en:

   `http://127.0.0.1:8080`

5. Opcionalmente, usa **Compartir → Añadir a pantalla de inicio** para abrirla como web app.

No requiere Internet, servidor externo, Node, npm ni instalación de dependencias.

## Funciones incluidas

- Grid 6×3 para FUE, DES, AGI, CON, POD y VOL.
- Acumulación base automática según característica y acumulación comprada ajustable.
- Selección individual de qué características acumulan cada asalto.
- Acumulación completa o a la mitad (redondeo hacia arriba).
- Opción **Acumulación Plena** que fuerza acumulación completa.
- Reserva máxima, Ki libre, concentrado y gastado.
- Avance de asalto con o sin acumulación.
- Botón **Deshacer** para revertir exactamente el último avance de asalto sin perder las nuevas selecciones de acumulación que hayas corregido después.
- Botón **Reiniciar combate**: vuelve a Asalto 1, vacía la concentración y el Ki gastado, restaura toda la reserva disponible, cancela mantenidas y limpia el historial sin borrar la configuración del personaje.
- Técnicas con nivel y coste por característica.
- Detección automática de si una Técnica puede ejecutarse.
- Técnicas mantenidas con coste de mantenimiento por asalto.
- Cancelación de Técnicas mantenidas.
- Agon: recuperación automática de 1 Ki gastado por asalto, con contador diario 0/80.
- Consumo externo y recuperación manual de Ki.
- Historial de movimientos.
- Autoguardado mediante `localStorage`.
- Importación y exportación del estado completo en JSON.
- PWA/service worker para uso offline tras la primera carga local.

## Notas de funcionamiento

- El Ki concentrado no se considera gastado.
- Al ejecutar una Técnica, se consume su coste y la concentración sobrante vuelve a la reserva libre.
- El mantenimiento y Agon se procesan al avanzar un asalto, incluso si se usa **Avanzar sin acumular**.
- Si no hay Ki libre suficiente para pagar un mantenimiento completo, la app no hace un pago parcial: lo registra como impagado, avisa y no cancela automáticamente la Técnica para que el usuario decida cómo resolverlo.


## Actualización desde GitHub Pages

Esta versión usa la caché `anima-ki-v2`. Al sustituir los archivos en GitHub Pages, el service worker elimina las cachés anteriores al activarse. Si Safari sigue mostrando una versión antigua, cierra y vuelve a abrir la web app o recarga una vez la página.
