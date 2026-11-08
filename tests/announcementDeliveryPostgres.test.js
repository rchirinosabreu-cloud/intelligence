import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialCorrectionDatabase } from './support/financialCorrectionDatabase.js';
import pg from 'pg';
import { ensureAnnouncementDeliverySchema } from '../scripts/ensure-announcement-delivery-schema.js';
import { ensureAuditImmutability, AUDIT_TABLES } from '../src/lib/auditImmutability.js';
import { currentImportantNotice } from '../src/services/importantNoticeService.js';

test('anuncios: entrega única, respuestas personales, revisiones, archivo y permisos actuales', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const module = await import('../src/services/announcementDeliveryService.js').catch(() => null);
  assert.ok(module, 'Debe existir el servicio nativo de entrega y respuesta de anuncios');
  const fixture = await financialCorrectionDatabase({ additionalTables: ['TeamMember', 'GlobalAnnouncement', 'AnnouncementDelivery', 'AnnouncementEvent', 'ImportantNotice', 'Notification'] });
  const db = fixture.db;
  try {
    const manager = { userId: fixture.actor.id, role: 'ADMIN' };
    await db.teamMember.create({ data: { name: 'Administración', email: 'admin@example.invalid', role: 'Dirección', userId: manager.userId } });
    for (const id of ['reader', 'other', 'inactive']) {
      await db.user.create({ data: { id, name: id, email: `${id}@example.invalid`, password: 'local', role: 'VIEWER', isActive: id !== 'inactive' } });
      await db.teamMember.create({ data: { name: id, email: `${id}@example.invalid`, role: 'Community', userId: id } });
    }
    const body = { content: '<p>Reunión del equipo <strong>el martes</strong>.</p>', requestId: randomUUID() };
    const a = await module.publishAnnouncement(db, body, manager);
    const repeated = await module.publishAnnouncement(db, body, manager);
    assert.equal(a.id, repeated.id);
    assert.equal(await db.globalAnnouncement.count(), 1);
    assert.equal(await db.announcementDelivery.count(), 2);
    assert.equal(await db.importantNotice.count(), 2);
    assert.equal(await db.notification.count(), 0, 'no segunda campana ni push');
    const current = await currentImportantNotice(db, 'reader', new Date(), { operationalSource: async () => [] });
    assert.equal(current.notice.announcement.id, a.id);
    assert.equal(current.notice.announcement.revision, 1);
    assert.equal(current.notice.pendingAnnouncements, 1);
    await assert.rejects(module.publishAnnouncement(db, { ...body, content: 'Otro contenido' }, manager), { statusCode: 409 });
    assert.equal((await module.previewAnnouncement(db, a.id, { userId: 'reader' })).content, body.content);
    assert.equal((await db.announcementDelivery.findFirst({ where: { userId: 'reader' } })).openedAt, null, 'consultar no acredita apertura');
    await assert.rejects(module.respondAnnouncement(db, a.id, { action: 'open', expectedRevision: 1 }, { userId: 'inactive' }), { statusCode: 403 });
    await assert.rejects(module.respondAnnouncement(db, a.id, { action: 'accept', expectedRevision: 1 }, { userId: 'reader' }), { statusCode: 400 });
    await module.respondAnnouncement(db, a.id, { action: 'dismiss', expectedRevision: 1 }, { userId: 'reader' });
    let receipt = await db.announcementDelivery.findFirst({ where: { userId: 'reader' } });
    assert.equal(receipt.openedAt, null);
    assert.ok(receipt.dismissedAt);
    assert.equal(await db.importantNotice.count({ where: { resolvedAt: null } }), 1);
    await module.respondAnnouncement(db, a.id, { action: 'dismiss', expectedRevision: 1 }, { userId: 'reader' });
    assert.equal(await db.announcementEvent.count({ where: { action: 'DISMISSED' } }), 1);
    await module.respondAnnouncement(db, a.id, { action: 'open', expectedRevision: 1 }, { userId: 'reader' });
    receipt = await db.announcementDelivery.findFirst({ where: { userId: 'reader' } });
    assert.ok(receipt.openedAt && receipt.dismissedAt, 'abrir después conserva ambas evidencias');
    const edit = await module.changeAnnouncement(db, a.id, { content: 'Nuevo horario', expectedRevision: 1 }, manager);
    assert.equal(edit.revision, 2);
    await assert.rejects(module.respondAnnouncement(db, a.id, { action: 'open', expectedRevision: 1 }, { userId: 'other' }), { statusCode: 409 });
    await assert.rejects(module.changeAnnouncement(db, a.id, { content: 'Edición obsoleta', expectedRevision: 1 }, manager), { statusCode: 409 });
    assert.equal(await db.importantNotice.count(), 2, 'corregir no reemite ni revive avisos atendidos');
    await module.respondAnnouncement(db, a.id, { action: 'open', expectedRevision: 2 }, { userId: 'other' });
    const history = await module.announcementHistory(db, a.id, manager);
    assert.equal(history.deliveries.length, 2);
    assert.ok(history.events.some(e => e.action === 'EDITED' && e.content === body.content));
    await assert.rejects(module.announcementHistory(db, a.id, { userId: 'reader' }), { statusCode: 403 });
    // Una respuesta de otra pestaña se conserva una sola vez, aun si se pierde la respuesta HTTP.
    await Promise.all([1, 2].map(() => module.respondAnnouncement(db, a.id, { action: 'open', expectedRevision: 2 }, { userId: 'other' })));
    assert.equal(await db.announcementEvent.count({ where: { action: 'OPENED', actorId: 'other' } }), 1);
    await module.archiveAnnouncement(db, a.id, { expectedRevision: 2 }, manager);
    assert.equal(await db.globalAnnouncement.count(), 1);
    assert.ok((await db.globalAnnouncement.findUnique({ where: { id: a.id } })).archivedAt);
    assert.equal(await db.importantNotice.count({ where: { resolvedAt: null } }), 0);
    await assert.rejects(module.respondAnnouncement(db, a.id, { action: 'open', expectedRevision: 3 }, { userId: 'reader' }), { statusCode: 409 });
    await db.user.update({ where: { id: manager.userId }, data: { role: 'VIEWER' } });
    await assert.rejects(module.publishAnnouncement(db, { ...body, requestId: randomUUID() }, manager), { statusCode: 403 }, 'no confiar en el rol de la sesión');
  } finally { await fixture.close(); }
});

