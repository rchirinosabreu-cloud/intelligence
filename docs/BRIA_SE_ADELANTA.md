# Bria se adelanta, el pulso y el foco de la semana

10 de octubre de 2026. Rodny: «me gustaría que se adelante … por ejemplo, “Melissa no tiene nada en proceso desde hace 30 minutos, pregúntale en qué está”; la idea es que guíe a los projects y, claro, con un lenguaje más sobrio, corporativo y amigable». Y sobre el foco: «podría tener un resumen listo cada lunes para cada persona y dejarlo ahí en uno de sus chats para leer». Esa misma tarde: «quiero que viva en la plataforma desde ahora mismo».

## El pulso: cómo «vive» Bria en la plataforma

Las reglas de la primera versión eran avisos programados. El pulso (`src/lib/briaPulse.js`, `src/services/briaPulseService.js`) es lo que los convierte en algo que Bria decide:

1. **El código detecta.** Cada 15 minutos en horario hábil (8 a 18 de Bogotá, días hábiles de Colombia; Rodny: «si lee cada hora, ¿cómo podría saber que Melissa lleva 30 minutos? ¿una hora no es mucho?») se reúnen una sola vez los hechos de la plataforma: quién no tiene nada en proceso y qué vence hoy (las reglas de abajo), quién tiene mañana más de lo que cabe en un día (mapa de carga), qué cliente está en rojo en Operación, qué cliente tiene piezas esperando su aprobación esta semana y qué tarea lleva un día devuelta sin cambios. Cada hecho tiene un id estable y una huella de su texto.

   **Las aprobaciones se miran por cliente y en toda la semana** (Rodny, 19 de octubre de 2026: «hay piezas que no se han aprobado en la parrilla tal, ¿quieres enviarle un mensaje a Aristea? Puedo ayudarte a redactarlo … no te estoy dando un texto fijo sino una forma de pensar, de actuar de Bria»). Las piezas que esperan aprobación y salen en los próximos siete días (`APPROVAL_LOOKAHEAD_DAYS`) se agrupan por parrilla en **un solo hecho por cliente**, `APROBACIONES_PENDIENTES`: cuántas son, cuál sale primero y cuándo, con el día de la semana, y la oferta de redactarle el mensaje con el enlace del portal. Su importancia sube con la cercanía de la primera (hoy, dos días o más), y su huella cambia si cambian las piezas o sus fechas. Sus acciones son «Abrir la parrilla» y «Escribirle a Aristea», que deja escrita la petición y cae en `mensaje_para_cliente`. **Una sola pieza a dos días o menos conserva su aviso de siempre** (`PIEZA_SIN_APROBAR`), que tiene seguimiento pieza por pieza; el aviso por cliente todavía no tiene seguimiento.
2. **Bria decide y habla.** Para cada persona con Bria, el modelo rápido recibe los hechos de ahora, lo que ya le dijo hoy y quién es, y responde si vale la pena interrumpir (`speak`), con qué avisos (puede juntar dos hechos relacionados en uno), en qué orden y con qué palabras. Tono sobrio, corporativo y amable; nunca un juicio.
3. **El código manda.** `validatePulse` conserva solo lo respaldado por hechos reales, tira cualquier frase con un juicio («lento», «flojo», «mal»…), y aplica los topes de Rodny: **3 avisos nuevos por persona y jornada, 1 por hora, ningún hecho repetido dentro de la jornada salvo que cambie** (misma huella = no se repite), **silencio fuera de 8 a 18 y en días no hábiles**, y **un tipo de aviso que la persona ocultó tres veces en la semana deja de darse**. La jornada es de 8 a 18: ahí se cuenta todo, no en 24 horas.
4. **Si el modelo no está, Bria no se calla:** dice el hecho más importante con las palabras de la plataforma, marcado `REGLA`.

Lo dicho queda en `bria_memory.pulse_messages` (hechos, texto, acciones, origen, modelo, si se ocultó) y vive hasta el final de la jornada; `pulse_runs` reclama cada tramo de 15 minutos para que un reinicio o una segunda réplica no lo repita. Los textos dicen la hora, no los minutos («desde las 10:05»): la tarjeta se lee más tarde y «lleva 35 minutos» envejece. La tarjeta encima de la mascota lee el pulso mientras esté vivo (corrió en las últimas dos horas); si no ha corrido —recién desplegado, proveedor caído— vuelve a las reglas de siempre, para que la tarjeta nunca dependa de una sola pieza. Costo: como máximo una llamada al modelo rápido por persona y hora hábil (los tramos siguientes de la misma hora no preguntan si ya se le habló), y solo cuando hay hechos nuevos y presupuesto.

