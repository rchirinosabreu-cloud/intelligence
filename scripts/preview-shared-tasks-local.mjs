// Preview persistente sobre datos ficticios y PostgreSQL 55451. No carga .env.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareSharedTaskDatabase, sharedTaskOutput } from '../tests/support/sharedTaskSandbox.js';
import { createSharedTaskApiFixture } from '../tests/support/sharedTaskApiFixture.js';
import { startSharedTaskWebFixture } from '../tests/support/sharedTaskWebFixture.js';

await prepareSharedTaskDatabase();
const fixture = await createSharedTaskApiFixture();
let web;
try {
  const dueDate = new Date().toISOString();
  const pending = await fixture.createTask('Compartida · prueba desde cero', { dueDate });
  let partial = await fixture.createTask('Compartida · Ana terminó, Bea trabaja, Carlos pendiente', { dueDate });
  partial = (await fixture.move(partial, 'ana', 'EN_CURSO')).data;
  partial = (await fixture.move(partial, 'bea', 'EN_CURSO')).data;
  partial = (await fixture.move(partial, 'ana', 'REALIZADA')).data;
  web = await startSharedTaskWebFixture(fixture.api.origin);
  const information = { url: web.origin + '/gestion', database: '127.0.0.1:55451/shared_tasks_demo', runId: fixture.runId,
    client: fixture.client.name, password: fixture.actors.ana.password,
    users: Object.fromEntries(['ana', 'bea', 'carlos', 'manager'].map(key => [key, { name: fixture.actors[key].name, email: fixture.actors[key].email }])),
    tasks: { fromZero: pending.id, partial: partial.id },
    note: 'Gestión y login reales, datos ficticios; no monta los demás módulos. Selecciona este cliente. Responsable: Todos muestra una tarjeta por persona con el mismo Task ID.' };
  await writeFile(path.join(sharedTaskOutput, 'preview-access.json'), JSON.stringify(information, null, 2));
  console.log('SHARED_TASK_PREVIEW_READY');
  console.log(JSON.stringify(information, null, 2));
  const stop = async () => { await web?.close(); await fixture.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch (error) { await web?.close(); await fixture.close(); throw error; }