test('el esquema aditivo conserva legados; el historial es inmutable y una escritura fallida no entrega avisos', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const module = await import('../src/services/announcementDeliveryService.js');
  const fixture = await financialCorrectionDatabase({ additionalTables: ['TeamMember', 'GlobalAnnouncement', 'AnnouncementDelivery', 'AnnouncementEvent', 'ImportantNotice', 'Notification'] });
  const { db } = fixture;
  const url = new URL(fixture.databaseUrl), schema = url.searchParams.get('schema');
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    await db.teamMember.create({ data: { name: 'Admin', email: 'admin@test.invalid', role: 'Dirección', userId: fixture.actor.id } });
    await db.globalAnnouncement.create({ data: { id: 'legacy', content: 'Contenido histórico', type: 'info' } });
    await db.globalAnnouncement.create({ data: { id: 'long-legacy', content: 'Contenido anterior '.repeat(2000), type: 'info' } });
    assert.ok((await module.previewAnnouncement(db, 'long-legacy', { userId: fixture.actor.id })).content.length > 30000, 'no recortar ni rechazar el contenido anterior');
    await client.query('ALTER TABLE "GlobalAnnouncement" DROP COLUMN revision, DROP COLUMN "requestId", DROP COLUMN "archivedAt"');
    await ensureAnnouncementDeliverySchema(client); await ensureAnnouncementDeliverySchema(client);
    assert.equal((await db.globalAnnouncement.findUnique({ where: { id: 'legacy' } })).content, 'Contenido histórico');
    assert.equal(await db.announcementDelivery.count(), 0);
    assert.equal(await db.announcementEvent.count(), 0, 'no inventar eventos históricos');
    const actor = { userId: fixture.actor.id };
    const a = await module.publishAnnouncement(db, { requestId: randomUUID(), content: 'Anuncio protegido' }, actor);
    await ensureAuditImmutability(client, { functionSchema: schema, tables: AUDIT_TABLES.filter(t => t.name === 'AnnouncementEvent').map(t => ({ ...t, schema })) });
    await assert.rejects(client.query('UPDATE "AnnouncementEvent" SET action = \'OPENED\''));
    await assert.rejects(client.query('DELETE FROM "AnnouncementEvent"'));
    await assert.rejects(db.globalAnnouncement.delete({ where: { id: a.id } }), { code: 'P2003' });
    await client.query(`CREATE FUNCTION reject_announcement_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated event failure'; END $$`);
    await client.query('CREATE TRIGGER reject_announcement_event BEFORE INSERT ON "AnnouncementEvent" FOR EACH ROW EXECUTE FUNCTION reject_announcement_event()');
    const counts = [await db.globalAnnouncement.count(), await db.importantNotice.count()];
    await assert.rejects(module.publishAnnouncement(db, { requestId: randomUUID(), content: 'No debe persistir' }, actor), /simulated event failure/);
    assert.deepEqual([await db.globalAnnouncement.count(), await db.importantNotice.count()], counts);
    await client.query('DROP TRIGGER reject_announcement_event ON "AnnouncementEvent"');
    const request = { requestId: randomUUID(), content: 'Una sola publicación concurrente' };
    const both = await Promise.all([module.publishAnnouncement(db, request, actor), module.publishAnnouncement(db, request, actor)]);
    assert.equal(both[0].id, both[1].id);
  } finally { await client.end(); await fixture.close(); }
});
