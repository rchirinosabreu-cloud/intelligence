# Fiabilidad del calendario: corrección y operación

Este documento describe la corrección, su validación y el procedimiento de publicación. El estado de un despliegue concreto y cualquier reparación histórica requieren verificación por separado. Evidencia productiva e inventario: [auditoría del 7 de septiembre](./CALENDAR_PRODUCTION_AUDIT_2026-09-07.md).

## Incidente Wine and Wonder

El evento original identificado en la instantánea inicial de PostgreSQL tenía fecha **11 de septiembre de 2001**, fue creado el **4 de septiembre de 2026** y conservaba ID Google y dos vínculos. La recreación manual en Google para el **11 de septiembre de 2026** produjo dos registros locales por notificaciones concurrentes de distintas cuentas. Ambos casos incluyen a la misma participante identificada por el usuario. Una lectura posterior, antes del push, encontró el registro de 2001 ya ausente; esta auditoría no lo eliminó.

Se distinguen dos defectos: una entrada de fecha sin año puede caer en el parseo permisivo de JavaScript y resolver a 2001; la importación por cuentas distintas puede duplicar una misma identidad. La base prueba las fechas e identidades; no hay traza del texto exacto escrito originalmente ni comprobación GET productiva del evento remoto. No se debe afirmar que aquella secuencia de teclas quedó demostrada.

El evento vigente creado manualmente por el usuario no debe republicarse. Tampoco se deben enviar automáticamente los pendientes históricos (79 en el inventario inicial y 78 en el preflight): fueron creados entre abril y julio, y algunos tienen fechas inválidas. La vista seguirá siendo **lunes a viernes**, por instrucción del usuario; los fines de semana quedan fuera de esa vista deliberadamente.

## Comportamiento implementado

