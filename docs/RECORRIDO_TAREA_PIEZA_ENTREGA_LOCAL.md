# Tarea → pieza → entrega: revisión local

5 de noviembre de 2026. Rama `codex/recorrido-tarea-pieza-local`, posterior a PR #1264. **Revisado en local; Rodny autorizó la fusión después de igualar el estilo de los botones Ver pieza y Abrir Parrilla.** Esta autorización no amplía los límites de la evidencia que sigue.

## Qué puede revisarse

- **Ver pieza** abre el diálogo compartido, más pequeño que el de tarea y con el fondo desenfocado. Muestra cliente, período, fecha/hora, estado vigente, guion, texto, referencias, insumos, galería final, portada, comentarios de revisión y nota interna. Cerrar recupera la tarea, el foco y el comentario sin enviar. **Abrir Parrilla** sigue disponible.
- **Entregar pieza** permite subir archivos o registrar un enlace de Drive con las rutas y validaciones nativas. El éxito se muestra después de confirmar el guardado; los fallos conservan la posibilidad de reintentar. La entrega aparece en la misma pieza del editor. No termina participaciones ni modifica relojes. Una pieza aprobada recibe la revisión de material nuevo existente; una publicada conserva su recorrido nativo.
- **Período de la parrilla** permite ir a otro mes existente de la misma cuenta conservando procedencia y vista. No traslada piezas ni crea meses. El espejo MIO ofrece los meses ya leídos, incluidos años anteriores; no importa períodos al consultarlos. Mientras haya respuestas a comentarios abiertas, el selector espera a cancelarlas o confirmar su envío; un error conserva el texto y no desbloquea el cambio de mes. La posición automática de la pieza se libera al interactuar, para que el selector no se desplace fuera de pantalla.
- **Claridad del tablero:** la búsqueda global explica que abarca todo el tablero y deja inactivos los filtros que no aplica, conservándolos para cuando se borre. Realizado muestra los cierres más recientes primero, incluida la fecha personal de tareas compartidas. Arrastrar dentro de esa columna no altera prioridades. Aprobada, realizada y publicada tienen distintivos diferentes en editor, calendario y portal.
- **Continuidad adicional:** Inicio conserva persona y origen; Ritmo conserva selección de período, filtros y personas; Cotizaciones recupera pestaña, consulta y estado al volver del editor. El inventario de toda la plataforma está en `docs/RECORRIDOS_PLATAFORMA_2026-11-05.md`, con los recorridos pendientes separados de lo implementado.

## Prueba abierta

Frontend: **http://127.0.0.1:3183**. API local: `127.0.0.1:8092`. Base aislada: `127.0.0.1:55451/shared_tasks_demo`.

El acceso y los identificadores del conjunto ficticio vigente están en `output/task-piece-local/preview-access.json`. El navegador queda abierto como Ana en la pieza entregada de «Cuenta Faro · Tarea y pieza 9a2a7f72». Bea y Carlos son participantes de la misma tarea; Carlos no tiene permiso de Parrillas para comprobar esa separación.

Recorrido de aceptación observado en la aplicación completa:

1. Iniciar sesión como Ana y abrir su tarea vinculada.
2. Abrir **Ver pieza** sin abandonar la tarea.
3. Entregar la imagen ficticia FARO y esperar **Entrega guardada**.
4. Comprobar material nuevo por revisar y el archivo en la galería.
5. Cerrar la pieza y usar **Abrir Parrilla**: aparece el mismo archivo.
6. Pasar de noviembre a octubre y diciembre del mismo cliente.
7. Volver al origen: se recupera la tarea original.

La comprobación HTTP posterior acreditó un solo archivo con ese nombre, la misma tarea pendiente, las mismas participaciones y ninguna publicación. Evidencia: `output/task-piece-local/walkthrough/verification.json`, capturas `01`–`06` y `prueba-abierta.jpg`. Esta prueba no completa ni reabre tareas: ese recorrido ya tiene su aceptación independiente en `docs/COMPARTIDAS_CASOS_PRUEBA.md`.

## Verificación

