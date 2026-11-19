import test from 'node:test';
import assert from 'node:assert/strict';
import { brandSheetEvidence, brandSheetSummary } from '../src/lib/brandEvidence.js';
import { briaAssistantTools } from '../src/services/briaAssistantTools.js';
import { buildBriaReviewRequest } from '../src/services/briaContentPlanReviewGenerator.js';

const brand = {
  id: 'b1', clientId: 'c1', revision: 3,
  tagline: 'Del campo a tu mesa', voice: 'Cercana, alegre, sin tecnicismos',
  usageNotes: 'No usar el magenta sobre verdes.',
  colors: [{ hex: '#5fb34e', role: 'PRINCIPAL', name: 'Verde' }, { name: 'sin hex' }],
  fonts: [{ family: 'Catamaran', use: 'TEXTOS' }, { family: '' }]
};

test('la ficha se resume en voz, reglas, colores y tipografías', () => {
  const text = brandSheetSummary(brand);
  assert.match(text, /Frase de marca: Del campo a tu mesa/);
  assert.match(text, /Voz y tono: Cercana/);
  assert.match(text, /Reglas de uso: No usar el magenta/);
  assert.match(text, /Colores: Verde #5FB34E principal/);
  assert.match(text, /Tipografías: Catamaran \(textos\)/);
  assert.doesNotMatch(text, /sin hex/);
});

test('una ficha vacía no aporta evidencia', () => {
  assert.equal(brandSheetEvidence(null), null);
  assert.equal(brandSheetEvidence({ id: 'x', colors: [], fonts: [] }), null);
});

test('la evidencia cambia de id cuando el equipo edita la ficha', () => {
  const one = brandSheetEvidence(brand, { clientName: 'Mampuján' });
  assert.equal(one.sourceKind, 'BRAND_SHEET');
  assert.equal(one.id, 'brand:b1:r3');
  assert.equal(one.title, 'Ficha de marca · Mampuján');
  assert.equal(brandSheetEvidence({ ...brand, revision: 4 }).id, 'brand:b1:r4');
});

test('la revisión de parrillas le explica a Bria qué es la ficha solo cuando la tiene', () => {
  const batch = { plan: { id: 'p1' }, items: [] };
  const withBrand = JSON.stringify(buildBriaReviewRequest(batch, [brandSheetEvidence(brand)]));
  const without = JSON.stringify(buildBriaReviewRequest(batch, []));
  assert.match(withBrand, /BRAND_SHEET es la ficha de marca/);
  assert.doesNotMatch(without, /BRAND_SHEET es la ficha de marca/);
});

test('ficha_de_marca abre con Clientes y devuelve la ficha legible', async () => {
  const tool = briaAssistantTools.find((item) => item.name === 'ficha_de_marca');
  assert.ok(tool);
  assert.equal(tool.allowed({ role: 'EDITOR', modulePermissions: {} }), false);
  const db = { clientBrand: { findUnique: async ({ where }) => (where.clientId === 'c1' ? {
    ...brand, manualUrl: null, client: { name: 'Mampuján', slug: 'mampujan' },
    files: [{ kind: 'LOGO', label: 'Imagotipo' }, { kind: 'MANUAL', label: 'Manual de marca' }]
  } : null) } };
  const out = await tool.run({ clientId: 'c1' }, { db });
  assert.equal(out.data.cliente, 'Mampuján');
  assert.match(out.data.ficha, /Voz y tono/);
  assert.deepEqual(out.data.logos, ['Imagotipo']);
  assert.equal(out.data.tieneManual, true);
  assert.equal(out.sources[0].url, '/clientes?tab=marcas&cliente=mampujan');
  const missing = await tool.run({ clientId: 'c2' }, { db });
  assert.equal(missing.data.ficha, null);
});
