import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CrmValidationError, createLead, addActivity, changeStage, setTrafficLight, updateLead,
  listLeads, followUps, metricsFor, serializeLead, normalizeCompanyKey, archiveLead, unarchiveLead, archiveLeads
} from '../src/services/crmService.js';

const NOW = new Date('2026-09-18T15:00:00-05:00');
const actor = { userId: 'u1', role: 'EDITOR' };

// Minimal in-memory Prisma double: enough shape for the service, nothing more.
const fakeDb = ({ leads = [], activities = [], members = [{ id: 'tm1', isActive: true }] } = {}) => {
  const state = { leads: structuredClone(leads), activities: structuredClone(activities), calls: [] };
  const findLead = where => state.leads.find(lead => lead.id === where.id) || null;
  const withRelations = lead => lead && ({
    ...lead,
    activities: state.activities.filter(item => item.leadId === lead.id).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)),
    owner: lead.ownerId ? { id: lead.ownerId, name: 'Franci', avatarUrl: null } : null
  });
  const tx = {
    crmLead: {
      findUnique: async ({ where }) => withRelations(findLead(where)),
      findFirst: async ({ where }) => withRelations(state.leads.find(lead => lead.legacyCode === where?.legacyCode) || null),
      findMany: async ({ where = {} } = {}) => state.leads.filter(lead => {
        if (where.id?.in && !where.id.in.includes(lead.id)) return false;
        if (where.archivedAt === null) return !lead.archivedAt;
        if (where.archivedAt && typeof where.archivedAt === 'object' && 'not' in where.archivedAt) return Boolean(lead.archivedAt);
        return true;
      }).map(withRelations),
      create: async ({ data }) => { const lead = { id: `lead-${state.leads.length + 1}`, consecutive: state.leads.length + 1, createdAt: NOW, updatedAt: NOW, ...data }; state.leads.push(lead); state.calls.push(['lead.create', data]); return withRelations(lead); },
      update: async ({ where, data }) => { const lead = findLead(where); Object.assign(lead, data); state.calls.push(['lead.update', data]); return withRelations(lead); },
      updateMany: async ({ where, data }) => { const hit = state.leads.filter(lead => where.id.in.includes(lead.id) && !lead.archivedAt); hit.forEach(lead => Object.assign(lead, data)); state.calls.push(['lead.updateMany', where.id.in]); return { count: hit.length }; }
    },
    crmActivity: {
      findUnique: async ({ where }) => state.activities.find(item => item.authorId === where.authorId_requestId?.authorId && item.requestId === where.authorId_requestId?.requestId) || null,
      create: async ({ data }) => { const item = { id: `act-${state.activities.length + 1}`, createdAt: NOW, ...data }; state.activities.push(item); state.calls.push(['activity.create', data]); return item; },
      update: async ({ where, data }) => { const item = state.activities.find(entry => entry.id === where.id); Object.assign(item, data); return item; },
      findMany: async () => state.activities
    },
    teamMember: { findMany: async ({ where }) => members.filter(member => where.id.in.includes(member.id) && member.isActive) }
  };
  return { ...tx, $transaction: async callback => callback(tx), state };
};

test('normalizeCompanyKey groups the same company written differently', () => {
  assert.equal(normalizeCompanyKey('  HDI  Seguros S.A.S '), 'hdi seguros sas');
  assert.equal(normalizeCompanyKey('Jaraba Ingeniería'), 'jaraba ingenieria');
  assert.equal(normalizeCompanyKey(''), null);
});

test('createLead validates the catalog values and needs at least a company or a contact', async () => {
  const db = fakeDb();
  await assert.rejects(createLead(db, { origin: 'LINKEDIN' }, actor), CrmValidationError);
  await assert.rejects(createLead(db, { company: 'ACME', origin: 'TWITTER' }, actor), /origen/i);
  await assert.rejects(createLead(db, { company: 'ACME', stage: 'INVENTADA' }, actor), /etapa/i);
  await assert.rejects(createLead(db, { company: 'ACME', priority: 'URGENTE' }, actor), /prioridad/i);
  await assert.rejects(createLead(db, { company: 'ACME', ownerId: 'tm-missing' }, actor), /Equipo/);
  await assert.rejects(createLead(db, { company: 'ACME', quotedValue: 'mucho' }, actor), /valor/i);
  const lead = await createLead(db, { company: ' ACME Corp ', contactName: 'Ana', origin: 'REFERIDO', priority: 'ALTA', quotedValue: '1500000', ownerId: 'tm1', nextAction: 'Llamar', nextFollowUpAt: '2026-09-20' }, actor, NOW);
  assert.equal(lead.company, 'ACME Corp');
  assert.equal(lead.companyKey, 'acme corp');
  assert.equal(lead.code, 'CRM-0001');
  assert.equal(lead.stage, 'POR_GESTIONAR');
  assert.equal(lead.createdById, 'u1');
  assert.equal(lead.enteredAt.toISOString(), NOW.toISOString());
  assert.equal(lead.trafficLight.value, 'AMARILLO');
  assert.equal(lead.followUpBucket, 'SEMANA');
  assert.equal(lead.quotedValue, 1500000);
});

