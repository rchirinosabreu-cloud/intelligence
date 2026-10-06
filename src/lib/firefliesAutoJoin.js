// Fireflies entra en toda reunión (Rodny, 6 de octubre de 2026: «ya no quiero eso,
// quiero que por defecto se una a cualquier reunión»).
//
// Antes había una casilla «Invitar a Fireflies», apagada por defecto. Los números de
// producción explican por qué no servía: en 60 días hubo **158 reuniones y la casilla se
// marcó en 17**. No era descuido: **141 de esas reuniones ni pasan por la plataforma**,
// las crea alguien en Google Calendar o llegan como invitación de un cliente, y a esas la
// casilla no las alcanza nunca. Un control que solo cubre una de cada diez reuniones no
// puede significar «siempre».
//
// Esta regla cubre la parte que es nuestra: lo que se crea desde Actividad. **La otra
// mitad es un ajuste de Fireflies** («Auto-join calendar meetings» → «All meetings with
// web-conf link»), que su API no expone —no hay mutación para eso— y que solo cubre los
// calendarios conectados a Fireflies. Las dos mitades hacen falta.

export const FIREFLIES_BOT_EMAIL = 'fred@fireflies.ai';

const normal = (email) => String(email || '').trim().toLowerCase();
const isBot = (email) => normal(email) === FIREFLIES_BOT_EMAIL;

/**
 * La cuenta cuyo calendario vigila Fireflies, en `FIREFLIES_CALENDAR_EMAIL`.
 *
 * Fireflies solo mira los calendarios conectados a él y la agencia tiene **un solo
 * asiento**: `coordinador`. Una reunión creada en `social.brain` se quedaba sin
 * transcribir aunque se invitara a Fred, porque Fireflies ni se enteraba de que existía.
 * En vez de pagar otro asiento, se invita también a la cuenta vigilada: el evento cae en
 * su calendario y Fred entra por ahí.
 *
 * Sin configurar devuelve null y nada cambia: ninguna instalación hereda un correo
 * nuestro escrito en el código.
 */
export const firefliesWatchedCalendar = (env = process.env) => normal(env?.FIREFLIES_CALENDAR_EMAIL) || null;

/**
 * Una reunión siempre lleva a Fred. Lo que no es una reunión —una ausencia, un bloque de
 * producción, un descanso— no se graba: meter un bot ahí sería grabar a alguien que no
 * está en ninguna llamada.
 */
export const shouldInviteFireflies = (type) => String(type || '').toUpperCase() === 'MEETING';

/**
 * Devuelve la lista de invitados externos que corresponde al tipo de evento. Quita
 * cualquier forma del bot antes de decidir, para que no se duplique si alguien ya lo
 * escribió a mano (y para que un evento que deja de ser reunión lo pierda).
 *
 * `organizerEmail` es la cuenta de Google en cuyo calendario se crea el evento y
 * `watchedEmail` la que vigila Fireflies. Si no son la misma, la vigilada se añade como
 * invitada para que la reunión aparezca también en su calendario.
 */
export const withFirefliesInvite = (type, emails = [], { organizerEmail = null, watchedEmail = null } = {}) => {
    const limpias = (Array.isArray(emails) ? emails : []).filter(email => email && !isBot(email));
    if (!shouldInviteFireflies(type)) return limpias;

    const vigilada = normal(watchedEmail);
    const organizadora = normal(organizerEmail);
    const yaInvitada = limpias.some(email => normal(email) === vigilada);
    // En su propio calendario no hace falta invitarse, y no se repite si ya estaba.
    const faltaVigilada = vigilada && vigilada !== organizadora && !yaInvitada;

    return [...limpias, ...(faltaVigilada ? [vigilada] : []), FIREFLIES_BOT_EMAIL];
};
