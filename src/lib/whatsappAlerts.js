// Los avisos de Bria por WhatsApp (Rodny, 22 de octubre de 2026: «sí, planea lo de las alertas por WhatsApp» ·
// «implementa toda esa vaina»). Regla pura, sin red ni base: la leen el servicio del puente, la pantalla de Perfil
// y tests/whatsappButtons.test.js.
//
// Qué avisos (decisión de Rodny ese día): los pedidos de acceso (a quien administra, con Compartir / Denegar), la
// lectura de la mañana y el cierre del día, y los avisos del pulso. **El semáforo de servicios no se avisa**: «mejor
// sin avisos por servicio caído, a menos que se pregunte»; Bria lo responde si alguien le pregunta. Vienen
// encendidos al vincular el número y cada persona apaga los que no quiera desde su perfil.
//
// La ventana de Meta: dentro de las 24 horas desde el último mensaje de la persona, Bria escribe libre, con botones
// (mensaje de servicio: desde el 1 de octubre de 2026, 1.000 gratis al mes por número y después se cobran). Fuera de
// ella Meta solo admite plantillas aprobadas, que cobra y que exigen un método de pago en la cuenta de mensajes;
// por eso el aviso se guarda entero y por WhatsApp sale un llamado corto (la plantilla `bria_aviso`) con un botón
// «Ver aviso»: tocarlo abre la ventana y entonces llega el aviso completo, con sus botones.
//
// Lo que nunca sale por aquí: contraseñas ni datos de la bóveda, y nada que la plataforma no mande ya a la campana.
import { bogotaClock } from './briaNudges.js';
import { toWhatsAppText, recipientFields } from './whatsappBridge.js';

import { ALERT_KINDS, ALERT_KIND_LABELS } from './whatsappAlertKinds.js';

export { ALERT_KINDS, ALERT_KIND_LABELS };

const H = 60 * 60 * 1000;
export const SERVICE_WINDOW_MS = 24 * H;
// La vigencia se comprueba también al pulsar: la purga periódica no es una puerta de acceso.
export const ALERT_RETENTION_DAYS = 14;
export const isAlertCurrent = (alert, at = new Date()) => {
  const age = at.getTime() - new Date(alert?.createdAt).getTime();
  return Boolean(alert?.createdAt) && age >= 0 && age < ALERT_RETENTION_DAYS * 24 * H;
};
// No se arriesga un mensaje libre en el último cuarto de hora: si la ventana cierra en el camino, Meta lo rechaza.
export const WINDOW_MARGIN_MS = 15 * 60 * 1000;
/** Un pedido de acceso de noche no despierta a nadie: queda en la campana y encima de Bria. */
export const ACCESS_ALERT_HOURS = Object.freeze({ from: 7 * 60, to: 21 * 60 });

export const isWindowOpen = (lastInboundAt, at = new Date()) => {
  if (!lastInboundAt) return false;
  const since = at.getTime() - new Date(lastInboundAt).getTime();
  return since >= 0 && since < SERVICE_WINDOW_MS - WINDOW_MARGIN_MS;
};
export const alertsEnabled = (alertsOff = [], kind) => ALERT_KINDS.includes(kind) && !(alertsOff || []).includes(kind);
export const withinAlertHours = (kind, at = new Date()) => {
  if (kind !== 'ACCESS') return true;
  const { minutes } = bogotaClock(at);
  return minutes >= ACCESS_ALERT_HOURS.from && minutes < ACCESS_ALERT_HOURS.to;
};

// Los botones de un aviso apuntan al aviso guardado (`a:<id>:<n>`), no a su texto: así un botón viejo de un aviso
// que ya no existe se reconoce y se dice, en vez de ejecutar algo a ciegas.
const ALERT_REPLY = /^a:([A-Za-z0-9-]{1,64}):(open|\d{1,2})$/;
export const alertReplyId = (alertId, index) => `a:${alertId}:${index}`;
export const parseAlertReplyId = (value) => {
  const match = String(value || '').match(ALERT_REPLY);
  if (!match) return null;
  return { alertId: match[1], index: match[2] === 'open' ? 'open' : Number(match[2]) };
};
export const alertOptions = (alert) => (alert?.buttons || []).map((button, index) => ({ id: alertReplyId(alert.id, index), label: button.label }));

