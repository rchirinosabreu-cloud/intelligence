# Racha de calidad

Corrección del 14 de septiembre de 2026.

## Problema reproducido

El cálculo anterior incrementaba `SystemStreak.currentStreak` sin consultar las tareas devueltas. El endpoint ocultaba el número mientras existía alguna `DEVUELTA`, pero no detenía su acumulación. Al eliminar o reintegrar la última, reaparecían días que no representaban un periodo limpio. Además, el cierre usaba UTC y podía omitir días según la frecuencia del polling.

## Contrato vigente

- Con alguna tarea `DEVUELTA`, la racha persistida es cero y `cleanSinceAt` queda vacío.
- Borrar, completar o reintegrar la última devuelta inicia el periodo limpio en ese momento, con cero días. No recupera días anteriores.
- Se cuentan días calendario **completos** en `America/Bogota`, incluidos fines de semana. Si el periodo comienza el lunes a las 13:00, el martes todavía marca cero y el miércoles a las 00:00 marca uno. La preferencia de ocultar fines de semana en el calendario no cambia esta métrica.
- Los días se calculan desde el inicio del periodo; varias consultas, reinicios o ejecuciones de cron no suman el mismo día dos veces.
- Una edición sin cambio de estado o la eliminación de una tarea no devuelta no reinicia el periodo.
- Mutación de tarea, actualización de racha y auditoría comparten transacción. Las lecturas y el cron usan el mismo bloqueo y reintentos serializables. Un error de persistencia aborta la operación; nunca se devuelve un éxito con el contador anterior.
- Los cambios confirmados de tareas invalidan la consulta de racha en Actividad y en el espacio del cliente.

## Compatibilidad e historial

`trackingStartedAt` identifica el inicio de seguimiento verificable. Los registros anteriores no permiten reconstruir los periodos libres de devoluciones; su racha actual comienza en cero al inicializar este seguimiento. `highestStreak` se conserva como récord histórico registrado, sin certificar retroactivamente su exactitud. No se alteran tareas, `completedAt`, auditorías ni reconocimientos.

El arranque ejecuta `ensure-quality-streak-schema.js`: añade dos columnas nullable con `IF NOT EXISTS`, sin actualizar registros ni realizar un `db push`. La inicialización del contador ocurre bajo transacción al consultar o procesar la racha.

## Verificación

- Regresiones unitarias: contador oculto de tres días, persistencia de cero, reintegración, múltiples devoluciones, días completos en Bogotá, polling repetido y errores de lectura/escritura.
- `tests/qualityStreakPostgres.integration.mjs`: siete pruebas reales en clúster local aislado; actualización aditiva repetida, borrado auditado, reintegración, concurrencia, rollback ante error provocado en PostgreSQL y ejecución efectiva de los seis casos de la suite de CI. Cada ejecución usa su propio esquema temporal y rechaza conexiones fuera del destino de pruebas.
- `tests/browser/qualityStreak.mjs`: seis recorridos con componentes reales y API simulada, incluyendo respuestas pendientes y eliminación fallida. Capturas en `output/quality-streak/desktop-light.png` y `desktop-dark.png`.
- El entorno simulado de navegador y el PostgreSQL local no equivalen a modificar tareas de producción. La comprobación productiva se limita al despliegue, arranque y endpoint de la métrica.
- Verificación general local: 1.358 pruebas aprobadas, seis omitidas y un fallo preexistente de estilos destructivos en `ProposalDetailsEditor.jsx` (archivo y prueba sin cambios respecto de HEAD). Las 64 pruebas focales pasan; build y ESLint de los archivos modificados pasan. No se afirma que la suite general esté completamente verde.
