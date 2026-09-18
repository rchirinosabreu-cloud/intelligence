# Limpieza periódica de adjuntos de tareas

Estado al 18 de septiembre de 2026: implementado y **desactivado**. Ningún archivo se borra hasta que alguien encienda el interruptor de forma explícita. La verificación descrita aquí es local; no certifica el comportamiento en producción.

## Qué resuelve

El bucket `chat-evidence` guarda los adjuntos del chat de equipo **y también** los de las tareas, pese a su nombre. Los archivos de tareas ya terminadas se acumulan sin límite. Esta limpieza los retira cuando la tarea lleva suficiente tiempo cerrada.

No toca los archivos del chat de equipo: ese módulo tiene su propio barrido de huérfanos en `teamChatRuntime.js` y sus propios límites.

## Regla

Un adjunto es candidato cuando se cumplen **todas** estas condiciones:

- La tarea está en `REALIZADA`.
- `Task.completedAt` es anterior al corte (por defecto 30 días).
- El adjunto está en `ACTIVE`, es decir, no se procesó antes.
- La URL apunta al bucket configurado. Un enlace externo (Drive, por ejemplo) nunca se borra: no es nuestro.

El reloj cuenta desde que la tarea se cerró, no desde la fecha del archivo, porque la regla es sobre trabajo terminado. `AGENTS.md` §5 acopla `completedAt` al estado: **reabrir una tarea pone la fecha en nulo y saca sus archivos del barrido automáticamente**. El límite pertenece al archivo: exactamente en el corte todavía se conserva.

Ante cualquier duda —fecha ilegible, estado inesperado, URL que no se puede interpretar— se conserva el archivo. Los bytes borrados no vuelven.

## Qué queda después

La fila de `TaskAttachment` **se conserva**, a diferencia del barrido del chat, que sí borra su registro. Eso permite que el comentario siga explicando lo que hubo: el adjunto aparece tachado con «Archivo eliminado por limpieza automática» y su fecha. La conversación no pierde el hilo.

Estados: `ACTIVE` → `DELETING` → `PURGED`, más `purgedAt`. Columnas añadidas de forma aditiva por `scripts/ensure-task-attachment-retention-schema.js`, idempotente y ejecutado al arrancar. Los adjuntos existentes quedan en `ACTIVE`; no se marca nada retroactivamente.

## Borrado en dos fases

Igual que el barrido del chat: se reclama bajo `pg_advisory_xact_lock`, marcando `DELETING` en una transacción; después se borra del bucket y se confirma `PURGED`. Una caída entre las dos fases deja una fila en `DELETING`, nunca un comentario apuntando a un archivo que ya no existe.

Si el borrado falla, la fila **vuelve a `ACTIVE`** para reintentarlo en la siguiente pasada, en vez de quedar bloqueada. Si el objeto ya no estaba en el bucket, se considera cumplido.

## Activación

Dos variables de entorno:

| Variable | Efecto |
|---|---|
| `TASK_ATTACHMENT_RETENTION_ENABLED` | Solo el valor exacto `true` activa el barrido. Cualquier otra cosa lo deja apagado. |
| `TASK_ATTACHMENT_RETENTION_DAYS` | Días de plazo. Por defecto 30. Un valor inválido o menor que 1 vuelve al valor por defecto. |

El barrido corre cada 6 horas y procesa como máximo 200 archivos por pasada.

**La primera ejecución no borra «el mes pasado»: borra todo el acumulado anterior al plazo.** En una instalación con meses de historia eso puede ser mucho de una sola vez. Por eso viene apagado y existe el informe.

## Informe previo, sin borrar nada

```powershell
npm run storage:retention-report
```

Solo lee. No abre transacciones de escritura ni contacta el almacenamiento, así que puede apuntarse a cualquier base para dimensionar el problema antes de decidir. Muestra cuántos archivos caerían, cuáles se conservan y por qué, y una muestra de las claves.

Si el número resulta alto, la vía prudente es empezar con un plazo amplio (`TASK_ATTACHMENT_RETENTION_DAYS=180`) e ir bajándolo, en lugar de un borrado masivo inicial.

El informe no estima espacio liberado: `TaskAttachment` no guarda el tamaño del archivo, y consultarlo exigiría interrogar el bucket pieza por pieza.

## Verificación de esta entrega

- `tests/taskAttachmentRetention.test.js`: 17 pruebas. Cubren el corte y su frontera, tareas reabiertas, fechas ausentes, archivos ajenos al bucket, el reclamo bajo bloqueo, la recuperación ante fallo de almacenamiento, el objeto ya inexistente y que el interruptor venga apagado.
- Esquema aplicado dos veces seguidas contra PostgreSQL local para comprobar que es idempotente.
- Informe ejecutado contra un escenario sembrado con cinco adjuntos: detectó los 2 que correspondían, descartó el enlace externo e ignoró los de la tarea reciente y la pendiente.
- **No se ha ejecutado ningún barrido real**: el borrado solo se probó con dobles de almacenamiento.

## Límites conocidos

- Alcance actual: adjuntos de tareas, tanto de comentarios como de la tarea misma. Los adjuntos de referencia de una tarea terminada también entran; si conviene conservarlos, hay que separarlos por `category`.
- El informe tiene un tope de 5.000 filas revisadas, configurable con `TASK_ATTACHMENT_RETENTION_REPORT_LIMIT`, y avisa cuando lo alcanza.