// La plantilla con que Bria llama fuera de la ventana. Se registra en Meta con scripts/whatsapp-alert-template.mjs;
// si se cambia el texto aquí hay que volver a enviarla a revisión con otro nombre.
export const ALERT_TEMPLATE = Object.freeze({ name: 'bria_aviso', language: 'es', category: 'UTILITY', button: 'Ver aviso' });
export const ALERT_TEMPLATE_BODY = 'Hola {{1}}, tienes un aviso nuevo de Bria sobre {{2}}. Tócalo para verlo aquí mismo.';
export const ALERT_TEMPLATE_EXAMPLE = Object.freeze(['Rodny', 'tu cierre del día']);

export const templateMessagePayload = (target, { params = [], payload, name = ALERT_TEMPLATE.name, language = ALERT_TEMPLATE.language }) => ({
    messaging_product: 'whatsapp', recipient_type: 'individual', ...recipientFields(target), type: 'template',
    template: {
      name, language: { code: language },
      components: [
        { type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text || '').slice(0, 60) || '—' })) },
        { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload }] }
      ]
    }
});

const ORIGIN = 'https://labs.brainstudioagencia.com';
const absolute = (path, origin) => (/^https?:\/\//.test(path) ? path : `${origin.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`);

/**
 * Un aviso del pulso: el hecho, el primer enlace como dirección (WhatsApp no navega dentro de la plataforma), lo que
 * se le puede pedir a Bria como botón y, siempre, «Ocultar por hoy», que hace lo mismo que la X de la tarjeta.
 */
export const pulseAlert = (message, { origin = ORIGIN } = {}) => {
  const actions = Array.isArray(message.actions) ? message.actions : [];
  const link = actions.find((action) => action?.to);
  const asks = actions.filter((action) => action?.ask && action?.label).slice(0, 2);
  const head = [`*${String(message.title || '').trim()}*`, String(message.body || '').trim()].filter((part) => part && part !== '**').join('\n');
  return {
    kind: 'PULSE',
    sourceRef: `pulse:${message.id}`,
    topic: 'el trabajo de hoy',
    text: link ? `${head}\n\n${link.label}: ${absolute(link.to, origin)}` : head,
    buttons: [...asks.map((action) => ({ label: action.label, ask: action.ask })), { label: 'Ocultar por hoy', act: 'PULSE_DISMISS', ref: message.id }]
  };
};

const ACCESS_BUTTONS = {
  VAULT: (id) => [{ label: 'Compartir', act: 'VAULT_APPROVE', ref: id }, { label: 'Denegar', act: 'VAULT_DENY', ref: id }],
  MODULE: (id) => [{ label: 'Dar acceso', act: 'MODULE_APPROVE', ref: id }, { label: 'Denegar', act: 'MODULE_DENY', ref: id }]
};
/** Un pedido de acceso, con las mismas dos decisiones que el aviso encima de Bria. */
export const accessAlert = ({ type, request, text }) => ({
  kind: 'ACCESS',
  sourceRef: `${type === 'VAULT' ? 'vault' : 'module'}:${request.id}`,
  topic: 'un pedido de acceso',
  text: String(text || '').trim(),
  buttons: ACCESS_BUTTONS[type](request.id)
});

const DAILY_TOPICS = { CIERRE_DIA: 'tu cierre del día', LECTURA_MANANA: 'tu lectura de la mañana', REVISION_MES: 'la revisión de las cuentas del mes' };
/** La lectura de la mañana o el cierre del día, enteros: son el mismo texto que queda en el chat. */
export const dailyAlert = ({ note, dayKey, text, conversationId = null }) => ({
  kind: 'DAILY', sourceRef: `${note}:${dayKey}`, topic: DAILY_TOPICS[note] || 'tu día', text: toWhatsAppText(text),
  ...(conversationId ? { conversationId } : {}),
  // Revisar es una pregunta, nunca una aprobación de lo propuesto ni de una acción preparada en ese chat.
  buttons: conversationId ? [{ label: 'Revisar lectura', ask: 'Quiero revisar esta lectura y sus propuestas contigo. Explícame qué propones y por qué antes de hacer cambios.' }] : []
});

export const ALERT_ACTIONS = Object.freeze(['VAULT_APPROVE', 'VAULT_DENY', 'MODULE_APPROVE', 'MODULE_DENY', 'PULSE_DISMISS']);
