# Limpieza periódica de adjuntos de tareas

Estado al 18 de septiembre de 2026: implementado, **activo en producción** y con la primera pasada ya ejecutada.

`TASK_ATTACHMENT_RETENTION_ENABLED=true` está puesta en Railway. El barrido automático corre cada 6 horas con el plazo por defecto de 30 días. Para detenerlo basta poner esa variable en `false`; no devuelve lo ya borrado.

## Qué resuelve

El bucket `chat-evidence` guarda los adjuntos del chat de equipo **y también** los de las tareas, pese a su nombre. Los archivos de tareas ya terminadas se acumulan sin límite. Esta limpieza los retira cuando la tarea lleva suficiente tiempo cerrada.

No toca los archivos del chat de equipo: ese módulo tiene su propio barrido de huérfanos en `teamChatRuntime.js` y sus propios límites.

## Regla

Un adjunto es candidato cuando se cumplen **todas** estas condiciones:

- El archivo se subió **en un comentario** de la tarea, es decir, en la conversación. Los archivos de referencia colgados directamente en la card (`commentId` nulo) no se tocan: pertenecen a la tarea, no al hilo que la discutió.
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

El barrido corre cada 6 horas y procesa como máximo 200 archivos por pasada. **No se ejecuta al arrancar**: solo programa el temporizador, así que encender la variable no borra nada de inmediato.

### Ejecutar una pasada a mano

Para no esperar al temporizador —recomendable la primera vez, para verlo— existe una pasada supervisada:

```powershell
npm run storage:retention-sweep -- --confirm BORRAR
```

Exige **dos** confirmaciones independientes: la misma variable que obedece el temporizador, y la palabra exacta en la línea de comandos. Ninguna de las dos basta por sí sola. Antes de borrar imprime la base, el bucket, el plazo y cuántos archivos va a eliminar, y al terminar informa de borrados y reintentables.

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
### Primera ejecución real · 18 de septiembre de 2026

Ejecutada a mano desde la consola de Railway con `npm run storage:retention-sweep -- --confirm BORRAR`, contra `postgres.railway.internal` y el bucket `chat-evidence-cjupwwro9k`:

```
Se van a borrar 66 archivos de conversaciones de pendientes cerrados.
Reclamados: 66
Borrados:   66
Reintentables: 0
```

El informe posterior devolvió 0 candidatos: el acumulado quedó limpio. Fueron 66 y no los 65 del informe previo porque una tarea más cruzó el plazo entre una cosa y otra, que es el comportamiento esperado de una regla que cuenta días.

### Aviso en el comentario

Comprobado en la aplicación real, con un adjunto `PURGED` sembrado en local: el comentario conserva su texto y el adjunto aparece con borde discontinuo, icono atenuado, nombre tachado y la frase «Archivo eliminado por limpieza automática el 17 de septiembre de 2026». Sin botones de vista previa ni descarga. Verificado en tema claro y oscuro; contraste legible en ambos.

## Límites conocidos

- Alcance actual: solo adjuntos de comentarios. Los archivos de referencia de la card quedan fuera por diseño; si alguna vez conviene incluirlos, es un cambio consciente, no un descuido.
- Medición del 18 de septiembre de 2026 contra la base productiva: 65 candidatos, los 65 en conversaciones, ninguno suelto en una card. Los enlaces externos (Drive, Docs, Instagram, Canva, LinkedIn) estaban todos a nivel de card y ya quedaban fuera por partida doble.
- El informe tiene un tope de 5.000 filas revisadas, configurable con `TASK_ATTACHMENT_RETENTION_REPORT_LIMIT`, y avisa cuando lo alcanza.