// 30 de septiembre de 2026: el punto se leía como decimal, así que «1.200» se guardaba
// como 1,20 y «1.200.000» se rechazaba. El punto de miles es de miles.
test('el valor cotizado escrito con puntos de miles se guarda completo', async () => {
  const db = fakeDb();
  assert.equal((await createLead(db, { company: 'Uno', quotedValue: '1.200' }, actor, NOW)).quotedValue, 1200);
  assert.equal((await createLead(db, { company: 'Dos', quotedValue: '1.200.000' }, actor, NOW)).quotedValue, 1200000);
  assert.equal((await createLead(db, { company: 'Tres', quotedValue: '1200000.5' }, actor, NOW)).quotedValue, 1200000.5);
  await assert.rejects(createLead(db, { company: 'Cuatro', quotedValue: '-5' }, actor, NOW), /valor/i);
});

test('addActivity records the touch, moves the lead milestones and is idempotent by requestId', async () => {
  const db = fakeDb({ leads: [{ id: 'L1', stage: 'POR_GESTIONAR', enteredAt: new Date('2026-09-10T15:00:00-05:00'), priority: 'MEDIA', origin: 'LINKEDIN' }] });
  await assert.rejects(addActivity(db, 'L1', { type: 'FAX' }, actor), /tipo/i);
  await assert.rejects(addActivity(db, 'missing', { type: 'LLAMADA' }, actor), /encontr/i);
  const first = await addActivity(db, 'L1', { type: 'LLAMADA', note: 'Contesta Ana', result: 'Pide propuesta', nextAction: 'Enviar propuesta', nextFollowUpAt: '2026-09-22', requestId: 'req-1', occurredAt: '2026-09-18T10:00:00-05:00' }, actor, NOW);
  assert.equal(first.activity.type, 'LLAMADA');
  assert.equal(first.activity.authorId, 'u1');
  assert.equal(first.lead.stage, 'CONTACTADO', 'first outbound contact moves a fresh lead to Contactado');
  assert.equal(first.lead.firstContactAt.toISOString(), new Date('2026-09-18T10:00:00-05:00').toISOString());
  assert.equal(first.lead.lastActivityAt.toISOString(), new Date('2026-09-18T10:00:00-05:00').toISOString());
  assert.equal(first.lead.nextAction, 'Enviar propuesta');
  assert.equal(first.lead.nextFollowUpAt, '2026-09-22');
  const stageChange = db.state.activities.find(item => item.type === 'CAMBIO_ETAPA');
  assert.equal(stageChange.toStage, 'CONTACTADO');

  const repeat = await addActivity(db, 'L1', { type: 'LLAMADA', note: 'doble toque', requestId: 'req-1' }, actor, NOW);
  assert.equal(repeat.activity.id, first.activity.id);
  assert.equal(db.state.activities.filter(item => item.type === 'LLAMADA').length, 1);

  const proposal = await addActivity(db, 'L1', { type: 'PROPUESTA_ENVIADA', note: 'Propuesta v1', occurredAt: '2026-09-19T09:00:00-05:00' }, actor, NOW);
  assert.equal(proposal.lead.stage, 'PROPUESTA_ENVIADA');
  assert.equal(proposal.lead.proposalSentAt.toISOString(), new Date('2026-09-19T09:00:00-05:00').toISOString());
  // A later note does not rewind the first contact date.
  await addActivity(db, 'L1', { type: 'NOTA', note: 'recordatorio', occurredAt: '2026-09-01T09:00:00-05:00' }, actor, NOW);
  assert.equal(db.state.leads[0].firstContactAt.toISOString(), new Date('2026-09-18T10:00:00-05:00').toISOString());
});

