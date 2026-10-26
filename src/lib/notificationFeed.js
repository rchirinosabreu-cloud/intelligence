// El panel de notificaciones (Rodny, 26 de octubre de 2026: «el scroll del panel tiene un
// límite que no me deja ver las que aún no he leído»).
//
// No era el scroll: la consulta traía `take: 20` y punto, así que el aviso número 21 no
// existía para el navegador y no había forma de alcanzarlo. Ahora se pide de 20 en 20 con
// un cursor, se puede ver solo lo que falta por leer, y el contador de sin leer lo cuenta
// la base entera, no la página que se tiene a la vista.

export const NOTIFICATION_PAGE_SIZE = 20;
export const NOTIFICATION_MAX_PAGE_SIZE = 50;

/** Un tamaño de página que siempre cae dentro de lo razonable. */
export const notificationPageSize = (value) => {
    const requested = Number(value);
    if (!Number.isFinite(requested) || requested < 1) return NOTIFICATION_PAGE_SIZE;
    return Math.min(Math.trunc(requested), NOTIFICATION_MAX_PAGE_SIZE);
};

/**
 * Los argumentos de la consulta. Se pide **uno más** de los que se van a entregar: así se
 * sabe si queda algo más sin contar el total, que con el historial de meses sería caro.
 *
 * El orden lleva el `id` de desempate porque dos avisos pueden nacer en el mismo
 * milisegundo y, sin él, el cursor podría saltarse uno o repetirlo.
 */
export const notificationPageArgs = ({ userId, cursor = null, unreadOnly = false, limit } = {}) => {
    const take = notificationPageSize(limit);
    const where = { userId };
    if (unreadOnly) where.isRead = false;

    return {
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    };
};

/** Parte lo que devolvió la base en la página que se entrega y el cursor de la siguiente. */
export const notificationPage = (rows = [], limit) => {
    const take = notificationPageSize(limit);
    const items = rows.slice(0, take);
    const hasMore = rows.length > take;
    return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null
    };
};
