import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('client creation uses the Prisma ClientStatus enum accepted by PostgreSQL', async () => {
  const schema = await read('prisma/schema.prisma');
  const service = await read('src/services/clientService.js');

  assert.match(schema, /enum ClientStatus\s*\{[\s\S]*ACTIVO[\s\S]*\}/);
  assert.match(service, /status:\s*'ACTIVO'/);
  assert.doesNotMatch(service, /status:\s*'active'/);
});

test('clients view can keep the archived section open after clicking its toggle', async () => {
  const clientsView = await read('src/components/modules/Clients.jsx');

  // La selección ahora vive en la URL para sobrevivir al regreso desde una ficha y a la recarga.
  assert.match(clientsView, /const showArchived = searchParams\.get\('directoryArchived'\) === '1'/);
  assert.match(clientsView, /onClick=\{\(\) => updateFilter\('directoryArchived', showArchived \? '' : '1'\)\} aria-expanded=\{showArchived\}/);
  assert.match(clientsView, /\{showArchived && \([\s\S]*?aria-label="Clientes inactivos"/);
  assert.equal((clientsView.match(/updateFilter\(['"]directoryArchived['"]/g) || []).length, 1,
    'only the explicit toggle changes archived visibility; an outside-click handler must not close it');
  assert.match(clientsView, /const next = new URLSearchParams\(location\.search\)/,
    'toggling archived clients preserves the other directory filters');
  assert.match(clientsView, /setSearchParams\(next, \{ replace: true, state: location\.state \}\)/,
    'toggling archived clients preserves the navigation origin');
});
