# Auditoría operacional de Google Calendar — 7 de septiembre de 2026

Este documento registra el estado **anterior a la corrección** observado en producción y separa evidencia, causas y recuperación pendiente. No afirma que producción esté reparada. Auditoría realizada con la skill `use-railway`, consultas SQL bajo `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`, `transaction_read_only=on`, límite de consulta de 15 segundos y `ROLLBACK`. No se ejecutaron pruebas, migraciones, sincronizaciones, invitaciones, borrados ni despliegues en producción.

## Alcance y evidencia

- Railway: proyecto Brainstudio Lab `ff7560c1-10cc-4807-9e3e-9c215d8ec3cd`, entorno production `ed7ac964-83f7-404d-bb61-194b19615e61`, servicio Intelligence `01f98c5f-d321-48b6-b3aa-6ffe7a146bae`.
- Despliegue observado: `34b939b0-0d28-48aa-b9c1-7996b6089d2b`, estado `SUCCESS`, commit `453fd0d3fc30dca1c6e8e7c0f14b2b3fb9462464`, creado 2026-09-07 14:59:01 UTC. Postgres también reportó `SUCCESS`.
- Fuente y rama verificados contra el remoto local: `rchirinosabreu-cloud/intelligence`, `main`. Una réplica configurada en `us-west2`; `checkSuites=false`.
- La conexión SQL fue contrastada con el proxy TCP activo del servicio Postgres `b0ec2c4a-c1b8-448f-bd9f-a6056b3382dc`; no se mostraron credenciales.
- Instantánea de datos: 2026-09-07 20:30:58 UTC. Se conservaron IDs y conteos, sin títulos, descripciones, direcciones de correo ni tokens. Inventario completo en [CALENDAR_PRODUCTION_AUDIT_2026-09-07.inventory.json](./CALENDAR_PRODUCTION_AUDIT_2026-09-07.inventory.json).
- Logs de Calendar devueltos: 100 entradas del despliegue actual, entre 15:00 y 20:25 UTC. El conjunto acotado de errores no contenía errores de Calendar. Esto no demuestra entrega a Google ni cubre incidentes de despliegues anteriores. La consulta específica de HTTP POST `/api/activity/events` no devolvió registros.
- Las dos cuentas tenían tokens de acceso almacenados vencidos. No se renovaron ni se invocaron funciones productivas que modifican la conexión. Por ello la identidad actual remota no se contrastó mediante GET de Google; la evidencia de duplicidad descrita abajo proviene de PostgreSQL y los logs.

## Inventario real

| Hecho | Cantidad |
| --- | ---: |
| Eventos locales totales | 291 |
| BRAIN con estado NULL, sin ID Google y sin vínculo | 79 |
| BRAIN descartados explícitamente | 2 |
| BRAIN SYNCED | 20 |
| GOOGLE SYNCED | 190 |
| GOOGLE SYNCED sin fila de vínculo | 31 |
| Grupos con mismo iCalUID, inicio y fin | 14 |
| Filas adicionales dentro de esos grupos | 14 |
| Grupos con mismo título normalizado, inicio y fin | 16 |
| Eventos con fin anterior o igual al inicio | 16 |
| Series recurrence=GOOGLE | 26 |
| Series recurrence=WEEKLY | 0 |

Los 79 pendientes locales y los 16 rangos inválidos son históricos; no deben presentarse como 79 fallos nuevos. Los pendientes se crearon entre el 20 de abril y el 3 de julio de 2026. Los 31 Google sin vínculo son históricos. Igual título/horario es una señal para revisar y no autoriza una eliminación. Compartir iCalUID por sí solo tampoco demuestra duplicidad: Google lo comparte entre las instancias de una serie.

Las dos conexiones estaban activas, con calendario `primary`, cursor incremental y un canal no vencido por cuenta. Tenían 322 y 153 vínculos; última sincronización registrada alrededor de 20:25 UTC. Sus canales vencían el 12 de septiembre a las 14:09 UTC. Las variables requeridas de OAuth estaban definidas; el webhook usa el dominio productivo como fallback y se observaron notificaciones entrantes. No hay evidencia de un webhook completamente caído ni de una caída general de Railway en esta instantánea.

