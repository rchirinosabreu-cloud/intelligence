// In-memory stand-in for the Prisma client used by the CRM service. Only the calls the service makes
// are implemented, with the same shapes, so previews and tests exercise the real service logic.
let counter = 0;
const nextId = prefix => `${prefix}-${String(++counter).padStart(4, '0')}`;

const byOccurredDesc = (a, b) => new Date(b.occurredAt) - new Date(a.occurredAt);

export function createCrmMemoryDb({ leads = [], activities = [], members = [], users = [], requests = [], quotations = [] } = {}) {
  const state = {
    leads: leads.map((lead, index) => ({ consecutive: index + 1, createdAt: lead.enteredAt || new Date(), updatedAt: new Date(), ...lead })),
    activities: activities.map(activity => ({ createdAt: activity.occurredAt || new Date(), ...activity })),
    members,
    users,
    requests: [...requests],
    quotations: [...quotations]
  };
  const author = id => state.users.find(user => user.id === id) || null;
  const relations = lead => lead && ({
    ...lead,
    owner: lead.ownerId ? state.members.find(member => member.id === lead.ownerId) || null : null,
    activities: state.activities.filter(item => item.leadId === lead.id).sort(byOccurredDesc).map(item => ({ ...item, author: author(item.authorId) })),
    request: state.requests.find(item => item.leadId === lead.id) || null,
    quotations: state.quotations.filter(item => item.lead_id === lead.id)
  });
  const matchWhere = (lead, where = {}) => Object.entries(where).every(([key, value]) => (value === undefined ? true : (lead[key] ?? null) === value));

  const tx = {
    crmLead: {
      findUnique: async ({ where }) => relations(state.leads.find(lead => lead.id === where.id) || null),
      findFirst: async ({ where = {} }) => relations(state.leads.find(lead => matchWhere(lead, where)) || null),
      findMany: async ({ where = {} } = {}) => state.leads.filter(lead => matchWhere(lead, where)).map(relations),
      create: async ({ data }) => {
        const lead = { id: nextId('lead'), consecutive: state.leads.length + 1, createdAt: new Date(), updatedAt: new Date(), ...data };
        state.leads.push(lead);
        return relations(lead);
      },
      update: async ({ where, data }) => {
        const lead = state.leads.find(item => item.id === where.id);
        if (!lead) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        Object.assign(lead, data);
        return relations(lead);
      }
    },
    crmActivity: {
      findUnique: async ({ where }) => {
        if (where.id) return state.activities.find(item => item.id === where.id) || null;
        const key = where.authorId_requestId;
        return state.activities.find(item => item.authorId === key?.authorId && item.requestId === key?.requestId) || null;
      },
      create: async ({ data }) => {
        const activity = { id: nextId('act'), createdAt: new Date(), ...data };
        state.activities.push(activity);
        return activity;
      },
      update: async ({ where, data }) => {
        const activity = state.activities.find(item => item.id === where.id);
        Object.assign(activity, data);
        return activity;
      },
      findMany: async () => state.activities
    },
    crmRequest: {
      create: async ({ data }) => {
        const request = { id: nextId('req'), createdAt: new Date(), version: 1, ...data };
        state.requests.push(request);
        return request;
      },
      findUnique: async ({ where }) => state.requests.find(item => item.leadId === where.leadId || item.id === where.id) || null
    },
    user: {
      findMany: async ({ where = {} } = {}) => state.users.filter(user => (where.role === undefined || user.role === where.role) && (where.isActive === undefined || (user.isActive ?? true) === where.isActive) && (!where.teamMember || (user.teamMemberActive ?? true))).map(user => ({ id: user.id }))
    },
    teamMember: {
      findMany: async ({ where = {} } = {}) => state.members.filter(member => (!where.id?.in || where.id.in.includes(member.id)) && (where.isActive === undefined || member.isActive === where.isActive))
    }
  };
  return { ...tx, $transaction: async callback => callback(tx), state };
}