**Las acciones las pone la plataforma según el hecho** (`nudgeActions` en `src/lib/briaNudges.js`; Rodny: «¿cuál sería la lógica de ir al kanban en un anuncio así? ¿a ver qué?»): nunca un «Ver en Gestión» genérico. Persona sin nada en proceso → «Ver sus pendientes» (Gestión filtrada por ella, `/gestion?responsable=Nombre`) y «Que Bria me resuma lo que tiene»; vence hoy → «Abrir la tarea» (o sus pendientes) y el resumen; carga excedida mañana → «Abrir el mapa de carga» y «Pedirle a Bria qué se mueve»; cliente en rojo → «Abrir operación» y «Pedirle a Bria qué falta»; pieza sin aprobar → «Abrir la pieza» y «Redactar recordatorio al cliente»; varias piezas de un cliente por aprobar esta semana → «Abrir la parrilla» y «Escribirle a» ese cliente; devuelta sin tocar → «Abrir la tarea» y «Ver qué pidió el cliente»; foco de la semana → «Leer en Bria». Lo que se le pide a Bria queda escrito en el chat; la persona lo envía.

## El seguimiento de los avisos

Rodny, 14 de octubre de 2026 (primer punto del plan «llevar a Bria a más niveles»): «hoy Bria dice “Melissa no tiene nada en proceso” y se olvida; que a la hora mire si cambió algo y lo diga». Un aviso no termina al decirse. Cada tramo del pulso vuelve a mirar los avisos vivos que la plataforma puede comprobar sola (`src/lib/briaFollowUp.js`, `FOLLOWABLE_KINDS`: sin tarea en proceso, vence hoy, devuelta sin tocar, pieza sin aprobar):

- **Si el hecho se resolvió**, se escribe el desenlace con la hora en la misma fila (`resolution`, `resolved_at`): «Melissa arrancó “Reel de lanzamiento” a las 10:40», «Melissa puso su reloj en marcha», «“Carrusel de Endova” ya salió de devuelta: está en proceso», «“Promo del mes” ya no está pendiente del cliente». La tarjeta lo muestra en verde debajo del aviso.
- **Si a la hora sigue igual**, se dice una sola vez (`follow_up`, `followed_up_at`): «Melissa sigue sin una tarea en proceso a las 11:31». Después solo se espera el desenlace.
- **Nada de esto es un aviso nuevo:** no gasta los topes, no abre otra tarjeta, no repite el hecho. Un aviso oculto con la X no se sigue. Sin datos para comprobar (la persona ya no está en la lectura), no se afirma nada.
- Para seguir a una persona sin nada en proceso hace falta saber **cuándo arrancó** lo que ahora tiene en proceso: `readPeople` entrega `since` (el `startedAt` de la tarea).

Operación en rojo, carga de mañana y correos no tienen seguimiento: la plataforma no puede decir sola cuándo quedaron atendidos.

## El cierre del día

Rodny, el mismo día: «un solo mensaje por persona: qué cerró, qué quedó en proceso, qué vence mañana. Y para ti, el resumen del equipo». A las **5 de la tarde de cada día hábil** (Bogotá), para cada persona con Bria, un chat nuevo titulado «Cierre del día · martes 13 de octubre» con un solo mensaje escrito por la plataforma (`src/lib/dailyClose.js`, sin modelo, como el foco):

- **Tu día:** lo que cerraste (también donde colaboraste), lo que queda en proceso y lo vencido sin cerrar.
- **Mañana** (o el lunes, o el día después del festivo: `nextWorkday`): lo que te vence.
- **El equipo** (administradores y project managers, que son quienes tienen Bria): cuántas tareas se cerraron hoy y quién, cuántas quedan en proceso, qué vence mañana sin empezar y por persona, cuántas vencidas abiertas. Se cuenta a todo el equipo menos a los administradores.
- **Lo que te avisé hoy:** cada aviso del pulso con su desenlace («→ Melissa arrancó … a las 10:40»), «→ Al cierre seguía igual» o «→ Lo ocultaste».

