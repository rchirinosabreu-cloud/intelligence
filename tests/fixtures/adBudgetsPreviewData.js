// La muestra local de Pautas con lo que se revisó en la reunión del 6 de noviembre de 2026. Son datos de muestra: cifras
// aproximadas dichas de viva voz, sin validar contra Meta. No se cargan en ningún lado.
export const team = [
    { id: 'm-keila', name: 'Keila', role: 'Pauta', areas: ['PAUTA'], userId: 'u-keila', isActive: true },
    { id: 'm-camila', name: 'Camila', role: 'Project Manager', areas: ['PROJECT_MANAGEMENT'], userId: 'u-camila', isActive: true }
];

export const users = [
    { id: 'u-keila', name: 'Keila', role: 'EDITOR', isActive: true, modulePermissions: { pautas: true } },
    { id: 'u-camila', name: 'Camila', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { manager: true } }
];

const client = (id, name, cutDay) => ({ id, name, slug: id, isArchived: false, projectManagerId: 'm-camila', contracts: [{ startDate: '2026-01-01', cutDay }] });

export const clients = [
    client('foobspain', 'Foobespain', 1),
    client('muestra', 'Cliente de muestra (cierra pronto)', 11),
    client('bonsai', 'Bonsai', 19),
    client('promo-group', 'Promo Group', 15),
    client('new-pueblito', 'New Pueblito', 1),
    client('pablo-hoff', 'Pablo Hoff', 1),
    client('multik', 'Multi-K', 19),
    client('titanes', 'Titanes', 19),
    { id: 'martinez', name: 'Martínez y Nájera', slug: 'martinez', isArchived: false, contracts: [] }
];

const old = new Date('2026-08-01T12:00:00Z');
const budget = (id, clientId, amount, extra = {}) => ({ id, clientId, amount, responsibleId: 'm-keila', objective: 'Seguidores', createdAt: old, ...extra });

export const budgets = [
    budget('b-wonder', 'foobspain', 100, { brand: 'Wine & Wonder', currency: 'USD', payer: 'TARJETA_CLIENTE' }),
    budget('b-summit', 'foobspain', 100, { brand: 'Wine Summit', currency: 'USD', payer: 'TARJETA_CLIENTE' }),
    budget('b-foobe', 'foobspain', 100, { brand: 'FoobeSpain', currency: 'USD', payer: 'TARJETA_CLIENTE' }),
    budget('b-bonsai', 'bonsai', 1000000, { objective: 'Mensajes de WhatsApp', payer: 'TARJETA_BRAIN', notes: 'Cierre el 18. Falta leer en Meta el gasto desde el 19 de octubre.' }),
    budget('b-muestra', 'muestra', 1000000, { objective: 'Mensajes de WhatsApp', payer: 'TARJETA_BRAIN' }),
    budget('b-endova', 'promo-group', 300000, { brand: 'Endova', objective: 'Interacción', payer: 'TARJETA_BRAIN' }),
    budget('b-pueblito', 'new-pueblito', 300000, { objective: 'Mensajes de WhatsApp', payer: 'TARJETA_BRAIN', notes: 'Pendiente: que el cliente ponga su tarjeta.' }),
    budget('b-hoff', 'pablo-hoff', 200000, { payer: 'TARJETA_BRAIN', notes: 'Pendiente: que el cliente ponga su tarjeta.' }),
    budget('b-multik', 'multik', 350000, { objective: 'Mensajes de WhatsApp', payer: 'TARJETA_BRAIN', notes: 'Cierre el 18.' }),
    budget('b-titanes', 'titanes', 400000, { responsibleId: null, payer: 'POR_DEFINIR' })
];

const closed = new Date('2026-11-02T15:00:00Z');
const cycle = (id, budgetId, cycleKey, amount, spent, spentAsOf, extra = {}) => ({ id, budgetId, cycleKey, amount, spent, spentAsOf, carryOverManual: null, closedAt: null, ...extra });

export const cycles = [
    cycle('y1', 'b-wonder', '2026-10', 100, 86, '2026-10-31', { closedAt: closed }),
    cycle('y2', 'b-wonder', '2026-11', 100, 7, '2026-11-06'),
    cycle('y3', 'b-summit', '2026-10', 100, 29, '2026-10-31', { closedAt: closed }),
    cycle('y4', 'b-foobe', '2026-10', 100, 3.53, '2026-10-31', { closedAt: closed }),
    cycle('y5', 'b-muestra', '2026-09', 1000000, 906154, '2026-10-09', { closedAt: closed }),
    cycle('y6', 'b-muestra', '2026-10', 1000000, 768000, '2026-11-06'),
    cycle('y7', 'b-endova', '2026-09', 300000, 300000, '2026-10-14', { closedAt: closed }),
    cycle('y8', 'b-endova', '2026-10', 300000, 91000, '2026-11-03'),
    cycle('y9', 'b-pueblito', '2026-10', 300000, 60000, '2026-10-31', { closedAt: closed }),
    cycle('y10', 'b-hoff', '2026-10', 200000, 200000, '2026-10-30'),
    cycle('y11', 'b-multik', '2026-09', 350000, 350000, '2026-10-18', { closedAt: closed }),
    cycle('y12', 'b-multik', '2026-10', 350000, 176000, '2026-11-06'),
    cycle('y13', 'b-titanes', '2026-09', 400000, 350000, '2026-10-18', { closedAt: closed }),
    cycle('y14', 'b-titanes', '2026-10', 400000, 400000, '2026-11-05')
];

