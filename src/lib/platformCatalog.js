// El mapa de la plataforma para Bria (Rodny, 10 de octubre de 2026: «quiero que Bria tenga permiso para todo en la
// plataforma, ella vive ahí … como todo se crea manual, ella lo puede hacer también»).
//
// Qué hay aquí y qué no:
// - `PLATFORM_OPERATIONS`: una frase en español por cada ruta de la API que Bria puede usar, con los campos que
//   lleva cuando se conocen. Es lo único que se escribe a mano. Los permisos NO están aquí: los lee
//   `listApiRoutes` de las rutas reales (etiqueta `permission` de cada guardián) y los hace valer la propia API.
// - `PLATFORM_EXCLUDED`: lo que Bria no hace ni confirmando, con su motivo: cuentas y permisos de personas,
//   contraseñas y verificación en dos pasos, la bóveda (tiene su propio camino), borrar una parrilla entera, subir
//   archivos (no caben en un chat), binarios, proxies y lo interno de la plataforma.
// - La prueba `tests/platformCatalog.test.js` exige que toda ruta real esté descrita o excluida: una ruta nueva sin
//   su frase rompe CI, así Bria crece con la plataforma sin que nadie se acuerde de avisarle.

export const PLATFORM_EXCLUDED = [
  { match: /^\w+ \/(public|quotations\/public|login|password-reset|services-catalog)(\/|$)/, reason: 'puerta pública o de inicio de sesión' },
  { match: /^POST \/users$/, reason: 'crear cuentas es de la pantalla de Equipo' },
  { match: /^\w+ \/(minutes\/fireflies\/webhook|activity\/google-calendar\/webhook)$/, reason: 'avisos de proveedores externos' },
  { match: /^\w+ \/team-chat-media\//, reason: 'archivos del chat del equipo' },
  { match: /^\w+ \/team-chat\/(events|channels\/:id\/uploads|messages\/:messageId\/attachments)/, reason: 'flujo en vivo y archivos del chat' },
  { match: /^\w+ \/bria(\/|$)/, reason: 'es la propia Bria' },
  { match: /^\w+ \/vault(\/|$)/, reason: 'la bóveda tiene su propio camino conversacional y nunca pasa valores por el modelo' },
  { match: /^\w+ \/(client-errors|auth\/me|openai|fireflies|report-pdf)(\/|$)/, reason: 'interno de la plataforma' },
  { match: /^\w+ \/push(\/|$)/, reason: 'suscripciones del dispositivo' },
  { match: /^\w+ \/user\/(avatar|mfa|password|onboarding)(\/|$)/, reason: 'contraseñas, verificación en dos pasos, foto y bienvenida se manejan en la pantalla de la persona' },
  { match: /^(POST|PUT|DELETE) \/team(\/|$)/, reason: 'cuentas, roles y permisos de personas: solo desde Equipo' },
  { match: /^\w+ \/feedback(\/|$)/, reason: 'retroalimentación de personas: zona privada' },
  { match: /^\w+ \/talent-radar\/member\/:memberId\/(avatar|avatar-image|ai-insights)$/, reason: 'foto y análisis de personas' },
  { match: /^\w+ \/(drive\/upload|tasks\/upload-temp|drive\/managed-files)/, reason: 'subir o descargar archivos' },
  { match: /^\w+ \/tasks\/:taskId\/(trace-open|alert-interaction|work-confirmation|returned-reminder\/snooze)$/, reason: 'señales de la pantalla' },
  { match: /^GET \/tasks\/:taskId\/(attachments|comments)\/[^/]+\/(file|download)$/, reason: 'descarga de archivos' },
  { match: /^\w+ \/content\/items\/:id\/final-assets?(\/|$)/, reason: 'subir, ordenar o bajar piezas finales se hace en el editor' },
  { match: /^\w+ \/clients\/:\w+\/(logo-image|storage\/signed-url|files)(\/|$)/, reason: 'archivos y logos' },
  { match: /^\w+ \/boards\/(unfurl|:boardId\/storage\/signed-url)$/, reason: 'adjuntos de inspiración' },
  { match: /^\w+ \/reports\/(generate|extract-metrics|image-proxy|:reportId\/(pdf|preview))$/, reason: 'subir capturas y archivos del informe' },
  { match: /^\w+ \/financials\/(import|bank-reconciliation\/(preview|import))(\/|$)/, reason: 'cargar archivos de Excel o extractos' },
  { match: /^(POST \/financials\/records\/:id\/documents|GET \/financials\/records\/:id\/documents\/:documentId\/file)$/, reason: 'comprobantes: archivos' },
  { match: /^GET \/financials\/receivables\/:id\/document$/, reason: 'el PDF de la cuenta de cobro' },
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

// method path → { que, campos? }. Las rutas con parámetro llevan `:nombre` como en el servidor.
export const PLATFORM_OPERATIONS = {
  // Cotizaciones y catálogo
  'GET /quotations/catalog': { que: 'El catálogo de servicios con sus precios, para armar cotizaciones.' },
  'GET /quotations/exchange-rate': { que: 'La TRM oficial del día (Superfinanciera).' },
  'POST /quotations': { que: 'Crea una cotización en borrador.', campos: 'clientName, items[{serviceId, quantity, billingType}], durationMonths, notes' },
  'PUT /quotations/:id': { que: 'Actualiza una cotización (precios, líneas, estado).', campos: 'los mismos de crear; status para emitirla' },
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
  'GET /manager/rhythm/reading': { que: 'La lectura de la semana que escribió Bria.' },
  'POST /manager/rhythm/reading': { que: 'Pide una lectura de la semana nueva.' },
  'GET /manager/bria-memory': { que: 'La memoria indexada de Bria (documentos y minutas).' },
  'GET /manager/bria-memory/search': { que: 'Busca en la memoria indexada.', campos: 'q (consulta)' },
  'POST /manager/bria-memory/sync': { que: 'Vuelve a indexar la memoria.' },
  'GET /manager/observer-signals': { que: 'Las señales que Observer detectó en las fuentes.' },
  'POST /manager/observer-signals/sync': { que: 'Vuelve a escanear las fuentes.' },
  'PATCH /manager/observer-signals/:id': { que: 'Resuelve, descarta o archiva una señal.', campos: 'status, note' },
  'GET /metrics/quality-streak': { que: 'La racha de calidad del equipo.' },
  // Gestión (tareas)
  'GET /tasks/completed': { que: 'Las tareas realizadas de un día.', campos: 'date, search (consulta)' },
  'GET /tasks/work-alerts': { que: 'Alertas de muchas horas en una tarea, de la persona.' },
  'GET /tasks/returned-alerts': { que: 'Avisos de tareas devueltas, de la persona.' },
  'GET /tasks': { que: 'Las tareas del tablero, opcionalmente de un cliente.', campos: 'clientId (consulta)' },
  'POST /tasks': { que: 'Crea una tarea en Gestión (mejor con preparar_pendiente, que pregunta lo que falta).', campos: 'title, clientId, assigneeId, dueDate, priority (NORMAL|ALTA|URGENTE), comments, collaboratorIds, isPrivate, viewerIds, referenceUrl' },
  'POST /tasks/reorder': { que: 'Reordena las tarjetas del tablero.', campos: 'reorderList[{id, sortOrder}]' },
  'POST /tasks/:taskId/focus-extension': { que: 'Pide más tiempo para un compromiso con hora.', campos: 'minutes (15|30|60|120|240), reason' },
  'POST /tasks/:taskId/declared-time': { que: 'Declara cuánto tomó una tarea cerrada sin cronómetro.', campos: 'minutes' },
  'PATCH /tasks/:taskId': { que: 'Cambia una tarea (mejor con cambiar_pendiente, que avisa y resume).', campos: 'status, assigneeId, dueDate, priority, title, comments, focusDeadlineAt, collaboratorIds, isPrivate, viewerIds, returnReason, returnNote, reopenReason, reopenNote' },
  'DELETE /tasks/:taskId': { que: 'Elimina una tarea (mejor con preparar_eliminacion).', campos: 'reason' },
  'POST /tasks/:taskId/toggle-follow': { que: 'Sigue o deja de seguir una tarea.' },
  'GET /tasks/:taskId/follow-status': { que: 'Si la persona sigue una tarea.' },
  'GET /tasks/:taskId/work-history': { que: 'Los ciclos y sesiones de trabajo de una tarea (managers).' },
  'GET /tasks/:taskId/work/team': { que: 'El tiempo de cada colaborador en una tarea.' },
  'POST /tasks/:taskId/work/start': { que: 'Arranca el reloj propio en una tarea en proceso.' },
  'POST /tasks/:taskId/work/pause': { que: 'Pausa el reloj propio en una tarea.' },
  'GET /tasks/:taskId/comments': { que: 'La conversación de una tarea.' },
  'POST /tasks/:taskId/comments': { que: 'Escribe un comentario en una tarea, firmado por la persona.', campos: 'content (texto o HTML sencillo)' },
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
  'PUT /client-operations/:clientId/profile': { que: 'La ficha operativa y el contrato de un cliente.', campos: 'description, instagramUrl, agency, complexity, projectManagerId, communityManagerId, contract{serviceType, status, startDate, endDate, cutDay, deliverables[{format, quantity}], storiesPerWeek, productionDays, monthlyReport, notes}, renew' },
  'PUT /client-operations/:clientId/reports/:year/:month': { que: 'Marca si el informe de un mes se entregó.', campos: 'delivered' },
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
  'GET /global-announcements': { que: 'Los anuncios generales del dashboard.' },
  'POST /global-announcements': { que: 'Publica un anuncio general para todo el equipo.', campos: 'content, type' },
  'DELETE /global-announcements/:id': { que: 'Retira un anuncio general.' },
  'GET /general-chat': { que: 'El chat general (historial).' },
  'POST /general-chat': { que: 'Escribe en el chat general.', campos: 'content' },
  'POST /dashboard/announcements': { que: 'Crea un anuncio del dashboard (general o para una persona).', campos: 'content, scope (global|personal), userId' },
  'PATCH /dashboard/announcements/:scope/:id': { que: 'Edita un anuncio del dashboard.', campos: 'content' },
  'DELETE /dashboard/announcements/:scope/:id': { que: 'Retira un anuncio del dashboard.' },
  'PATCH /dashboard/clients/:clientId/responsible': { que: 'Asigna el community manager de un cliente.', campos: 'responsibleId' },
  'GET /dashboard/personal': { que: 'El dashboard personal de quien pregunta: tareas, reuniones, recordatorios.' },
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
  'GET /drive/contents': { que: 'El contenido de una carpeta del Drive interno.', campos: 'folderId (consulta)' },
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
  'POST /content/items': { que: 'Crea una pieza (mejor con crear_pieza).', campos: 'planId, objective, format, publishDate, status' },
  'PATCH /content/items/:id': { que: 'Edita una pieza: objetivo, formato, guion, texto, fecha, hora, estado, notas, cuentas.', campos: 'objective, format, copyText, captionText, publishDate (YYYY-MM-DD), publishTime (HH:mm), status (BORRADOR|EN_REVISION|APROBADO|DEVUELTO|EN_PRODUCCION|REALIZADO|PUBLICADO), internalNotes, socialPageIds' },
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
  // Equipo y radar
  'GET /talent-radar/summary': { que: 'El resumen del Radar de Mérito.' },
  'GET /talent-radar/member/:memberId': { que: 'El radar de una persona.' },
  // Actividad y calendario
  'GET /activity/status': { que: 'El estado del módulo de Actividad.' },
  'GET /activity/events': { que: 'Los eventos de Actividad en un rango.', campos: 'from, to (consulta)' },
  'POST /activity/events': { que: 'Crea un evento en el calendario elegido.', campos: 'title, startAt, endAt, description, googleConnectionId, memberIds' },
  'POST /activity/events/generate-meet': { que: 'Genera un enlace de Meet para un evento.', campos: 'googleConnectionId, eventId' },
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
  'PATCH /activity/events/:id': { que: 'Edita un evento (no cambia de cuenta ni de calendario).', campos: 'title, startAt, endAt, description, memberIds' },
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
  'POST /financials/accounts': { que: 'Crea una cuenta financiera.', campos: 'name, type, currency, openingBalance, openingDate' },
  'GET /financials/records': { que: 'El libro de movimientos.', campos: 'year, month, type, category, accountId (consulta)' },
  'GET /financials/integrity': { que: 'La auditoría de integridad del financiero.' },
  'POST /financials/records': { que: 'Registra un movimiento (ingreso o egreso).', campos: 'type (INGRESO|EGRESO), amount, date (YYYY-MM-DD), concept, category, accountId, clientId, requestId' },
  'PATCH /financials/records/:id': { que: 'Edita un movimiento no vinculado a pagos.', campos: 'amount, date, concept, category, accountId, clientId' },
  'POST /financials/records/:id/void': { que: 'Anula un movimiento con motivo.', campos: 'reason' },
  'PUT /financials/records/:id/allocations': { que: 'El desglose interno de un movimiento (ítems que suman el total).', campos: 'allocations[{amount, category, concept}]' },
  'POST /financials/records/:id/documents/:documentId/void': { que: 'Anula un comprobante con motivo.', campos: 'reason' },
  'GET /financials/periods': { que: 'Los periodos contables y su estado.' },
  'POST /financials/periods/close': { que: 'Cierra un periodo.', campos: 'year, month' },
  'POST /financials/periods/reopen': { que: 'Reabre un periodo.', campos: 'year, month' },
  'GET /financials/monthly-ledger': { que: 'El resumen mensual.', campos: 'year (consulta)' },
  'PATCH /financials/monthly-summaries/:id': { que: 'Ajusta un resumen mensual.', campos: 'year, actualThroughMonth' },
  'GET /financials/client-reconciliation': { que: 'Conciliación por cliente.' },
  'GET /financials/clients/:clientId/statement': { que: 'El estado de cuenta de un cliente.' },
  'GET /financials/clients': { que: 'El directorio financiero de clientes.' },
  'POST /financials/clients': { que: 'Crea una ficha de cliente desde el financiero.', campos: 'name, legalName, documentType, documentNumber, email, phone' },
  'PATCH /financials/clients/:id': { que: 'Edita una ficha desde el financiero.', campos: 'los mismos de crear' },
  'PATCH /financials/client-links/:sourceClientId': { que: 'Une una ficha sobrante a la ficha real del cliente.', campos: 'targetClientId' },
  'GET /financials/receivables-ledger': { que: 'La cartera: cuentas por cobrar y sus abonos.' },
  'PATCH /financials/receivables/:id': { que: 'Corrige una cuenta por cobrar no emitida.', campos: 'amount, dueDate, concept, status' },
  'POST /financials/receivables': { que: 'Crea una cuenta por cobrar.', campos: 'clientId, amount, dueDate, concept, currency, foreignAmount, exchangeRate' },
  'DELETE /financials/receivables/:id': { que: 'Elimina una cuenta por cobrar sin abonos vigentes.', campos: 'reason' },
  'POST /financials/receivables/:id/issue': { que: 'Emite la cuenta de cobro con número y PDF.', campos: 'issueDate, servicePeriod, concept, items[{description, amount}], currency, exchangeRate' },
  'PUT /financials/receivables/:id/document': { que: 'Corrige una cuenta de cobro emitida y rehace su PDF.', campos: 'los mismos de emitir' },
  'GET /financials/exchange-rate': { que: 'La TRM del día.' },
  'POST /financials/receivables/:id/payments': { que: 'Registra un abono a una cuenta por cobrar.', campos: 'amount, date, accountId, notes, concept, requestId' },
  'POST /financials/receivable-payments/:paymentId/reverse': { que: 'Revierte un abono con motivo.', campos: 'reason' },
  'GET /financials/payroll-ledger': { que: 'La nómina: contratos y liquidaciones.' },
  'POST /financials/payroll-contracts': { que: 'Crea un contrato de nómina.', campos: 'memberId, amount, frequency, startDate' },
  'PATCH /financials/payroll-contracts/:id': { que: 'Edita un contrato de nómina.', campos: 'amount, endDate, status' },
  'POST /financials/payroll/periods': { que: 'Genera las liquidaciones de un periodo.', campos: 'year, month' },
  'POST /financials/payroll-transactions/:id/approve': { que: 'Aprueba una liquidación.' },
  'POST /financials/payroll-transactions/:id/pay': { que: 'Registra el pago de una liquidación.', campos: 'amount, date, accountId, reference, financialRecordId' },
  'GET /financials/payroll-transactions/:id/payment-candidates': { que: 'Egresos ya registrados que podrían ser el pago de una liquidación.' },
  'POST /financials/payroll-payments/:paymentId/split': { que: 'Desglosa un pago de nómina en varios.', campos: 'parts[{amount, date, accountId, reference}]' },
  'POST /financials/payroll-payments/:paymentId/reverse': { que: 'Revierte un pago de nómina.', campos: 'reason' },
  'PATCH /financials/payroll-payments/:paymentId': { que: 'Corrige referencia o nota de un pago de nómina.', campos: 'reference, notes' },
  'GET /financials/bank-reconciliation': { que: 'La conciliación bancaria.' },
  'POST /financials/bank-reconciliation/rebuild': { que: 'Recalcula las propuestas de conciliación.' },
  'POST /financials/bank-reconciliation/matches/:id/approve': { que: 'Aprueba un cruce de conciliación.' },
  // CRM
  'GET /crm/catalogs': { que: 'Etapas, fuentes y catálogos del CRM.' },
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
  'POST /crm/leads/:leadId/archive': { que: 'Archiva una oportunidad.', campos: 'reason' },
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
      const haystack = fold(`${key} ${op.que} ${op.campos || ''}`);
      const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { key, score, write: WRITE.has(key.split(' ')[0]), ...op };
    })
    .filter((row) => row.score > 0 && (!writesOnly || row.write))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map(({ score, ...row }) => row);
};

/** Qué pide la ruta, leído de sus guardianes reales; `null` si solo pide sesión. */
export const describeGuards = (guards = []) => {
  const modules = [...new Set(guards.filter((g) => g.module).map((g) => g.module))];
  const roles = [...new Set(guards.filter((g) => g.role).map((g) => g.role))];
  const financial = [...new Set(guards.filter((g) => g.financial).map((g) => g.financial))];
  if (!modules.length && !roles.length && !financial.length) return null;
  return { ...(modules.length ? { modules } : {}), ...(roles.length ? { roles } : {}), ...(financial.length ? { financial } : {}) };
};
