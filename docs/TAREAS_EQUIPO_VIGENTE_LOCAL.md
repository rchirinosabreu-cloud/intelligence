# Tareas: presentación del equipo vigente

Solicitud de Rodny, 7 de noviembre de 2026. Muestra local validada y fusión autorizada por Rodny el mismo día.

## Comportamiento

- El resumen compartido deja de ofrecer Empezar, Pausar, Terminar y Devolver: las tarjetas conservan el cambio de columna y las acciones nativas. Se mantienen Reabrir y Reintegrar en los estados correspondientes.
- Una tarea que conserva una sola participación vuelve a la presentación individual: selector Estado actual y tiempo personal; sin bloque de equipo, contador de partes ni advertencias de afectar a otros participantes.
- Al incorporar de nuevo colaboradores reaparece el resumen del equipo.
- La marca interna `sharedProgress` se conserva. Los cambios de estado de una tarea anteriormente compartida siguen usando identidad personal, revisión de participación y revisión de equipo. No se altera el agregado directamente.
- Devolver, reabrir y reintegrar conservan motivos, permisos y tratamiento de conflictos. El selector individual confirma cada cambio inmediatamente con el servidor.
- Los tiempos e historial de personas retiradas permanecen intactos. No hay cambios de esquema, migraciones ni modificaciones de datos productivos.

## Verificación

La prueba de presentación falló antes del ajuste por mostrar tres botones redundantes y por no ofrecer el selector individual. El contrato de equipo vigente también falló antes de implementar la distinción.

- `tests/taskParticipationBoard.test.js`: equipo vigente, proyección y ruta personal conservada.
- `tests/browser/taskParticipationProgress.mjs`: presentación individual y de equipo, arrastre personal, conflicto, reintegración, error al devolver, navegación e históricos.
- `tests/browser/sharedTaskReal.mjs`: navegador, API y PostgreSQL local; tres personas, cierre global, retiro/reingreso de colaboradores, conservación de sesiones e historial y conflicto entre dos sesiones.

Capturas locales en `output/task-participation/` y `output/shared-tasks-local/browser/`.