## Incidente identificado: Wine and Wonder con Gema

El usuario precisó que el evento fue recreado directamente en Google Calendar. Una nueva lectura SQL bajo `READ ONLY`, a las **20:57:29 UTC del 7 de septiembre**, encontró la recreación y un evento anterior con el mismo título e invitada. La coincidencia de Gema se comprobó por igualdad interna del correo de invitación entre ambos registros; no se conserva ni se muestra ese correo.

| Registro | Evidencia |
| --- | --- |
| Intento anterior | ID local `591e30da-3517-49fe-86c2-5f84de675a9e`; Google ID `pa08qe6c084rteeg4eajnnb464`; creado el 4 de septiembre de 2026 a las 17:34:59.421 UTC; conserva creador de plataforma y dos vínculos Google |
| Fecha del intento anterior | **11 de septiembre de 2001**, 13:00–14:00 UTC, guardada en PostgreSQL. `to_char(startAt)` devolvió `2001-09-11 13:00:00.000000` y `EXTRACT(YEAR)` devolvió `2001`; no es una reinterpretación horaria de Node |
| Recreación vigente según el usuario | Google ID `0qjq7tl2v7epfc88kcs86ccvq5`; 11 de septiembre de 2026, 14:00–15:00 UTC (09:00–10:00 Bogotá) |
| Duplicado de la recreación en plataforma | IDs locales `9832c61b-87fd-401f-8d95-336daad33e97` (vínculo organizador) y `d4182fa6-2d12-4f4f-b00b-e8de7c9187c5` (vínculo invitado), creados a las 16:45:29.417/.416 UTC del 7 de septiembre |

Los tres registros figuran `SYNCED`, tienen a la misma invitada identificada como Gema y carecen de error registrado. El anterior conserva `googleUpdatedAt=2026-09-04 17:35:00.080` y metadatos de ambas cuentas. Su `source=GOOGLE` no permite negar un origen en plataforma: la versión desplegada sobrescribía la procedencia al importar. La presencia de creador local y vínculos es consistente con un intento previo que llegó a Google y quedó registrado con un año incorrecto. **La fecha 2001 está confirmada en la base de datos; no se verificó el estado remoto actual mediante GET**.

Se intentó obtener acceso temporal solo en memoria para esa lectura remota, sin guardar tokens ni cambiar eventos; Google respondió `invalid_client` con la configuración OAuth local y no se ejecutaron GET de eventos. Esto no demuestra un fallo de la autorización productiva: las conexiones de producción mantenían sincronizaciones recientes. No se insistió modificando configuración.

No existe un huérfano BRAIN de septiembre asociado al intento. El único Wine and Wonder sin vínculo es `e72bc1b2-6900-47ce-ab1a-39ae1b556ab2`, una actividad de parrilla del **27 de mayo**, sin Gema; es ajena a esta reunión y no debe publicarse para resolverla.

**Protección del evento vigente:** no recrear ni mover automáticamente a 2026 el registro fechado en 2001, y no reenviar invitaciones. La reunión vigente ya tiene identidad Google. La única reparación local candidata para este incidente es consolidar las dos copias de `0qjq7tl2v7epfc88kcs86ccvq5`, conservando esa identidad y sus vínculos, previa revalidación. El evento anterior con otra identidad Google requiere revisión separada; no es elegible para fusionarse solo por coincidir el título.

El incidente combina evidencia de **año incorrecto aceptado sin advertencia** y **duplicación al importar simultáneamente las dos cuentas**. No debe resumirse como una simple caída de Google ni como un evento que nunca alcanzó la integración. La causa exacta que introdujo 2001 en el formulario requiere contrastar el flujo de captura; los datos por sí solos no distinguen entrada accidental de conversión defectuosa.

## Hallazgos priorizados

### P1 — Carrera entre cuentas crea dos filas para el mismo evento