| Comprobación | Resultado y alcance |
|---|---|
| Regresión afectada, sin salida de red externa | 721 casos: **715 aprobados, 6 omitidos, 0 fallidos**. `output/task-piece-delivery/affected-suite.log`. |
| Entrega HTTP + PostgreSQL | **5/5** en `tests/taskPieceApi.integration.mjs`: lectura, multipart y bytes, subida directa y Drive, permisos y pieza publicada. |
| Períodos MIO HTTP + PostgreSQL | **3/3** en `tests/taskPiecePeriodsApi.integration.mjs`: años anteriores, exclusiones, permisos y lecturas sin mutación. |
| Aplicación completa | **1/1** en `tests/browser/taskPieceReal.mjs`, login, API y persistencia reales. Cero errores de página. |
| Regresión de posición del selector | **1/1** en `tests/browser/planPeriodReal.mjs`, después de reproducir la opción fuera de pantalla. |
| Componentes reales con respuestas ficticias | **5/5** tarea/pieza/entrega; **8/8** períodos/estados; **14/14** sincronización del tablero; **5/5** continuidad de Inicio/Ritmo/Cotizaciones. Incluyen móvil, oscuro, errores y regreso. No sustituyen la aceptación HTTP. |
| Construcción | `node scripts/preview-task-piece-web.mjs --build`: **exit 0**, después del último cambio de código. |
| Calidad estática | `npx eslint src scripts tests --quiet` y `npm run audit:dead-code`: **exit 0**. El editor y su regresión de scroll también se revisaron después del último cambio. |

Los conteos se solapan; no deben sumarse como casos únicos. Los contratos adaptados a la extracción de componentes conservan sus exigencias de comportamiento. La galería y entradas multimedia viven en `ContentPlan/PieceMedia.jsx`, compartidas por editor y consulta; esta última no importa todo el editor. `contentFinalDelivery` centraliza el mismo flujo nativo de subida en ambas superficies.

Verificación final antes de fusionar: `output/task-piece-delivery/premerge-browser.log` conserva los **5/5** casos de tarea/pieza/entrega; `output/task-piece-delivery/premerge-periods-browser.log`, los **8/8** de períodos. El último caso de MIO falló primero con un borrador escrito y selector habilitado; ahora verifica varias respuestas abiertas, cancelación parcial, rechazo 502 con texto preservado, reintento confirmado y cambio al mes no cacheado. También pasan **23/23 contratos MIO** y ESLint en los archivos de este cierre, sin cambiar permisos ni el servicio de envío.

El primer CI limpio del PR #1265 aprobó construcción, seguridad, licencias y calidad estática; en la suite general quedaron **4.743 aprobados, uno omitido y un fallo**: faltaba describir el catálogo de períodos MIO para Bria. Se registró como lectura antes de la ruta mensual parametrizada, conservando la guarda de Parrillas y sin prometer importación o todos los meses. La regresión reprodujo primero la resolución incorrecta de `periods` como mes; después pasaron **30/30** casos de catálogo, períodos y capacidades de Bria (`premerge-catalog-green.log`). El resultado definitivo de CI se consulta en el PR; no se omite ni se relaja su control de cobertura.

La suite general inicial **no fue enteramente verde**: 4.607 aprobados, 16 fallidos, 2 cancelados y 35 omitidos. Los fallos atribuibles a esta rama quedaron corregidos y están cubiertos por la regresión afectada. Quedan dos casos ajenos de Calendar que intentan consultar la dependencia de gobierno sin aislarla, y el bloque de chat que supera su límite de 30 segundos también al ejecutarlo separado. No se modificaron para ocultar esos resultados. El intento de Calendar terminó en resolución de host fallida; no acredita conexión ni cambios de datos. La regresión posterior bloqueó la salida de red y la carga de `.env`.

La compilación conserva avisos previos de paquetes grandes y CSS generado por Tailwind a partir del patrón `/[-:T]/` de `receivablePdfService.js`. El comando global de ESLint también encontró el límite de archivos abiertos al recorrer copias antiguas bajo `output`; la comprobación indicada arriba abarca `src`, `scripts` y `tests`.

## Límites y reproducción

La aplicación, autenticación, rutas, servicios y PostgreSQL son reales; las cuentas son ficticias. El almacén HTTP local conserva bytes en memoria y admite hasta **16 MB por archivo**, sin cambiar los límites productivos. Al reiniciar el proceso se pierde ese almacén; el script crea un conjunto ficticio nuevo y actualiza el archivo de accesos, sin resetear la base. No se probaron Google, Meta, publicación externa ni almacenamiento de producción.

Con la base aislada existente encendida, iniciar en dos terminales:

```powershell
node scripts/task-piece-preview-local.mjs
node scripts/preview-task-piece-web.mjs
```

Después ejecutar `node --test tests/browser/taskPieceReal.mjs` para el recorrido completo. Esa prueba entrega un archivo ficticio nuevo. `tests/taskPieceApi.integration.mjs` utiliza el puerto 8092 y debe ejecutarse cuando ese preview esté detenido; la aceptación de MIO usa el 8094. Ninguno prepara ni borra el esquema. Los scripts verifican la base aislada y no necesitan el `.env` de producción.

El barrido transversal fue lectura de código de todas las familias de rutas, no una prueba visual completa de cada módulo. Quedan documentados, entre otros, los filtros de cartera operativa, fecha de calendario, carpeta/archivo en Drive, borradores de informes, perfiles y Radar. No se declara resuelta toda la navegación de la plataforma.
