// El mapa de la plataforma para Bria (Rodny, 10 de octubre de 2026: «quiero que Bria tenga permiso para todo en la
// plataforma, ella vive ahí … como todo se crea manual, ella lo puede hacer también»).
//
// Qué hay aquí y qué no:
// - `PLATFORM_OPERATIONS`: una frase en español por cada ruta de la API que Bria puede usar, con los campos que
//   lleva cuando se conocen. Es lo único que se escribe a mano. Los permisos NO están aquí: los lee
//   `listApiRoutes` de las rutas reales (etiqueta `permission` de cada guardián) y los hace valer la propia API.
// - `PLATFORM_EXCLUDED`: lo que Bria no hace ni confirmando, con su motivo: cuentas y permisos de personas,
//   contraseñas y verificación en dos pasos, la bóveda (tiene su propio camino), borrar una parrilla entera, bajar
//   o borrar archivos, cargas masivas (Excel, extractos), binarios, proxies y lo interno de la plataforma.
// - Subir un archivo sí (22 de octubre de 2026): una ruta que recibe archivos lo dice en su código con
//   `receivesFiles` (campo y cuántos), Bria lo lee del router y manda el archivo que llegó al chat o por WhatsApp.
//   Aquí solo va `archivo`, en palabras: qué archivo espera esa pantalla.
// - La prueba `tests/platformCatalog.test.js` exige que toda ruta real esté descrita o excluida: una ruta nueva sin
//   su frase rompe CI, así Bria crece con la plataforma sin que nadie se acuerde de avisarle.

