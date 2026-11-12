import { randomUUID } from 'node:crypto';

// Un doble en memoria de lo que Pautas le pide a la base. Lo usan las pruebas del servicio y la muestra local, así que la
// muestra corre el servicio y las rutas de verdad. No certifica PostgreSQL: las columnas y restricciones reales las
// define `scripts/ensure-ad-budgets-schema.js`.
const byId = (rows, id) => rows.find((row) => row.id === id) || null;
const matches = (row, where = {}) => Object.entries(where).every(([key, wanted]) => {
    if (wanted && typeof wanted === 'object' && !(wanted instanceof Date)) {
        if ('in' in wanted) return wanted.in.includes(row[key]);
        if ('notIn' in wanted) return !wanted.notIn.includes(row[key]);
        if ('not' in wanted) return wanted.not === null ? row[key] !== null && row[key] !== undefined : row[key] !== wanted.not;
    }
    if (wanted === null) return row[key] === null || row[key] === undefined;
    return row[key] === wanted;
});

export const createAdBudgetsDb = ({ clients = [], team = [], users = [], budgets = [], cycles = [], readings = [], campaigns = [], metaAccounts = [], metaCampaigns = [] } = {}) => {
    const store = {
        clients, team, users,
        budgets: budgets.map((row) => ({ createdAt: new Date('2026-01-01T12:00:00Z'), status: 'ACTIVA', kind: 'MENSUAL', platform: 'META', currency: 'COP', payer: 'POR_DEFINIR', ...row })),
        cycles: [...cycles], readings: [...readings], campaigns: [...campaigns],
        metaAccounts: [...metaAccounts], metaCampaigns: metaCampaigns.map((row) => ({ budgetId: null, ignoredAt: null, spend30: 0, ...row })),
        alerts: [], notices: [], notifications: [], events: []
    };
    const joined = (row) => {
        const client = byId(store.clients, row.clientId);
        const member = (id) => (id ? byId(store.team, id) : null);
        return {
            ...row,
            client: client ? { ...client, contracts: client.contracts || [], projectManager: member(client.projectManagerId) } : null,
            responsible: member(row.responsibleId),
            cycles: store.cycles.filter((cycle) => cycle.budgetId === row.id).sort((a, b) => a.cycleKey.localeCompare(b.cycleKey)),
            campaigns: store.campaigns.filter((campaign) => campaign.budgetId === row.id),
            metaCampaigns: store.metaCampaigns.filter((campaign) => campaign.budgetId === row.id).sort((a, b) => a.name.localeCompare(b.name))
        };
    };
    const db = {
        store,
        $transaction: (work) => work(db),
        adBudget: {
            findMany: async ({ where } = {}) => store.budgets.filter((row) => matches(row, where)).map(joined),
            findUnique: async ({ where }) => { const row = byId(store.budgets, where.id); return row ? joined(row) : null; },
            create: async ({ data }) => { const row = { createdAt: new Date(), ...data }; store.budgets.push(row); return row; },
            update: async ({ where, data }) => Object.assign(byId(store.budgets, where.id), data),
            // El borrado en cascada de la base: ciclos, lecturas, campañas y avisos ya enviados.
            delete: async ({ where }) => {
                const cycleIds = store.cycles.filter((row) => row.budgetId === where.id).map((row) => row.id);
                store.readings = store.readings.filter((row) => !cycleIds.includes(row.cycleId));
                store.cycles = store.cycles.filter((row) => row.budgetId !== where.id);
                store.campaigns = store.campaigns.filter((row) => row.budgetId !== where.id);
                store.metaCampaigns.filter((row) => row.budgetId === where.id).forEach((row) => { row.budgetId = null; });
                store.budgets = store.budgets.filter((row) => row.id !== where.id);
            }
        },
        adBudgetCycle: {
            findUnique: async ({ where }) => {
                const { budgetId, cycleKey } = where.budgetId_cycleKey;
                return store.cycles.find((row) => row.budgetId === budgetId && row.cycleKey === cycleKey) || null;
            },
            create: async ({ data }) => { const row = { spent: null, spentAsOf: null, carryOverManual: null, closedAt: null, ...data }; store.cycles.push(row); return row; },
            update: async ({ where, data }) => Object.assign(byId(store.cycles, where.id), data)
        },
        adSpendReading: {
            create: async ({ data }) => { const row = { createdAt: new Date(), ...data }; store.readings.push(row); return row; },
            findUnique: async ({ where, include }) => {
                const row = byId(store.readings, where.id);
                return row && include?.cycle ? { ...row, cycle: byId(store.cycles, row.cycleId) } : row;
            },
            findMany: async ({ where, take }) => {
                const rows = store.readings.filter((row) => matches(row, where)).reverse().sort((a, b) => b.readOn.localeCompare(a.readOn));
                return take ? rows.slice(0, take) : rows;
            },
            update: async ({ where, data }) => Object.assign(byId(store.readings, where.id), data),
            updateMany: async ({ where, data }) => { store.readings.filter((row) => matches(row, where)).forEach((row) => Object.assign(row, data)); },
            delete: async ({ where }) => { store.readings.splice(store.readings.indexOf(byId(store.readings, where.id)), 1); }
        },
        adCampaign: {
            create: async ({ data }) => { const row = { createdAt: new Date(), ...data }; store.campaigns.push(row); return row; },
            findUnique: async ({ where }) => byId(store.campaigns, where.id),
            update: async ({ where, data }) => Object.assign(byId(store.campaigns, where.id), data),
            delete: async ({ where }) => { store.campaigns.splice(store.campaigns.indexOf(byId(store.campaigns, where.id)), 1); }
        },
        adBudgetEvent: {
            create: async ({ data }) => { const row = { createdAt: new Date(), ...data }; store.events.push(row); return row; },
            findMany: async ({ where, take }) => store.events.filter((row) => matches(row, where)).reverse().slice(0, take)
        },
        // Pautas conectadas a Meta: lo que la lectura vio y a qué pauta se ligó cada campaña.
        adMetaAccount: {
            findMany: async ({ where = {}, orderBy = {}, take } = {}) => {
                const rows = store.metaAccounts.filter((row) => matches(row, where));
                if (orderBy.fetchedAt) rows.sort((a, b) => new Date(b.fetchedAt) - new Date(a.fetchedAt));
                else rows.sort((a, b) => a.name.localeCompare(b.name));
                return take ? rows.slice(0, take) : rows;
            },
            upsert: async ({ where, create, update }) => {
                const row = byId(store.metaAccounts, where.id);
                if (row) return Object.assign(row, update);
                const created = { fetchedAt: null, problem: null, ...create };
                store.metaAccounts.push(created);
                return created;
            }
        },
        adMetaCampaign: {
            findMany: async ({ where = {} } = {}) => store.metaCampaigns.filter((row) => matches(row, where)).sort((a, b) => a.name.localeCompare(b.name)),
            findUnique: async ({ where }) => byId(store.metaCampaigns, where.id),
            upsert: async ({ where, create, update }) => {
                const row = byId(store.metaCampaigns, where.id);
                if (row) return Object.assign(row, update);
                const created = { budgetId: null, ignoredAt: null, ...create };
                store.metaCampaigns.push(created);
                return created;
            },
            update: async ({ where, data }) => Object.assign(byId(store.metaCampaigns, where.id), data),
            updateMany: async ({ where, data }) => { const rows = store.metaCampaigns.filter((row) => matches(row, where)); rows.forEach((row) => Object.assign(row, data)); return { count: rows.length }; }
        },
        adBudgetAlert: {
            create: async ({ data }) => {
                if (store.alerts.some((row) => row.budgetId === data.budgetId && row.cycleKey === data.cycleKey && row.step === data.step)) {
                    throw Object.assign(new Error('duplicado'), { code: 'P2002' });
                }
                store.alerts.push(data);
                return data;
            }
        },
        client: {
            findUnique: async ({ where }) => byId(store.clients, where.id),
            findMany: async () => store.clients.filter((row) => !row.isArchived).map(({ id, name }) => ({ id, name }))
        },
        teamMember: {
            findUnique: async ({ where }) => byId(store.team, where.id),
            findFirst: async ({ where }) => store.team.find((row) => row.userId === where.userId) || null,
            findMany: async () => store.team.filter((row) => row.isActive !== false)
        },
        user: {
            findMany: async ({ where = {} } = {}) => store.users
                .filter((row) => (!where.id?.in || where.id.in.includes(row.id)) && (where.isActive === undefined || row.isActive !== false))
                .map((row) => ({ ...row, teamMember: store.team.find((member) => member.userId === row.id) || null }))
        },
        importantNotice: {
            findMany: async ({ where = {} } = {}) => store.notices.filter((row) => matches(row, where)),
            findFirst: async ({ where = {} } = {}) => store.notices.find((row) => matches({ ...row, decidedAt: row.decidedAt ?? null }, where.decidedAt ? { userId: where.userId } : where) && (!where.decidedAt || row.decidedAt)) || null,
            create: async ({ data }) => { const row = { id: randomUUID(), resolvedAt: null, snoozedUntil: null, ...data }; store.notices.push(row); return row; },
            update: async ({ where, data }) => Object.assign(byId(store.notices, where.id), data),
            updateMany: async ({ where, data }) => { const rows = store.notices.filter((row) => matches(row, where)); rows.forEach((row) => Object.assign(row, data)); return { count: rows.length }; }
        }
    };
    return db;
};
