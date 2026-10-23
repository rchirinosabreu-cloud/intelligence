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

/**
 * Si una fila está desplegada. Se abre por su `sourceId` al tocarla, o por el id de su
 * ficha justo después de crearla o guardarla. Nada vacío coincide nunca: una etiqueta del
 * Excel no tiene ficha, y su `clientId` nulo igualaba a «ninguna abierta» y la dejaba
 * siempre desplegada (Rodny, 30 de septiembre de 2026: «no puedo cerrar "ecozonorte"»).
 */
export const isClientDirectoryRowOpen = (row, expanded) => {
    if (!row || expanded === null || expanded === undefined || expanded === '') return false;
    return expanded === row.sourceId || (Boolean(row.clientId) && expanded === row.clientId);
};

/** Filtra por nombre, nombre legal, documento, contacto, correo o ciudad, sin tildes. */
export const filterClientDirectoryRows = (rows = [], search = '') => {
    const needle = normalizeText(String(search).trim());
    if (!needle) return rows;
    return rows.filter((row) => [row.name, ...SEARCH_FIELDS.map((field) => row.profile?.[field]), ...THIRD_PARTY_SEARCH_FIELDS.map((field) => row.thirdParty?.[field]), row.prospect?.contactName, row.prospect?.email, row.prospect?.phone]
        .some((value) => normalizeText(value).includes(needle)));
};

// --- Terceros (Elisa, 23 de octubre de 2026: «el tema de terceros, nos gusta como lo hacen acá») ---
// Una fila por tercero con sus roles: los clientes (sus fichas, más las etiquetas del Excel que no
// tienen ficha) y aquellos a quienes Brain Studio les paga. Un tercero que también es cliente —ligado
// a su ficha, o con el mismo documento— es una sola fila con los dos roles.

const THIRD_PARTY_SEARCH_FIELDS = ['name', 'legalName', 'documentNumber', 'email', 'phone'];

export const PARTY_ROLES = Object.freeze([
    { value: 'CLIENTE', label: 'Cliente' },
    // Quien recibió una cotización y todavía no tiene ficha de cliente (punto 1 de la solicitud de Elisa).
    { value: 'CLIENTE_POTENCIAL', label: 'Cliente potencial' },
    { value: 'PROVEEDOR', label: 'Proveedor' },
    { value: 'COLABORADOR', label: 'Colaborador' },
    { value: 'ARRENDADOR', label: 'Arrendador' },
    { value: 'SOCIO', label: 'Socio' },
    { value: 'OTRO', label: 'Otro tercero' }
]);
export const partyRoleLabel = (value) => PARTY_ROLES.find((role) => role.value === value)?.label || value;

const documentKey = (value) => String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '') || null;

// Las etapas del CRM en que una oportunidad ya no sigue: un cliente potencial perdido queda inactivo.
const CLOSED_PROSPECT_STAGES = new Set(['PERDIDO', 'DESCARTADO']);

/**
 * `commercial` es lo que entrega /financials/parties/commercial: los clientes potenciales (una fila cada uno)
 * y las cotizaciones de cada cliente, que se cuelgan de su fila.
 */
export const buildPartyRows = (clientRows = [], thirdParties = [], commercial = {}) => {
    const quotationsByClient = commercial?.quotationsByClient || {};
    const rows = clientRows.map((row) => ({
        ...row,
        quotations: (row.clientId && quotationsByClient[row.clientId]) || [],
        prospect: null,
        thirdParty: null,
        roles: row.clientId ? ['CLIENTE'] : [],
        // Una etiqueta del Excel sin ficha: se vincula, no es un tercero todavía.
        unlinked: !row.clientId
    }));
    const byClient = new Map(rows.filter((row) => row.clientId).map((row) => [row.clientId, row]));
    const byDocument = new Map(rows.filter((row) => documentKey(row.profile?.documentNumber)).map((row) => [documentKey(row.profile.documentNumber), row]));
    for (const thirdParty of thirdParties) {
        const match = (thirdParty.clientId && byClient.get(thirdParty.clientId))
            || (documentKey(thirdParty.documentNumber) && byDocument.get(documentKey(thirdParty.documentNumber)));
        if (match && !match.thirdParty) {
            match.thirdParty = thirdParty;
            match.roles = [...match.roles, thirdParty.kind];
            continue;
        }
        rows.push({ sourceId: `tercero:${thirdParty.id}`, clientId: null, name: thirdParty.name, slug: null, profile: null, income: 0, receivable: 0, recordCount: 0, quotations: [], prospect: null, thirdParty, roles: [thirdParty.kind], unlinked: false });
    }
    for (const prospect of commercial?.prospects || []) {
        rows.push({
            sourceId: `prospecto:${prospect.id}`, clientId: null, name: prospect.company || prospect.contactName || prospect.email || 'Sin nombre',
            slug: null, profile: null, income: 0, receivable: 0, recordCount: 0, quotations: prospect.quotations || [],
            prospect, thirdParty: null, roles: ['CLIENTE_POTENCIAL'], unlinked: false
        });
    }
    return rows;
};

/**
 * Activo si el cliente no está archivado; si solo se le paga, si su ficha de pago está activa; si es un
 * cliente potencial, mientras su oportunidad siga en la ruta comercial.
 */
export const isPartyActive = (row) => {
    if (row.clientId) return !row.profile?.isArchived;
    if (row.thirdParty) return row.thirdParty.isActive !== false;
    if (row.prospect) return !CLOSED_PROSPECT_STAGES.has(row.prospect.stage);
    return true;
};

export const partyDocument = (row) => {
    const source = row.profile?.documentNumber ? row.profile : row.thirdParty?.documentNumber ? row.thirdParty : null;
    return source ? `${source.documentType ? `${source.documentType} ` : ''}${source.documentNumber}` : null;
};

export const partyContact = (row) => {
    const phone = row.profile?.phone || row.thirdParty?.phone || row.prospect?.phone;
    const email = row.profile?.email || row.thirdParty?.email || row.prospect?.email;
    return [phone, email].filter(Boolean).join(' · ') || null;
};

/** Las cifras de arriba de Terceros: cuántos hay y de qué clase. Lo que solo está en el Excel no cuenta. */
export const summarizeParties = (rows = []) => {
    const real = rows.filter((row) => !row.unlinked);
    const withRole = (role) => real.filter((row) => row.roles.includes(role)).length;
    return {
        total: real.length,
        clients: withRole('CLIENTE'),
        prospects: withRole('CLIENTE_POTENCIAL'),
        suppliers: withRole('PROVEEDOR'),
        team: withRole('COLABORADOR'),
        others: real.filter((row) => row.roles.some((role) => ['ARRENDADOR', 'SOCIO', 'OTRO'].includes(role))).length,
        active: real.filter(isPartyActive).length,
        unlinked: rows.length - real.length
    };
};

/** Rol (o «SIN_FICHA» para las etiquetas del Excel), estado y búsqueda. */
export const filterPartyRows = (rows = [], { search = '', role = '', status = '' } = {}) => filterClientDirectoryRows(rows, search).filter((row) => {
    if (role === 'SIN_FICHA') { if (!row.unlinked) return false; } else if (role && !row.roles.includes(role)) return false;
    if (status === 'ACTIVO' && (row.unlinked || !isPartyActive(row))) return false;
    if (status === 'INACTIVO' && (row.unlinked || isPartyActive(row))) return false;
    return true;
});
