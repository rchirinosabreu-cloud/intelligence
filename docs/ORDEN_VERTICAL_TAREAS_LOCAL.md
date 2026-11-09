# Prioridad vertical de las tarjetas · 9 de noviembre de 2026

Solicitud de Rodny: permitir a cualquier admin o project manager ordenar verticalmente todas las tarjetas, sin restricciones por tipo de tarea. Desarrollo en `codex/orden-vertical-todas-tareas`, validado en local. Rodny autorizó fusionar la corrección el 9 de noviembre de 2026. No se han modificado datos productivos durante las pruebas.

## Causa y comportamiento

El tablero rechazaba expresamente la prioridad manual de compartidas y realizadas; además confundía permiso para priorizar con permiso para cambiar estado. La ventana de devueltas tampoco usaba el orden persistido del tablero.

Ahora cada tarjeta conserva su posición dentro de la columna. Una tarea compartida sigue siendo una única Task: la posición distingue a cada persona. Privadas y partes ajenas pueden ordenarse por gestores sin abrir sus datos ni cambiar sus estados. La prioridad manual prevalece en Realizado; sin intervención manual se conserva el cierre personal reciente. Nuevas tarjetas entran al final de una cola priorizada.

El arrastre anticipa la posición. Si se rechaza el guardado, se consulta el orden vigente y se informa del motivo; nunca se confirma una prioridad que el servidor rechazó. Un movimiento pendiente se termina antes de aceptar el siguiente.

## Persistencia y permisos

- `TaskCardOrder`, clave tarea/persona, estado, posición y revisión. No reescribe Task, sesiones, ciclos, comentarios ni reconocimientos para ordenar.
- Ensure aditivo, importable e idempotente; arranque después del esquema de participaciones. Sin migración del orden legado ni cambios de archivos.
- Permisos y revisiones se releen dentro de la transacción nativa. Un cambio concurrente devuelve conflicto y requiere una lectura actualizada.
- Con filtros se sustituyen las posiciones seleccionadas y se mantienen las ocultas. El recibo de prioridad incluye exclusivamente las tarjetas solicitadas.
- Cambiar de columna retira la posición de esa participación; las demás conservan su prioridad. Retirar a una persona elimina solo su posición vigente. La presentación individual tras retirar colaboradores conserva el mecanismo personal.
- La colocación horizontal individual mantiene su ancla incluso si el destino ya se ordenó manualmente. Una pantalla antigua con el protocolo anterior recibe una petición de actualizar si intenta sobreescribir prioridades nuevas.
- La consulta operativa continúa excluyendo retiradas/eliminadas y conserva el alcance temporal existente del tablero. Este ajuste no restaura tareas ni modifica el historial.

## Verificación local

`tests/taskCardOrderApi.integration.mjs`: API real y PostgreSQL aislado en 127.0.0.1:55451. Admin y PM, varias partes del mismo ID, estado personal diferente del global, realizadas/devueltas, privacidad, permisos revocados, filtros, llegada de tareas nuevas, colocación horizontal, concurrencia y conservación exacta de las filas de tarea, sesiones, ciclos y comentarios.

`tests/browser/taskCardOrder.mjs`: pantallas reales con datos ficticios, ambos roles, cuatro columnas incluida la ventana de devueltas, privadas, partes ajenas, recarga y bloqueo del cambio de estado no autorizado. `tests/browser/taskOrder.mjs`: filtros, nueva tarea, recarga, rechazo y temas claro/oscuro. `tests/browser/taskParticipationProgress.mjs`: regresión del ciclo personal y sus relojes.

Los recibos y capturas de prueba quedan en `output/task-card-order*`. La prueba de navegador usa respuestas locales simuladas; la persistencia y concurrencia se verifican por separado mediante API/PostgreSQL reales.

## Publicación y reversión

Fusión autorizada por Rodny el 9 de noviembre de 2026. El despliegue debe ejecutar el ensure antes de atender el tablero. No hace falta importar prioridades ni tocar tareas reales manualmente. Revertir el código deja intactas las tareas y el historial; las nuevas posiciones quedan almacenadas sin uso hasta restaurar esta versión. No borrar la tabla como parte de una reversión rutinaria.
