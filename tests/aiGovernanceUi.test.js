import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
test('el control explica el bloqueo de flujos compartidos y los límites externos', () => {
  const source = readFileSync('src/components/modules/Governance/GovernanceCenter.jsx', 'utf8');
  assert.match(source, /flujos sin cliente identificado/);
  assert.match(source, /herramientas externas/);
  assert.doesNotMatch(source, /Activar control de parrillas|Este interruptor no los bloquea/);
});
test('el listado distingue carga, error, vacío y vencimiento; nunca afirma envío de correo', async () => {
  const outfile = path.resolve('output/governance-ui-test.mjs');
  await build({ entryPoints: ['src/components/modules/Governance/GovernanceRecords.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
  const { default: Records } = await import(pathToFileURL(outfile));
  const html = props => renderToStaticMarkup(React.createElement(Records, { kind: 'incidents', onEdit() {}, onHistory() {}, ...props }));
  assert.match(html({ loading: true }), /Cargando/);
  assert.match(html({ error: new Error('No autorizado') }), /No se pudo cargar/);
  assert.doesNotMatch(html({ error: new Error('No autorizado') }), /Sin registros/);
  assert.match(html({ items: [] }), /Sin registros/);
  const populated = html({ items: [{ id: 'i', name: 'Prueba', status: 'OPEN', version: 1, data: {}, notificationDueAt: '2026-01-01T15:00:00Z', notificationOverdue: true }] });
  assert.match(populated, /Plazo de aviso vencido/); assert.match(populated, /Historial/);
});
