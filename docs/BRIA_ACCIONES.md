# Bria: acciones en la plataforma y cómo se usa

10 de octubre de 2026. Rodny, el 9: «la idea es que Bria contribuya a desarrollar buenas prácticas más que simplemente poner cosas … crea la parrilla tal, ¿quién será el responsable? ¿cuál será el objetivo estratégico?». Y el 10: «sigamos trabajando en Bria … y pulirla con el uso».

## Una sola forma de actuar

Toda acción de Bria sobre la plataforma sigue el mismo contrato, en `src/lib/briaActions.js` (lógica pura) y `src/services/briaActionService.js`:

1. **Bria prepara.** La herramienta recibe lo que la persona dijo, deduce lo que puede (una persona por su nombre, una fecha como «viernes», el mes «próximo»), y arma una acción con `summary` (qué va a pasar, con palabras), `warnings` (lo que conviene saber) y `missing` (lo que la plataforma exige y falta).
2. **Pregunta de a una cosa.** Si falta algo, la respuesta es solo la primera pregunta, con botones cuando hay opciones (`actionReply`). La persona responde y Bria vuelve a llamar la misma herramienta con todo lo que ya sabía más lo nuevo: es la misma acción (`previous`), no otra.
3. **Resume y espera.** Sin nada pendiente, la respuesta es el resumen, escrito por la plataforma y no por el modelo, con los botones «Confirmar» y «Cancelar».
4. **Solo la persona ejecuta.** El servidor ejecuta cuando escribe «Confirmar» (`isActionConfirmation`: frase corta y completa) sobre **la respuesta inmediatamente anterior** (`pendingActionOf`): una acción de una respuesta vieja nunca se ejecuta con un «confirmar» suelto. Ocurre dentro de `append`, con la conversación bloqueada y su revisión comprobada; una acción hecha no se repite, y una cancelada no se ejecuta.
5. **Por las vías de la pantalla.** Ejecutar llama a las mismas funciones que los botones de la plataforma y pasa por las mismas puertas, revisadas otra vez justo antes de escribir.

### Una sola base también por dentro (Rodny, 10 de octubre de 2026: «lo de unificar por dentro, hazlo»)

Las tres acciones anteriores a esta base —crear pendiente, despachar a producción, eliminar pendientes— nacieron cada una con su propio flujo (`taskDraft`, `dispatchDraft`, `deleteDraft`) y el servicio de conversación resolvía tres veces lo mismo. Ahora viajan como acciones de esta base, con tipos `TASK_CREATE`, `DISPATCH` y `TASK_DELETE`:

- **Lo que no cambia para la persona:** su preparación, sus textos, sus botones y sus frases («Crear pendiente» / «Cancelar pendiente», «Despachar a producción» / «Cancelar despacho», «Eliminar pendiente» / «No eliminar») siguen iguales; sus servicios (`briaTaskDraftService`, `briaDispatchService`, `briaDeleteService`) siguen preparando y escribiendo. Además aceptan «Confirmar» y «Cancelar», como las demás. Un borrador de estas tres sobrevive a una pregunta suelta (como siempre); las acciones nuevas solo valen sobre la respuesta inmediatamente anterior.
- **Cómo viaja:** `wrapLegacyAction(type, draft)` (`src/lib/briaActions.js`) envuelve el borrador en una acción (`draft` dentro, `missing` según la etapa del borrador, `status` DRAFT/DONE/CANCELLED); `actionReply` delega en el texto de cada flujo; `confirmsAction` / `cancelsAction` entienden la frase común y la de cada flujo; `LEGACY_ACTIONS` guarda esa tabla. Las herramientas `preparar_pendiente`, `preparar_despacho` y `preparar_eliminacion` devuelven `pendingAction`, y `briaActionService` ejecuta los tres tipos llamando a `createConfirmedTask`, `createConfirmedDispatch` y `createConfirmedDelete` con su frase canónica (la persona ya confirmó sobre el resumen). `ACTION_PERMISSION` admite varios módulos (`DISPATCH: ['gestion', 'parrillas']`); `actionModules` los lee.
- **Lo guardado antes se sigue leyendo:** `pendingActionOf` envuelve un turno viejo que traiga `taskDraft`, `dispatchDraft` o `deleteDraft`, y `authorizeTurn` conserva sus tres comprobaciones. El repositorio ya solo escribe `pendingAction`.