test('changeStage records the transition, requires a reason to lose and closes won leads', async () => {
  const db = fakeDb({ leads: [{ id: 'L1', stage: 'NEGOCIACION', enteredAt: NOW, priority: 'MEDIA', origin: 'REFERIDO' }] });
  await assert.rejects(changeStage(db, 'L1', { stage: 'PERDIDO' }, actor), /motivo/i);
  await assert.rejects(changeStage(db, 'L1', { stage: 'NADA' }, actor), /etapa/i);
  const same = await changeStage(db, 'L1', { stage: 'NEGOCIACION' }, actor, NOW);
  assert.equal(db.state.activities.length, 0, 'same stage is a no-op');
  assert.equal(same.stage, 'NEGOCIACION');
  const won = await changeStage(db, 'L1', { stage: 'GANADO', note: 'Firmó contrato' }, actor, NOW);
  assert.equal(won.stage, 'GANADO');
  assert.equal(won.closedAt.toISOString(), NOW.toISOString());
  assert.equal(won.trafficLight.value, 'VERDE');
  const change = db.state.activities.at(-1);
  assert.deepEqual([change.type, change.fromStage, change.toStage, change.note], ['CAMBIO_ETAPA', 'NEGOCIACION', 'GANADO', 'Firmó contrato']);
  const lost = await changeStage(db, 'L1', { stage: 'PERDIDO', lostReason: 'Precio' }, actor, NOW);
  assert.equal(lost.lostReason, 'Precio');
  assert.equal(lost.trafficLight.value, 'ROJO');
  const reopened = await changeStage(db, 'L1', { stage: 'CONTACTADO' }, actor, NOW);
  assert.equal(reopened.closedAt, null, 'reopening clears the close date');
});

test('setTrafficLight stores an override with its reason and clears it back to automatic', async () => {
  const db = fakeDb({ leads: [{ id: 'L1', stage: 'SIN_RESPUESTA', enteredAt: NOW, priority: 'MEDIA', origin: 'OTRO' }] });
  await assert.rejects(setTrafficLight(db, 'L1', { value: 'AZUL' }, actor), /sem[aá]foro/i);
  await assert.rejects(setTrafficLight(db, 'L1', { value: 'VERDE' }, actor), /motivo/i);
  const manual = await setTrafficLight(db, 'L1', { value: 'VERDE', reason: 'Confirmó por teléfono' }, actor, NOW);
  assert.deepEqual(manual.trafficLight, { value: 'VERDE', mode: 'MANUAL', reason: 'Confirmó por teléfono' });
  const auto = await setTrafficLight(db, 'L1', { value: null }, actor, NOW);
  assert.equal(auto.trafficLight.mode, 'AUTO');
  assert.equal(auto.trafficLight.value, 'ROJO');
});

test('updateLead never changes the stage or the milestones filled by the log', async () => {
  const db = fakeDb({ leads: [{ id: 'L1', stage: 'CONTACTADO', enteredAt: NOW, priority: 'MEDIA', origin: 'OTRO', firstContactAt: NOW }] });
  const updated = await updateLead(db, 'L1', { stage: 'GANADO', firstContactAt: null, company: 'Nueva', email: 'ana@acme.co', priority: 'ALTA', nextFollowUpAt: '' }, actor, NOW);
  assert.equal(updated.stage, 'CONTACTADO');
  assert.equal(updated.firstContactAt.toISOString(), NOW.toISOString());
  assert.equal(updated.company, 'Nueva');
  assert.equal(updated.priority, 'ALTA');
  assert.equal(updated.nextFollowUpAt, null);
  await assert.rejects(updateLead(db, 'L1', { email: 'no-es-correo' }, actor), /correo/i);
});