export const readings = [
    { id: 'r1', cycleId: 'y6', readOn: '2026-10-28', spent: 512000, isFinal: false, recordedById: 'u-keila', createdAt: new Date('2026-10-28T15:00:00Z') },
    { id: 'r2', cycleId: 'y6', readOn: '2026-11-06', spent: 768000, isFinal: false, recordedById: 'u-keila', note: 'Revisado en la reunión', createdAt: new Date('2026-11-06T15:00:00Z') },
    { id: 'r3', cycleId: 'y2', readOn: '2026-11-06', spent: 7, isFinal: false, recordedById: 'u-keila', createdAt: new Date('2026-11-06T15:00:00Z') }
];

const campaign = (id, budgetId, name, extra = {}) => ({ id, budgetId, name, status: 'ACTIVA', createdAt: new Date('2026-10-20T12:00:00Z'), ...extra });

// Lo que la muestra simula de Meta: cuentas y campañas con un gasto fijo por día. Ningún dato sale de Meta.
export const metaAccounts = [
    { id: '273405029', name: 'Francisco Villa', currency: 'COP', isActive: true },
    { id: '323231997523552', name: 'BONSAI', currency: 'COP', isActive: true },
    { id: '1694884524909081', name: 'Multimateriales Cartagena -Multik', currency: 'COP', isActive: true },
    { id: '1971947907549081', name: 'Endova', currency: 'COP', isActive: true },
    { id: '1991796371377407', name: 'Wine & Wonder', currency: 'USD', isActive: true },
    { id: '1124220066605324', name: 'FoobeSpain', currency: 'USD', isActive: true }
];

export const metaCampaignCatalog = {
    '273405029': [
        { id: '120100', name: 'PABLO HOFF- MENSAJES INSCRIPCIONES', perDay: 6800 },
        { id: '120101', name: 'PABLO HOFF-  NUEVA SEDE', perDay: 2000 },
        { id: '120102', name: 'NEW PUEBLITO  MENSAJES NOV 2026', perDay: 11400 },
        { id: '120103', name: 'NOV INTERACCIÓN MARTINEZ&NÁJERA.', perDay: 6100 },
        { id: '120104', name: 'BRAIN -  POSICIONAMIENTO NOV 2026', perDay: 3700 }
    ],
    '323231997523552': [{ id: '120200', name: 'BONSAI SEPTIEMBRE 2026', perDay: 26800 }],
    '1694884524909081': [{ id: '120300', name: 'MULTIK /  OCTUBRE  2026', perDay: 4900 }],
    '1971947907549081': [{ id: '120400', name: 'CAMPAÑA DE INTERACCION NOVIEMBRE 2026', perDay: 4300 }],
    '1991796371377407': [
        { id: '120500', name: 'ANUNCIO VISITAS AL PERFIL NOVIEMBRE 2026', perDay: 5.62 },
        { id: '120501', name: 'WINE SUMMIT | TRAFICO NOV 2026', perDay: 0.53 }
    ],
    '1124220066605324': [{ id: '120600', name: 'VISITAS AL PERFIL NOVIEMBRE 2026', perDay: 1.39 }]
};

const dayCount = (since, until) => Math.round((new Date(`${until}T12:00:00Z`) - new Date(`${since}T12:00:00Z`)) / 86_400_000) + 1;

/** Un Meta de mentira con la forma del de verdad: `listAdAccounts` y `campaignSpend`. */
export const previewMeta = {
    listAdAccounts: async () => metaAccounts,
    campaignSpend: async ({ adAccountId, since, until, campaignIds }) => (metaCampaignCatalog[adAccountId] || [])
        .filter((row) => !campaignIds || campaignIds.includes(row.id))
        .map((row) => ({ id: row.id, name: row.name, spend: Math.round(row.perDay * dayCount(since, until) * 100) / 100 }))
};

export const campaigns = [
    campaign('k1', 'b-muestra', 'Tiempo récord de pedido', { objective: 'Mensajes de WhatsApp', startDate: '2026-10-21', endDate: '2026-11-18', link: 'https://www.instagram.com/p/Desd3Hgx5Yc/' }),
    campaign('k2', 'b-endova', 'Convocatorias', { objective: 'Interacción', startDate: '2026-10-20', endDate: '2026-11-10', planned: 100000 }),
    campaign('k3', 'b-summit', 'Evento Wine Summit', { objective: 'Interacción', startDate: '2026-10-09', endDate: '2026-10-21', notes: 'Se reactivó el 29 de octubre.' }),
    campaign('k4', 'b-wonder', '¿Cómo se vive una experiencia en Wine and Wonder?', { startDate: '2026-11-01', endDate: '2026-11-20', planned: 72 })
];