## Las acciones de hoy

### `cambiar_pendiente` (permiso de Gestión)
Estado (pendiente, en proceso, realizada, devuelta), responsable, fecha de entrega y prioridad de una tarea, en una sola llamada o en varias.
- **La misma puerta que el botón de Gestión:** `checkTaskUpdate` (`src/services/taskUpdateGate.js`), que ahora comparten el controlador `PATCH /api/tasks/:id` y Bria. Reordenar y el compromiso con hora son de managers; el compromiso bloquea las demás tareas de la persona (423); reabrir una cerrada es de cualquiera y solo eso; lo demás es de managers, quien la creó o quien la ejecuta; un colaborador solo la mueve entre Pendiente y En proceso; la privacidad la cambia solo quien la creó. Un pendiente privado que la persona no puede abrir se rechaza antes.
- **Devolver** pide motivo (catálogo `RETURN_REASONS`, por botones) y nota; **reabrir** pide motivo (`REOPEN_REASONS`) y nota, igual que la pantalla.
- **Buenas prácticas, dichas sin imponer:** cerrar una tarea que no pasó por «En proceso» avisa que quedará sin tiempo medido; pasar a «En proceso» una tarea con colaboradores avisa que ningún reloj arranca solo.
- Ejecuta con `updateTask`, que es quien decide `completedAt`, relojes, ciclos de retrabajo y avisos.

### `crear_parrilla` (permiso de Parrillas)
La parrilla de un cliente para un mes. **Nace con responsable y con objetivo estratégico:** si la persona no los dijo, Bria los pregunta, proponiendo al community manager y al project manager de la ficha como responsable, y el objetivo del mes anterior como opción. Un mes ya pasado este año se entiende del año que viene. Si la parrilla ya existe, no crea otra: enlaza la que hay. Ejecuta con `createContentPlan` y `updateContentPlan` (para el responsable).

### `cambiar_pendientes` (permiso de Gestión)
El mismo cambio para hasta 50 tareas a la vez: estado (en proceso, realizada o pendiente), responsable y/o fecha de entrega. Cada tarea pasa por `checkTaskUpdate` por separado; las que no pueden (privadas que no se abren, ya cerradas, bloqueadas por un compromiso con hora, de otra persona sin permiso) se dicen con su motivo y las demás siguen. Devolver y reabrir piden motivo y nota por tarea: eso se hace de a una con `cambiar_pendiente`. Al ejecutar, cada tarea se vuelve a mirar: lo que ya quedó así no falla («ya estaba»), y una falla no frena a las demás. Las tareas se nombran por id o se resuelven con un filtro: ver «Acciones masivas sobre pendientes».

## Acciones masivas sobre pendientes

Rodny, 11 de octubre de 2026: «Todos los pendientes de Jarlan, pónselos a Kamila como responsable», «Todos los pendientes que no tienen asignación, colócaselos a Francisco», «Dime cuántos pendientes están sin asignar». El contrato es el de siempre —Bria prepara, muestra cuáles sí y cuáles no, la persona escribe «Confirmar» sobre la respuesta inmediatamente anterior— con tres piezas:

- **Una sola búsqueda** (`src/services/taskSearch.js`, `searchTasks`): filtros combinables `responsable` (nombre; exacto primero y, sin resultado, parecido con `fuzzyMatch`, diciendo que fue aproximación; también personas ya inactivas, porque sus pendientes siguen existiendo), `sinResponsable`, `cliente` (nombre o id, misma búsqueda), `estado` (`pendientes | en_proceso | devueltas | realizadas | todas` = no cerradas) y `vencidas` (fecha anterior a hoy en Bogotá y no cerradas). Devuelve el **total real** (`count` con el mismo `where`) y como máximo 50 filas, las de fecha más próxima. Un nombre que no existe responde 404; uno con varias personas posibles responde 400 con las opciones, para que Bria pregunte cuál. La usan **las dos** herramientas de abajo: lo que Bria cuenta es exactamente lo que Bria cambia.
- **`buscar_pendientes`** (permiso de Gestión, en `briaAssistantTools.js`): cuenta y lista con esos filtros; devuelve `total`, `descripcion` («12 pendientes abiertos de Jarlan Pérez») y las tareas compactas con su id, para que «¿cuántos están sin asignar?» se responda de una vez y para que las otras herramientas usen los ids. Solo la cabecera de cada tarea y la reserva de los privados aplicada como en el tablero (`taskPrivacyFilter`): el cuerpo de un pendiente que la persona no puede abrir nunca viaja.
- **`cambiar_pendientes` por filtro**: con `tareas` vacío y `filtro`, el servidor resuelve el lote con la misma búsqueda, guarda los ids resueltos en `target.taskIds` y cómo se resolvió en `target.descripcion` (primera línea del resumen: «Lote: 5 pendientes abiertos de Jarlan Pérez»). Un filtro nuevo reemplaza el lote; sin filtro nuevo se conserva el ya resuelto, así la persona puede responder «¿Cuál Francisco será el responsable?» sin que se vuelva a buscar nada. Si el filtro es ambiguo («¿Los pendientes de cuál Francisco?»), se pregunta **antes** de resolver y el lote queda vacío hasta la respuesta. Más de 50 se avisa («Son 60 en total; preparo 50…»); el tope es `BULK_MAX = TASK_SEARCH_MAX`.
- **Lo que se avisa antes de confirmar** (`warnings`, que `actionReply` ya pinta): tareas con compromiso con hora (`focusDeadlineAt`), pendientes privados que la persona sí puede abrir, y tareas **en proceso con su responsable actual** cuando se cambia el responsable: la plataforma cierra el reloj de quien la trabajaba (su tiempo queda a su nombre) y la devuelve a Pendiente para que el nuevo la arranque; si el lote pide además «en proceso», el reloj pasa al nuevo en el acto (`reassignmentEffect` en `src/lib/taskTiming.js`, decisión de Rodny del 11 de octubre de 2026; vale igual desde la pantalla). Frases cortas, con los títulos entre comillas, máximo cinco y «y N más».
- **Por tarea y por la misma vía:** cada tarea pasa por `checkTaskUpdate` con **solo lo que le falta** para quedar como se pidió (`bulkChangesFor`: una que ya es de Kamila pero cambia de estado recibe solo el estado), y se escribe una por una con `updateTask`, que pone `completedAt`, cierra relojes, notifica y audita. **Nunca `updateMany`.** Devolver y reabrir siguen siendo de a una.
- **Qué decide Bria y qué el código:** la instrucción 18 le dice al modelo que un pedido en lote por persona, cliente, sin responsable o vencidas va a `cambiar_pendientes` con `filtro`, sin pedirle ids a la persona ni listar antes, y que «cuántos…» o «cuáles…» va a `buscar_pendientes`. El modelo solo elige la herramienta y repite los nombres que dio la persona; quién es «Jarlan» y qué tareas son lo decide el servidor.
- La puerta `checkTaskUpdate` se inyecta en `createBriaActionService` (`gate`) solo para poder probar sus negativas; en producción es la misma de la pantalla.

Contrato: `tests/briaBulkTasks.test.js`.

### `pendientes_de_reunion` (Gestión y Minutas)

Rodny, 14 de octubre de 2026 (segundo punto del plan «llevar a Bria a más niveles»): «cuando analiza una reunión, que prepare los pendientes que salieron de ahí, con responsable y fecha propuestos, y tú confirmas». La minuta ya trae los compromisos (`MeetingMinute.actionItems`: tarea, responsable, fecha y prioridad que anotó el análisis); la acción `MINUTE_TASKS` los vuelve pendientes numerados (`src/lib/minuteTasks.js` + `prepareMinuteTasks`/`executeMinuteTasks`):