test('listLeads filters by stage, origin, owner, traffic light, bucket and free text, and sorts urgent first', async () => {
  const db = fakeDb({ leads: [
    { id: 'A', company: 'Alfa', stage: 'CONTACTADO', origin: 'LINKEDIN', priority: 'ALTA', ownerId: 'tm1', enteredAt: NOW, lastActivityAt: NOW, nextFollowUpAt: new Date('2026-09-10T05:00:00Z') },
    { id: 'B', company: 'Beta', contactName: 'Marta', stage: 'PROPUESTA_ENVIADA', origin: 'REFERIDO', priority: 'MEDIA', enteredAt: NOW, lastActivityAt: NOW, nextFollowUpAt: new Date('2026-09-18T05:00:00Z') },
    { id: 'C', company: 'Gamma', stage: 'GANADO', origin: 'LINKEDIN', priority: 'BAJA', enteredAt: NOW },
    { id: 'D', company: 'Delta', stage: 'CONTACTADO', origin: 'OTRO', priority: 'MEDIA', enteredAt: NOW, archivedAt: NOW }
  ] });
  const all = await listLeads(db, {}, NOW);
  assert.deepEqual(all.items.map(lead => lead.id), ['A', 'B', 'C'], 'archived hidden; overdue first, then today, then the rest');
  assert.equal(all.total, 3);
  assert.deepEqual((await listLeads(db, { stage: 'CONTACTADO' }, NOW)).items.map(lead => lead.id), ['A']);
  assert.deepEqual((await listLeads(db, { origin: 'LINKEDIN' }, NOW)).items.map(lead => lead.id), ['A', 'C']);
  assert.deepEqual((await listLeads(db, { ownerId: 'tm1' }, NOW)).items.map(lead => lead.id), ['A']);
  assert.deepEqual((await listLeads(db, { trafficLight: 'VERDE' }, NOW)).items.map(lead => lead.id), ['C']);
  assert.deepEqual((await listLeads(db, { bucket: 'HOY' }, NOW)).items.map(lead => lead.id), ['B']);
  assert.deepEqual((await listLeads(db, { search: 'marta' }, NOW)).items.map(lead => lead.id), ['B']);
  assert.deepEqual((await listLeads(db, { group: 'ABIERTO' }, NOW)).items.map(lead => lead.id), ['A', 'B']);
  assert.deepEqual((await listLeads(db, { includeArchived: true }, NOW)).items.map(lead => lead.id).sort(), ['A', 'B', 'C', 'D']);
  assert.deepEqual((await listLeads(db, { archived: 'SOLO' }, NOW)).items.map(lead => lead.id), ['D'], '«Ver archivadas» muestra dónde quedaron');
});

test('archivar conserva los datos, saca de la lista y se deshace con desarchivar; en lote desde la lista filtrada', async () => {
  const db = fakeDb({ leads: [
    { id: 'A', company: 'Alfa', stage: 'PROPUESTA_ENVIADA', origin: 'LINKEDIN', priority: 'MEDIA', enteredAt: NOW },
    { id: 'B', company: 'Beta', stage: 'CONTACTADO', origin: 'OTRO', priority: 'MEDIA', enteredAt: NOW },
    { id: 'C', company: 'Gamma', stage: 'CONTACTADO', origin: 'OTRO', priority: 'MEDIA', enteredAt: NOW, archivedAt: new Date('2026-10-01T12:00:00Z') }
  ] });
  const filed = await archiveLead(db, 'A', actor, NOW);
  assert.equal(filed.archivedAt.toISOString(), NOW.toISOString());
  assert.equal(filed.stage, 'PROPUESTA_ENVIADA', 'archivar no es una etapa: la oportunidad queda como estaba');
  assert.deepEqual((await listLeads(db, {}, NOW)).items.map(lead => lead.id), ['B']);
  assert.deepEqual((await listLeads(db, { archived: 'SOLO' }, NOW)).items.map(lead => lead.id), ['C', 'A'], 'la última archivada primero (C se archivó el 1 de octubre, A el 18 de septiembre)');
  const back = await unarchiveLead(db, 'A', actor, NOW);
  assert.equal(back.archivedAt, null);
  assert.deepEqual((await listLeads(db, {}, NOW)).items.map(lead => lead.id).sort(), ['A', 'B']);
  await assert.rejects(unarchiveLead(db, 'missing', actor, NOW), /encontrada/);
  // En lote: las que ya estaban archivadas o no existen se cuentan aparte, nada falla por ellas.
  const batch = await archiveLeads(db, ['A', 'B', 'C', 'missing', 'A'], actor, NOW);
  assert.deepEqual(batch, { archived: 2, skipped: 2, ids: ['A', 'B'] });
  assert.deepEqual((await listLeads(db, {}, NOW)).items, []);
  await assert.rejects(archiveLeads(db, [], actor, NOW), /al menos una/);
  await assert.rejects(archiveLeads(db, Array.from({ length: 201 }, (_, index) => `L${index}`), actor, NOW), /200/);
});