Una sola vez por día y persona (`bria_memory.daily_close_deliveries`), aviso en la campana (`BRIA_CIERRE_DEL_DIA`, que abre el chat) y «Bria dejó tu cierre del día» como primer aviso encima de la mascota (`CIERRE_DIA`, se oculta por hoy). Servicio: `src/services/dailyCloseService.js` (`runAutomatic`, `initDailyCloseScheduler` en `server.js`, cada 10 minutos).

**La lectura de la mañana (19 de octubre de 2026)** es la otra punta del día: a las 7:30, a administradores y project managers, lo que Bria vio al amanecer comparado con la historia de cada cuenta y persona, lo que haría hoy y lo que no haría. Encima de la mascota va como `LECTURA_DIA`, después del cierre del día y antes del foco de la semana. Detalle: `docs/BRIA_OJOS_Y_CEREBRO.md`.

## Pedir acceso a un módulo

Rodny, 15 de octubre de 2026: «si Camila está solicitando algo a lo que Bria no le puede dar acceso por su rol, no tiene que pedírmelo directamente, me debería aparecer a mí el anuncio … y así nos adelantamos aún más», y después «haz también la versión general». Las contraseñas tienen su propio camino (`docs/BOVEDA_DE_ACCESOS.md`, «Pedir un acceso»); esto es lo mismo para los **módulos** de la plataforma.

- **Bria sabe qué le falta a cada persona.** La última línea de sus instrucciones dice «Módulos que no tiene: Financiero, CRM…», sacada de la lista única de módulos (`missingModules`, `src/lib/modulePermissionRequests.js`). Esa línea cambia por persona y por eso va al final, para la caché de prompt.
- **Lo pide sola.** Si la persona pregunta o quiere hacer algo de uno de esos módulos («¿cuánto nos debe Aristea?»), Bria llama `pedir_permiso` con el módulo y para qué, sin que ella lo pida, y le dice en una frase que ya se lo pidió a un administrador. No da la información ni la deduce por otro camino. Un «no tienes permiso» de la plataforma (`consultar_plataforma` con 403) apunta al mismo pedido. Lo que es solo de administración (Gobierno de IA, Salud operativa, el uso de Bria) no es un módulo y no se pide.
- **Sin insistir.** Un pedido abierto por módulo y persona (`bria_memory.permission_requests`); lo denegado en los últimos 7 días no se vuelve a pedir solo, y Bria dice quién lo denegó.
- **El aviso del administrador.** Notificación `MODULE_ACCESS_REQUESTED` y, primero encima de Bria, «Camila necesita acceso a Financiero», para qué lo pidió y a qué hora, con «Dar acceso» y «Denegar» (`POST /api/bria/nudges/permission-requests/:id/decision`, solo administradores).
- **Dar acceso** marca la misma casilla que Equipo y nada más (`grantModule`), dentro de una transacción que vuelve a leer la cuenta y solo si la persona sigue activa en el equipo. **Financiero entra en solo lectura** (`VIEWER`) salvo que ya tuviera un nivel; el aviso lo dice y el nivel se cambia en Equipo. Decidir reclama el pedido con una sola escritura condicional, así que dos administradores no deciden dos veces; si dar acceso falla, el pedido vuelve a quedar pendiente. Los permisos se leen de la base en cada petición, así que valen al instante.
- **La respuesta.** `MODULE_ACCESS_GRANTED` (que al tocarlo abre el módulo recargando la página, para que el menú lea el permiso) o `MODULE_ACCESS_DENIED`, y su aviso: «Rodny te dio acceso a Financiero», con «Abrir Financiero», o «Rodny denegó tu acceso a Financiero». Su X la da por vista.

Contrato: `tests/modulePermissionRequest.test.js`; recorrido real con capturas: `node tests/browser/briaPermissionRequest.mjs`.

## La consulta rápida, detrás de la mascota

