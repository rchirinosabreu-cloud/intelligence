// Escribirle al cliente (Rodny, 19 de octubre de 2026: «que Bria sea mi project manager y mi community manager»).
// Bria lee la parrilla como la ve el cliente y redacta el mensaje; la persona lo copia y lo envía. De la base solo se
// leen los campos que el cliente ve: ni el guion ni las notas internas salen de la consulta.
import { hasModulePermission } from '../config/security.js';
import { buildClientUpdate } from '../lib/clientUpdate.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthLabel = (month, year) => `${MONTHS[month - 1]} de ${year}`;
const toolError = (message, status = 400, code = 'BRIA_CLIENT_UPDATE') => Object.assign(new Error(message), { status, code });

const CHANNEL_GUIDE = {
  whatsapp: 'WhatsApp: corto, cálido y directo, en párrafos breves; sin asunto ni firma larga.',
  correo: 'Correo: primera línea «Asunto: …», saludo, cuerpo breve con viñetas si hay varias piezas, y despedida con el nombre de quien escribe.'
};
const FOCUS_GUIDE = {
  resumen: 'Cuenta en orden: lo que salió publicado (con su enlace), lo programado, lo que espera su aprobación y lo que se está ajustando según lo que pidió.',
  aprobacion: 'El objetivo es que apruebe: di qué piezas esperan su aprobación y cuándo salen, y pídele revisarlas en el portal. Si alguna trae material nuevo, dile que ya puede ver la imagen o el video.',
  publicado: 'Cuéntale lo que salió publicado esta semana, con su enlace, y lo que viene.'
};

export const briaClientUpdateTools = [{
  name: 'mensaje_para_cliente',
  description: 'Lo que hace falta para escribirle a un cliente sobre su parrilla de un mes: qué piezas esperan su aprobación, qué se está ajustando según lo que pidió, qué salió publicado en la última semana (con sus enlaces), qué está programado en las próximas dos semanas y el enlace del portal que ya tiene. Solo trae lo que el cliente ve. Úsala cuando pidan escribirle (contarle cómo va su parrilla, recordarle que apruebe, contarle lo publicado): antes busca el cliente con buscar_cliente, llámala con el canal y el enfoque que pidieron, y entrega el mensaje listo para copiar con lo que trae la herramienta y el enlace del portal. Habla del trabajo, nunca del equipo por dentro: ni guiones, ni notas internas, ni horas, ni quién lo hace. Tú nunca lo envías: la persona lo copia y lo manda. Si te dan un tono o un dato extra, úsalo sin inventar fechas ni compromisos. Sin mes y año, el mes actual.',
  parameters: { type: 'object', properties: {
    clientId: { type: 'string' },
    mes: { type: 'integer', minimum: 1, maximum: 12 },
    anio: { type: 'integer' },
    canal: { type: 'string', enum: ['whatsapp', 'correo'], description: 'Por dónde se le va a mandar; WhatsApp si no lo dijeron.' },
    enfoque: { type: 'string', enum: ['resumen', 'aprobacion', 'publicado'], description: 'Resumen de la semana, recordarle aprobar o contarle lo publicado.' }
  }, required: ['clientId'] },
  allowed: (user) => hasModulePermission(user, 'parrillas'),
  async run({ clientId, mes, anio, canal = 'whatsapp', enfoque = 'resumen' } = {}, { db, today, person }) {
    const id = String(clientId ?? '').trim();
    if (!id) throw toolError('Falta el id del cliente: búscalo primero con buscar_cliente.');
    const [todayYear, todayMonth] = String(today).split('-').map(Number);
    const month = Number.isInteger(Number(mes)) && mes >= 1 && mes <= 12 ? Number(mes) : todayMonth;
    const year = Number.isInteger(Number(anio)) && anio > 2000 ? Number(anio) : todayYear;
    const plan = await db.contentPlan.findFirst({
      where: { clientId: id, deletedAt: null, month, year },
      select: {
        id: true, month: true, year: true, shareToken: true, client: { select: { name: true, contactName: true } },
        contentItems: {
          where: { deletedAt: null },
          select: {
            id: true, objective: true, format: true, publishDate: true, publishTime: true, status: true, comments: true, revisionRequestedAt: true,
            publications: { select: { status: true, platform: true, permalink: true, publishedAt: true, scheduledAt: true } }
          }
        }
      }
    });
    if (!plan) return { data: { mensaje: `No hay parrilla de ${monthLabel(month, year)} para este cliente: no hay nada que contarle de ese mes.` } };
    const channel = CHANNEL_GUIDE[canal] ? canal : 'whatsapp';
    const focus = FOCUS_GUIDE[enfoque] ? enfoque : 'resumen';
    const update = buildClientUpdate({ clientName: plan.client?.name, monthLabel: monthLabel(plan.month, plan.year), items: plan.contentItems || [], shareToken: plan.shareToken, today });
    const link = update.enlacePortal
      ? 'Incluye el enlace del portal tal cual, para que revise y apruebe ahí.'
      : 'Esta parrilla todavía no tiene enlace para el cliente: dile a la persona que lo cree con «Compartir» en la parrilla y que lo pegue en el mensaje; no inventes un enlace.';
    // A quién se saluda y quién firma (19 de octubre de 2026): el primer mensaje de prueba saludó «Hola, Aristea», como
    // si la marca fuera una persona, y firmó «[Tu nombre]».
    const contacto = String(plan.client?.contactName || '').trim() || null;
    const firma = String(person?.name || '').trim() || null;
    const greeting = contacto ? `Saluda a ${contacto.split(/\s+/)[0]} por su nombre.` : `No hay un contacto en la ficha: saluda «Hola, equipo de ${update.cliente || 'la marca'}», nunca a la marca como si fuera una persona.`;
    const signature = firma ? `Firma con ${firma.split(/\s+/)[0]}, que es quien lo va a enviar.` : 'Firma de parte del equipo de Brain Studio.';
    return {
      data: {
        ...update, contacto, firma, canal: channel, enfoque: focus,
        instruccion: `Redacta el mensaje para ${update.cliente || 'el cliente'} listo para copiar, en español de Latinoamérica, cordial y profesional, sin tecnicismos. ${greeting} ${signature} ${CHANNEL_GUIDE[channel]} ${FOCUS_GUIDE[focus]} ${link} Una pieza que espera su aprobación todavía no está programada: di que sale tal día una vez la apruebe, nunca que «está programada». Usa solo lo que trae esta respuesta: no prometas fechas que no estén aquí ni menciones guiones, notas internas, personas del equipo, horas de trabajo ni herramientas. Nunca lo envías tú: entrégalo y dile que lo copie y lo mande.`
      },
      sources: [{ kind: 'parrilla', id: plan.id, label: `Parrilla de ${update.mes}`, url: `/parrillas/${plan.id}` }]
    };
  }
}];