Confirmado en datos: las filas `d4182fa6-2d12-4f4f-b00b-e8de7c9187c5` y `9832c61b-87fd-401f-8d95-336daad33e97` comparten Google ID `0qjq7tl2v7epfc88kcs86ccvq5`, iCalUID, inicio y fin. Son eventos no recurrentes, origen GOOGLE; cada fila tiene un vínculo de una conexión distinta. Fueron creadas el 7 de septiembre a las 16:45:29.416 y 16:45:29.417 UTC. Coinciden con webhooks recibidos a las 16:45:29.099 y 16:45:29.128 UTC.

La implementación desplegada en `operationalEventService.js` bloquea por conexión, busca una fila por UID y luego la crea en operaciones separadas. Dos cuentas pueden concluir al mismo tiempo que no existe. El índice único de `GoogleCalendarEventLink` protege la copia por conexión, pero no la identidad común del evento. Este mecanismo explica el par confirmado y los duplicados que aparecen al recibir dos invitaciones del mismo evento. Incluso con una sola réplica, son dos tareas concurrentes diferentes.

Corrección necesaria: exclusión mutua compartida por todos los escritores/importadores, identidad de instancia separada de la serie y persistencia atómica de evento/vínculos. Verificar con dos importadores concurrentes de cuentas distintas y con excepciones de recurrencia. El control en memoria por cuenta no basta para reinicios, despliegues solapados ni futuras réplicas.

### P1 — El diagnóstico oculta 79 eventos locales sin sincronizar

Confirmado por SQL: el filtro equivalente al código `googleSyncStatus != 'DISMISSED'` devuelve **0** pendientes. Incluir los estados NULL devuelve **79**. SQL no considera `NULL != 'DISMISSED'` verdadero.

El filtro se repite en el estado de conexión, la previsualización y la selección de conciliación. Esto permite mostrar un calendario aparentemente sin pendientes mientras eventos locales nunca adquirieron ID ni vínculo Google. Corregir las tres consultas con NULL explícito; conservar `DISMISSED` como exclusión deliberada. No publicar los 79 eventos automáticamente: son históricos y 16 datos tienen un rango inválido.

### P1 — Creación y reintentos no tienen identidad durable de operación

La ruta `POST /api/activity/events` crea una fila nueva en cada petición; no recibe ni conserva una clave estable de petición. `events.insert` deja generar un nuevo ID a Google. Una respuesta perdida después de aceptar el evento puede terminar en borrado compensatorio local y un nuevo intento con otro ID. La propiedad privada `brainOperationalEventId` permite reconocer copias posteriormente, pero no hace idempotente la inserción original.

La propia guía de Google recomienda asignar el ID al crear para evitar duplicados cuando la operación ya se completó en su backend. La corrección requiere clave estable del cliente, huella y actor comprobados en servidor, ID Google derivado de la identidad local, recuperación mediante GET ante resultado incierto, y estado persistente para reintentar tras reinicios. Un conflicto HTTP 409 exige leer y comprobar identidad antes de darlo por resuelto.

### P1 — Ausencia de cuenta puede producir guardado local con apariencia de éxito

En el código desplegado, `syncOperationalEventToGoogle` devuelve el evento sin error si no hay cliente autorizado. La ruta responde con éxito. El mismo patrón existe en eliminación de un evento vinculado: si la autorización no existe, la limpieza local puede continuar y dejar la copia Google intacta.

Se debe rechazar una operación que requiere Google o conservarla como pendiente explícito y verificable. No es correcto convertir la falta de cuenta en sincronización confirmada. Este defecto general es independiente del incidente de Wine and Wonder identificado arriba, que sí conserva ID y vínculos de Google y un año incorrecto en la base de datos.

### P1 — Series de Google y excepciones no tienen representación completa

Hay 26 series `GOOGLE`. El código desplegado solo expande `WEEKLY`; la lectura por rango también trata de forma especial únicamente esa clase. Una serie compleja cuyo primer evento sea antiguo no aparece correctamente en las semanas actuales. El importador además usa iCalUID sin distinguir `originalStartTime`, por lo que una excepción puede sobrescribir la fila de su serie u otra instancia. Una cancelación de instancia no debe eliminar la serie.

La solución debe representar identidad de serie e instancia, fecha original y cancelaciones; evaluar reglas completas y excepciones o materializar instancias de Google. No ampliar la deduplicación a una unicidad simple de iCalUID. Probar evento movido, instancia cancelada, regla con BYDAY/COUNT/INTERVAL y rango posterior al inicio de la serie.

