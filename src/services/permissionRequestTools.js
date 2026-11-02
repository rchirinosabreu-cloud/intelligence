// Pedir acceso a un módulo sin que la persona lo pida (Rodny, 15 de octubre de 2026: «si Camila está solicitando algo
// a lo que Bria no le puede dar acceso por su rol, no tiene que pedírmelo directamente, me debería aparecer a mí el
// anuncio»). Bria sabe qué módulos le faltan (la última línea de sus instrucciones) y, cuando lo que preguntan es de uno
// de ellos, lo pide por la persona. Nunca cambia nada ella: decide un administrador desde su aviso.
import { canUseBria } from '../lib/briaLivingMemory.js';
import { MODULE_KEYS } from '../lib/platformModules.js';
import { missingModules, moduleOf } from '../lib/modulePermissionRequests.js';

const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';

const reply = (out, key) => {
  const label = moduleOf(key)?.label || key;
  if (out.alreadyHas) return { instruccion: `La persona ya tiene acceso a ${label}: respóndele con lo que puedas o dile que recargue la página si no lo ve en el menú.` };
  if (out.deniedRecently) {
    const who = out.request?.decidedByName || 'Un administrador';
    return { pedido: false, denegadoPor: who, instruccion: `${who} denegó hace poco el acceso a ${label}, así que no se lo volví a pedir. Díselo en una frase y sugiérele hablarlo directamente con ${who} si lo necesita.` };
  }
  const names = out.admins || [];
  const who = names.length ? names.join(' y ') : 'administración';
  return {
    pedido: true, nuevo: Boolean(out.created), modulo: label, administradores: names,
    instruccion: out.created
      ? `Eso es de ${label}, que su cuenta no tiene. Ya se lo pediste a ${who}: díselo en una frase, sin dar la información ni deducirla por otro camino, y que cuando decida le llega un aviso encima de Bria y en sus notificaciones.`
      : `Eso es de ${label}, que su cuenta no tiene, y ya estaba pedido; sigue esperando respuesta de ${who}. Díselo en una frase.`
  };
};

export const createPermissionRequestTools = (service) => service ? [{
  name: 'pedir_permiso',
  description: 'Le pide a los administradores acceso a un módulo de la plataforma que la cuenta de esta persona no tiene (la lista de módulos que le faltan llega en «Módulos que no tiene», en la última línea de tus instrucciones). Si la persona pide algo de uno de esos módulos, no lo deduzcas por otro camino ni le digas solo que no está disponible: llámala sin que ella lo pida, con el módulo y «para» en pocas palabras (por ejemplo «ver cuánto debe Aristea»), y dile en una frase que ya se lo pediste a un administrador. El administrador recibe un aviso con «Dar acceso» y «Denegar», y a ella le llega la respuesta. Lo que es solo de administración (Gobierno de IA, Salud operativa, el uso de Bria) no es un módulo: eso no se pide.',
  parameters: { type: 'object', properties: {
    modulo: { type: 'string', enum: [...MODULE_KEYS] },
    para: { type: ['string', 'null'], description: 'Para qué lo necesita, en pocas palabras; null si no se sabe.' }
  }, required: ['modulo', 'para'], additionalProperties: false },
  allowed: (user) => canUseBria(user) && !isAdmin(user) && missingModules(user).length > 0,
  async run({ modulo, para = null } = {}, { user }) {
    return { data: reply(await service.request(user, String(modulo), para), String(modulo)) };
  }
}] : [];
