# Bria: acciones en la plataforma y cómo se usa

10 de octubre de 2026. Rodny, el 9: «la idea es que Bria contribuya a desarrollar buenas prácticas más que simplemente poner cosas … crea la parrilla tal, ¿quién será el responsable? ¿cuál será el objetivo estratégico?». Y el 10: «sigamos trabajando en Bria … y pulirla con el uso».

## Una sola forma de actuar

Toda acción de Bria sobre la plataforma sigue el mismo contrato, en `src/lib/briaActions.js` (lógica pura) y `src/services/briaActionService.js`:

1. **Bria prepara.** La herramienta recibe lo que la persona dijo, deduce lo que puede (una persona por su nombre, una fecha como «viernes», el mes «próximo»), y arma una acción con `summary` (qué va a pasar, con palabras), `warnings` (lo que conviene saber) y `missing` (lo que la plataforma exige y falta).
2. **Pregunta de a una cosa.** Si falta algo, la respuesta es solo la primera pregunta, con botones cuando hay opciones (`actionReply`). La persona responde y Bria vuelve a llamar la misma herramienta con todo lo que ya sabía más lo nuevo: es la misma acción (`previous`), no otra.
3. **Resume y espera.** Sin nada pendiente, la respuesta es el resumen, escrito por la plataforma y no por el modelo, con los botones «Confirmar» y «Cancelar».
4. **Solo la persona ejecuta.** El servidor ejecuta cuando escribe «Confirmar» (`isActionConfirmation`: frase corta y completa) sobre **la respuesta inmediatamente anterior** (`pendingActionOf`): una acción de una respuesta vieja nunca se ejecuta con un «confirmar» suelto. Ocurre dentro de `append`, con la conversación bloqueada y su revisión comprobada; una acción hecha no se repite, y una cancelada no se ejecuta.
5. **Por las vías de la pantalla.** Ejecutar llama a las mismas funciones que los botones de la plataforma y pasa por las mismas puertas, revisadas otra vez justo antes de escribir.

Las tres acciones anteriores a esta base (crear pendiente, despachar a producción, eliminar pendiente) conservan su propio flujo, que ya funciona y está probado; las nuevas se construyen sobre esta base.

## Las acciones de hoy

### `cambiar_pendiente` (permiso de Gestión)
Estado (pendiente, en proceso, realizada, devuelta), responsable, fecha de entrega y prioridad de una tarea, en una sola llamada o en varias.
- **La misma puerta que el botón de Gestión:** `checkTaskUpdate` (`src/services/taskUpdateGate.js`), que ahora comparten el controlador `PATCH /api/tasks/:id` y Bria. Reordenar y el compromiso con hora son de managers; el compromiso bloquea las demás tareas de la persona (423); reabrir una cerrada es de cualquiera y solo eso; lo demás es de managers, quien la creó o quien la ejecuta; un colaborador solo la mueve entre Pendiente y En proceso; la privacidad la cambia solo quien la creó. Un pendiente privado que la persona no puede abrir se rechaza antes.
- **Devolver** pide motivo (catálogo `RETURN_REASONS`, por botones) y nota; **reabrir** pide motivo (`REOPEN_REASONS`) y nota, igual que la pantalla.
- **Buenas prácticas, dichas sin imponer:** cerrar una tarea que no pasó por «En proceso» avisa que quedará sin tiempo medido; pasar a «En proceso» una tarea con colaboradores avisa que ningún reloj arranca solo.
- Ejecuta con `updateTask`, que es quien decide `completedAt`, relojes, ciclos de retrabajo y avisos.

### `crear_parrilla` (permiso de Parrillas)
La parrilla de un cliente para un mes. **Nace con responsable y con objetivo estratégico:** si la persona no los dijo, Bria los pregunta, proponiendo al community manager y al project manager de la ficha como responsable, y el objetivo del mes anterior como opción. Un mes ya pasado este año se entiende del año que viene. Si la parrilla ya existe, no crea otra: enlaza la que hay. Ejecuta con `createContentPlan` y `updateContentPlan` (para el responsable).

## Cómo se usa Bria (`uso_de_bria`, solo administradores)

Cifras de los últimos 7 o 30 días leídas de las conversaciones guardadas (`src/services/briaUsageService.js`): cuántas personas preguntaron y cuántas veces cada una, preguntas por día, qué herramientas se usaron, cuántas respuestas quedaron **sin respuesta** (el texto de respaldo) o **con una herramienta fallida**, y cuántas llamadas y tokens costó. **Nunca el contenido** de ninguna conversación. La instrucción le dice a Bria que son cifras para pulirla, no para evaluar a nadie.

## Dónde se conecta
- `briaTaskApplication.js` arma `briaActions` con Prisma y las funciones reales; `briaAssistantService.js` monta las herramientas; `briaConversationService.js` resuelve «Confirmar» y «Cancelar»; `briaConversationRepository.js` guarda `pendingAction` en los metadatos del turno; `briaConversationApplication.js` exige el módulo de cada acción para ver o confirmar el turno.
- Reglas 18 y 19 de `buildInstructions`.

## Pruebas
`tests/briaActions.test.js`, `tests/briaActionService.test.js`, `tests/briaActionConversation.test.js`, `tests/taskUpdateGate.test.js`, `tests/briaUsage.test.js`. Las pruebas que leían las comprobaciones dentro del controlador (`taskFocusDeadline`, `taskPrivacyRoutes`, `taskReopenAnyone`) ahora las leen en la puerta compartida.
