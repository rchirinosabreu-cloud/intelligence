// Protocolo global: abrir/recibir/posponer no acreditan cumplimiento. Una decisión de negocio
// escribe en su origen nativo y se vuelve a leer para todas las personas afectadas.
// Los avisos persistentes nuevos deben declarar aquí su origen, respuestas y condición de salida.
const policy = (family, source, actions, openLabel, explanation) => Object.freeze({ family, source, actions: Object.freeze(actions), openLabel, explanation });
const crm = () => policy('CRM', 'CrmLead / CrmActivity', ['open', 'follow-up', 'close', 'archive', 'snooze'], 'Abrir oportunidad', 'La gestión y el resultado se guardan en la oportunidad del CRM.');
const collection = (suspension = false) => policy('COLLECTION', 'AccountsReceivable / CollectionActivity / ClientSuspension', ['open', 'follow-up', 'snooze'], suspension ? 'Revisar suspensión' : 'Registrar pago', 'Registrar una gestión de cobro no registra un pago ni suspende al cliente.');
const operation = (source, openLabel, explanation, actions = ['open', 'snooze']) => policy('OPERATION', source, actions, openLabel, explanation);
export const NOTICE_RESPONSE_POLICIES = Object.freeze({
  ANUNCIO_GENERAL: policy('ANNOUNCEMENT', 'GlobalAnnouncement / AnnouncementDelivery / AnnouncementEvent', ['preview', 'dismiss'], 'Ver anuncio', 'Abrir registra la apertura; cerrar solo retira tu aviso. Ninguna acción acredita cumplimiento.'),
  PAUTA_REVISION: policy('ADS', 'AdBudgetCycle / AdSpendReading / AdBudgetEvent', ['open', 'snooze'], 'Revisar pauta', 'La lectura de gasto y el cierre se registran en Pautas. Abrir el aviso no actualiza el gasto.'),
  PAUTA_CAMPANA: policy('ADS', 'AdCampaign / AdBudgetEvent', ['open', 'snooze'], 'Revisar campaña', 'La revisión se resuelve al corregir la campaña en Pautas, conservando su historial.'),
  PAUTA_RESUMEN: policy('ADS', 'AdBudgetCycle / AdSpendReading / AdCampaign', ['open', 'snooze'], 'Revisar pautas', 'Cada pendiente se atiende en Pautas. Este resumen no declara revisadas ni cerradas las campañas.'),
  CRM_FOLLOW_UP: crm(), CRM_REVIEW: crm(),
  CARTERA_MENSUAL: collection(), CARTERA_UNICO: collection(), CARTERA_SUSPENSION: collection(true),
  PARRILLA_SIN_PUBLICAR: policy('PLAN', 'ContentItem / SocialPublication', ['open', 'snooze'], 'Revisar publicaciones', 'Se retira cuando las piezas pendientes figuran publicadas en la parrilla.'),
  PARRILLA_RESUMEN: policy('PLAN', 'ContentItem / SocialPublication', ['open', 'snooze'], 'Revisar parrillas', 'Cada cuenta sale del resumen al resolver sus publicaciones pendientes.'),
  OPERACION_INICIO: operation('ProjectOperation', 'Revisar alcance', 'La revisión del proyecto se guarda en su ficha operativa.'),
  OPERACION_CONTINUIDAD: operation('ClientContract / ClientSuspension / AccountsReceivable', 'Revisar continuidad', 'La continuidad se comprueba en el contrato y la situación administrativa de la cuenta.', ['open', 'continuity', 'snooze']),
  OPERACION_RENOVACION: operation('ClientContract', 'Registrar renovación', 'La renovación se registra en la ficha. Si el cliente no continúa, confirma esa decisión aquí.', ['open', 'renew', 'continuity', 'snooze']),
  OPERACION_SUSPENSION: operation('ClientSuspension', 'Revisar suspensión', '«Recibido» confirma que viste la suspensión; no la levanta ni cierra pendientes.', ['open', 'acknowledge', 'snooze']),
  OPERACION_REACTIVACION: operation('ClientSuspension', 'Revisar reactivación', '«Recibido» confirma que viste la reactivación; no declara el trabajo cumplido.', ['open', 'acknowledge', 'snooze']),
  OPERACION_CICLO: operation('ClientMonthlyClose / ClientMonthlyReport / ContentItem', 'Revisar cierre y avance', 'El cierre y el envío del informe se confirman en sus registros, conservando lo pendiente.'),
});
export const noticeResponsePolicy = notice => NOTICE_RESPONSE_POLICIES[notice?.kind] || null;
export const noticeAllows = (notice, action) => Boolean(noticeResponsePolicy(notice)?.actions.includes(action));
export function assertNoticeResponsePolicy(notice) {
  if (!noticeResponsePolicy(notice)) throw Object.assign(new Error('Falta declarar el protocolo de respuesta de este aviso.'), { statusCode: 400 });
}

// Las otras superficies conservan su registro nativo: este contrato impide interpretar una interacción
// de presentación como un cierre de negocio, también al incorporar una familia nueva.
export const ALERT_SURFACE_PROTOCOLS = Object.freeze({
  BELL: { record: 'Notification.isRead/readAt', meaning: 'Lectura personal; abrir conduce al origen. Nunca cierra el asunto.' },
  PERSISTENT_BAND: { record: 'ImportantNotice y origen declarado', meaning: 'Acuse y pausa personales; decisiones compartidas en el origen.' },
  RETURNED_TASK: { record: 'OperationalTraceEvent / TaskParticipation', meaning: 'Revisar abre la tarea; posponer dura una hora. Solo su corrección nativa resuelve la devolución.' },
  EXCESSIVE_TASK: { record: 'OperationalTraceEvent', meaning: 'Sigo trabajando registra una confirmación personal por cuatro horas; no completa ni altera tiempos.' },
  BRIA: { record: 'bria_memory / solicitud nativa de acceso', meaning: 'Ocultar afecta la presentación; aprobar o denegar acceso modifica la solicitud autorizada. Abrir o preparar texto no ejecuta trabajo.' },
  FOCUS: { record: 'TaskComment (system_focus_extension) / Task.focusDeadlineAt', meaning: 'La ampliación permitida se aplica al solicitarla con duración y motivo, queda en la tarea y avisa a quien fijó la hora. No exige una aprobación adicional ni completa trabajo.' },
  RECOGNITION: { record: 'RecognitionAward', meaning: 'Información sobre un logro registrado; recibirlo no concede otro logro.' },
  DRAFT: { record: 'Borrador del recurso', meaning: 'Recuperar o descartar actúa sobre ese borrador; nunca publica ni guarda el documento final.' },
});