- **La reunión** se encuentra por id (de `memoria_de_reuniones`), por título o por parecido; con varias, se pregunta cuál. Desde Minutas, «Preparar pendientes con Bria» deja la petición escrita en el chat con el id.
- **El cliente** es el que dijo la persona, el que nombra el título de la reunión (si nombra exactamente uno) o se pregunta; «sin cliente» vale.
- **El responsable** se busca en el equipo por el nombre que anotó la reunión: nombre completo, nombre de pila único o parecido claro («Jarlan Peres» → Jarlan Pérez, y se dice); dos Melissas o alguien que no está en el equipo (el contacto del cliente) es una pregunta, nunca un invento. **Un pendiente necesita responsable**: la opción es otra persona u omitirlo.
- **La fecha** es la de la reunión; a los que no traen se les pregunta una sola vez («¿Qué fecha les pongo?» · Mañana, Viernes, Sin fecha).
- **Ajustes por número** (`ajustes: [{ n, responsable, fecha, omitir }]`): la persona corrige un compromiso concreto sin repetir los demás.
- **Confirmar** crea tarea por tarea con el `createTask` de Gestión (cliente, responsable, fecha al mediodía UTC, prioridad y el contexto «De la reunión … Compromiso: …» como primer comentario), avisa al responsable (`TASK_ASSIGNED`) si no es quien confirma, y **escribe el `taskId` en el compromiso de la minuta** después de cada creación: confirmar dos veces no crea dos veces, y Minutas enlaza «ya es pendiente». Lo que ya es pendiente no se vuelve a ofrecer.

Contrato: `tests/briaMinuteTasks.test.js`.

### `crear_pieza` (permiso de Parrillas)
Una pieza nueva en una parrilla (por su id o por cliente y mes). **Nace con un objetivo que diga algo** («Nuevo Objetivo» no vale), un formato (Reel, Carrusel, Post, Video, Historia) y un día; la hora es opcional. Avisa si ese día ya hay otra pieza (dos el mismo día es señal amarilla en la operación) y si la fecha cae fuera del mes. Se crea en borrador, sin guion ni texto, con la fecha al mediodía UTC como hace la pantalla, por `createContentItem`.

### `mover_pieza` (permiso de Parrillas)
La fecha y la hora de publicación de una pieza. Una pieza ya publicada no se mueve. Avisa si tiene una publicación programada en redes (se mueve con ella, porque `updateContentItem` resincroniza la cola), si la fecha es pasada (lo programado se cancela) y si el cliente ya la aprobó (no le pide otra aprobación, pero conviene avisarle). La fecha viaja como `YYYY-MM-DD`, igual que desde el editor.

### `registrar_observacion` (módulo Clientes)
Una observación en la ficha del cliente (Operación de clientes): contexto que el equipo tiene que leer, no un pendiente. Pide el texto si no lo dieron, respeta el tope de 2.000 caracteres y la guarda con el autor por `addObservation`, la misma función de la ruta.

### `proponer_parrilla` (permiso de Parrillas)

Rodny, 14 de octubre de 2026 (tercer punto del plan «llevar a Bria a más niveles»; eligió la opción 2): «yo podría pedirle que necesito la parrilla de tal y que el cliente me comunicó que le gustaría tales énfasis … y basado en ello montarme las piezas y desde el chat enviarlas a parrilla como borrador, las que yo quiera». La acción `PLAN_DRAFT` (`src/lib/planDraft.js` + `preparePlanDraft`/`executePlanDraft`):

