// Las filas de la pestaña Clientes de Financiero (30 de septiembre de 2026): el directorio
// —todas las fichas, con o sin movimientos, archivadas incluidas— unido a la conciliación
// —lo que suma cada cliente y las etiquetas que solo existen en el Excel—.

const normalizeText = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SEARCH_FIELDS = ['legalName', 'documentNumber', 'contactName', 'email', 'city'];

export const buildClientDirectoryRows = (directory = [], reconciliation = []) => {
    const byClientId = new Map(reconciliation.filter((row) => row.clientId).map((row) => [row.clientId, row]));
    const rows = directory.map((client) => {
        const totals = byClientId.get(client.id);
        return {
            sourceId: totals?.sourceId || client.id,
            clientId: client.id,
            name: client.name,
            slug: client.slug,
            profile: client,
            income: totals?.income || 0,
            receivable: totals?.receivable || 0,
            recordCount: (totals?.recordCount || 0) + (totals?.receivableCount || 0)
        };
    });
    const known = new Set(directory.map((client) => client.id));
    for (const row of reconciliation) {
        if (row.clientId && known.has(row.clientId)) continue;
        rows.push({
            sourceId: row.sourceId || row.clientId,
            clientId: row.clientId || null,
            name: row.client?.name,
            slug: row.client?.slug || null,
            profile: null,
            income: row.income || 0,
            receivable: row.receivable || 0,
            recordCount: (row.recordCount || 0) + (row.receivableCount || 0)
        });
    }
    // Primero los que mueven plata, como antes; después, en orden alfabético.
    return rows.sort((a, b) => ((b.income + b.receivable) - (a.income + a.receivable)) || String(a.name).localeCompare(String(b.name), 'es'));
};

/** Filtra por nombre, nombre legal, documento, contacto, correo o ciudad, sin tildes. */
export const filterClientDirectoryRows = (rows = [], search = '') => {
    const needle = normalizeText(String(search).trim());
    if (!needle) return rows;
    return rows.filter((row) => [row.name, ...SEARCH_FIELDS.map((field) => row.profile?.[field])].some((value) => normalizeText(value).includes(needle)));
};