### P1 — No existe cola durable para recuperar escrituras inciertas

Los errores se guardan como diagnóstico o se intenta compensar borrando/restaurando la fila local. El planificador solo importa desde Google; no asegura que las escrituras locales pendientes vuelvan a enviarse. Al cerrar la petición o reiniciar el proceso, un intento incierto puede quedar sin dueño. Una escritura remota que sí ocurrió puede ser sobrescrita por datos locales/restaurados o duplicada por otro intento.

Se necesitan estados de escritura pendientes, reintentos con espera y límite por intento, conservación del destino organizador original y prevención de que la importación sobreescriba una intención local pendiente. La cancelación necesita su propio estado durable. El 404/410 de una copia remota debe interpretarse dentro de la operación correspondiente.

### P2 — Señal de salud no prueba sincronización

Los logs reportan «Sincronización automática completada» cada cinco minutos. `syncAllGoogleCalendars` atrapa fallos por cuenta y devuelve objetos de error; el planificador no los inspecciona antes de escribir ese mensaje. Además, `connected` es la existencia de una conexión marcada activa, no una lectura satisfactoria reciente de Google.

Registrar resultado por conexión, número de pendientes, errores, antigüedad de último éxito, vencimiento de canal y siguiente reintento. Diferenciar cuenta vinculada, autenticación verificada y sincronización terminada. Nunca borrar el error operativo al ocultar su tarjeta si eso elimina el único rastro de una escritura pendiente.

### P2 — Calendario y organizador pueden cambiar por selección implícita

La elección predeterminada utiliza la conexión ordenada por `lastSyncedAt`, un campo que cambia continuamente. El calendario elegido no se verifica como escribible en `setActiveGoogleCalendar`; la lista incluye permisos `reader`. Sin vínculo, la escritura usa el calendario de la conexión, sin asegurar que respete el `googleCalendarId` persistido en el evento.

El destino debe resolverse de forma estable y persistirse antes de la primera escritura, con autorización de escritura verificada. El selector debe mostrar y mantener el organizador concreto. Cambiar calendario activo también requiere cursor y canal propios del nuevo calendario.

### P2 — Integridad histórica requiere reparación separada

Los 16 rangos inválidos son BRAIN, no todo el día y no recurrentes. Los 31 GOOGLE sin vínculo no significan por sí mismos que no exista evento remoto. Crear un índice único nuevo sin atender los duplicados tampoco los repara. Estas condiciones deben mostrarse como datos por revisar, sin inventar horas, eventos o confirmaciones.

No se encontró evidencia suficiente para declarar un P0. La auditoría de permisos confirmó que las escrituras del calendario exigen ADMIN/PROJECT_MANAGER y pasan por autenticación que revalida usuario activo y sesión. El webhook público exige canal y token registrados no vencidos; su exclusión de JWT es intencional. Falta comprobar el identificador de recurso del webhook como defensa adicional.

## Recuperación conservadora propuesta

1. Publicar primero la corrección de identidad, exclusión mutua, estados durables, validación y diagnóstico; verificar que el despliegue exacto alcance `SUCCESS` y no produzca nuevas filas duplicadas ante dos notificaciones.
2. Releer el inventario con una nueva instantánea de solo lectura. El JSON adjunto es evidencia del momento, no una orden de ejecución: puede quedar obsoleto si usuarios editan o eliminan eventos.
3. Para los 14 grupos UID/horario, obtener sus copias remotas con GET y verificar Google ID, UID, originalStartTime, organizador, estado, versión y vínculos. La coincidencia de título sola no autoriza fusionar. Elegir la fila canónica conservando autoría y referencias. Consolidar vínculos y retirar solo la redundancia local mediante transacción y versión esperada; no cancelar el evento Google ni enviar invitaciones.
4. Para los 31 GOOGLE sin vínculo, comprobar que la copia pertenece a una conexión autorizada y que sigue existiendo. Restaurar únicamente vínculos comprobados. Conservar aparte los casos cancelados, inaccesibles o ambiguos.
5. Revisar los 79 locales con el responsable del calendario. Mantener descartes explícitos y no enviar retrospectivamente invitaciones de abril–julio. Corregir los 16 rangos solo con evidencia del horario real. Publicar únicamente eventos seleccionados con organizador y fechas confirmados.
6. Ejecutar verificación real de creación, edición, reintento, copia entre cuentas, cancelación, recurrencia y reconexión en un calendario de prueba aislado, sin invitados reales. Las pruebas con dobles no sustituyen esta validación de Google.