- Una creación exige `requestId`, huella de contenido y actor. Repetir la misma solicitud devuelve el mismo registro; reutilizar la clave con otro contenido/actor produce conflicto. Un cliente antiguo que no envía clave recibe 422 y debe actualizar la página: el servidor no inventa otra identidad en cada reintento.
- Antes de guardar se autoriza y fija cuenta/calendario. La ausencia de autorización nunca devuelve un evento como sincronizado. Los reintentos no cambian el destino.
- La reconciliación solo selecciona registros sin identidad de escritura ni ID Google. Al iniciar una publicación explícita, fija una clave durable y el destino; si falla, se recupera por ese mismo evento y no vuelve al selector de otra cuenta.
- Crear o reprogramar exige inicio presente/futuro tanto en formulario como en API. La fecha se revalida antes de persistir, después de autorizar. Para «Todo el día», hoy se calcula en Bogotá y se rechazan días anteriores. Editar texto de un evento histórico conserva su horario original; importar historia y recuperar una solicitud ya guardada no crean otra reunión. La reconciliación también impide publicar un pendiente vencido.
- La intención se confirma en PostgreSQL como `PENDING` antes de llamar Google. El ID de inserción Google deriva de la identidad local y cumple base32hex. Un GET verifica identidad y campos antes de recuperar una respuesta perdida.
- Las ediciones usan ETag y lectura de confirmación. Un cambio externo diferente produce `CONFLICT` e invalida el cursor para recuperar una versión que pudo haberse visto mientras existía una intención pendiente. Se conservan las respuestas RSVP.
- `PENDING_DELETE` conserva una eliminación incierta; 404/410 confirma ausencia. `DELETED` conserva la identidad para impedir que un reintento antiguo recree el evento. `MERGED` conserva duplicados consolidados y no acepta CRUD remoto desde pestañas antiguas.
- El planificador recupera hasta 20 intenciones vencidas por ciclo antes de importar. Usa espera exponencial con dispersión y límite de una hora; los fallos terminales requieren intervención. Las solicitudes Google tienen timeout de 15 segundos y no hacen reintentos de escritura ocultos del cliente HTTP.
- Un fallo de autorización previo a la escritura también deja diagnóstico y mueve la cola. Una cuenta revocada no ocupa indefinidamente los primeros 20 lugares; una eliminación conserva `PENDING_DELETE` y su espera. Las actualizaciones de recuperación comprueban el estado previo para no pisar un resultado más reciente.
- Un bloqueo asesor PostgreSQL de sesión es compartido por CRUD, reintentos, importación, selección de calendario y reparación. Un proceso competidor recibe `GOOGLE_CALENDAR_BUSY`. La pérdida de sesión aborta solicitudes y bloquea nuevas escrituras del trabajo viejo. Se evita mantener una transacción de base abierta durante las llamadas de red.
- Cada importación confirma evento/vínculo en una transacción corta. Se conserva la procedencia BRAIN, no se sobreescriben intenciones pendientes y una copia antigua de invitado no reemplaza al organizador.
- La sincronización inicial recorre toda la colección y todas sus páginas. Un 410 reinicia el cursor; solo se guarda el nuevo token tras importar correctamente todas las páginas. La actualización de cursor comprueba cuenta, calendario, conexión y versión previos.
- Se representan recurrencias, excepciones movidas/canceladas, EXDATE/RDATE y zona original. Las consultas admiten hasta 366 días y 10.000 ocurrencias por serie. Frecuencias horarias o más frecuentes devuelven error explícito; no se recortan silenciosamente.
- Cancelar una serie oculta también sus excepciones movidas; se carga la serie original aunque la excepción haya quedado fuera de su rango inicial.
- Se persisten tokens renovados antes de devolver autorización, se protege una reconexión reciente frente a errores antiguos, se pagina la lista de calendarios y se invalidan canales/cursor al cambiar de calendario.
- El frontend distingue guardado local, pendiente y confirmación Google; bloquea doble envío, reutiliza la identidad al recuperar, muestra fallos parciales y errores de lectura de salud. Las fechas incluyen año explícito y las horas corresponden a Bogotá.
- El formulario reúne fecha y hora en un único selector, con calendario y columna de horas. La entrada escrita exige fecha completa con año y parseo estricto. Internamente se conserva el día separado de la hora para que el dispositivo no altere la hora elegida durante cambios de horario de verano. Cambiar solo el título conserva segundos y límites de recurrencia originales. El aviso de fecha vencida es «No puedes elegir una fecha y hora que ya pasó».
- Oficina, retos y métricas excluyen registros cancelados, eliminados, fusionados o pendientes de eliminación. Oficina usa las mismas ocurrencias y excepciones que el calendario, incluso cuando cruzan medianoche.
- Generar un enlace Meet crea un espacio; ya no usa una inserción de calendario sin vínculo local como alternativa.

## Esquema y compatibilidad

La actualización es aditiva en `OperationalEvent` y `GoogleCalendarConnection`: claves de solicitud, contador/siguiente intento, identidad de excepción, zona horaria, cancelación y versión de sincronización. No cambia PostgreSQL, CORS ni `Task.completedAt`. El índice único permite NULL para registros anteriores. No hay borrado, reescritura de fechas ni publicación de eventos históricos en el bootstrap.

`npm start` ya ejecuta `scripts/ensure-calendar-invitations-schema.js` antes de generar Prisma y arrancar el servidor. El bootstrap fue ejecutado dos veces contra PostgreSQL aislado y terminó correctamente. No es necesario ejecutar `prisma db push` sobre producción para esta corrección.

Al actualizar una réplica se debe esperar a que la versión anterior deje de atender antes de reparar duplicados: la versión vieja no participa en el nuevo bloqueo. `syncVersion` fuerza una lectura inicial completa; puede tardar más que una sincronización incremental. Mientras el bloqueo está ocupado, el formulario conserva la intención y permite reintentar.

## Validación

Resultado del cierre local: **209/209 pruebas de calendario y consumidores**, **24/24 pruebas en navegador real** y **5/5 integraciones PostgreSQL**. La compilación de producción y ESLint de los archivos modificados finalizaron sin errores. Esta evidencia es local y no cambia el estado productivo indicado al inicio.