test('el tablero lista lo recién registrado a mano sin primer contacto, aparte de lo urgente y del formulario', async () => {
  const db = fakeDb({ leads: [
    { id: 'A', company: 'Naro', stage: 'POR_GESTIONAR', origin: 'LINKEDIN', priority: 'MEDIA', enteredAt: NOW },
    { id: 'B', company: 'Ecuador', stage: 'POR_GESTIONAR', origin: 'LINKEDIN', priority: 'MEDIA', enteredAt: new Date('2026-09-17T15:00:00-05:00') },
    { id: 'C', company: 'Vieja', stage: 'POR_GESTIONAR', origin: 'OTRO', priority: 'MEDIA', enteredAt: NOW, firstContactAt: NOW },
    { id: 'D', company: 'Formulario', stage: 'POR_GESTIONAR', origin: 'FORMULARIO', priority: 'MEDIA', enteredAt: NOW, request: { id: 'r1' } }
  ] });
  const metrics = await metricsFor(db, {}, NOW);
  assert.equal(metrics.fresh, 2);
  assert.deepEqual(metrics.recentFresh.map(lead => lead.id), ['A', 'B'], 'la de hoy primero; la contactada y la del formulario no');
});

test('followUps groups actionable leads into the four daily buckets', async () => {
  const db = fakeDb({ leads: [
    { id: 'A', stage: 'CONTACTADO', origin: 'OTRO', priority: 'MEDIA', enteredAt: NOW, nextFollowUpAt: new Date('2026-09-10T05:00:00Z') },
    { id: 'B', stage: 'APROBADA', origin: 'OTRO', priority: 'MEDIA', enteredAt: NOW, nextFollowUpAt: new Date('2026-09-18T05:00:00Z') },
    { id: 'C', stage: 'NEGOCIACION', origin: 'OTRO', priority: 'MEDIA', enteredAt: NOW, nextFollowUpAt: new Date('2026-09-19T05:00:00Z') },
    { id: 'D', stage: 'CONTACTADO', origin: 'OTRO', priority: 'MEDIA', enteredAt: NOW },
    { id: 'E', stage: 'PERDIDO', origin: 'OTRO', priority: 'MEDIA', enteredAt: NOW }
  ] });
  const result = await followUps(db, {}, NOW);
  assert.deepEqual(Object.fromEntries(Object.entries(result.buckets).map(([key, items]) => [key, items.map(lead => lead.id)])), { VENCIDO: ['A'], HOY: ['B'], SEMANA: ['C'], SIN_FECHA: ['D'] });
  assert.deepEqual(result.counts, { VENCIDO: 1, HOY: 1, SEMANA: 1, SIN_FECHA: 1 });
});

test('metricsFor applies the date and owner filters before computing', async () => {
  const db = fakeDb({ leads: [
    { id: 'A', stage: 'CONTACTADO', origin: 'LINKEDIN', priority: 'MEDIA', ownerId: 'tm1', enteredAt: new Date('2026-09-05T15:00:00-05:00'), lastActivityAt: NOW },
    { id: 'B', stage: 'GANADO', origin: 'REFERIDO', priority: 'MEDIA', ownerId: 'tm2', enteredAt: new Date('2026-08-05T15:00:00-05:00'), closedAt: NOW, quotedValue: '900000' }
  ] });
  const all = await metricsFor(db, {}, NOW);
  assert.equal(all.total, 2);
  assert.equal(all.wonValue, 900000);
  const september = await metricsFor(db, { from: '2026-09-01', to: '2026-09-30' }, NOW);
  assert.equal(september.total, 1);
  const owner = await metricsFor(db, { ownerId: 'tm2' }, NOW);
  assert.equal(owner.won, 1);
});

test('serializeLead exposes code, derived outcome, traffic light and plain numbers', () => {
  const lead = serializeLead({ id: 'x', consecutive: 12, stage: 'APROBADA', quotedValue: { toString: () => '250000.50' }, nextFollowUpAt: new Date('2026-09-18T05:00:00Z'), activities: [], enteredAt: NOW }, NOW);
  assert.equal(lead.code, 'CRM-0012');
  assert.equal(lead.outcome, 'APROBADO');
  assert.equal(lead.quotedValue, 250000.5);
  assert.equal(lead.nextFollowUpAt, '2026-09-18');
  assert.equal(lead.trafficLight.value, 'VERDE');
  assert.equal(lead.followUpBucket, 'HOY');
});