Rodny, 10 de octubre: «hacerle una pregunta rápida a Bria, no necesariamente abriendo un chat nuevo … “Haz tu consulta” y el icono de pulso … que ella misma diga “recuerda que puedes consultarme algo”». La primera versión era una caja permanente dentro de la tarjeta, y al día siguiente Rodny la devolvió: «cuando entro en la plataforma siempre aparece el cuadro de la consulta, no me gusta así, estorba … cuando poso el cursor sobre ella, aparecen dos iconos … la barra de consulta escribiendo o enviando un audio, ninguno es un chat nuevo».

Desde el 11 de octubre de 2026 **la tarjeta existe solo cuando Bria tiene algo que decir** (`BriaNudge` devuelve nada sin aviso) y la consulta vive **detrás de la mascota** (`BriaAssistant.jsx`, `BriaQuickAsk.jsx`):

- **Al pasar el cursor** sobre Bria aparecen, deslizándose desde ella, dos iconos redondos en la superficie de los popovers: **el lápiz** («Escribir una consulta») y **el micrófono** («Dictar una consulta»). Solo con cursor real (`@media (hover: hover)`) o navegando con teclado (`:focus-within`); **en táctil no existen** y tocar a Bria sigue abriendo el chat. Hacer clic en la mascota abre el chat, como siempre.
- **Los dos abren la misma caja** en el sitio de la tarjeta: una línea «Haz tu consulta», el micrófono y el icono de pulso para enviar, con un recordatorio corto de Bria arriba (`QUICK_ASK_REMINDERS`, fijo por persona). Desde el lápiz, el cursor queda listo; desde el micrófono, **empieza a grabar de una vez** y lo dictado queda escrito en la caja para revisarlo y enviarlo con Enter (igual que en el chat: una transcripción nunca se manda sola). Lo que la persona envía va **al chat que tenga abierto**, o a uno nuevo si no hay ninguno (`quickAskBria` / `onBriaQuickAsk`); **nunca dice «nuevo chat»**. Escape, la X o enviar la cierran.
- **Un solo dictado para toda Bria:** `useBriaDictation.js` (micrófono, tope de 20 MB y 5 minutos, `POST /dictation`, soltar el micrófono al cancelar o cerrar) lo comparten el compositor del chat y la consulta rápida. No volver a grabar aparte.

**Los gestos** (Rodny: «cuando uno pasa el cursor, hace un movimiento, cuando está escribiendo, se inclina … hay un movimiento suave y natural siempre»): la regla es pura (`src/lib/briaMascotGesture.js`: escuchar gana a escribir, escribir gana a pasar el cursor; mientras Bria trabaja o celebra manda la pose del lienzo) y el movimiento es CSS sobre el lienzo entero (`[data-bria-gesture]` en `index.css`, curva con un poco de rebote): **se levanta** al pasar el cursor, **se inclina** hacia la caja mientras se escribe y **se mece** mientras graba. El botón fijo no se mueve nunca, para que Bria siempre esté donde se la busca, y `prefers-reduced-motion` deja el lienzo quieto. La ilustración del atlas no cambia: los gestos no son poses nuevas.

## Qué es

Dos cosas que Bria hace sin que nadie le pregunte, y que **nunca abren el chat solas ni mandan nada**:

1. **Avisos encima de la mascota.** Una tarjeta pequeña, en la superficie de los popovers (`brain-popover-surface`), fija encima del botón de Bria y solo con el panel cerrado. Dice un hecho de la plataforma y una sugerencia, con las acciones de su tipo (ver arriba): un enlace al sitio exacto, algo que pedirle a Bria (`askBria`: queda escrito, la persona decide si lo manda) o abrir el chat del foco (`openBriaConversation`). La **X** oculta ese aviso por hoy, en el servidor, solo para quien lo ocultó.
2. **El foco de la semana.** Los lunes desde las 7 (Bogotá), para cada persona con Bria (administradores y project managers con el módulo activo y ficha activa en Equipo), un chat nuevo titulado «Foco de la semana · 12 de octubre» con un solo mensaje de Bria: vencidas, en proceso, lo que vence esta semana por día, pendientes sin fecha y las señales del mapa de carga del equipo. Avisa en la campana (`BRIA_FOCO_SEMANAL`) y aparece como el primer aviso encima de la mascota.

## Quién lo ve

Administradores y project managers con Bria (`canSeeNudges`). Los avisos nunca hablan de quien mira ni de un administrador; sí de project managers, porque también ejecutan tareas.

