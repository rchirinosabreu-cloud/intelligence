import test from 'node:test';
import assert from 'node:assert/strict';

test('period choices contain only saved plans of the current client, with stable destinations', async () => {
  const { planPeriodOptions } = await import('../src/lib/contentPlanNavigation.js');
  const current = { id: 'nov', clientId: 'c1', client: { id: 'c1', slug: 'faro' }, month: 11, year: 2026 };
  const options = planPeriodOptions(current, [
    { ...current, id: 'dec', month: 12 },
    { ...current, id: 'other', clientId: 'c2', client: { id: 'c2', slug: 'other' }, month: 10 },
    { ...current, id: 'bad', month: 13 },
  ]);
  assert.deepEqual(options.map(({ value, label }) => ({ value, label })), [
    { value: '/parrillas/faro/diciembre-2026', label: 'Diciembre 2026' },
    { value: '/parrillas/faro/noviembre-2026', label: 'Noviembre 2026' },
  ]);
  assert.equal(planPeriodOptions({ ...current, client: { id: 'c1' } }, [])[0].value, '/parrillas/nov');
});

test('MIO period choices use only read tabs for the same client, without inventing a native plan', async () => {
  const { externalPeriodOptions } = await import('../src/lib/contentPlanNavigation.js');
  const current = { client: { id: 'c1', slug: 'faro' }, month: 11, year: 2026 };
  const options = externalPeriodOptions(current, [
    { client: { id: 'c2', slug: 'other' }, months: [{ month: 10, year: 2026, tabName: 'Octubre', readAt: '2026-10-01' }] },
    { client: current.client, months: [
      { month: 12, year: 2026, tabName: 'Diciembre', readAt: '2026-11-05' },
      { month: 1, year: 2027, tabName: null, readAt: null },
    ] },
  ]);
  assert.deepEqual(options.map(option => option.value), ['/parrillas/hoja/faro/diciembre-2026', '/parrillas/hoja/faro/noviembre-2026']);
});

test('changing period keeps view and useful query while removing another month’s piece selection', async () => {
  const { periodDestination } = await import('../src/lib/contentPlanNavigation.js');
  assert.deepEqual(periodDestination('/parrillas/faro/diciembre-2026', '?item=old&itemId=legacy&view=calendar&dark&q=faro'), {
    pathname: '/parrillas/faro/diciembre-2026', search: 'view=calendar&dark=&q=faro',
  });
});

test('approved, completed and published pieces have distinct names, icons and tones', async () => {
  const { pieceStatusPresentation } = await import('../src/components/modules/ContentPlan/pieceStatusPresentation.js');
  const states = ['APROBADO', 'REALIZADO', 'PUBLICADO'].map(status => pieceStatusPresentation({ status }));
  assert.deepEqual(states.map(state => state.label), ['Aprobada', 'Realizada', 'Publicada']);
  assert.equal(new Set(states.map(state => state.icon)).size, 3);
  assert.equal(new Set(states.map(state => state.dot)).size, 3);
  assert.equal(new Set(states.map(state => state.chip)).size, 3);
});

test('new material takes precedence over completion without reopening a published piece', async () => {
  const { pieceStatusPresentation } = await import('../src/components/modules/ContentPlan/pieceStatusPresentation.js');
  assert.equal(pieceStatusPresentation({ status: 'REALIZADO', revisionRequestedAt: '2026-11-05' }, { publicView: true }).label, 'Material nuevo');
  assert.equal(pieceStatusPresentation({ status: 'PUBLICADO', revisionRequestedAt: '2026-11-05' }, { publicView: true }).label, 'Publicada');
  assert.equal(pieceStatusPresentation({ status: 'EN_PRODUCCION' }, { publicView: true }).label, 'Por revisar');
});