- Pruebas TDD de creación sin cuenta, respuesta perdida de INSERT/PATCH, reintento con la misma clave, cambio externo, ETag, fallo de persistencia, cambio de cuenta, tombstones, descarte, tipos HTTP, fechas ambiguas/imposibles y bloqueo del pasado.
- Pruebas TDD de paginación, 410, cursores obsoletos, aislamiento entre cuentas, recurrencias/zonas y fallos parciales.
- Cinco integraciones con **PostgreSQL 16 real aislado en Docker**: bloqueo contra otro proceso; dos cuentas/una fila/dos vínculos; rollback por FK; recuperación con requestId y persistencia real; consolidación y reversión. Las respuestas Google de esas integraciones son simuladas.
- El fixture aislado conserva las tablas de calendario y sus restricciones; únicamente dos columnas vectoriales ajenas al calendario se representaron como texto porque la imagen de PostgreSQL de prueba no incluye pgvector. El esquema productivo no recibió esa adaptación.
- Navegador real con respuestas API interceptadas: doble envío, recuperación del mismo ID, creación/eliminación pendientes, OAuth en StrictMode, errores de salud, Light/Dark, móvil, pasado y cambios DST del dispositivo. Las capturas están en `verification/calendar-reliability/`.
- Compilación productiva y validación Prisma. La suite general final también se ejecutó con la conexión productiva deshabilitada: 1.160 pruebas pasan, 2 fallan y 6 se omiten (1.168 total). El fallo ajeno al calendario está en `qualityStreakUnit.test.js`, que alcanza `taskWorkCycle.findFirst` sin doble de persistencia y sin base disponible; no se modificaron esos archivos. El reporte cuenta el subtest y su prueba contenedora como dos fallos.
- La verificación visual midió el mensaje de fecha inválida: contraste 4,70:1 en claro y 4,67:1 en oscuro. La derivación compartida de texto destructivo conserva el token global; el bloque «Todo el día» ya contiene su texto completo en móvil.

Las pruebas locales no prueban entrega en Google productivo, recepción de invitaciones ni recuperación después de todas las posibles particiones de red. La disponibilidad de Google y autorizaciones revocadas siguen siendo condiciones externas; ahora deben aparecer como pendientes/errores comprobables.

## Activación y revisión de datos

1. Desplegar backend y frontend de la misma revisión. Comprobar el ID de despliegue exacto en `SUCCESS`, bootstrap terminado y primer ciclo completo por cuenta.
2. Confirmar mediante lectura la cuenta/calendario, `syncVersion`, último éxito, pendientes y errores. Verificar que el evento Wine and Wonder vigente conserve fecha/hora y Google ID.
3. Generar un plan nuevo con `node scripts/repair-calendar-duplicates.js`. El modo predeterminado es solo lectura. La vista previa productiva anterior encontró **4 pares elegibles y 10 rechazados**; las cantidades pueden cambiar al releer.
4. Revisar el plan antes de aplicar con `--apply --plan <archivo> --receipt <archivo-nuevo>`. La transacción revalida huellas, mueve vínculos y conserva ambos registros, marcando duplicados `MERGED`. No llama Google ni envía invitaciones. El recibo permite reversión mientras no existan cambios posteriores.
5. Revisar por separado los grupos rechazados, registros sin vínculo y fechas históricas inválidas. No borrar eventos por igualdad de título/horario, no convertir UID en identidad única de todas las instancias y no cancelar el evento remoto original de 2001 sin revisar su efecto sobre invitados.

## Fuentes del protocolo

- [Google: creación e identificadores propios para evitar duplicados](https://developers.google.com/workspace/calendar/api/guides/create-events).
- [Google: errores, conflictos y reintentos](https://developers.google.com/workspace/calendar/api/guides/errors).
- [Google: sincronización incremental y reinicio del cursor](https://developers.google.com/workspace/calendar/api/guides/sync).
- [Google: notificaciones push](https://developers.google.com/workspace/calendar/api/guides/push).
