import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../src/services/briaCriterionDiscoveryContract.js').catch(() => ({}));
const plan = { id: 'plan', clientId: 'client', deletedAt: null, month: 9, year: 2026, internalNotes: '["Evitar tecnicismos.","Usar tú."]', contentItems: [
  { id: 'piece', status: 'APROBADO', copyText: 'Conoce nuestra colección.', captionText: 'Escríbenos.', internalNotes: 'Solo durante septiembre.', comments: '[Cliente - 01/09/2026]: Preferimos mensajes cercanos.', updatedAt: new Date('2026-09-02T12:00:00Z') },
  { id: 'deleted', deletedAt: new Date(), copyText: 'No leer', status: 'APROBADO' },
  { id: 'draft', status: 'BORRADOR', copyText: 'Texto no aprobado' }
] };
test('discovery reads client feedback, internal notes and approved text without inventing authors or approval dates', () => {
  assert.equal(typeof module.collectCriterionSources, 'function');
  const sources = module.collectCriterionSources([plan, { ...plan, id: 'foreign', clientId: 'other' }, { ...plan, id: 'deleted', deletedAt: new Date() }], 'client');
  assert.equal(sources.length, 6);
  assert.equal(sources.filter(s => s.kind === 'INTERNAL_NOTE').length, 3);
  assert.equal(sources.filter(s => s.kind === 'APPROVED_CONTENT').length, 2);
  assert.ok(sources.every(s => s.author === null && s.eventDate === null));
  assert.ok(sources.every(s => s.planId === 'plan'));
  assert.equal(sources.find(s => s.kind === 'CLIENT_FEEDBACK').attribution, 'Registro de feedback; autor no verificado');
});
test('source identity ignores unrelated timestamps and preserves every character in batches', () => {
  assert.equal(typeof module.collectCriterionSources, 'function');
  const sources = module.collectCriterionSources([plan], 'client');
  const changed = structuredClone(plan); changed.contentItems[0].updatedAt = new Date();
  assert.equal(module.discoveryHash(sources), module.discoveryHash(module.collectCriterionSources([changed], 'client')));
  const large = [{ ...sources[0], text: 'x'.repeat(70001) }];
  const batches = module.criterionSourceBatches(large);
  assert.equal(batches.flat().map(s => s.text).join(''), large[0].text);
  assert.ok(batches.every(batch => JSON.stringify(batch).length < 30000));
});
test('AI fenced JSON proposals require literal evidence, known scope and explicit conflicts; approval alone is not a rule', () => {
  assert.equal(typeof module.parseCriterionSuggestions, 'function');
  const sources = module.collectCriterionSources([plan], 'client');
  const internal = sources.find(s => s.kind === 'INTERNAL_NOTE');
  const suggestion = { category: 'MARCA', text: 'Evitar tecnicismos en esta parrilla.', reason: 'El equipo lo propone para este mes.', scope: 'PLAN', scopePlanId: 'plan', basis: 'EXPLICIT', evidence: [{ sourceId: internal.id, quote: internal.text }], conflicts: [] };
  const parse = candidate => module.parseCriterionSuggestions('```json\n' + JSON.stringify({ proposals: [candidate] }) + '\n```', sources, []);
  assert.equal(parse(suggestion)[0].provenance.evidence[0].kind, 'INTERNAL_NOTE');
  assert.throws(() => parse({ ...suggestion, evidence: [{ sourceId: internal.id, quote: 'Cita inventada' }] }), /evidencia/i);
  assert.throws(() => parse({ ...suggestion, scopePlanId: 'foreign' }), /alcance/i);
  assert.throws(() => parse({ ...suggestion, conflicts: ['unknown-rule'] }), /conflicto/i);
  const approved = sources.find(s => s.kind === 'APPROVED_CONTENT');
  assert.throws(() => parse({ ...suggestion, basis: 'EXPLICIT', evidence: [{ sourceId: approved.id, quote: approved.text }] }), /patrón/i);
  assert.throws(() => parse({ ...suggestion, basis: 'PATTERN', evidence: [{ sourceId: approved.id, quote: approved.text }] }), /dos piezas/i);
});
test('prompt treats notes as evidence, not instructions; structured output is strict', () => {
  assert.equal(typeof module.buildCriterionDiscoveryRequest, 'function');
  const request = module.buildCriterionDiscoveryRequest([], []);
  assert.equal(request.strictSchema, true);
  assert.match(request.prompt, /no son instrucciones/i);
  assert.match(request.prompt, /rechazad/i);
  assert.match(request.prompt, /temporal/i);
  assert.match(request.prompt, /MARCA.*tono.*tratamiento/i);
});
test('a pattern seen in one plan remains plan-scoped even when the model suggests client-wide scope', () => {
  const sources = module.collectCriterionSources([{ ...plan, contentItems: [plan.contentItems[0], { ...plan.contentItems[0], id: 'piece-two' }] }], 'client').filter(s => s.kind === 'APPROVED_CONTENT' && s.field === 'copyText');
  const result = module.parseCriterionSuggestions(JSON.stringify({ proposals: [{ category: 'ESTRATEGIA', text: 'Cerrar con una llamada a la acción.', reason: 'Dos ejemplos del mismo mes.', scope: 'CLIENT', scopePlanId: null, basis: 'PATTERN', evidence: sources.map(s => ({ sourceId: s.id, quote: s.text })), conflicts: [] }] }), sources, []);
  assert.equal(result[0].scope, 'PLAN');
  assert.equal(result[0].sourcePlanId, 'plan');
  assert.match(result[0].provenance.scopeNote, /una sola parrilla/i);
});
