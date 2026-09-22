// Un cliente archivado sigue debiendo plata y sigue teniendo movimientos suyos.
// En financiero tiene que poder elegirse, pero marcado y detrás de los activos:
// si no aparece, alguien crea una ficha nueva y el dinero acaba en el sitio
// equivocado — que es exactamente lo que pasó con Elvira Utria en septiembre de 2026.
export const ARCHIVED_CLIENT_SUFFIX = ' · archivado';

export const clientOptions = (clients = []) => (Array.isArray(clients) ? clients : [])
    .filter((client) => client && client.id)
    .map((client) => {
        const name = String(client.name || 'Cliente sin nombre');
        const isArchived = Boolean(client.isArchived);
        return { id: client.id, name, isArchived, label: isArchived ? `${name}${ARCHIVED_CLIENT_SUFFIX}` : name };
    })
    .sort((a, b) => (a.isArchived === b.isArchived
        ? a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
        : (a.isArchived ? 1 : -1)));
