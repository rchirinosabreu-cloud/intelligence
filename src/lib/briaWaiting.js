// «Esperando por ti» (Rodny, 20 de noviembre de 2026). Lógica pura: de los conteos de cada fuente arma la lista que
// Bria muestra en su inicio. Cada fila dice qué espera y a dónde ir: una pantalla (`to`), un pedido a Bria (`ask`)
// o una conversación (`conversationId`). Sin nada pendiente, la lista queda vacía y el bloque no aparece.
// Etapa 1: las decisiones y las reuniones se resuelven todavía en Manager; la mudanza a Bria viene después.

export const WAITING_ACTIONS = 3;
const count = (value) => (Number.isInteger(value) && value > 0 ? value : 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const buildWaiting = ({ decisions = 0, meetings = 0, mail = 0, actions = [] } = {}) => {
  const items = [];
  if (count(decisions)) items.push({ kind: 'DECISIONES', count: decisions, text: `${plural(decisions, 'decisión', 'decisiones')} de la lectura y de lo que Bria detectó`, to: '/manager' });
  if (count(meetings)) items.push({ kind: 'REUNIONES', count: meetings, text: `${plural(meetings, 'pendiente', 'pendientes')} de reuniones por aprobar`, to: '/manager?tab=reuniones' });
  if (count(mail)) items.push({ kind: 'CORREO', count: mail, text: mail === 1 ? '1 correo importante espera respuesta' : `${mail} correos importantes esperan respuesta`, ask: 'Muéstrame los correos importantes que siguen sin respuesta.' });
  for (const action of (actions || []).slice(0, WAITING_ACTIONS)) {
    const title = String(action.title || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60);
    items.push({ kind: 'ACCION', count: 1, text: `Una acción lista para confirmar en ${title ? `«${title}»` : 'una conversación'}`, conversationId: action.id });
  }
  return items;
};