- **El modelo propone** (modelo de chat, esquema estricto, uso `bria.plan-draft`): tantas piezas como falten para la cuota del contrato (o las que diga la persona, hasta 20), cada una con objetivo (el título que verán equipo y cliente), formato, día del mes, idea para el equipo, texto de publicación y a qué responde. Lee el contrato (piezas por formato, historias), el objetivo del mes, los criterios editoriales aprobados, la parrilla anterior (para no repetir), las piezas que ya existen (para no pisar sus días) y **el énfasis con las palabras de la persona, que manda sobre todo lo demás**. No inventa datos del cliente: deja huecos entre corchetes.
- **El código manda** (`validatePlanDraft`): solo formatos de la plataforma, días dentro del mes, sin «Nuevo objetivo», sin repetir, sin juicios, dentro del tope; la respuesta con bloque ```json se parsea igual. Lo que no entra se cuenta en un aviso.
- **La propuesta se guarda en la acción** (`wanted.propuesta`): `omitir` (por número), `solo` (quedarse con unas) o confirmar no vuelven a preguntarle al modelo; más énfasis o `rehacer` sí, y una propuesta nueva olvida las omisiones viejas.
- **Sin parrilla**, se pregunta responsable y objetivo (como `crear_parrilla`; «Usar el énfasis como objetivo» vale) y se crea al confirmar; una parrilla finalizada o un cliente archivado se rechazan con palabras.
- **Confirmar** envía solo las piezas elegidas, en borrador, por `createContentItem`: la idea queda como guion (solo el equipo), el texto de publicación como caption (lo que verá el cliente), la fecha al mediodía UTC y la procedencia en la nota interna («Propuesta de Bria para noviembre de 2026 · Énfasis: …»). Las piezas se revisan en la parrilla antes de mandarlas al cliente.
- **Un modelo caído no inventa nada:** se dice («No pude armar la propuesta ahora») y se vuelve a intentar.

Contrato: `tests/briaPlanDraft.test.js`.

## Las manos de Bria en toda la plataforma

Rodny, 10 de octubre de 2026: «quiero que Bria tenga permiso para todo en la plataforma, ella vive ahí, no necesariamente hay que darle desde aquí configuraciones o permisos; como todo se crea manual, ella lo puede hacer también, si se lo pide un admin o project y según los módulos a los que ese usuario tiene acceso».

**La idea en una frase:** lo que la persona puede hacer en una pantalla, Bria lo puede hacer por ella, con su misma sesión y sus mismos permisos. No hay una segunda tabla de permisos ni acciones cableadas una por una.

- **Cómo entra.** `src/lib/briaPlatformClient.js` llama a la API **con el mismo token** con el que la persona abrió el chat (la ruta de conversaciones lo toma de la cabecera y lo pasa como `session`; vive en la petición, nunca se guarda en un turno). La llamada pasa por `authenticateToken`, el módulo, el rol y los guardianes de cada ruta: la API responde lo que le respondería a la persona. Si su sesión vence, Bria se queda sin manos en el acto. Lleva la marca `x-brain-via: bria` y queda en la auditoría operativa con el nombre de la persona.
- **Qué sabe que existe.** `src/lib/platformCatalog.js` es el mapa: una frase en español por cada ruta de la API, con sus campos cuando se conocen, y `PLATFORM_EXCLUDED`, lo que Bria no hace ni confirmando: cuentas, roles y permisos de personas; contraseñas y verificación en dos pasos; la bóveda (tiene su propio camino y nunca pasa valores por el modelo); borrar una parrilla entera; archivos (subir, bajar, PDF); proxies y lo interno. Los **permisos no están en el mapa**: `src/lib/platformRoutes.js` los lee del router real (cada guardián lleva una etiqueta `permission`: `requireModulePermission`, `requireManagerRole`, `requireRole`, `requireFinancialPermission` y los guardianes propios de Operación de clientes, Meta y Salud operativa) y `src/lib/platformPermissions.js` arma el índice. `tests/platformCatalog.test.js` exige que **toda ruta real esté descrita o excluida**: una ruta nueva sin su frase rompe CI, así Bria crece con la plataforma.
- **Tres herramientas** (`src/services/briaPlatformTools.js`): `mapa_de_plataforma` busca por palabras qué operación hace lo que piden; `consultar_plataforma` lee cualquier GET del mapa de una vez (leer no cambia nada), con la sesión de la persona, y recorta respuestas largas; `operar_en_plataforma` prepara cualquier POST, PUT, PATCH o DELETE del mapa como una acción `PLATFORM` del mismo contrato: resumen con lo que va a pasar (`que_hace` en palabras de la persona, la operación y cada campo), avisos (borrados, dinero, cuerpo vacío), permiso de la ruta comprobado de entrada y otra vez al ejecutar, y solo «Confirmar» la ejecuta.
- **Orden de preferencia** (regla 20 de Bria): las herramientas propias (pendiente, cambios, parrilla, pieza, despacho, eliminación, observación) van primero porque preguntan y avisan mejor; el mapa es para todo lo demás. Nunca dice que hizo un cambio; si la plataforma responde que falta un dato o que no hay permiso, lo dice con sus palabras.

## Cómo se usa Bria (`uso_de_bria`, solo administradores)

Cifras de los últimos 7 o 30 días leídas de las conversaciones guardadas (`src/services/briaUsageService.js`): cuántas personas preguntaron y cuántas veces cada una, preguntas por día, qué herramientas se usaron, cuántas respuestas quedaron **sin respuesta** (el texto de respaldo) o **con una herramienta fallida**, y cuántas llamadas y tokens costó. **Nunca el contenido** de ninguna conversación. La instrucción le dice a Bria que son cifras para pulirla, no para evaluar a nadie.

Desde el 14 de octubre de 2026 trae además la **valoración**: cuántas respuestas recibieron pulgar arriba, cuántas pulgar abajo, cuántas quedaron sin valorar, la tasa positiva y los últimos veinte motivos escritos al pulgar abajo (sin decir quién los escribió).

## Que Bria se mida (14 de octubre de 2026)

Rodny: «antes de crecer más, saber qué tan bien responde». Dos medidas, ninguna evalúa a personas.

**Pulgar arriba o abajo en cada respuesta.** Junto al botón de copiar de cada respuesta de Bria hay dos pulgares (`src/components/bria/BriaConversation.jsx`). El pulgar abajo se registra al instante y después pregunta «¿Qué falló?» con una nota opcional de hasta 300 caracteres, que viaja aparte: si la persona no escribe nada, el pulgar queda igual. La valoración se guarda en el turno de Bria (`metadata.rating = { value: 'UP' | 'DOWN', note, at }`) por `POST /api/bria/conversations/:id/rating` (`turnId`, `rating`, `note`), que solo acepta un turno de Bria del chat de quien valora; volver a pulsar reemplaza la anterior y no cambia la revisión del chat. La regla es pura (`src/lib/briaRating.js`: `normalizeRating`, `turnPosition`); el servicio es `rate` en `briaConversationService.js` y la escritura `rateTurn` en `briaConversationRepository.js`.

**El conjunto de preguntas reales.** `tests/evals/briaCases.js` tiene once preguntas del día a día del equipo con datos ficticios, cada una con `requiredTools` o `anyTools`, `mustSay`, `mustNotSay` y un `why`. `checkEvalAnswer` juzga una respuesta; `FORBIDDEN_EVERYWHERE` prohíbe en todas el español peninsular y los juicios sobre personas. Se corre a mano contra el modelo real:

```bash
BRIA_EVAL_OUTPUT=tmp/bria-casos.json npm run eval:bria-casos -- --solo accion-no-afirma --repeticiones 2
```

`scripts/eval-bria-casos.mjs` lee solo `OPENAI_API_KEY` y el modelo del archivo de entorno (`BRIA_PROJECT_ENV`, `.env` por defecto), arma herramientas ficticias con las mismas declaraciones que las reales (lecturas y acciones que solo preparan), no abre ninguna base de datos y escribe un informe JSON con cada respuesta y su veredicto; termina con código 1 si algo falló. Se corre cada vez que cambien las instrucciones de Bria (`buildInstructions`) o sus herramientas, y nunca en CI. Un caso nuevo se añade al conjunto con su `why`; `tests/briaRating.test.js` valida la forma de todos.

## Escribirle al cliente (19 de octubre de 2026)

Rodny: «vamos a seguir fortaleciendo a Bria para que sea mi project manager y mi community manager». Es la primera pieza de ese frente. El aviso «Redactar recordatorio al cliente» ya existía, pero Bria lo escribía a ciegas: sin el enlace del portal y sin saber qué había salido ni qué esperaba la aprobación.

- **`mensaje_para_cliente`** (`src/services/briaClientUpdateTools.js`, módulo Parrillas) lee la parrilla del mes **como la ve el cliente** (`buildClientUpdate`, regla pura en `src/lib/clientUpdate.js`): lo que espera su aprobación —`EN_REVISION` o con material nuevo—, lo que se está ajustando según lo que pidió —`DEVUELTO`, con su último pedido—, lo publicado en la última semana con sus enlaces de Instagram y Facebook, lo programado en las dos semanas siguientes, cuántas piezas siguen en preparación, el avance y **el enlace del portal que ya tiene** (`portalUrlOf`, `…/compartir/<token>`; sin token no se inventa uno: Bria dice que lo creen con «Compartir»).
- **Nunca sale lo que el cliente no ve.** La consulta ni siquiera lee el guion ni las notas internas, y la instrucción prohíbe hablar del equipo, de horas o de herramientas.
- **Saluda y firma como persona.** Saluda al contacto de la ficha por su nombre, o «equipo de» la marca si no hay contacto, y firma con el nombre de quien lo va a enviar. La primera prueba saludó «Hola, Aristea» y firmó «[Tu nombre]». Una pieza que espera aprobación «sale tal día una vez la apruebes», nunca «está programada».
- **Canal y enfoque.** WhatsApp, corto y sin asunto, o correo, con asunto y viñetas. Resumen de la semana, recordarle aprobar o contarle lo publicado.
- **Bria nunca lo envía.** Entrega el mensaje listo para copiar; la persona lo manda.
- El aviso de pieza sin aprobar pide ahora el recordatorio por WhatsApp con el enlace del portal, y por eso cae en esta herramienta.

Contrato: `tests/clientUpdate.test.js`. Dos casos nuevos en el conjunto de preguntas reales: `mensaje-cliente-aprobar` y `mensaje-cliente-resumen-correo`.

## Dónde se conecta
- `briaTaskApplication.js` arma `briaActions` con Prisma y las funciones reales; `briaAssistantService.js` monta las herramientas; `briaConversationService.js` resuelve «Confirmar» y «Cancelar»; `briaConversationRepository.js` guarda `pendingAction` en los metadatos del turno; `briaConversationApplication.js` exige el módulo de cada acción para ver o confirmar el turno.
- Reglas 18, 19 y 20 de `buildInstructions`.

## Pruebas
`tests/briaActions.test.js`, `tests/briaActionService.test.js`, `tests/briaBulkTasks.test.js` (acciones masivas: búsqueda compartida, lote por filtro, responsable y fecha en lote, avisos y confirmación tarea por tarea), `tests/briaActionConversation.test.js`, `tests/briaTaskConversation.test.js`, `tests/briaDispatch.test.js` y `tests/briaDelete.test.js` (los tres flujos viejos sobre la base común, con sus frases y con «Confirmar», leyendo turnos guardados antes), `tests/taskUpdateGate.test.js`, `tests/briaUsage.test.js`, `tests/platformCatalog.test.js` (toda ruta real descrita o excluida) y `tests/briaPlatform.test.js` (cliente, preparación, ejecución, herramientas y sesión en la conversación). Las pruebas que leían las comprobaciones dentro del controlador (`taskFocusDeadline`, `taskPrivacyRoutes`, `taskReopenAnyone`) ahora las leen en la puerta compartida.