export const PLATFORM_EXCLUDED = [
  { match: /^POST \/dashboard\/announcements\/:id\/response$/, reason: 'apertura o cierre personal del anuncio: solo se registra al actuar en su pantalla; Bria no puede declarar que alguien lo abrió ni cerrar su aviso por él' },
  { match: /^\w+ \/drive\/folders\/[^/]+\/(password|unlock|lock)$/, reason: 'las contraseñas y el desbloqueo de carpetas se gestionan solo en Drive; las claves nunca se solicitan ni pasan por Bria' },
  { match: /^\w+ \/(public|quotations\/public|login|password-reset|services-catalog)(\/|$)/, reason: 'puerta pública o de inicio de sesión' },
  { match: /^POST \/users$/, reason: 'crear cuentas es de la pantalla de Equipo' },
  { match: /^\w+ \/(minutes\/fireflies\/webhook|activity\/google-calendar\/webhook|whatsapp\/webhook)$/, reason: 'avisos de proveedores externos' },
  { match: /^\w+ \/team-chat-media\//, reason: 'archivos del chat del equipo' },
  { match: /^\w+ \/team-chat\/(events|channels\/:id\/uploads|messages\/:messageId\/attachments)/, reason: 'flujo en vivo y archivos del chat' },
  { match: /^\w+ \/bria(\/|$)/, reason: 'es la propia Bria' },
  { match: /^\w+ \/vault(\/|$)/, reason: 'la bóveda tiene su propio camino conversacional y nunca pasa valores por el modelo' },
  { match: /^\w+ \/(client-errors|auth\/me|openai|fireflies|report-pdf)(\/|$)/, reason: 'interno de la plataforma' },
  { match: /^\w+ \/push(\/|$)/, reason: 'suscripciones del dispositivo' },
  { match: /^\w+ \/incident-reports(\/|$)/, reason: 'un reporte de incidente de seguridad se escribe en su diálogo y nunca pasa por un proveedor de IA' },
  { match: /^\w+ \/user\/(avatar|mfa|password|onboarding)(\/|$)/, reason: 'contraseñas, verificación en dos pasos, foto y bienvenida se manejan en la pantalla de la persona' },
  { match: /^(POST|PUT|DELETE) \/team(\/|$)/, reason: 'cuentas, roles y permisos de personas: solo desde Equipo' },
  { match: /^\w+ \/feedback(\/|$)/, reason: 'retroalimentación de personas: zona privada' },
  // Datos de personas (Rodny, 10 de octubre de 2026, al revisar las políticas): el radar y la nómina no pasan por el
  // modelo, ni para leer ni para escribir. La nómina se lleva en la pantalla de Financiero.
  { match: /^\w+ \/talent-radar(\/|$)/, reason: 'datos de personas: el Radar de Mérito se mira en su pantalla' },
  { match: /^\w+ \/financials\/payroll(-|\/)/, reason: 'nómina: datos de salario de personas, nunca pasan por el modelo' },
  { match: /^\w+ \/(drive\/upload|tasks\/upload-temp|drive\/managed-files)/, reason: 'subir o descargar archivos' },
  { match: /^\w+ \/tasks\/:taskId\/(trace-open|alert-interaction|work-confirmation|returned-reminder\/snooze)$/, reason: 'señales de la pantalla' },
  { match: /^POST \/important-notices\/:id\/shown$/, reason: 'señales de la pantalla' },
  { match: /^POST \/important-notices\/:id\/acknowledge$/, reason: 'acuse personal de recepción del aviso operativo: la persona lo confirma en la banda, no acredita cumplimiento ni lo confirma Bria por ella' },
  { match: /^POST \/client-operations\/:clientId\/continuity$/, reason: 'decisión contractual explícita de no renovar o corregirla: el PM asignado o Dirección confirma la vigencia en la ficha o banda; no es descartar un aviso' },
  { match: /^GET \/tasks\/:taskId\/(attachments|comments)\/[^/]+\/(file|download)$/, reason: 'descarga de archivos' },
  { match: /^GET \/tasks\/:id\/deliverables\/:fileId\/(file|download)$/, reason: 'lectura binaria de entregables internos; se abre desde la tarea autorizada' },
  { match: /^POST \/tasks\/:id\/deliverables\/(direct-upload|confirm)$/, reason: 'subida directa del navegador, ligada a persona, tarea y revisión' },
  // Subir una pieza final, su portada o un enlace de Drive sí se hace desde el chat (22 de octubre de 2026); bajar o
  // borrar archivos, la subida directa al almacenamiento y la ruta antigua de un solo archivo, no.
  { match: /^(GET|DELETE) \/content\/items\/:id\/(final-assets\/:assetId|cover)$/, reason: 'bajar o borrar archivos de una pieza se hace en el editor' },
  { match: /^POST \/content\/items\/:id\/final-assets\/(direct-upload|confirm)$/, reason: 'la subida directa va del navegador al almacenamiento' },
  { match: /^POST \/content\/items\/:id\/delivery\/(direct-upload|confirm)$/, reason: 'confirmación de una carga directa del navegador, ligada a su sesión de entrega' },
  { match: /^\w+ \/clients\/:\w+\/(logo-image|storage\/signed-url|files)(\/|$)/, reason: 'archivos y logos' },
  { match: /^\w+ \/boards\/(unfurl|:boardId\/storage\/signed-url)$/, reason: 'adjuntos de inspiración' },
  { match: /^\w+ \/reports\/(generate|extract-metrics|image-proxy|:reportId\/(pdf|preview))$/, reason: 'subir capturas y archivos del informe' },
  // Adjuntar un comprobante, un soporte o un certificado sí se hace desde el chat (22 de octubre de 2026); bajarlo no.
  { match: /^GET \/financials\/(records\/:id|payables\/:id|receivable-payments\/:paymentId|formalizations\/:id)\/documents\/:documentId\/file$/, reason: 'descargar comprobantes, soportes, certificados y contratos' },
  { match: /^GET \/financials\/receivables\/:id\/document$/, reason: 'el PDF de la cuenta de cobro' },
  { match: /^GET \/financials\/clients\/:clientId\/statement\/document$/, reason: 'el PDF del estado de cuenta' },
  { match: /^\w+ \/recognitions(\/|$)/, reason: 'entrega personal de reconocimientos' },
  { match: /^\w+ \/activity\/google-calendar\/(auth-url|oauth-callback)$/, reason: 'conexión con Google: pantalla' },
  { match: /^\w+ \/db(\/|$)/, reason: 'rutas antiguas duplicadas' },
  { match: /^DELETE \/content\/plans\/:id$/, reason: 'borrar una parrilla entera no se hace desde un chat' },
  { match: /^DELETE \/minutes\/:id\/permanent$/, reason: 'borrado definitivo' },
  { match: /^\w+ \/ai-governance\/(usage\/export|documents\/:id)$/, reason: 'archivos' },
  { match: /^\w+ \/dashboard\/personal\/:userId$/, reason: 'el dashboard de otra persona se mira en su pantalla' },
  { match: /^\w+ \/user\/profile\/:userId$/, reason: 'el perfil de otra persona se edita en Equipo' }
];

export const isExcludedOperation = (key) => PLATFORM_EXCLUDED.find((rule) => rule.match.test(key)) || null;

// method path → { que, campos?, archivo? }. Las rutas con parámetro llevan `:nombre` como en el servidor.
export const PLATFORM_OPERATIONS = {
  // Cotizaciones y catálogo
  'GET /quotations/catalog': { que: 'El catálogo de servicios con sus precios, para armar cotizaciones.' },
  'GET /quotations/exchange-rate': { que: 'La TRM oficial del día (Superfinanciera).' },
  'POST /quotations': { que: 'Crea una cotización en borrador.', campos: 'clientName, items[{serviceId, quantity, billingType}], durationMonths, notes' },
  'PUT /quotations/:id': { que: 'Actualiza una cotización (precios, líneas, estado).', campos: 'los mismos de crear; status para emitirla' },
  'POST /quotations/:id/accept': { que: 'Registra que el cliente aprobó la cotización por fuera de su enlace (WhatsApp, correo, reunión) y abre la formalización del proyecto.', campos: 'scenarioId (si tiene escenarios), expectedUpdatedAt' },
  'POST /quotations/:id/send': { que: 'Reenvía una propuesta emitida por correo al cliente con el enlace para aceptar y el PDF, o registra que se mandó por WhatsApp.', campos: 'channel (CORREO o WHATSAPP)' },
  'GET /quotations/:id/pdf': { que: 'El PDF de una cotización (archivo).' },
  'GET /quotations/:id': { que: 'Una cotización con sus líneas y escenarios.' },
  'GET /quotations': { que: 'La lista de cotizaciones.' },
  'GET /services': { que: 'Los servicios del catálogo.' },
  'POST /services': { que: 'Crea un servicio en el catálogo.', campos: 'category, name, description, valor_neto, costo_real_estimado, precio_variable' },
  'PUT /services/:id': { que: 'Edita un servicio del catálogo.', campos: 'category, name, description, valor_neto, costo_real_estimado' },
  'DELETE /services/:id': { que: 'Retira un servicio del catálogo.' },
  // Chat del equipo
  'GET /team-chat/channels': { que: 'Los canales del chat del equipo de la persona.' },
  'GET /team-chat/roster': { que: 'Quiénes están en el chat del equipo.' },
  'POST /team-chat/channels': { que: 'Crea un canal o conversación directa.', campos: 'name, memberIds' },
  'PATCH /team-chat/channels/:id': { que: 'Renombra o ajusta un canal.', campos: 'name' },
  'GET /team-chat/channels/:id/members': { que: 'Los miembros de un canal.' },
  'GET /team-chat/channels/:id/messages': { que: 'Los mensajes de un canal.' },
  'POST /team-chat/channels/:id/messages': { que: 'Envía un mensaje en un canal, firmado por la persona.', campos: 'text' },
  'POST /team-chat/channels/:id/forward': { que: 'Reenvía un mensaje a un canal.', campos: 'messageId' },
  'POST /team-chat/channels/:id/read': { que: 'Marca un canal como leído.' },
  'PUT /team-chat/channels/:id/muted': { que: 'Silencia o reactiva un canal.', campos: 'muted' },
  'GET /team-chat/messages/:id': { que: 'Un mensaje del chat.' },
  'PATCH /team-chat/messages/:id': { que: 'Edita un mensaje propio.', campos: 'text' },
  'DELETE /team-chat/messages/:id': { que: 'Borra un mensaje propio.' },
  'PUT /team-chat/messages/:id/reactions': { que: 'Reacciona a un mensaje.', campos: 'emoji' },
  // Manager
  'GET /manager/task-analytics': { que: 'Esfuerzo del equipo: horas por categoría, cliente y persona.' },
  'GET /manager/rhythm': { que: 'Ritmo del equipo: cuánto tarda cada persona por tipo de trabajo.', campos: 'days=7|30|90 (consulta)' },
  'GET /manager/rhythm/load': { que: 'Mapa de carga: horas estimadas por persona y día hábil.' },
  'POST /manager/rhythm/assignment-preview': { que: 'Simula una asignación y anticipa su margen de entrega; no guarda cambios.', campos: 'taskId?, title, clientId, assigneeId, dueDay, focusDeadlineAt?' },
  'GET /manager/rhythm/reading': { que: 'La lectura de la semana que escribió Bria.' },
  'POST /manager/rhythm/reading': { que: 'Pide una lectura de la semana nueva.' },
  'GET /manager/bria-memory': { que: 'La memoria indexada de Bria (documentos y minutas).' },
  'GET /manager/bria-memory/search': { que: 'Busca en la memoria indexada.', campos: 'q (consulta)' },
  'POST /manager/bria-memory/sync': { que: 'Vuelve a indexar la memoria.' },
  'GET /manager/observer-signals': { que: 'Las señales que Observer detectó en las fuentes.' },
  'POST /manager/observer-signals/sync': { que: 'Vuelve a escanear las fuentes.' },
  'PATCH /manager/observer-signals/:id': { que: 'Resuelve, descarta o archiva una señal.', campos: 'status, note' },
  'GET /manager/decisions': { que: 'Las decisiones de la semana en Manager: lo que propuso la lectura de la mañana y lo que detectó el Observer esta semana, por urgencia, con lo ya respondido y lo que Bria aprendió a no mostrar.' },
  'GET /manager/decisions/pulse': { que: 'Si hay decisiones de Manager esperando respuesta (solo sus huellas, para el aviso del menú).' },
  'POST /manager/decisions/respond': { que: 'Responde una decisión de Manager: me encargo, descartar (con motivo) o más tarde (mañana, en 3 días o la próxima semana).', campos: 'source (LECTURA u OBSERVER), id, respuesta (HACER, DESCARTAR, MAS_TARDE), motivo (ESPERA_CLIENTE, YA_RESUELTO, NO_PRIORIDAD, INFO_INCORRECTA, OTRO), nota, hasta (MANANA, TRES_DIAS, PROXIMA_SEMANA)' },
  'GET /manager/meeting-tasks': { que: 'La bandeja de pendientes de reuniones en Manager: los compromisos que Fireflies anotó en cada minuta, armados como pendientes con cliente, responsable, fecha y prioridad propuestos, esperando que una persona los despache a Gestión o los descarte. Despachar uno es crear el pendiente con «POST /tasks» llevando «source: { kind: MINUTE, minuteId, n }»: el compromiso recuerda su pendiente y no se crea dos veces.' },
  'POST /manager/meeting-tasks/discard': { que: 'Descarta un compromiso de una reunión con su motivo; queda en la minuta con quién y cuándo, sin borrarse.', campos: 'minuteId, n, motivo (YA_HECHO, NO_ES_PENDIENTE, DEL_CLIENTE, OTRO), nota' },
  'GET /metrics/quality-streak': { que: 'La racha de calidad del equipo.' },
  // Gestión (tareas)
  'GET /tasks/completed': { que: 'Los logros de un día: tareas individuales y partes realizadas de tareas compartidas, incluso participaciones archivadas. Varias personas pueden corresponder a la misma Task.id; un logro personal no acredita cierre global.', campos: 'date, search (consulta)' },
  'GET /tasks/work-alerts': { que: 'Alertas de muchas horas en una tarea, de la persona.' },
  'GET /tasks/returned-alerts': { que: 'Avisos de tareas devueltas, de la persona.' },
  'GET /tasks': { que: 'Las tareas del tablero, opcionalmente de un cliente. En compartidas, status es global; participants contiene memberId, estado, revisión, reloj y permisos por persona, y rosterVersion identifica el equipo vigente. Lee estas revisiones antes de preparar cambios personales.', campos: 'clientId (consulta)' },
  'POST /tasks': { que: 'Crea una tarea en Gestión; preparar_pendiente conserva el borrador, las aclaraciones y los archivos elegidos del chat.', campos: 'title, clientId, assigneeId, dueDate, focusDeadlineAt (fecha-hora ISO con zona: compromiso con hora, solo dirección), priority (NORMAL|ALTA|URGENTE), isSpecial (estrella de proyecto especial; foco al trabajar en curso, no inicia trabajo), comments, collaboratorIds (personas que participan además del responsable), isPrivate, viewerIds, referenceUrl, initial_inputs[{url,name}] (insumos), initial_references[{url,name}] (referencias), initial_comments[{content}] (texto exacto), tempAttachments[{url,name}] (adjuntos del comentario), source {kind: MINUTE, minuteId, n} (solo al despachar un compromiso de la bandeja de reuniones de Manager: el compromiso queda enlazado y no se crea dos veces). Para archivos del chat usa preparar_pendiente: selecciona sus identificadores y destinos, sin inventar URLs' },
  'POST /tasks/reorder': { que: 'Reordena las tarjetas del tablero.', campos: 'reorderList[{id, sortOrder}]' },
  'POST /tasks/:taskId/focus-extension': { que: 'Pide más tiempo para un compromiso con hora.', campos: 'minutes (15|30|60|120|240), reason' },
  'POST /tasks/:taskId/declared-time': { que: 'Declara cuánto tomó el trabajo cerrado sin cronómetro, solo quien lo realizó. En una tarea compartida identifica la participación y su revisión de cierre.', campos: 'minutes, participantMemberId (compartida), expectedRevision (compartida)' },
  'PATCH /tasks/:taskId/participants/:memberId': { que: 'Mueve una participación concreta de una tarea compartida, conservando la misma Task.id. La persona mueve su parte o dirección interviene explícitamente; terminarla concede su logro y solo cierra el conjunto cuando todos terminan. Devolver/reabrir afecta únicamente esa parte, con motivo y nota. Reintegrar una parte devuelta es del creador o dirección. Conserva aprobación humana, acceso privado, foco y suspensión. Si hay conflicto de revisión, vuelve a leer y revisar; no reintentes automáticamente. Los archivos de participaciones retiradas son históricos, no se mueven.', campos: 'status (PENDIENTE|EN_CURSO|REALIZADA|DEVUELTA), expectedRevision, expectedRosterVersion, returnReason, returnNote, reopenReason, reopenNote, reintegrateReason' },
  'PATCH /tasks/:taskId': { que: 'Cambia una tarea existente con los permisos del creador, responsable o dirección. cambiar_pendiente cubre sus campos declarados; para otros campos usa esta operación con aprobación. Una tarea vinculada a una pieza conserva el cliente de la parrilla. En compartidas no admite status global: usa participants; editar equipo exige expectedRosterVersion vigente.', campos: 'status, assigneeId, dueDate, priority, title (tarea independiente), contentObjective (objetivo de la pieza vinculada), clientId (cliente activo de destino para tarea independiente), comments, isSpecial (estrella de proyecto especial), focusDeadlineAt, collaboratorIds (personas que participan además del responsable), expectedRosterVersion, isPrivate, viewerIds, returnReason, returnNote, reopenReason, reopenNote' },
  'DELETE /tasks/:taskId': { que: 'Elimina una tarea (mejor con preparar_eliminacion).', campos: 'reason' },
  'POST /tasks/:taskId/toggle-follow': { que: 'Sigue o deja de seguir una tarea.' },
  'GET /tasks/:taskId/follow-status': { que: 'Si la persona sigue una tarea.' },
  'GET /tasks/:taskId': { que: 'Detalle autorizado de una tarea por su ID, también fuera de las 200 realizadas recientes. En compartidas incluye cada participación, revisiones, reloj y permisos actuales; relee aquí después de un conflicto. Un archivo de participación no concede acceso privado.' },
  'GET /tasks/:taskId/work-history': { que: 'Los ciclos y sesiones de trabajo de una tarea (managers).' },
  'GET /tasks/:id/deliverables': { que: 'Entrega interna vigente e historial de una tarea sin pieza de parrilla, con revisión y permisos. El historial conserva quién, cuándo y qué archivos; solo el conjunto vigente tiene enlaces. No acredita estado, horas ni aprobación del cliente. Una tarea ligada a pieza usa la entrega nativa de esa pieza.' },
  'POST /tasks/:id/deliverables': { que: 'Reemplaza TODO el conjunto de entrega interna de una tarea independiente, sin comparar nombres ni conservar archivos anteriores por coincidencia. Requiere aprobación del conjunto completo, acceso y permiso de escritura. No cierra tareas ni modifica relojes. Relee tras un conflicto 409 y pide otra aprobación; un timeout conserva requestId para evitar duplicados.', campos: 'requestId (UUID único del intento lógico; conservar al reintentar), expectedRevision (vigente)', archivo: 'conjunto completo nuevo: entre 1 y 20 archivos seguros, hasta 200 MB por envío; para conjuntos mayores usar pantalla con subida directa hasta 2 GB por archivo' },
  'PUT /tasks/:id/deliverables/order': { que: 'Reordena el conjunto vigente de entregables internos de una tarea independiente. No añade, retira ni reemplaza archivos y conserva el historial. Requiere todos los identificadores actuales y revisión vigente.', campos: 'order (todos los ids en el orden nuevo, sin duplicados), expectedRevision, requestId (UUID del intento lógico)' },
  'POST /tasks/:taskId/work-sessions/:sessionId/correction': { que: 'Corrige el tiempo de una sesión de trabajo, hacia arriba o hacia abajo, por ejemplo un reloj que nadie pausó (solo administradores, con motivo). Si el reloj seguía corriendo, se detiene; en una tarea de una sola persona, la tarea vuelve a Pendiente.', campos: 'durationMinutes (el tiempo real, en minutos), reason (por qué se corrige; queda en la tarea)' },
  'GET /tasks/:taskId/work/team': { que: 'El tiempo de cada colaborador en una tarea.' },
  'POST /tasks/:taskId/work/start': { que: 'Ruta anterior de reloj manual, rechazada en tareas compartidas. Mueve la participación a EN_CURSO mediante la operación de participants.' },
  'POST /tasks/:taskId/work/pause': { que: 'Ruta anterior de reloj manual, rechazada en tareas compartidas. Mueve la participación a PENDIENTE mediante la operación de participants.' },
  'GET /tasks/:taskId/comments': { que: 'La conversación de una tarea.' },
  'POST /tasks/:taskId/comments': { que: 'Escribe un comentario en una tarea, firmado por la persona, con archivos adjuntos si los hay.', campos: 'content (texto o HTML sencillo)', archivo: 'los adjuntos del comentario, hasta 10 y 25 MB en total' },
  'POST /tasks/:taskId/comments/:commentId/reactions': { que: 'Reacciona a un comentario.', campos: 'emoji' },
  'PATCH /tasks/:taskId/comments/:commentId': { que: 'Edita un comentario propio.', campos: 'content' },
  'DELETE /tasks/:taskId/comments/:commentId': { que: 'Borra un comentario propio.' },
  // Clientes
  'GET /clients': { que: 'La lista de clientes (activos; con isArchived=all también los archivados).', campos: 'isArchived (consulta)' },
  'POST /clients': { que: 'Crea una ficha de cliente.', campos: 'name, legalName, documentType, documentNumber, contactName, email, phone, address, city, country, responsibleId, projectManagerId' },
  'PATCH /clients/:id': { que: 'Edita la ficha de un cliente.', campos: 'los mismos de crear' },
  'PATCH /clients/:id/archive': { que: 'Archiva o reactiva un cliente.', campos: 'isArchived' },
  'GET /clients/:clientId/announcements': { que: 'Los anuncios de un cliente.' },
  'POST /clients/:clientId/announcements': { que: 'Publica un anuncio en la ficha de un cliente.', campos: 'content, type' },
  'GET /clients/:clientId/flow': { que: 'El flujo de notas de un cliente.' },
  'POST /clients/:clientId/flow': { que: 'Añade una nota al flujo del cliente.', campos: 'content' },
  'GET /client-operations': { que: 'La operación de todos los clientes: semáforo, avance y motivos.' },
  'GET /client-operations/:slug': { que: 'La operación de un cliente por su slug: contrato, meses, observaciones.' },
  'GET /client-operations/:clientId/projects': { que: 'Los proyectos y servicios de un cliente, separados de su contrato mensual: habilitación administrativa, fuente aprobada y ficha operativa revisada o pendiente. No contiene tarifas, pagos ni documentos financieros.' },
  'PUT /client-operations/:clientId/projects/:projectId': { que: 'Guarda o revisa la ficha operativa de un proyecto habilitado. Conserva el alcance comercial de origen y no modifica el contrato mensual. Requiere leer la versión actual; un conflicto exige volver a revisar y confirmar, nunca reenviar automáticamente.', campos: 'expectedRevision (revisión leída), title, modality (MENSUAL, PUNTUAL o MIXTO), startDate, endDate (AAAA-MM-DD o null), projectManagerId, deliverables[{id,label,description,quantity,unit}], productionDays, productionHours (horas totales), reportRequired (booleano o null), notes, review (false guarda borrador; true confirma la revisión operativa). Cantidades o fechas ausentes quedan por definir; no deducirlas de la prosa ni confundir cantidades de servicios con piezas.' },
  'PUT /client-operations/:clientId/profile': { que: 'La ficha operativa y el contrato de un cliente.', campos: 'description, instagramUrl, agency, complexity, projectManagerId, communityManagerId, externalPlanUrl (hoja de Google de la parrilla de MIO), contract{serviceType, status, startDate, endDate, standBySince, cutDay, deliverables[{format, quantity}], storiesPerWeek, productionDays, monthlyReport, notes}, renew' },
  'PUT /client-operations/:clientId/reports/:year/:month': { que: 'El estado del informe de un mes: pendiente, en elaboración, en revisión o enviado, con el enlace al informe como soporte.', campos: 'status (PENDIENTE, EN_ELABORACION, EN_REVISION o ENVIADO), link (opcional, https), note (opcional)' },
  'GET /client-operations/jornadas': { que: 'Las jornadas de producción de un mes, de todos los clientes: fecha, horario, lugar, estado (Agendada, Falta la evidencia, Realizada), responsable, guion y evidencias; más los clientes cuyo contrato pide jornadas que ese mes todavía no están agendadas. Reemplaza el Excel «Seguimiento jornadas de producción».', campos: 'year, month (consulta)' },
  'POST /client-operations/:clientId/work-authorizations': { que: 'Autoriza seguir trabajando con un cliente sin propuesta aprobada (sin contrato vigente) hasta una fecha. Solo Dirección o Administración.', campos: 'until (AAAA-MM-DD, como máximo 120 días), reason' },
  'POST /client-operations/:clientId/suspension': { que: 'Suspende a un cliente por cartera: el mes en curso se termina y desde el siguiente no se trabaja parrilla ni producción. Solo Dirección o Administración, y hay que decir quién lo autorizó.', campos: 'authorizedBy (quién autorizó la suspensión), reason (por qué)' },
  'DELETE /client-operations/:clientId/suspension': { que: 'Levanta a mano la suspensión por cartera de un cliente, por ejemplo por un acuerdo de pago. Cuando el cliente se pone al día se levanta sola. Solo Dirección o Administración.', campos: 'reason (por qué se levanta)' },
  'DELETE /client-operations/:clientId/closes/:year/:month': { que: 'Reabre el cierre de un mes que se confirmó por error; se puede volver a confirmar.' },
  'POST /client-operations/:clientId/external-plan/refresh': { que: 'Lee ahora la parrilla de MIO del cliente desde su hoja de Google (mes en curso y siguiente). Solo lectura.' },
  'POST /client-operations/:clientId/closes/:year/:month': { que: 'Confirma el cierre de un mes de un cliente, desde tres días antes de que termine. Lo pendiente no se borra: queda escrito en el cierre.', campos: 'note (opcional)' },
  'POST /client-operations/:clientId/observations': { que: 'Anota una observación en la ficha (mejor con registrar_observacion).', campos: 'text' },
  'DELETE /client-operations/:clientId/observations/:observationId': { que: 'Borra una observación propia.' },
  'PUT /client-operations/team/:memberId/highlight': { que: 'La «acción destacada» de una persona del equipo.', campos: 'text' },
  'POST /client-operations/:clientId/pieces/:itemId/published': { que: 'Marca a mano una pieza como publicada por fuera.' },
  'DELETE /client-operations/:clientId/pieces/:itemId/published': { que: 'Deshace el «ya se publicó» a mano.' },
  // Notificaciones y anuncios
  'GET /notifications': { que: 'Las notificaciones de la persona.' },
  'POST /notifications': { que: 'Envía una notificación a una persona del equipo.', campos: 'userId, message, type, relatedId' },
  'PATCH /notifications/:id/read': { que: 'Marca una notificación como leída.' },
  'POST /notifications/read-all': { que: 'Marca todas como leídas.' },
  'PATCH /notifications/preferences': { que: 'Enciende o apaga el aviso de cuando el equipo termina un pendiente.', campos: 'teamCompletions' },
  'GET /important-notices/current': { que: 'El aviso importante que la persona tiene en la banda de abajo (uno a la vez).' },
  'POST /important-notices/:id/follow-up': { que: 'Registra el seguimiento de un aviso del CRM o una gestión de cobro y lo atiende. Para cartera mensual conserva exactamente las obligaciones de la lectura; un conflicto requiere volver a consultar, sin reenvío automático.', campos: 'channel (WHATSAPP, LLAMADA, CORREO, REUNION o RESPUESTA_CLIENTE), receivableIds (obligatorio solo para CARTERA_MENSUAL: los ids recibidos al consultar el aviso)' },
  'POST /important-notices/:id/snooze': { que: 'Pospone un aviso importante.', campos: 'option (10m, 1h o tomorrow)' },
  'POST /important-notices/:id/close': { que: 'Guarda el resultado nativo de una oportunidad y retira sus avisos. Descartar es directo. Cliente no aprobó es el nombre visible de PERDIDO y conserva su motivo e historial.', campos: 'outcome (PERDIDO, DESCARTADO, GANADO o ARCHIVAR), confirmed, expectedUpdatedAt, reason?' },
  'POST /important-notices/:id/schedule-follow-up': { que: 'Programa acción y fecha en la oportunidad, conservando el aviso para ese día. No acredita contacto ni reinicia el silencio del cliente.', campos: 'nextAction, nextFollowUpAt, confirmed, expectedUpdatedAt, requestId' },
  'GET /crm/activity-suggestions': { que: 'Consulta frases de gestiones previas del autor autenticado para completar texto editable; no comparte frases de otras personas ni registra una gestión.' },
  'GET /global-announcements': { que: 'Los anuncios generales del dashboard.' },
  'POST /global-announcements': { que: 'Publica un anuncio general para todo el equipo activo en la banda existente, sin duplicar campanas; conserva el mismo requestId ante un reintento.', campos: 'content, requestId (identificador único de la solicitud)' },
  'DELETE /global-announcements/:id': { que: 'Archiva un anuncio general y retira sus avisos pendientes conservando contenido y respuestas; exige la revisión recién consultada.', campos: 'expectedRevision' },
  'GET /general-chat': { que: 'El chat general (historial).' },
  'POST /general-chat': { que: 'Escribe en el chat general.', campos: 'content' },
  'POST /dashboard/announcements': { que: 'Crea un anuncio del dashboard, general en la banda del equipo activo o personal para el destinatario elegido; ante un reintento conserva el mismo requestId.', campos: 'content, scope (GLOBAL|MEMBER), targetUserId (solo MEMBER), requestId (identificador único obligatorio para GLOBAL)' },
  'GET /dashboard/announcements/:id/preview': { que: 'Consulta el contenido, autor y revisión actual de un anuncio general sin registrar que la persona lo abrió ni cerrar su aviso.' },
  'GET /dashboard/announcements/:id/history': { que: 'Consulta las respuestas personales de un anuncio general con acceso vigente de gestor; solo administradores reciben además la auditoría detallada. Apertura y cierre no acreditan lectura completa, aceptación ni cumplimiento.' },
  'PATCH /dashboard/announcements/:scope/:id': { que: 'Corrige un anuncio del dashboard; en generales conserva la versión anterior y no reemite avisos atendidos. Un conflicto de revisión requiere volver a consultar.', campos: 'content, expectedRevision (obligatorio para GLOBAL)' },
  'DELETE /dashboard/announcements/:scope/:id': { que: 'Archiva un anuncio general conservando su historial y retirando los avisos pendientes; un anuncio personal conserva su eliminación habitual.', campos: 'expectedRevision (obligatorio para GLOBAL)' },
  'PATCH /dashboard/clients/:clientId/responsible': { que: 'Asigna el community manager de un cliente.', campos: 'responsibleId' },
  'GET /dashboard/personal': { que: 'El dashboard personal de quien pregunta: tareas, reuniones y recordatorios.' },
  // La liga del mes (2 y 3 de noviembre de 2026): el buen uso de la plataforma, en puntos que se suman.
  'GET /league': { que: 'La liga del mes de quien pregunta: sus puntos (5 por cada hábito del día: reloj, al día, a tiempo, documentado, sin devolución; 5 por cada extra del día: primero en abrir la plataforma desde las 8:00, primero en la reunión; 10 por cada regalo del equipo), lo de hoy, su racha, su posición y la carrera de todo el equipo (de los demás, solo su puntaje).' },
  'GET /league/recognitions': { que: 'Los reconocimientos guardados de quien pregunta en el mes actual de Bogotá: conteos por categoría y hasta doce eventos recientes, con indicador de lista parcial. Solo devuelve categoría y fecha, sin tareas ni clientes. Respeta los permisos de Gestión y Parrillas; no añade puntos ni marca avisos como vistos.' },
  'POST /league/meetings': { que: 'Un administrador registra quién llegó primero a la reunión de tráfico: diez puntos para cada una de las dos primeras personas de la semana, registradas con la misma fecha. Rechaza una tercera persona, la misma persona dos veces, fechas futuras o fuera del mes vigente y personas inactivas.', campos: 'memberId (ficha de Equipo), day (fecha YYYY-MM-DD de la reunión, Bogotá)' },
  'POST /league/kudos': { que: 'Regala cinco puntos a otra persona activa del equipo. Una vez por persona y semana ISO de Bogotá; repetir devuelve LEAGUE_KUDOS_ALREADY.', campos: 'memberId (ficha de Equipo de quien los recibe), note (una línea, hasta 120 caracteres)' },
  'GET /dashboard/operational-health': { que: 'Salud operativa de la plataforma.' },
  'GET /dashboard/operational-trace': { que: 'Historial de actividad (acciones humanas registradas).' },
  // Minutas y Drive
  'GET /minutes': { que: 'Las minutas de reuniones.' },
  'GET /minutes/trash': { que: 'Las minutas en la papelera (managers).' },
  'POST /minutes/sync': { que: 'Trae reuniones nuevas de Fireflies.' },
  'PATCH /minutes/:id/restore': { que: 'Restaura una minuta de la papelera.' },
  'DELETE /minutes/:id': { que: 'Manda una minuta a la papelera.' },
  'GET /minutes/:id': { que: 'Una minuta completa: resumen, señales, compromisos.' },
  'GET /drive/files': { que: 'Los archivos del Drive interno.' },
  'GET /drive/contents': { que: 'El contenido de una carpeta del Drive interno. La carpeta virtual Entregables organiza los archivos vigentes por cliente, año, mes y tarea o pieza; usa los mismos archivos y permisos de su origen. Sus nombres automáticos conservan originalName. La fecha de una pieza viene de su parrilla y la de una tarea de su primera entrega en Bogotá; un legado sin historial lo declara. Es de solo lectura: reemplazar o reordenar se hace en la tarea o pieza. No revela tareas privadas por tener acceso a Drive.', campos: 'folderId (id opaco devuelto por la lectura; deliverables abre la raíz virtual), query (búsqueda dentro de la carpeta; en Entregables incluye el subárbol), trash (true solo papelera ordinaria)' },
  'POST /drive/folders': { que: 'Crea una carpeta en el Drive interno.', campos: 'name, parentId' },
  'PATCH /drive/folders/:id': { que: 'Renombra o mueve una carpeta.', campos: 'name, parentId' },
  'PATCH /drive/folders/:id/restore': { que: 'Restaura una carpeta.' },
  'DELETE /drive/folders/:id': { que: 'Manda una carpeta a la papelera.' },
  'PATCH /drive/files/:id': { que: 'Renombra o mueve un archivo.', campos: 'name, folderId' },
  'PATCH /drive/files/:id/restore': { que: 'Restaura un archivo.' },
  'DELETE /drive/files/:id': { que: 'Manda un archivo a la papelera.' },
  'GET /drive/files/:meetingId/:kind': { que: 'El archivo de una reunión (transcripción o resumen).' },
  // Perfil propio y notas
  'GET /user/profile': { que: 'El perfil de quien pregunta.' },
  'PUT /user/profile': { que: 'Edita el perfil propio.', campos: 'name, bio' },
  'GET /user/notes': { que: 'Las notas personales de quien pregunta.' },
  'POST /user/notes': { que: 'Crea una nota personal.', campos: 'title, content' },
  'PUT /user/notes/:id': { que: 'Edita una nota personal.', campos: 'title, content' },
  'DELETE /user/notes/:id': { que: 'Borra una nota personal.' },
  'GET /team': { que: 'El equipo: personas, cargos y cuentas.' },
  'PATCH /team/member/status-message': { que: 'El mensaje de estado propio.', campos: 'statusMessage' },
  // Parrillas
  'GET /content/plans/:id/criteria': { que: 'Los criterios editoriales de la parrilla y su cliente.' },
  'GET /content/plans/:id/criteria/discovery': { que: 'El estado de la búsqueda de criterios de la parrilla.' },
  'POST /content/plans/:id/criteria/discover': { que: 'Pide a Bria buscar criterios en las fuentes del cliente.' },
  'PATCH /content/plans/:id/criteria/:criterionId/draft': { que: 'Ajusta un criterio propuesto antes de aprobarlo.', campos: 'text, category, reason, version' },
  'POST /content/plans/:id/criteria': { que: 'Propone un criterio editorial a mano.', campos: 'text, category, reason, scope (CLIENT|PLAN)' },
  'PATCH /content/plans/:id/criteria/:criterionId': { que: 'Aprueba, rechaza o revoca un criterio.', campos: 'action (approve|reject|revoke), reason, version' },
  'DELETE /content/plans/:id/criteria/:criterionId': { que: 'Elimina definitivamente un criterio (administradores).', campos: 'version, confirmation=ELIMINAR' },
  'GET /content/plans': { que: 'Todas las parrillas.' },
  'GET /content/external-plans': { que: 'Las parrillas de MIO que viven en hojas de Google: cada cliente con hoja vinculada, su mes en curso y el siguiente, y cuántos cambios trajo la última lectura.' },
  'GET /content/external-plans/:slug/periods': { que: 'Los meses y años de la hoja de MIO ya leídos para este cliente, con pestaña y fecha de la última lectura válida; incluye años anteriores. No consulta Google ni garantiza meses que nunca se leyeron.' },
  'GET /content/external-plans/:slug/:period': { que: 'Un mes de la hoja de MIO de un cliente (period = «noviembre-2026»): sus piezas con estado, copy, caption, comentarios de la hoja y de Google, y lo que cambió en la última lectura.' },
  'POST /content/external-plans/:slug/refresh': { que: 'Lee ahora la hoja de MIO del cliente. Solo lectura: no cambia nada en la hoja.' },
  'PATCH /content/external-plans/:slug/:period/pieces/:row/status': { que: 'Cambia el estado de una pieza en la hoja de Google de MIO (escribe en la hoja con la cuenta de la plataforma). Comprueba antes que la fila siga siendo la misma pieza y que el estado sea el que se vio.', campos: 'status (una opción del desplegable de la hoja), expected (el estado que se vio)' },
  'POST /content/external-plans/:slug/:period/comments/:commentId/replies': { que: 'Responde un comentario de Google de la hoja de MIO, firmado con el nombre de quien escribe, y si se pide lo marca como resuelto.', campos: 'content, resolve (true|false)' },
  'GET /content/plans/:id': { que: 'Una parrilla con sus piezas.' },
  'GET /content/plans/:id/bria-review': { que: 'La revisión de Bria de una parrilla: puntaje y hallazgos.' },
  'POST /content/plans/:id/bria-review': { que: 'Pide revisar la parrilla de nuevo.' },
  'PATCH /content/plans/:id/bria-review/findings/:findingId': { que: 'Marca un hallazgo como corregido o descartado.', campos: 'action (resolve|dismiss), reason' },
  'GET /content/plans/:clientSlug/:month-:year': { que: 'La parrilla de un cliente por slug y periodo.' },
  'POST /content/plans': { que: 'Crea una parrilla (mejor con crear_parrilla, que pide responsable y objetivo).', campos: 'clientId, month, year, strategicObjectives' },
  'PATCH /content/plans/:id': { que: 'Edita una parrilla: estado, responsable, objetivo estratégico, notas internas.', campos: 'status (PLANIFICACION|EN_APROBACION|ACTIVO|FINALIZADO), ownerId, strategicObjectives, internalNotes' },
  'POST /content/plans/:id/share-token': { que: 'El enlace público de la parrilla (siempre el mismo).' },
  'POST /content/plans/:id/request-revision': { que: 'Pide al cliente volver a revisar las piezas aprobadas con material nuevo.' },
  'POST /content/items/:id/request-revision': { que: 'Pide al cliente volver a revisar una pieza.' },
  'GET /content/items': { que: 'Las piezas de contenido.', campos: 'planId (consulta)' },
  'POST /content/items/:id/final-assets': { que: 'Sube fotos o videos como pieza final de una pieza; quedan al final del carrusel.', archivo: 'las fotos o videos, hasta 10' },
  'GET /content/items/:id/location': { que: 'Consulta la parrilla y el período vigentes de una pieza por su identidad. Permite resolver un enlace anterior después de un traslado; no cambia la pieza.' },
  'GET /content/items/:id/delivery': { que: 'Lee el conjunto vigente de archivos de una pieza, su revisión y el historial de cambios con autor y fecha. El historial conserva metadatos, no descargas de versiones anteriores.' },
  'POST /content/items/:id/delivery/replace': { que: 'Sustituye todos los archivos finales de una pieza por la selección nueva, en orden. El conjunto anterior solo se retira después de confirmar la carga completa. Requiere leer antes la revisión vigente y confirmar que se reemplaza todo el conjunto, incluidos enlaces de Drive; nunca borra archivos del Drive externo.', campos: 'expectedRevision (revisión leída), requestId (identificador único de este pedido)', archivo: 'imágenes o videos que compondrán toda la entrega, entre 1 y 20' },
  'POST /content/items/:id/final-assets/drive': { que: 'Agrega un archivo de Google Drive como pieza final de una pieza.', campos: 'url (enlace del archivo, no de una carpeta), name (opcional)' },
  'PUT /content/items/:id/final-assets/order': { que: 'Cambia el orden de los archivos de la pieza final, que es el orden del carrusel que sale publicado.', campos: 'order (lista de ids de los archivos, en el orden nuevo)' },
  'POST /content/items/:id/cover': { que: 'Sube la portada de un reel (una imagen; se ajusta a 9:16 sin recortar).', archivo: 'la imagen de la portada' },
  'POST /content/items': { que: 'Crea una pieza (mejor con crear_pieza).', campos: 'planId, objective, format, publishDate, status' },
  'PATCH /content/items/:id': { que: 'Edita una pieza: objetivo, formato, guion, texto, fecha, hora, estado, notas, cuentas. Cambiar la fecha a otro mes o año traslada la misma pieza a la parrilla de ese período y cliente, creando el destino si falta; sus tareas y entregables la siguen. Si queda vacía, solo se retira la parrilla automática sin trabajo manual propio. Conserva estados personales, tiempos e historial. La programación pendiente se ajusta a la fecha; si ya pasó se cancela, y una publicación en curso bloquea el cambio. Lee primero la pieza y envía su planId vigente como expectedPlanId para rechazar una pantalla desactualizada. No escribas planId directamente.', campos: 'objective, format, copyText, captionText, publishDate (YYYY-MM-DD), expectedPlanId (id de la parrilla leída), publishTime (HH:mm), status (BORRADOR|EN_REVISION|APROBADO|DEVUELTO|EN_PRODUCCION|REALIZADO|PUBLICADO; PROGRAMADO lo pone la cola de Meta, no se escribe a mano), internalNotes, socialPageIds' },
  'DELETE /content/items/:id': { que: 'Elimina una pieza de la parrilla.' },
  'POST /content/items/:id/send-to-kanban': { que: 'Despacha una pieza a producción (mejor con preparar_despacho).', campos: 'assigneeId, dueDate, isPriority' },
  // Redes
  'GET /social/publications': { que: 'Las publicaciones programadas o salidas en redes.', campos: 'itemId, clientId (consulta)' },
  'POST /social/publications': { que: 'Programa una pieza en las cuentas del cliente a su fecha y hora.', campos: 'itemId, accountIds' },
  'PUT /social/items/:itemId/pages': { que: 'A qué cuentas va una pieza.', campos: 'pageIds' },
  'DELETE /social/publications/:publicationId': { que: 'Cancela una publicación programada.' },
  'POST /social/publications/:publicationId/retry': { que: 'Reintenta una publicación fallida.' },
  'POST /social/publications/:publicationId/reopen': { que: 'Deja una publicación ya salida lista para programarla de nuevo.' },
  'GET /social/accounts': { que: 'Las cuentas de redes conectadas de un cliente.', campos: 'clientId (consulta)' },
  'GET /social/accounts/available': { que: 'Las páginas de Meta que se pueden conectar.' },
  'POST /social/accounts/link': { que: 'Conecta una página de Meta a un cliente.', campos: 'clientId, pageId' },
  'DELETE /social/accounts/:accountId': { que: 'Desconecta una cuenta de redes.' },
  // Actividad y calendario
  'GET /activity/status': { que: 'Estado actual registrado de las personas del equipo en Actividad: reunión, ausencia, producción, foco o trabajo, con tarea y evento actuales. Combina tareas en curso y eventos vigentes del calendario. Describe lo registrado ahora, no certifica presencia física ni atención; una lista de pendientes o tiempos históricos no lo sustituye.' },
  'GET /activity/events': { que: 'Los eventos de Actividad en un rango.', campos: 'from, to (consulta)' },
  // 22 de octubre de 2026: sin `type` ni cuenta de Google la plataforma lo rechaza («El tipo de evento no es válido»).
  'POST /activity/events': { que: 'Crea un evento en el calendario elegido. Obligatorios: title, type, startAt, endAt y googleConnectionId.', campos: 'title, type (PRODUCTION|PROJECT|MEETING|ABSENCE|BREAK; una ausencia, permiso o incapacidad es ABSENCE), startAt y endAt (ISO con -05:00), isAllDay (true para todo el día: startAt el día a las 00:00 y endAt el día siguiente a las 00:00), googleConnectionId (obligatorio: el id de la primera cuenta activa de GET /activity/google-calendar/connections; no preguntes en cuál, porque el evento queda siempre en todos los calendarios conectados), description, memberIds (ids de TeamMember), attendeeEmails, recurrence (NONE|WEEKLY), recurrenceEnd', requestId: true },
  'POST /activity/events/generate-meet': { que: 'Genera un enlace de Meet para un evento.', campos: 'googleConnectionId, eventId' },
  // Jornadas de producción con evidencia (10 de noviembre de 2026): colgadas del evento de Producción del calendario.
  'GET /production-days/by-task/:taskId': { que: 'Si un pendiente de Gestión es el de una jornada de producción y en qué va: cliente, horario, si ya tiene su evidencia (archivos de la entrega o enlace de Drive). Sin jornada responde productionDay vacío.' },
  'PUT /production-days/by-task/:taskId/evidence': { que: 'Pega o corrige el enlace de la carpeta de Drive con las evidencias de una jornada desde su pendiente de Gestión, desde el día de la jornada. Con eso (o con archivos en la entrega del pendiente) queda realizada y el pendiente se puede cerrar. Lo hace quien está en la jornada o en el pendiente, quien la agendó o un project manager.', campos: 'url (https, obligatorio), note' },
  'GET /production-days/clients': { que: 'Los clientes en operación a los que se puede ligar una jornada de producción (solo para administradores y project managers; a los demás les responde una lista vacía).' },
  'GET /production-days/by-event/:eventId': { que: 'La jornada de producción de un evento de Producción: a qué cliente está ligada, si ya tiene la evidencia (enlace del Drive) y en qué va (Agendada, Falta la evidencia, Realizada). Una jornada solo está realizada cuando tiene evidencia; estar en el calendario no basta.' },
  'PUT /production-days/by-event/:eventId/client': { que: 'Liga un evento de Producción a un cliente para que cuente como su jornada de producción; sin cliente la desliga si todavía no tiene evidencia. Solo administradores y project managers. No adivines el cliente por el título: pregúntalo si no lo dijeron.', campos: 'clientId (o vacío para desligar)' },
  'PUT /production-days/by-event/:eventId/evidence': { que: 'Sube o corrige el enlace del Drive con las evidencias de una jornada ya ligada a un cliente, desde el día de la jornada. Es lo que la da por realizada. Lo hace quien estuvo en la jornada, quien la agendó o un project manager.', campos: 'url (https, obligatorio), note' },
  'GET /activity/google-calendar/status': { que: 'Si la cuenta de Google está conectada.' },
  'GET /activity/google-calendar/connections': { que: 'Las cuentas de Google conectadas.' },
  'GET /activity/google-calendar/calendars': { que: 'Los calendarios de una cuenta.', campos: 'connectionId (consulta)' },
  'PATCH /activity/google-calendar/active-calendar': { que: 'Elige el calendario activo de una cuenta.', campos: 'connectionId, calendarId' },
  'POST /activity/google-calendar/sync': { que: 'Sincroniza ahora con Google.', campos: 'connectionId' },
  'GET /activity/google-calendar/reconciliation': { que: 'Diferencias entre la plataforma y Google.' },
  'POST /activity/google-calendar/reconciliation': { que: 'Vuelve a comparar con Google.', campos: 'connectionId' },
  'PATCH /activity/google-calendar/errors/:id/dismiss': { que: 'Descarta un error de sincronización.' },
  'POST /activity/google-calendar/errors/:id/retry': { que: 'Reintenta un error de sincronización.' },
  'PATCH /activity/google-calendar/reconciliation/:id/dismiss': { que: 'Descarta una diferencia.' },
  'PATCH /activity/events/:id': { que: 'Edita un evento (no cambia de cuenta ni de calendario).', campos: 'title, type (PRODUCTION|PROJECT|MEETING|ABSENCE|BREAK), startAt, endAt, isAllDay, description, memberIds, attendeeEmails, recurrence, recurrenceEnd' },
  'DELETE /activity/events/:id': { que: 'Cancela un evento.' },
  // Reportes
  'GET /reports/pipeline-status': { que: 'Si la IA de informes está disponible.' },
  'GET /reports/meta/sources': { que: 'Las cuentas de Meta de un cliente para un informe.', campos: 'clientId (consulta)' },
  'GET /reports/meta/ad-accounts/available': { que: 'Las cuentas publicitarias disponibles.' },
  'GET /reports/meta/ad-accounts/:adAccountId/campaigns': { que: 'Las campañas de una cuenta publicitaria.' },
  'POST /reports/meta/ad-accounts': { que: 'Vincula una cuenta publicitaria a un cliente.', campos: 'clientId, adAccountId, campaignFilter' },
  'DELETE /reports/meta/ad-accounts/:id': { que: 'Desvincula una cuenta publicitaria.' },
  'GET /reports': { que: 'Los informes de resultados.' },
  'GET /reports/:reportId': { que: 'Un informe con sus cifras.' },
  'PATCH /reports/:reportId/observations': { que: 'Edita las observaciones de un informe.', campos: 'observations' },
  'POST /reports/:reportId/analyze': { que: 'Pide el análisis con IA de un informe.' },
  'POST /reports/:reportId/publish': { que: 'Publica un informe.' },
  'POST /reports/:reportId/reopen': { que: 'Reabre un informe publicado.' },
  'PATCH /reports/:reportId/metrics': { que: 'Corrige cifras de un informe.', campos: 'normalizedMetrics' },
  'POST /reports/:reportId/generate-narrative': { que: 'Genera la narrativa de un informe.' },
  // Inspiración
  'GET /boards': { que: 'Los tableros de inspiración.' },
  'GET /boards/:boardId': { que: 'Un tablero de inspiración.' },
  'POST /boards': { que: 'Crea un tablero de inspiración.', campos: 'name, clientId' },
  'DELETE /boards/:boardId': { que: 'Borra un tablero.' },
  'GET /boards/:boardId/items': { que: 'Las referencias de un tablero.' },
  'POST /boards/:boardId/items': { que: 'Añade una referencia (enlace o nota) a un tablero.', campos: 'type, url, note, title' },
  'PATCH /boards/:boardId/items/:itemId': { que: 'Edita una referencia.', campos: 'note, title' },
  'DELETE /boards/:boardId/items/:itemId': { que: 'Quita una referencia.' },
  // Financiero
  'GET /financials/dashboard': { que: 'Indicadores y gráficas del financiero.', campos: 'year, month, category (consulta)' },
  'GET /financials/accounts': { que: 'Las cuentas bancarias y de caja.' },
  'GET /financials/accounts/:accountId/statement': { que: 'Composición del saldo registrado desde apertura: saldo inicial, ingresos, egresos y movimientos paginados con saldo acumulado. Todos los años, no solo el periodo de pantalla; no acredita saldo bancario conciliado.', campos: 'page' },
  'GET /financials/payment-corrections/:kind/:paymentId': { que: 'Lee el pago original de nómina (payroll) o proveedor (payable), su revisión y saldo antes de preparar una corrección. Solo administradores reciben el historial de auditoría.' },
  'POST /financials/payment-corrections/:kind/:paymentId': { que: 'Corrige pago y movimiento juntos, con revisión vigente, motivo e historial. No realiza transferencias ni crea pagos. Nómina exige aprobación financiera; proveedores, escritura. No modifica egresos preexistentes aplicados.', campos: 'expectedRevision, requestId, amount, paidAt, accountId, reference, notes, reason' },
  'POST /financials/accounts': { que: 'Crea una cuenta de banco o caja. Siempre en pesos.', campos: 'name, type (BANK|CASH|OTHER), institution, holderName, holderType (COMPANY|PERSON), identificationType, identificationNumber, lastFour, isThirdPartyHeld, openingBalance, openingBalanceDate' },
  'PATCH /financials/accounts/:accountId': { que: 'Corrige los datos de una cuenta de banco o caja.', campos: 'name, type, institution, holderName, holderType, identificationType, identificationNumber, lastFour, isThirdPartyHeld, openingBalance, openingBalanceDate' },
  'GET /financials/records': { que: 'El libro de movimientos.', campos: 'year, month, type, category, accountId (consulta)' },
  'POST /financials/records': { que: 'Registra un movimiento (ingreso o egreso).', campos: 'type (INGRESO|EGRESO), amount, date (YYYY-MM-DD), concept, category, accountId, clientId, requestId' },
  'PATCH /financials/records/:id': { que: 'Edita un movimiento no vinculado a pagos.', campos: 'amount, date, concept, category, accountId, clientId' },
  'POST /financials/records/:id/void': { que: 'Anula un movimiento con motivo.', campos: 'reason' },
  'PUT /financials/records/:id/allocations': { que: 'El desglose interno de un movimiento (ítems que suman el total).', campos: 'allocations[{amount, category, concept}]' },
  'POST /financials/records/:id/documents': { que: 'Adjunta un comprobante o una factura (PDF, JPG o PNG) a un movimiento de Financiero.', archivo: 'el comprobante, un archivo por vez' },
  'POST /financials/records/:id/documents/:documentId/void': { que: 'Anula un comprobante con motivo.', campos: 'reason' },
  'POST /financials/payables/:id/documents': { que: 'Adjunta el soporte (factura, cuenta de cobro o recibo en PDF, JPG o PNG) a una cuenta por pagar.', archivo: 'el soporte, un archivo por vez' },
  'POST /financials/receivable-payments/:paymentId/documents': { que: 'Adjunta el certificado de una retención, o el soporte de un ajuste, a su fila de la cartera.', archivo: 'el certificado o soporte, un archivo por vez' },
  'GET /financials/periods': { que: 'Los periodos contables y su estado.' },
  'POST /financials/periods/close': { que: 'Cierra un periodo.', campos: 'year, month' },
  'POST /financials/periods/reopen': { que: 'Reabre un periodo.', campos: 'year, month' },
  'GET /financials/client-reconciliation': { que: 'Conciliación por cliente.' },
  'GET /financials/clients/:clientId/statement': { que: 'El estado de cuenta de un cliente.' },
  'GET /financials/clients': { que: 'El directorio financiero de clientes.' },
  'POST /financials/clients': { que: 'Crea una ficha de cliente desde el financiero.', campos: 'name, legalName, documentType, documentNumber, email, phone' },
  'PATCH /financials/clients/:id': { que: 'Edita una ficha desde el financiero.', campos: 'los mismos de crear' },
  'PATCH /financials/client-links/:sourceClientId': { que: 'Une una ficha sobrante a la ficha real del cliente.', campos: 'targetClientId' },
  'GET /financials/receivables-ledger': { que: 'La cartera: cuentas por cobrar y sus abonos.', campos: 'year, month, quarter, q (consulta). month prevalece sobre quarter. q busca en cliente, origen, notas y comentarios; combina términos con AND, no une clientes con OR. Verifica la identidad de las filas; un resultado de búsqueda no acredita por sí solo que pertenezca al cliente solicitado.' },
  'PATCH /financials/receivables/:id': { que: 'Corrige una cuenta por cobrar. La modalidad de cobro se puede precisar sin alterar el importe; una cuota de formalización conserva su clasificación.', campos: 'amount, dueDate, concept, status, collectionMode (MENSUAL, PUNTUAL, CUOTA o null para dejar sin definir)' },
  'POST /financials/receivables': { que: 'Crea una cuenta por cobrar. La modalidad pertenece a esa obligación, no se deduce del nombre o del contrato global del cliente.', campos: 'clientId, amount, dueDate, concept, currency, foreignAmount, exchangeRate, collectionMode (MENSUAL, PUNTUAL, CUOTA o null)' },
  'DELETE /financials/receivables/:id': { que: 'Elimina una cuenta por cobrar sin abonos vigentes.', campos: 'reason' },
  'POST /financials/receivables/:id/issue': { que: 'Emite la cuenta de cobro con número y PDF.', campos: 'issueDate, servicePeriod, concept, items[{description, amount}], currency, exchangeRate' },
  'PUT /financials/receivables/:id/document': { que: 'Corrige una cuenta de cobro emitida y rehace su PDF.', campos: 'los mismos de emitir' },
  'GET /financials/exchange-rate': { que: 'La TRM del día.' },
  'POST /financials/receivables/:id/payments': { que: 'Registra un abono a una cuenta por cobrar, con las retenciones que aplicó el cliente si las hay (no cuentan como ingreso).', campos: 'amount, date, accountId, notes, concept, requestId, retentions[{type (RETEFUENTE, RETEICA, RETEIVA), amount}]' },
  'POST /financials/receivables/:id/collection-archive': { que: 'Archiva una cuenta por cobrar del cobro (o la desarchiva): sigue en Cartera con su saldo, pero no genera avisos de cartera, no cuenta para suspender ni en la antigüedad de lo vencido.', campos: 'archived (true archiva, false desarchiva), reason (obligatorio al archivar)' },
  'POST /financials/loans': { que: 'Registra un préstamo a un tercero: crea el egreso (o liga uno ya registrado) y la deuda en Cuentas por cobrar. Su devolución entra como reintegro.', campos: 'counterpartyType (COLABORADOR, SOCIO, CLIENTE, PROVEEDOR, OTRO), counterpartyName o clientId, amount, lentAt, accountId o financialRecordId, dueDate, notes' },
  'POST /financials/loans/:receivableId/correction': { que: 'Corrige el valor, la fecha o la cuenta de un préstamo; el egreso de Movimientos cambia con él. Conserva reintegros y descuentos, y no deja el valor por debajo de lo ya aplicado.', campos: 'amount, lentAt, accountId, reason (obligatorio), expectedUpdatedAt' },
  'GET /financials/formalizations/access': { que: 'Si la persona puede gestionar la formalización de proyectos (áreas Dirección y Administrativa y contable).' },
  'GET /financials/formalizations': { que: 'Los proyectos por formalizar y los ya habilitados: cotización aprobada, contrato cargado, estado del anticipo o la excepción autorizada.' },
  'POST /financials/formalizations/:id/documents': { que: 'Carga a la formalización de un proyecto el contrato firmado, un otrosí o un anexo. Un contrato o un otrosí vigente cumplen lo que se pide; un anexo no.', campos: 'kind (CONTRATO, OTROSI o ANEXO), note (opcional)', archivo: 'el documento, un archivo por vez' },
  'POST /financials/formalizations/:id/documents/:documentId/void': { que: 'Anula un documento de la formalización subido por error: sigue guardado y deja de contar.', campos: 'reason' },
  'POST /financials/formalizations/:id/exception': { que: 'Autoriza empezar el proyecto sin el anticipo; la deuda sigue en Cuentas por cobrar.', campos: 'reason, conditions (opcional), paymentDate (AAAA-MM-DD, la fecha de pago acordada)' },
  'PUT /financials/formalizations/:id/requirements': { que: 'Cambia lo que se pide para habilitar un proyecto: el contrato firmado (o un otrosí) y el anticipo. Si ya cumple, el proyecto queda habilitado.', campos: 'requiresContract (true o false), requiresAdvance (true o false), note (opcional)' },
  'PUT /financials/formalizations/:id/advance': { que: 'Liga la cuenta por cobrar del anticipo cuando la cotización no traía plan de pagos.', campos: 'receivableId' },
  'GET /financials/collection-activities': { que: 'Las gestiones de cobro registradas: cliente, obligación cuando es individual, canal, fecha y quién la hizo.' },
  'POST /financials/collection-activities': { que: 'Registra una gestión de cobro. Con receivableId cubre únicamente esa obligación del cliente; sin él registra gestión de toda su cartera. Conserva el alcance que la persona revisó.', campos: 'clientId, receivableId (opcional, debe pertenecer al cliente), channel (WHATSAPP, LLAMADA, CORREO, REUNION o RESPUESTA_CLIENTE)' },
  'GET /financials/collection-alerts': { que: 'Los plazos de los avisos de cartera: días para pagar después de emitida la cuenta, cuántas mensualidades vencidas avisan, el primer aviso de un servicio puntual y cada cuántos días se repite.' },
  'PUT /financials/collection-alerts': { que: 'Cambia los plazos de los avisos de cartera (solo administradores).', campos: 'paymentTermDays, monthlyAlertCount, oneOffFirstAlertDays, repeatDays' },
  'GET /financials/receivable-adjustments': { que: 'Resumen de ajustes de cartera del periodo: lo saldado sin dinero (acuerdo, canje, compensación, condonación) y la diferencia en cambio de las cuentas en dólares.', campos: 'year, month' },
  'POST /financials/receivables/:id/settlements': { que: 'Salda una cuenta por cobrar sin dinero: acuerdo por menor valor, canje, compensación, condonación o la retención que aplicó el cliente. No crea ingresos; una retención deja la cuenta pagada. COMPENSACION exige elegir una cuenta por pagar del mismo cliente desde offset-options, revisar ambos saldos y enviar payableId, expectedRevision y requestId estable; reduce ambas obligaciones sin banco. CANJE exige barter-options, expectedRevision, requestId, destinationMode (AGENCIA, BENEFICIARIO u OTRO_AUTORIZADO), autorización y destino explícito; BENEFICIARIO requiere beneficiaryThirdPartyId del directorio y crea su cuenta nativa, nunca una venta ni préstamo. Un canje anterior se completa desde barters/:paymentId/destination sin reaplicar el importe. No reaplicar ajustes históricos de texto.', campos: 'kind (ACUERDO, CANJE, COMPENSACION, CONDONACION, RETENCION), amount, settledAt, reason, authorizedBy, goods, destination, destinationMode, beneficiaryThirdPartyId, payableId, expectedRevision, requestId, retentionType (RETEFUENTE, RETEICA, RETEIVA), certificateNumber' },
  'POST /financials/receivable-payments/:paymentId/reverse': { que: 'Revierte un abono o un ajuste con motivo.', campos: 'reason' },
  'PATCH /financials/receivable-payments/:paymentId': { que: 'Corrige un abono sin revertirlo: valor, fecha, cuenta, referencia o notas. Cambiar el dinero exige motivo; su ingreso cambia con él.', campos: 'amount, paidAt, accountId, reference, notes, reason, settlesInFull' },
  // Terceros y cuentas por pagar (20 de octubre de 2026)
  'GET /financials/third-parties/:id/person': { que: 'Revisa la identidad financiera, sus vínculos de nómina y cartera y los registros disponibles para relacionar. Un nombre parecido no confirma que sea la misma persona. Devuelve revisión e historial nativo; no modifica datos.', campos: '' },
  'POST /financials/third-parties/:id/person': { que: 'Relaciona registros de nómina y préstamos con una persona confirmada. Exige selección explícita, revisión vigente, motivo, permiso financiero y confirmación humana. Conserva IDs, contratos, importes, períodos, pagos y comprobantes; no salda ni aprueba obligaciones.', campos: 'collaboratorIds, receivableIds, expectedRevision, requestId, reason' },
  'POST /financials/person-links/:id/reverse': { que: 'Deshace los vínculos añadidos por una decisión de identidad, solo sin cambios posteriores. Exige revisión vigente, motivo y confirmación. Conserva personas, deudas, contratos, pagos e historial.', campos: 'expectedRevision, requestId, reason' },
  'POST /financials/parties/profile': { que: 'Crea o reutiliza la ficha financiera de una identidad elegida de Cliente, Equipo o Nómina. No une personas por nombre ni recrea fichas inactivas. Solo al confirmar la operación; nunca al leer o buscar.', campos: 'selection (ID de tercero, client:ID, team:ID o payroll:ID)' },
  'GET /financials/third-parties/:id/merge-review': { que: 'Revisa la unificación explícita de dos fichas de la misma identidad. No infiere equivalencias por nombre. Conserva pagos y vínculos nativos.', campos: 'targetId (consulta)' },
  'POST /financials/third-parties/:id/merge': { que: 'Unifica fichas financieras tras revisar identidad y obligaciones. Conserva origen, historial y datos bancarios del destino. Exige confirmación humana y revisión vigente.', campos: 'targetId, expectedRevision, requestId, reason' },
  'GET /financials/party-merges/:id': { que: 'Consulta una unificación y si admite deshacerse; no expone el catálogo de auditoría.', campos: '' },
  'POST /financials/party-merges/:id/reverse': { que: 'Deshace una unificación sin cambios posteriores, conservando historial. Exige motivo, confirmación y revisión.', campos: 'expectedRevision, requestId, reason' },
  'GET /financials/offsets/:paymentId/legacy-options': { que: 'Revisa la contrapartida de una compensación antigua que ya descontó Cartera. Muestra los saldos sin aplicar otra vez el descuento.', campos: '' },
  'POST /financials/offsets/:paymentId/link': { que: 'Vincula una compensación histórica con su cuenta por pagar confirmada. No descuenta otra vez Cartera ni crea dinero. Exige revisión, permiso vigente, autorización identificada y motivo; la reversión posterior es del cruce completo.', campos: 'payableId, expectedRevision, requestId, reason, authorizedBy (o autorización histórica registrada)' },
  'GET /financials/third-parties': { que: 'Las fichas de pago de los terceros: proveedores, colaboradores, arrendador, socios (los clientes están en /financials/clients).', campos: 'q, kind, includeInactive, selection (clientes y equipo además de fichas de pago), includeMerged (consulta)' },
  'GET /financials/parties/commercial': { que: 'Lo comercial de los terceros: los clientes potenciales (oportunidades del CRM con cotización y sin ficha de cliente) y las cotizaciones de cada cliente.' },
  'GET /financials/parties/team': { que: 'El equipo activo como terceros de Terceros: nombre, cargo y correo de cada persona, para unirla con su ficha de pago.' },
  'POST /financials/parties/prospects/:leadId/client': { que: 'Une un cliente potencial con su ficha de cliente: su oportunidad y sus cotizaciones pasan a esa ficha.', campos: 'clientId' },
  'POST /financials/third-parties': { que: 'Crea un tercero con sus datos de pago.', campos: 'roles (varias clasificaciones), kind (CLIENTE, PROVEEDOR, CONTRATISTA, OUTSOURCING, COLABORADOR, ARRENDADOR, SOCIO), name, legalName, documentType, documentNumber, email, phone, bankName, bankAccountType, bankAccountNumber, clientId (si también es cliente), notes' },
  'PATCH /financials/third-parties/:id': { que: 'Edita o desactiva un tercero.', campos: 'los mismos de crear, isActive' },
  'GET /financials/receivables/:id/barter-options': { que: 'Lee saldo, revisión y beneficiarios activos del directorio para revisar un canje sin inferir destinatarios.', campos: '' },
  'GET /financials/barters/:paymentId': { que: 'Lee canje, destino, cuenta del beneficiario, cobros que bloquean reversión y permisos actuales; auditoría solo administradores.', campos: '' },
  'POST /financials/barters/:paymentId/destination': { que: 'Completa explícitamente el destino de un canje legado. Conserva fecha e importe; no vuelve a saldar al cliente. La decisión no se infiere del texto antiguo.', campos: 'destinationMode, beneficiaryThirdPartyId, destination, authorizedBy, reason, expectedRevision, requestId' },
  'POST /financials/barters/:paymentId/reverse': { que: 'Revierte el canje completo y anula su cuenta de beneficiario con una aplicación nativa sin dinero. Conserva documentos e historial; bloquea si el beneficiario tiene cobros o cruces vigentes. No elimina ni devuelve pagos automáticamente.', campos: 'reason, expectedRevision, requestId' },
  'GET /financials/receivables/:id/offset-options': { que: 'Obligaciones aptas del mismo tercero para compensar: saldos actuales y revisión. Solo lee; sin deducir vínculos por nombre.', campos: '' },
  'GET /financials/offsets/:paymentId': { que: 'Consulta un cruce vinculado desde su aplicación a Cartera: ambos saldos, soporte, autor y reversión. Auditoría solo administradores.', campos: '' },
  'POST /financials/offsets/:paymentId/reverse': { que: 'Revierte el cruce completo en ambas obligaciones conservando pagos posteriores, historial y soportes. Requiere revisión actual y motivo; no anula movimientos bancarios.', campos: 'reason, expectedRevision, requestId' },
  'GET /financials/payables-ledger': { que: 'Las cuentas por pagar: lo abierto de cualquier fecha más lo cerrado del periodo, agrupado por tercero, con totales por pagar, vencido y pagado.', campos: 'year, month, status, thirdPartyId, q (consulta)' },
  'POST /financials/payables': { que: 'Registra una cuenta por pagar recibida de un tercero.', campos: 'thirdPartyId, concept, category, amount, receivedAt, dueDate, documentNumber, notes' },
  'PATCH /financials/payables/:id': { que: 'Corrige una cuenta por pagar; el valor nunca queda por debajo de lo pagado.', campos: 'concept, category, amount, receivedAt, dueDate, documentNumber, notes' },
  'POST /financials/payables/:id/void': { que: 'Anula una cuenta por pagar sin pagos vigentes.', campos: 'reason' },
  'POST /financials/payables/:id/payments': { que: 'Paga una cuenta por pagar: crea el egreso en Movimientos ligado al pago.', campos: 'amount, paidAt, accountId, reference, notes' },
  'POST /financials/payable-payments/:paymentId/reverse': { que: 'Revierte un pago de una cuenta por pagar; su egreso se anula.', campos: 'reason' },
  // CRM
  'GET /crm/catalogs': { que: 'Etapas, fuentes y catálogos del CRM.' },
  'GET /crm/follow-up-alerts': { que: 'Los días de las alertas comerciales: los recordatorios al responsable de una oportunidad sin respuesta y el día de la revisión.' },
  'PUT /crm/follow-up-alerts': { que: 'Cambia los días de las alertas comerciales (solo administradores).', campos: 'reminders (lista de días, hasta seis), review (día de la revisión, después del último recordatorio)' },
  'GET /crm/metrics': { que: 'Indicadores del CRM.' },
  'GET /crm/followups': { que: 'Seguimientos vencidos y de hoy.' },
  'GET /crm/leads': { que: 'Las oportunidades del CRM.', campos: 'stage, ownerId, q (consulta)' },
  'POST /crm/leads': { que: 'Crea una oportunidad.', campos: 'company, contactName, email, phone, source, ownerId, notes' },
  'GET /crm/leads/:leadId': { que: 'Una oportunidad con su historial.' },
  'PATCH /crm/leads/:leadId': { que: 'Edita una oportunidad.', campos: 'company, contactName, email, phone, ownerId, nextFollowUpAt, notes' },
  'POST /crm/leads/:leadId/stage': { que: 'Cambia la etapa de una oportunidad.', campos: 'stage, reason' },
  'POST /crm/leads/:leadId/activities': { que: 'Registra una actividad (llamada, reunión, correo).', campos: 'type, note, happenedAt, nextFollowUpAt' },
  'PATCH /crm/leads/:leadId/activities/:activityId': { que: 'Edita una actividad.', campos: 'note, happenedAt' },
  'POST /crm/leads/:leadId/traffic-light': { que: 'Fija el semáforo a mano.', campos: 'light, reason' },
  'POST /crm/leads/:leadId/archive': { que: 'Archiva una oportunidad: sale de listas, métricas y avisos con sus datos intactos.', campos: 'reason' },
  'POST /crm/leads/:leadId/unarchive': { que: 'Desarchiva una oportunidad: vuelve tal cual estaba, con su etapa y su bitácora.' },
  'POST /crm/leads/archive': { que: 'Archiva varias oportunidades de una vez (hasta 200).', campos: 'ids (lista de ids)' },
  'POST /crm/leads/:leadId/quotations': { que: 'Crea un borrador de cotización desde la oportunidad.' },
  // Gobierno de IA
  'GET /ai-governance/options': { que: 'Opciones del gobierno de IA.' },
  'PUT /ai-governance/policy/:clientId': { que: 'La política de IA de un cliente.', campos: 'enabled, scope' },
  'GET /ai-governance/usage/summary': { que: 'Resumen del uso de IA.' },
  'GET /ai-governance/usage': { que: 'El registro de uso de IA.' },
  'GET /ai-governance/data-requests': { que: 'Solicitudes de titulares de datos.' },
  'POST /ai-governance/data-requests': { que: 'Registra una solicitud de titular.', campos: 'kind, requesterName, channel, receivedOn, summary' },
  'PATCH /ai-governance/data-requests/:id': { que: 'Avanza una solicitud de titular.', campos: 'status, answeredOn, answer, evidence' },
  'GET /ai-governance/:kind/:id/history': { que: 'Historial de un registro de gobierno.' },
  'GET /ai-governance/:kind': { que: 'Registros de gobierno por tipo (incidentes, proveedores, políticas).' },
  'POST /ai-governance/:kind': { que: 'Crea un registro de gobierno.', campos: 'según el tipo' },
  'PATCH /ai-governance/:kind/:id': { que: 'Edita un registro de gobierno.', campos: 'según el tipo' },
  // Salud de servicios
  'GET /service-health': { que: 'El semáforo de servicios externos (administradores).' },
  'GET /ad-budgets': { que: 'Las pautas de todos los clientes: presupuesto global, ciclo del cliente, gasto registrado, saldo y cómo va cada una. Las cifras terminadas en Cents van en centavos: para hablar usa formatos con su moneda, y `evaluation.reasons` ya lo dice en palabras. El gasto lo escribe quien lleva la pauta mirando Meta: la fecha de la lectura dice hasta cuándo es cierto.', campos: 'clientId (opcional), terminadas=1 (opcional)' },
  'GET /ad-budgets/options': { que: 'Los clientes y las personas del equipo que se pueden elegir al crear una pauta.' },
  'GET /ad-budgets/meta': { que: 'La conexión de Pautas con Meta: las cuentas publicitarias que ve la plataforma, cada campaña que gastó en los últimos 30 días con la pauta a la que está ligada, y las que gastan sin estar en ninguna pauta (unassigned). Solo lectura; spend30Cents va en centavos de la moneda de su cuenta.' },
  'POST /ad-budgets/meta/sync': { que: 'Vuelve a leer Meta ahora: cuentas, campañas y el gasto de las pautas con campañas ligadas. La plataforma ya lo hace sola cada dos horas.' },
  'POST /ad-budgets/meta/campaigns/:campaignId/ignore': { que: 'Marca una campaña de Meta como que no es de ninguna pauta (o lo deshace), para que deje de aparecer como gasto sin asignar.', campos: 'ignored (true o false)' },
  'GET /ad-budgets/:id/meta-suggestions': { que: 'Las campañas de Meta que parecen de esta pauta por su nombre o el de su cuenta. Es una propuesta: la confirma una persona.' },
  'GET /ad-budgets/:id/meta-budgets': { que: 'Los presupuestos que Meta tiene ahora en las campañas de una pauta (el de la campaña o el de cada conjunto), lo que gastaría cada una hasta el límite de gasto del ciclo y cuánto queda. Es una estimación con lo configurado en Meta, no una predicción.' },
  'POST /ad-budgets/:id/meta-budget': { que: 'Cambia en Meta el presupuesto diario o total de una campaña ligada a la pauta, o de uno de sus conjuntos. Pide «Editar pautas». No deja subirlo si la pauta gastaría más de lo que queda del ciclo: primero se sube el presupuesto de la pauta. Solo cambia el valor del presupuesto: no pausa, no crea y no cambia el tipo.', campos: 'objectId (campaña o conjunto), kind (DAILY o LIFETIME, el que ya tiene), amount (nuevo valor en la moneda de la pauta), expectedCents (el presupuesto que se vio, en centavos, para no pisar un cambio hecho en Meta)' },
  'PUT /ad-budgets/:id/meta-campaigns': { que:'Liga una pauta a sus campañas de Meta: se manda la lista completa. Una campaña es de una sola pauta y en su moneda. Desde ahí el gasto de la pauta se lee de Meta y queda como lectura marcada «Meta»; lo que una persona escribió ese día manda.', campos: 'campaignIds (lista de identificadores de campaña de Meta; vacía suelta todas)' },
  'GET /ad-budgets/:id': { que: 'Una pauta con sus campañas, sus ciclos anteriores y cada lectura de gasto.' },
  'POST /ad-budgets': { que: 'Crea el presupuesto global de pauta de un cliente o de una de sus marcas. El ciclo sale del corte de su contrato, salvo que la pauta tenga el suyo.', campos: 'clientId, brand (marca, opcional), platform (META, GOOGLE, TIKTOK, LINKEDIN u OTRA), kind (MENSUAL o ESPECIFICA), currency (COP o USD), amount, cutDay (1 a 28, opcional), objective, payer (TARJETA_CLIENTE, TARJETA_BRAIN o POR_DEFINIR), responsibleId, startDate y endDate (solo la específica), notes' },
  'PATCH /ad-budgets/:id': { que: 'Corrige cualquier dato de una pauta, también el cliente o la moneda. Lo que no se manda se conserva. Cambiar el presupuesto aplica al ciclo abierto y no reescribe los anteriores.', campos: 'los mismos de crear, más status (ACTIVA, PAUSADA o TERMINADA)' },
  'DELETE /ad-budgets/:id': { que: 'Elimina una pauta creada por error, con sus ciclos, lecturas y campañas. Para conservarla, márcala como terminada.' },
  'PATCH /ad-budgets/:id/readings/:readingId': { que: 'Corrige una lectura de gasto y recalcula el ciclo.', campos: 'spent, readOn (AAAA-MM-DD), final, note' },
  'DELETE /ad-budgets/:id/readings/:readingId': { que: 'Elimina una lectura de gasto: la cifra vigente vuelve a ser la lectura anterior.' },
  'PATCH /ad-budgets/:id/cycles/:cycleKey': { que: 'Corrige el presupuesto de un ciclo en particular, también de uno cerrado.', campos: 'amount' },
  'POST /ad-budgets/:id/cycles/:cycleKey/reopen': { que: 'Reabre un ciclo cerrado: lo que pasa al siguiente vuelve a ser provisional.' },
  'DELETE /ad-budgets/:id/carry-over': { que: 'Quita el ajuste manual del saldo: vuelve a salir de la cuenta automática.', campos: 'cycleKey (consulta, AAAA-MM, opcional)' },
  'DELETE /ad-budgets/:id/campaigns/:campaignId': { que: 'Elimina una campaña de una pauta.' },
  'POST /ad-budgets/:id/spend': { que: 'Registra cuánto se lleva gastado en el ciclo según Meta, acumulado. Con final cierra el ciclo y deja firme lo que pasa al siguiente.', campos: 'spent, readOn (AAAA-MM-DD), final (opcional), note (opcional), cycleKey (AAAA-MM, opcional: otro ciclo)' },
  'PUT /ad-budgets/:id/carry-over': { que: 'Ajusta el saldo que pasa a un ciclo cuando la cuenta automática no aplica, con su motivo.', campos: 'carryOver (puede ser negativo), reason, cycleKey (AAAA-MM, opcional)' },
  'POST /ad-budgets/:id/campaigns': { que: 'Añade una campaña o anuncio dentro del presupuesto global de una pauta.', campos: 'name, link, objective, status (POR_ACTIVAR, ACTIVA, PAUSADA o FINALIZADA), startDate, endDate, planned, notes' },
  'PATCH /ad-budgets/:id/campaigns/:campaignId': { que: 'Corrige una campaña o cambia su estado, por ejemplo al apagarla.', campos: 'los mismos de crear' },
  'GET /client-profitability': { que: 'La rentabilidad de cada cliente en un mes (administradores): lo facturado frente a sus horas por el costo hora de la agencia más su costo directo, con el margen, el ingreso por hora y una lectura de cada cuenta. Las cifras terminadas en Cents van en centavos: para hablar usa `line`, `reading` y `notes`, que ya vienen en pesos y en palabras.', campos: 'year, month (consulta; sin ellos, el último mes cerrado)' },
  'GET /service-health/summary': { que: 'El punto de color del semáforo.' },
  'POST /service-health/run': { que: 'Comprueba los servicios ahora.' }
};

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const fold = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Convierte una ruta concreta en el patrón del catálogo: `/tasks/abc-123` → `/tasks/:taskId`. */
export const matchOperation = (method, path) => {
  const verb = String(method || 'GET').toUpperCase();
  const clean = String(path || '').split('?')[0].replace(/\/$/, '') || '/';
  const parts = clean.split('/');
  for (const key of Object.keys(PLATFORM_OPERATIONS)) {
    const [keyMethod, keyPath] = key.split(' ');
    if (keyMethod !== verb) continue;
    const keyParts = keyPath.split('/');
    if (keyParts.length !== parts.length) continue;
    const params = {};
    const fits = keyParts.every((segment, index) => {
      if (segment.includes(':')) {
        // `:month-:year` → dos parámetros en un segmento.
        const pattern = new RegExp(`^${segment.replace(/:(\w+)/g, '(?<$1>[^/]+?)')}$`);
        const found = parts[index].match(pattern);
        if (!found) return false;
        Object.assign(params, found.groups || {});
        return true;
      }
      return segment === parts[index];
    });
    if (fits) return { key, method: verb, path: keyPath, params, write: WRITE.has(verb), ...PLATFORM_OPERATIONS[key] };
  }
  return null;
};

/** Busca operaciones por palabras: «anuncio», «cartera abono», «nómina pagar». */
export const findOperations = (query, { limit = 12, writesOnly = false } = {}) => {
  const words = fold(query).match(/[\p{L}\p{N}]{3,}/gu) || [];
  if (!words.length) return [];
  return Object.entries(PLATFORM_OPERATIONS)
    .map(([key, op]) => {
      const haystack = fold(`${key} ${op.que} ${op.campos || ''} ${op.archivo ? `archivo adjuntar subir ${op.archivo}` : ''}`);
      const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { key, score, write: WRITE.has(key.split(' ')[0]), ...op };
    })
    .filter((row) => row.score > 0 && (!writesOnly || row.write))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map(({ score, ...row }) => row);
};

// Directorio derivado del catálogo, sin clasificar frases del usuario. El modelo puede recorrer una familia
// completa aunque una búsqueda léxica no encuentre nada; nuevas rutas se incorporan automáticamente.
const operationFamily = key => key.split(' ')[1].split('/')[1];
export const platformFamilies = () => [...new Set(Object.keys(PLATFORM_OPERATIONS).map(operationFamily))].sort().map(familia => {
  const entries = Object.entries(PLATFORM_OPERATIONS).filter(([key]) => operationFamily(key) === familia);
  return { familia, operaciones: entries.length, alcance: entries.filter(([key]) => key.startsWith('GET ')).slice(0, 2).map(([, op]) => op.que).join(' ') || entries[0][1].que };
});
export const familyOperations = (family, { writesOnly = false } = {}) => Object.entries(PLATFORM_OPERATIONS)
  .filter(([key]) => operationFamily(key) === family && (!writesOnly || WRITE.has(key.split(' ')[0])))
  .map(([key, op]) => ({ key, write: WRITE.has(key.split(' ')[0]), ...op }));

/** Qué pide la ruta, leído de sus guardianes reales; `null` si solo pide sesión. */
export const describeGuards = (guards = []) => {
  const modules = [...new Set(guards.filter((g) => g.module).map((g) => g.module))];
  const roles = [...new Set(guards.filter((g) => g.role).map((g) => g.role))];
  const financial = [...new Set(guards.filter((g) => g.financial).map((g) => g.financial))];
  if (!modules.length && !roles.length && !financial.length) return null;
  return { ...(modules.length ? { modules } : {}), ...(roles.length ? { roles } : {}), ...(financial.length ? { financial } : {}) };
};
