// Appends one fictional run to the existing isolated database. Does not prepare/reset schemas.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTaskPieceFixture, finalPiecePng, seedTaskPieceExternalPeriods, taskPieceOutput } from '../tests/support/taskPieceFixture.js';

const fixture = await createTaskPieceFixture({ port: Number(process.env.TASK_PIECE_PORT || 8092) });
const externalPeriods = await seedTaskPieceExternalPeriods(fixture);
await mkdir(taskPieceOutput, { recursive: true });
await writeFile(path.join(taskPieceOutput, 'pieza-final-ejemplo.png'), finalPiecePng);
const information = {
  apiOrigin: fixture.api.origin, database: '127.0.0.1:55451/shared_tasks_demo', runId: fixture.runId,
  client: { id: fixture.client.id, name: fixture.client.name, slug: fixture.client.slug },
  users: Object.fromEntries(Object.entries(fixture.actors).map(([key, actor]) => [key, { name: actor.name, email: actor.email, password: actor.password }])),
  plans: fixture.plans.map(plan => ({ id: plan.id, month: plan.month, year: plan.year })),
  pieces: fixture.pieces,
  externalPeriods,
  sampleFile: path.join(taskPieceOutput, 'pieza-final-ejemplo.png'),
  note: 'Login, API, persistencia y subidas reales; almacenamiento HTTP ficticio local (máximo 16 MB por archivo). Carlos tiene tarea compartida y no tiene permiso de Parrillas. Ningún servicio externo ni publicación real. La memoria del almacenamiento dura mientras viva este proceso.'
};
await writeFile(path.join(taskPieceOutput, 'preview-access.json'), JSON.stringify(information, null, 2));
console.log('TASK_PIECE_PREVIEW_READY');
console.log(JSON.stringify({ apiOrigin: information.apiOrigin, runId: information.runId, access: path.join(taskPieceOutput, 'preview-access.json') }));
const close = async () => { await fixture.close(); process.exit(0); };
process.once('SIGINT', close); process.once('SIGTERM', close);
