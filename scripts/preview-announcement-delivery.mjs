import express from 'express';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import config from '../tailwind.config.js';
import { financialCorrectionDatabase } from '../tests/support/financialCorrectionDatabase.js';
import { createAnnouncementDeliveryRouter } from '../src/routes/api/announcementDelivery.js';
import { createImportantNoticeRouter } from '../src/routes/api/importantNotices.js';
import * as notices from '../src/services/importantNoticeService.js';
import * as announcements from '../src/services/announcementDeliveryService.js';
import { getDashboardAnnouncements } from '../src/services/personalDashboardService.js';

export async function createAnnouncementPreview({ port = 3851 } = {}) {
  process.env.TEST_DATABASE_URL ||= 'postgresql://recognition_test@127.0.0.1:55448/recognition_test';
  const fixture = await financialCorrectionDatabase({ additionalTables: ['TeamMember', 'GlobalAnnouncement', 'AnnouncementDelivery', 'AnnouncementEvent', 'ImportantNotice', 'Notification', 'OperationalTraceEvent'] });
  const { db } = fixture;
  const manager = { userId: fixture.actor.id, role: 'ADMIN', name: 'Dirección · muestra' };
  let actor = { userId: 'demo-reader', role: 'VIEWER', name: 'Ana · muestra' };
  let now = new Date();
  await db.teamMember.create({ data: { name: manager.name, email: 'announcement-admin@example.invalid', role: 'Dirección', userId: manager.userId } });
  for (const [id, name] of [['demo-reader', 'Ana · muestra'], ['demo-other', 'Camila · muestra']]) {
    await db.user.create({ data: { id, name, email: `${id}@example.invalid`, password: 'local-only', role: 'VIEWER', modulePermissions: { financiero: false, crm: false } } });
    await db.teamMember.create({ data: { name, email: `${id}@example.invalid`, role: 'Community manager', userId: id } });
  }
  const add = async () => announcements.publishAnnouncement(db, { requestId: randomUUID(), content: '<h2>Prioridades de esta semana</h2><p>El martes revisaremos juntos los cierres de los clientes y las entregas de la semana.</p><p>La reunión será a las <strong>9:00 a. m.</strong> Traigan las observaciones que ya tienen registradas en la plataforma.</p><p>Gracias, equipo.</p>' }, manager, { now });
  await add();
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = actor; res.set('Cache-Control', 'no-store'); next(); });
  const run = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { console.error('[Muestra anuncios]', e.message); res.status(e.statusCode || 500).json({ error: e.message }); } };
  app.get('/api/preview/state', run(async () => ({ actor, announcements: await getDashboardAnnouncements(actor.userId, { db }), deliveries: await db.announcementDelivery.findMany(), events: await db.announcementEvent.findMany() })));
  app.post('/api/preview/new', run(async () => { now = new Date(now.getTime() + 6 * 60000); return add(); }));
  app.post('/api/preview/actor', run(async req => { actor = req.body.manager ? manager : { userId: 'demo-reader', role: 'VIEWER', name: 'Ana · muestra' }; return { ok: true }; }));
  app.use('/api/dashboard/announcements', createAnnouncementDeliveryRouter({ db, service: { ...announcements, respondAnnouncement: (db, id, body, actor) => announcements.respondAnnouncement(db, id, body, actor, { now }) } }));
  app.post('/api/dashboard/announcements', run(req => announcements.publishAnnouncement(db, req.body, actor, { now })));
  app.patch('/api/dashboard/announcements/GLOBAL/:id', run(req => announcements.changeAnnouncement(db, req.params.id, req.body, actor, { now })));
  app.delete('/api/dashboard/announcements/GLOBAL/:id', run(req => announcements.archiveAnnouncement(db, req.params.id, req.body, actor, { now })));
  app.use('/api/important-notices', createImportantNoticeRouter({ db, clock: () => now, service: { ...notices,
    currentImportantNotice: (db, userId, now) => notices.currentImportantNotice(db, userId, now, { operationalSource: async () => [], overduePlans: async () => [] }) } }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Solo datos ficticios de esta muestra.' }));
  const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'output/announcement-preview'); await mkdir(out, { recursive: true });
  await build({ entryPoints: [path.join(root, 'tests/fixtures/announcement-delivery.jsx')], outfile: path.join(out, 'preview.js'), bundle: true, format: 'esm', jsx: 'automatic',
    alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.VITE_API_URL': 'window.location.origin' }, loader: { '.css': 'empty' }, logLevel: 'silent' });
  const css = await postcss([tailwind({ ...config, content: [...config.content, './tests/fixtures/announcement-delivery.jsx'] }), autoprefixer]).process(await readFile(path.join(root, 'src/index.css'), 'utf8'), { from: path.join(root, 'src/index.css') });
  await writeFile(path.join(out, 'preview.css'), css.css);
  app.use(express.static(out)); app.get('*', (_req, res) => res.type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anuncios · muestra local</title><link rel="stylesheet" href="/preview.css"><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>'));
  const server = await new Promise(resolve => { const s = app.listen(port, '127.0.0.1', () => resolve(s)); });
  return { origin: `http://127.0.0.1:${server.address().port}`, db, close: async () => { await new Promise(resolve => server.close(resolve)); await fixture.close(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createAnnouncementPreview(); console.log(`Vista local: ${preview.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await preview.close(); process.exit(0); });
}