## Herramienta de reparación local preparada

`scripts/repair-calendar-duplicates.js` queda disponible, pero **no se ejecutó ninguna reparación en producción**. Requiere que el bootstrap aditivo de calendario ya esté desplegado. La vista previa es el modo predeterminado y lee en una transacción `READ ONLY`; nunca ejecuta el bootstrap ni utiliza la API de Google.

La elegibilidad exige origen GOOGLE, estado SYNCED, ausencia de intención idempotente nueva/error/reintento/cancelación, misma identidad Google e iCalUID, fechas y recurrencia, vínculos comprobables y todos los demás campos de contenido iguales. Los metadatos propios de cada cuenta se conservan en la fila original y en sus vínculos. El organizador tiene prioridad al elegir la fila canónica. El script mueve únicamente la propiedad local de los vínculos; conserva cada registro duplicado con `googleSyncStatus=MERGED` y `googleCancelled=true`. No borra filas ni eventos remotos.

Una previsualización de solo lectura sobre los 190 registros GOOGLE de producción encontró **4 pares elegibles** y rechazó 10 de los 14 pares por contenido distinto o vínculos no verificables. Entre los elegibles está el par creado con 1 ms de diferencia. Esta previsualización se hizo antes del bootstrap y **no es un plan aplicable**: debe generarse un plan fresco después del despliegue. La lista de elegibles puede cambiar por sincronizaciones posteriores.

```powershell
# Generar y revisar plan; solo IDs, conteos, códigos y huellas.
node scripts/repair-calendar-duplicates.js > calendar-repair-plan.json

# Acción explícita posterior al despliegue y revisión del plan.
node scripts/repair-calendar-duplicates.js --apply --plan calendar-repair-plan.json --receipt calendar-repair-receipt.json

# Reversión explícita, únicamente si las filas y vínculos siguen sin cambios.
node scripts/repair-calendar-duplicates.js --apply --revert calendar-repair-receipt.json
```

La aplicación exige plan guardado y un archivo de recibo nuevo; se vuelve a comprobar la huella completa de eventos/vínculos bajo el bloqueo global de calendario y una transacción `Serializable`. Un cambio concurrente invalida el plan. No se debe relajar esa comprobación para forzar una reparación: regenerar y revisar la vista previa.

El recibo se escribe y sincroniza a disco **antes del commit**. Un fallo de escritura revierte la transacción. La presencia del recibo no demuestra que el commit terminó: la reversión compara su huella posterior con la base de datos antes de actuar. Conserva el recibo fuera de limpiezas temporales. La reversión solo restaura propietario de vínculos y las dos marcas del duplicado; jamás sobrescribe contenido. Si una sincronización o edición posterior cambia las filas, la reversión automática se rechaza y requiere revisión manual. El importador productivo debe excluir MERGED al resolver nuevas copias para no revivir el registro conservado.

Validación del reparador: 19 pruebas unitarias mediante TDD cubren selección conservadora, autoría/recurrencia/identidad discrepantes, metadata de vínculos, obsolescencia, rollback ante fallo de vínculo o recibo, reversión y recibo manipulado.

La ejecución coordinada de esta tarea añadió **5 pruebas de integración aprobadas contra PostgreSQL real en Docker**, mediante `tests/googleCalendarPostgres.integration.mjs`, y aplicó el bootstrap dos veces para verificar su repetibilidad. Se comprobó el bloqueo entre procesos, la importación concurrente de dos cuentas con una sola fila y dos vínculos, rollback ante clave foránea inválida, reintentos con identidad durable, y reparación/reversión conservando las filas y los vínculos. El archivo exige `TEST_DATABASE_URL` con host localhost/127.0.0.1, puerto 55439 y base `calendar_sync_test`; nunca toma `.env` como alternativa. La persistencia y concurrencia son reales en esas pruebas; las respuestas de Google continúan simuladas y no equivalen a validar entrega contra Google Calendar real.

