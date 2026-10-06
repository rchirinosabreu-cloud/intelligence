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

const isBot = (email) => String(email || '').trim().toLowerCase() === FIREFLIES_BOT_EMAIL;

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
 */
export const withFirefliesInvite = (type, emails = []) => {
    const limpias = (Array.isArray(emails) ? emails : [])
        .filter(email => email && !isBot(email));
    return shouldInviteFireflies(type) ? [...limpias, FIREFLIES_BOT_EMAIL] : limpias;
};
