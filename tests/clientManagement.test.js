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

  assert.match(clientsView, /setShowArchived\(!showArchived\)/);
  assert.doesNotMatch(
    clientsView,
    /setShowArchived\(false\)/,
    'the outside-click handler must not immediately close archived clients'
  );
});