## Fuentes primarias contrastadas

- [Google: creación de eventos](https://developers.google.com/workspace/calendar/api/guides/create-events): ID propio para recuperación de inserciones y prevención de duplicados.
- [Google: Events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert): restricciones del ID, diferencia con iCalUID, notificaciones y final exclusivo. La preferencia de invitaciones del destinatario puede impedir que aparezca automáticamente aunque la invitación exista; no forzar aceptación ni duplicar el evento para compensarlo.
- [Google: sincronización incremental](https://developers.google.com/workspace/calendar/api/guides/sync): paginación completa, persistir el cursor al terminar y recuperación ante 410.
- [Google: notificaciones push](https://developers.google.com/workspace/calendar/api/guides/push): los canales caducan, deben reemplazarse y pueden solaparse; una notificación requiere volver a leer el recurso.
- [Google: manejo de errores](https://developers.google.com/workspace/calendar/api/guides/errors): distinguir autenticación, conflictos, cuotas y errores transitorios; aplicar espera exponencial donde corresponda.

Las recomendaciones derivan de esas reglas y del código productivo contrastado. No implican garantía de disponibilidad de Google ni validación remota de los eventos inventariados.

## Preflight antes de publicar — 7 de septiembre, 21:39 UTC

La nueva lectura de las **21:39:10 UTC**, bajo transacción `READ ONLY`, encontró cambios respecto del inventario histórico: los BRAIN con estado NULL pasaron de **79 a 78**, y el evento Wine and Wonder fechado en 2001, ID local `591e30da-3517-49fe-86c2-5f84de675a9e` / Google ID `pa08qe6c084rteeg4eajnnb464`, **ya no estaba en PostgreSQL**. Son cambios observados entre lecturas, externos a las acciones de esta auditoría; no ejecutamos esas eliminaciones ni podemos atribuirlas a una persona o proceso concreto. El inventario original conserva su valor como evidencia histórica y no se modifica para representar esta instantánea posterior.

La reunión vigente conserva Google ID `0qjq7tl2v7epfc88kcs86ccvq5` y horario **11 de septiembre de 2026, 14:00–15:00 UTC**, todavía con sus dos filas locales y un vínculo en cada una. No se recreó ni se modificó el evento para realizar esta comprobación.

Intelligence continuaba en el despliegue `34b939b0-0d28-48aa-b9c1-7996b6089d2b`, `SUCCESS`, commit `453fd0d3fc30dca1c6e8e7c0f14b2b3fb9462464`, conectado al repositorio y rama `main` verificados. La salud pública devolvió HTTP 200; las dos conexiones estaban activas, con cursor y un canal vigente por cuenta, y último ciclo registrado alrededor de las 21:35 UTC. Las nueve columnas nuevas del bootstrap todavía no existían, como corresponde al estado previo a publicar. Este preflight no ejecutó cambios de esquema, variables, reparaciones ni escrituras de Google.

Preparación de la verificación posterior, 21:47 UTC: el helper local exige ahora validación TLS normal. La conexión pública PostgreSQL devolvió `SELF_SIGNED_CERT_IN_CHAIN`, también usando las CA del sistema; no se desactivó la validación para continuar. El launcher local ignorado `verification/calendar-deploy-check-ssh.ps1` resuelve el servicio mediante `railway ssh config --dry-run`, exige host SSH ya confiable y ejecuta consultas acotadas con `DATABASE_URL` interna y transacción `READ ONLY`, sin escribir archivos remotos. La lectura interna quedó sin ejecutar porque `ssh.railway.com` no está en `known_hosts`; no se aceptó otra huella ni se cambió confianza o TLS. HTTP seguía en 200. La comprobación inmediata del despliegue se apoyará en commit, estado, logs autenticados de bootstrap y primer ciclo, y salud HTTP; esta limitación no bloquea publicar el código.
