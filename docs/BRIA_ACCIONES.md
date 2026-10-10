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
El mismo cambio de estado para hasta 10 tareas a la vez: en proceso, realizada o pendiente. Cada tarea pasa por `checkTaskUpdate` por separado; las que no pueden (privadas que no se abren, ya cerradas, bloqueadas por un compromiso con hora, de otra persona sin permiso) se dicen con su motivo y las demás siguen. Devolver y reabrir piden motivo y nota por tarea: eso se hace de a una con `cambiar_pendiente`. Al ejecutar, cada tarea se vuelve a mirar: lo que ya estaba en ese estado no falla, y una falla no frena a las demás.

### `crear_pieza` (permiso de Parrillas)
Una pieza nueva en una parrilla (por su id o por cliente y mes). **Nace con un objetivo que diga algo** («Nuevo Objetivo» no vale), un formato (Reel, Carrusel, Post, Video, Historia) y un día; la hora es opcional. Avisa si ese día ya hay otra pieza (dos el mismo día es señal amarilla en la operación) y si la fecha cae fuera del mes. Se crea en borrador, sin guion ni texto, con la fecha al mediodía UTC como hace la pantalla, por `createContentItem`.

### `mover_pieza` (permiso de Parrillas)
La fecha y la hora de publicación de una pieza. Una pieza ya publicada no se mueve. Avisa si tiene una publicación programada en redes (se mueve con ella, porque `updateContentItem` resincroniza la cola), si la fecha es pasada (lo programado se cancela) y si el cliente ya la aprobó (no le pide otra aprobación, pero conviene avisarle). La fecha viaja como `YYYY-MM-DD`, igual que desde el editor.

### `registrar_observacion` (módulo Clientes)
Una observación en la ficha del cliente (Operación de clientes): contexto que el equipo tiene que leer, no un pendiente. Pide el texto si no lo dieron, respeta el tope de 2.000 caracteres y la guarda con el autor por `addObservation`, la misma función de la ruta.

## Las manos de Bria en toda la plataforma

Rodny, 10 de octubre de 2026: «quiero que Bria tenga permiso para todo en la plataforma, ella vive ahí, no necesariamente hay que darle desde aquí configuraciones o permisos; como todo se crea manual, ella lo puede hacer también, si se lo pide un admin o project y según los módulos a los que ese usuario tiene acceso».

**La idea en una frase:** lo que la persona puede hacer en una pantalla, Bria lo puede hacer por ella, con su misma sesión y sus mismos permisos. No hay una segunda tabla de permisos ni acciones cableadas una por una.

- **Cómo entra.** `src/lib/briaPlatformClient.js` llama a la API **con el mismo token** con el que la persona abrió el chat (la ruta de conversaciones lo toma de la cabecera y lo pasa como `session`; vive en la petición, nunca se guarda en un turno). La llamada pasa por `authenticateToken`, el módulo, el rol y los guardianes de cada ruta: la API responde lo que le respondería a la persona. Si su sesión vence, Bria se queda sin manos en el acto. Lleva la marca `x-brain-via: bria` y queda en la auditoría operativa con el nombre de la persona.
- **Qué sabe que existe.** `src/lib/platformCatalog.js` es el mapa: una frase en español por cada ruta de la API, con sus campos cuando se conocen, y `PLATFORM_EXCLUDED`, lo que Bria no hace ni confirmando: cuentas, roles y permisos de personas; contraseñas y verificación en dos pasos; la bóveda (tiene su propio camino y nunca pasa valores por el modelo); borrar una parrilla entera; archivos (subir, bajar, PDF); proxies y lo interno. Los **permisos no están en el mapa**: `src/lib/platformRoutes.js` los lee del router real (cada guardián lleva una etiqueta `permission`: `requireModulePermission`, `requireManagerRole`, `requireRole`, `requireFinancialPermission` y los guardianes propios de Operación de clientes, Meta y Salud operativa) y `src/lib/platformPermissions.js` arma el índice. `tests/platformCatalog.test.js` exige que **toda ruta real esté descrita o excluida**: una ruta nueva sin su frase rompe CI, así Bria crece con la plataforma.
- **Tres herramientas** (`src/services/briaPlatformTools.js`): `mapa_de_plataforma` busca por palabras qué operación hace lo que piden; `consultar_plataforma` lee cualquier GET del mapa de una vez (leer no cambia nada), con la sesión de la persona, y recorta respuestas largas; `operar_en_plataforma` prepara cualquier POST, PUT, PATCH o DELETE del mapa como una acción `PLATFORM` del mismo contrato: resumen con lo que va a pasar (`que_hace` en palabras de la persona, la operación y cada campo), avisos (borrados, dinero, cuerpo vacío), permiso de la ruta comprobado de entrada y otra vez al ejecutar, y solo «Confirmar» la ejecuta.
- **Orden de preferencia** (regla 20 de Bria): las herramientas propias (pendiente, cambios, parrilla, pieza, despacho, eliminación, observación) van primero porque preguntan y avisan mejor; el mapa es para todo lo demás. Nunca dice que hizo un cambio; si la plataforma responde que falta un dato o que no hay permiso, lo dice con sus palabras.

## Cómo se usa Bria (`uso_de_bria`, solo administradores)

Cifras de los últimos 7 o 30 días leídas de las conversaciones guardadas (`src/services/briaUsageService.js`): cuántas personas preguntaron y cuántas veces cada una, preguntas por día, qué herramientas se usaron, cuántas respuestas quedaron **sin respuesta** (el texto de respaldo) o **con una herramienta fallida**, y cuántas llamadas y tokens costó. **Nunca el contenido** de ninguna conversación. La instrucción le dice a Bria que son cifras para pulirla, no para evaluar a nadie.

## Dónde se conecta
- `briaTaskApplication.js` arma `briaActions` con Prisma y las funciones reales; `briaAssistantService.js` monta las herramientas; `briaConversationService.js` resuelve «Confirmar» y «Cancelar»; `briaConversationRepository.js` guarda `pendingAction` en los metadatos del turno; `briaConversationApplication.js` exige el módulo de cada acción para ver o confirmar el turno.
- Reglas 18, 19 y 20 de `buildInstructions`.

## Pruebas
`tests/briaActions.test.js`, `tests/briaActionService.test.js`, `tests/briaActionConversation.test.js`, `tests/briaTaskConversation.test.js`, `tests/briaDispatch.test.js` y `tests/briaDelete.test.js` (los tres flujos viejos sobre la base común, con sus frases y con «Confirmar», leyendo turnos guardados antes), `tests/taskUpdateGate.test.js`, `tests/briaUsage.test.js`, `tests/platformCatalog.test.js` (toda ruta real descrita o excluida) y `tests/briaPlatform.test.js` (cliente, preparación, ejecución, herramientas y sesión en la conversación). Las pruebas que leían las comprobaciones dentro del controlador (`taskFocusDeadline`, `taskPrivacyRoutes`, `taskReopenAnyone`) ahora las leen en la puerta compartida.
