// La tarjeta «Buzones que lee Bria» en Actividad (11 de octubre de 2026): la contraseña se pega una vez en un campo
// de contraseña, nunca se rellena desde el servidor; conectar es de administradores; el aviso de correo abre Gmail
// en otra pestaña. Contratos de código fuente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const card = readFileSync('src/components/modules/Activity/MailboxConnections.jsx', 'utf8');
const calendar = readFileSync('src/components/modules/Activity/OperationalCalendar.jsx', 'utf8');
const nudge = readFileSync('src/components/bria/BriaNudge.jsx', 'utf8');
const routes = readFileSync('src/routes/index.js', 'utf8');
const server = readFileSync('scripts/ensure-bria-knowledge-schema.js', 'utf8');

test('the card lives in Actividad next to the Google connections and only admins can connect, test or remove', () => {
  assert.match(calendar, /import MailboxConnections from '\.\/MailboxConnections'/);
  assert.match(calendar, /<MailboxConnections isAdmin=\{currentUser\?\.role === 'ADMIN'\}/);
  assert.match(card, /\{isAdmin && !open && <button/);
  assert.match(card, /\{isAdmin && open && \(/);
  assert.match(card, /Buzones que lee Bria/);
  assert.match(card, /no envía ni guarda el contenido/);
});

test('the app password is typed once into a password field, posted and never read back; the form explains where to get it', () => {
  assert.match(card, /type="password" required autoComplete="off" value=\{password\}/);
  assert.match(card, /body: \{ email, label, appPassword: password \}/);
  assert.match(card, /setPassword\(''\)/);
  assert.doesNotMatch(card, /account\.secret|appPassword:\s*account/);
  assert.match(card, /Contraseñas de aplicaciones/);
  assert.ok(card.indexOf('toast.success') > card.indexOf("await request('/accounts', { method: 'POST'"), 'success only after the server answered');
  assert.match(card, /confirmLabel: 'Quitar', destructive: true/);
});

test('mail actions open Gmail in a new tab, the route is mounted under /api/bria and the schema is applied at start-up', () => {
  assert.match(nudge, /item\.to && \(item\.external \|\| \/\^https\?:\\\/\\\/\/\.test\(item\.to\)\)/);
  assert.match(nudge, /target="_blank" rel="noopener noreferrer"/);
  assert.match(routes, /router\.use\('\/bria\/mail', createBriaMailRouter\(\)\);/);
  assert.match(server, /bria-mail\.sql/);
  for (const source of [card]) {
    assert.match(source, /dark:bg-zinc-900/);
    assert.doesNotMatch(source, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald|amber|orange)-/);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{6}/);
    assert.doesNotMatch(source, /vosotros|tenéis|podéis/);
  }
});
