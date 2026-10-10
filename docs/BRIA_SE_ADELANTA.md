# Bria se adelanta y el foco de la semana

10 de octubre de 2026. Rodny: «me gustaría que se adelante … por ejemplo, “Melissa no tiene nada en proceso desde hace 30 minutos, pregúntale en qué está”; la idea es que guíe a los projects y, claro, con un lenguaje más sobrio, corporativo y amigable». Y sobre el foco: «podría tener un resumen listo cada lunes para cada persona y dejarlo ahí en uno de sus chats para leer».

## Qué es

Dos cosas que Bria hace sin que nadie le pregunte, y que **nunca abren el chat solas ni mandan nada**:

1. **Avisos encima de la mascota.** Una tarjeta pequeña, en la superficie de los popovers (`brain-popover-surface`), fija encima del botón de Bria y solo con el panel cerrado. Dice un hecho de la plataforma y una sugerencia. Tres acciones posibles: **Pedírselo a Bria** (deja el mensaje escrito en el chat, la persona decide si lo manda: `askBria`), **Ver en Gestión** y **Leer en Bria** (abre la conversación donde Bria dejó el foco: `openBriaConversation`). La **X** oculta ese aviso por hoy, en el servidor, solo para quien lo ocultó.
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

`tests/briaNudges.test.js` (regla), `tests/briaNudgeService.test.js` (servicio y ruta), `tests/briaNudgeUi.test.js` (pantalla, eventos y arranque), `tests/weeklyFocus.test.js` (texto, servicio, programador y la nota en el repositorio). Recorrido real con capturas: `node tests/browser/briaNudge.mjs` (muestra `scripts/preview-bria.js`, con avisos simulados).
