import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Contrato de pantalla de «Reportar un incidente» y del registro único (12 de octubre de 2026).
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dialog = read('src/components/security/IncidentReportDialog.jsx');
const profile = read('src/components/layout/SidebarProfile.jsx');

test('la entrada vive en el menú de cuenta, que ve todo el equipo, y abre el diálogo', () => {
  assert.match(profile, /Reportar un incidente/);
  assert.match(profile, /<IncidentReportDialog/);
  // Entre Ajustes y Cerrar sesión: no compite con la navegación de trabajo.
  const item = profile.indexOf('<span>Reportar un incidente</span>');
  assert.ok(profile.indexOf('<span>Ajustes</span>') < item);
  assert.ok(item < profile.indexOf('<span>Cerrar sesión</span>'));
  assert.doesNotMatch(profile, /role === 'ADMIN'[\s\S]{0,80}Reportar un incidente/, 'no depende del rol');
});

test('el diálogo usa los controles compartidos y pregunta lo mínimo en español llano', () => {
  assert.match(dialog, /from '@\/components\/ui\/dialog'/);
  assert.match(dialog, /import Select from '@\/components\/ui\/Select'/);
  assert.match(dialog, /BrainDateTimePicker/);
  assert.doesNotMatch(dialog, /<select|type="date|type="datetime-local|type="time/);
  for (const text of ['¿Qué pasó?', '¿Cuándo pasó?', '¿Tiene que ver con un cliente?', '¿Qué cliente?', 'No sé', 'Enviar reporte']) assert.match(dialog, new RegExp(text.replace(/[?¿]/g, '\\$&')));
  assert.match(dialog, /\/api\/incident-reports/);
  assert.match(dialog, /\/api\/clients/);
  assert.doesNotMatch(dialog, /vosotros|podéis|tenéis/);
});

test('el aviso de éxito sale solo después de la respuesta del servidor, en una línea y sin emojis', () => {
  const submit = dialog.slice(dialog.indexOf('const submit'), dialog.indexOf('const submit') + 1600);
  assert.ok(submit.indexOf('await fetch') > -1 && submit.indexOf('await fetch') < submit.indexOf('toast.success'));
  assert.match(submit, /console\.error/);
  const message = dialog.match(/toast\.success\('([^']+)'/)[1];
  assert.ok(message.length <= 70, message);
  assert.doesNotMatch(message, /\p{Extended_Pictographic}/u);
});

test('los colores salen de los tokens, en claro y en oscuro', () => {
  assert.doesNotMatch(dialog, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald)-/);
  assert.doesNotMatch(dialog, /#[0-9a-fA-F]{6}\b/);
  assert.match(dialog, /dark:/);
});

test('el aviso a administración se lee en español y abre los incidentes', async () => {
  const layout = read('src/components/layout/AppLayout.jsx');
  assert.match(layout, /notif\.type === 'SECURITY_INCIDENT_REPORTED'\) \{[\s\S]*?navigate\('\/gobierno-ia\?tab=incidents'\)/);
  const { getNotificationDisplayParts } = await import('../src/utils/notificationUtils.js');
  const parts = getNotificationDisplayParts({ type: 'SECURITY_INCIDENT_REPORTED', message: 'Ana reportó un incidente de seguridad. Revísalo en Gobierno de IA.' });
  assert.equal(parts.title, 'Reportaron un incidente de seguridad');
  assert.match(parts.body, /Ana reportó/);
  const center = read('src/components/modules/Governance/GovernanceCenter.jsx');
  assert.match(center, /get\('tab'\)/, 'el enlace del aviso abre la pestaña de incidentes');
});

test('el registro dice quién reportó, el tipo, y no inventa un plazo de aviso cuando no hay cliente', async () => {
  const outfile = path.resolve('output/governance-records-incidents-test.mjs');
  await build({ entryPoints: ['src/components/modules/Governance/GovernanceRecords.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
  const { default: Records } = await import(pathToFileURL(outfile));
  const html = (item) => renderToStaticMarkup(React.createElement(Records, { kind: 'incidents', onEdit() {}, onHistory() {}, items: [{ id: 'i', name: 'Reporte', status: 'OPEN', version: 1, ...item }] }));
  const noClient = html({ data: { incidentType: 'DEVICE_LOSS', affectsClient: 'NO', reportedByName: 'Ana Pérez', reportedAt: '2026-10-12T15:42:37.512Z' }, noticeRequired: false, notificationDueAt: null });
  assert.match(noClient, /Pérdida o robo de equipo/);
  assert.match(noClient, /Reportado por Ana Pérez/);
  assert.match(noClient, /No afecta a un cliente: no requiere aviso/);
  assert.doesNotMatch(noClient, /Fecha límite de aviso/);
  const unknown = html({ data: { affectsClient: 'NO_SE', reportedByName: 'Ana' }, noticeRequired: true, notificationDueAt: '2026-10-13T15:42:00Z' });
  assert.match(unknown, /Quien reportó no sabe si afecta a un cliente/);
  assert.match(unknown, /Sin tipo/);
  assert.match(unknown, /Fecha límite de aviso/);
});