## Las reglas (`src/lib/briaNudges.js`, lógica pura)

- **Horario laboral:** de 8:00 a 18:00 de Bogotá, días hábiles de Colombia (`WORK_HOURS`, `isBusinessDay`). Fuera de ahí no hay avisos de personas.
- **`SIN_PROCESO`:** la persona tiene pendientes y nada en proceso. Si hoy cerró un reloj o una tarea, se avisa a los 30 minutos de eso (`IDLE_MINUTES`): «Melissa lleva 35 minutos sin una tarea en proceso». Si hoy no ha hecho nada, se espera media hora desde las 8 (`GRACE_MINUTES`): «Melissa no ha puesto ninguna tarea en proceso hoy». Un reloj propio de colaborador en marcha cuenta como trabajar.
- **`VENCE_HOY`:** desde las 14:00, tareas que vencen hoy y no están en proceso, con sus títulos (tres como máximo) y el enlace a la tarea si es una sola.
- **`FOCO_SEMANAL`:** si esta semana ya se dejó el foco, va primero.
- Como máximo cinco avisos, ordenados por lo que lleva más tiempo; la tarjeta enseña uno y dice «1 de N».
- **Ocultar:** por clave (`tipo:persona`) hasta el final del día de Bogotá; el foco, siete días. Tabla `bria_memory.nudge_dismissals`.
- **Palabras:** cada frase es un hecho y una sugerencia. Prohibido «lento», «flojo», «mal»: la prueba lo comprueba.

## Dónde vive

- Regla: `src/lib/briaNudges.js`. Lectura: `src/services/briaNudgeService.js` (`readPeople`: tareas abiertas por persona, última sesión de trabajo cerrada hoy, última tarea cerrada hoy, relojes abiertos). Guardado: `src/services/briaProactiveRepository.js` (`scripts/sql/bria-proactive.sql`, aplicado al arrancar).
- Ruta: `GET /api/bria/nudges` y `POST /api/bria/nudges/dismiss` (`src/routes/api/briaNudges.js`), bajo `/api/bria`, que el mapa de la plataforma excluye entero.
- Pantalla: `src/components/bria/BriaNudge.jsx`, montada en `BriaAssistant.jsx`; se refresca cada cinco minutos con la pestaña visible y al volver a la ventana. Nunca `new Date()` en el componente.
- Foco: `src/lib/weeklyFocus.js` (texto, sin modelo), `src/services/weeklyFocusService.js` (`runAutomatic`, `initWeeklyFocusScheduler` en `server.js`), `briaConversationRepository.postAssistantNote` (el único turno de Bria sin pregunta: abre el chat con revisión 1 y la nota en la posición 1). Una vez por semana y persona: `bria_memory.weekly_focus_deliveries`.
- Abrir un chat desde fuera: `openBriaConversation` / `onBriaOpen` en `src/lib/briaAsk.js`; `BriaAssistant` abre el panel y `BriaConversation` carga la conversación y refresca la lista. La campana lo usa para `BRIA_FOCO_SEMANAL`.

## Lo que queda para después

- Acotar los avisos a «su» equipo cuando el project manager tenga personas a cargo definidas; hoy ve a todo el equipo.
- Más señales (una tarea en proceso desde hace horas ya la cubre el aviso de 10 h; un cliente en rojo en Operación).
- El recordatorio de correo importante: depende del acceso al buzón (Workspace o IMAP).

## Pruebas

`tests/briaNudges.test.js` (regla), `tests/briaNudgeService.test.js` (servicio y ruta), `tests/briaNudgeUi.test.js` (pantalla, eventos y arranque), `tests/briaMascotGesture.test.js` (gestos, lápiz y micrófono, dictado compartido, tarjeta solo con aviso), `tests/weeklyFocus.test.js` (texto, servicio, programador y la nota en el repositorio), `tests/briaFollowUp.test.js` (el seguimiento: regla, pulso, tarjeta y columnas), `tests/dailyClose.test.js` (el cierre del día: texto, servicio, programador, tarjeta, campana y tabla lateral). Recorrido real con capturas: `node tests/browser/briaNudge.mjs` (muestra `scripts/preview-bria.js`, con avisos simulados; `?sinavisos` deja a Bria sola).
