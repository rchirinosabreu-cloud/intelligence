import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createWhatsAppLinkRepository } from '../src/services/whatsappLinkRepository.js';

// Los avisos por WhatsApp contra PostgreSQL real (22 de octubre de 2026). Solo con la base aislada de pruebas; usa
// una persona de muestra y la borra al terminar.

const connectionString = briaTestDatabaseUrl();
const USER = 'pg-whatsapp-alerts-user';

test('real PostgreSQL: el vínculo abre la ventana, las preferencias se guardan y cada aviso queda una sola vez', { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, max: 2 });
  const clean = async () => {
    await pool.query('DELETE FROM bria_memory.whatsapp_alerts WHERE user_id=$1', [USER]).catch(() => {});
    await pool.query('DELETE FROM bria_memory.whatsapp_links WHERE user_id=$1', [USER]).catch(() => {});
    await pool.query('DELETE FROM bria_memory.whatsapp_link_codes WHERE user_id=$1', [USER]).catch(() => {});
  };
  try {
    for (let i = 0; i < 2; i += 1) await pool.query(await readFile(new URL('../scripts/sql/bria-whatsapp.sql', import.meta.url), 'utf8'));
    await clean();
    const repo = createWhatsAppLinkRepository({ pool });
    const at = new Date('2099-01-05T15:00:00Z');
    assert.equal(await repo.createCode({ userId: USER, code: '990011', expiresAt: new Date('2099-01-05T16:00:00Z') }), true);
    assert.deepEqual(await repo.consumeCode({ code: '990011', waId: 'CO.PG990011', phone: '573009990011', profileName: 'Prueba', now: at }), { ok: true, userId: USER });
    const linked = await repo.linkByUser(USER);
    assert.equal(linked.lastInboundAt.toISOString(), at.toISOString(), 'mandar el código abre la ventana');
    assert.deepEqual(linked.alertsOff, [], 'vienen encendidos');
    await repo.setAlertsOff(USER, ['PULSE']);
    await repo.markInbound(USER, new Date('2099-01-05T18:00:00Z'));
    const after = await repo.linkByUser(USER);
    assert.deepEqual([after.alertsOff, after.lastInboundAt.toISOString()], [['PULSE'], '2099-01-05T18:00:00.000Z']);

    const saved = await repo.saveAlert({ userId: USER, kind: 'ACCESS', sourceRef: 'vault:pg-r1', topic: 'un pedido de acceso', text: 'Camila necesita la contraseña de CapCut.', buttons: [{ label: 'Compartir', act: 'VAULT_APPROVE', ref: 'pg-r1' }], createdAt: at });
    assert.equal(saved.status, 'PENDING');
    assert.deepEqual(saved.buttons, [{ label: 'Compartir', act: 'VAULT_APPROVE', ref: 'pg-r1' }]);
    assert.equal(await repo.saveAlert({ userId: USER, kind: 'ACCESS', sourceRef: 'vault:pg-r1', text: 'otra vez', createdAt: at }), null, 'el mismo origen no se guarda dos veces');
    assert.equal(await repo.alertsSince(USER, new Date('2099-01-05T00:00:00Z')), 1);
    await repo.markAlertSent(saved.id, 'TEMPLATE');
    await repo.markAlertOpened(saved.id, new Date('2099-01-05T19:00:00Z'));
    const read = await repo.alertById(saved.id);
    assert.deepEqual([read.status, read.via, read.openedAt.toISOString(), read.userId], ['SENT', 'TEMPLATE', '2099-01-05T19:00:00.000Z', USER]);
    assert.equal(read.conversationId, null, 'los avisos anteriores conservan su forma sin conversación fuente');
    const conversationId = '86c579ab-b2f3-4b8b-90ba-57e693342dd5';
    const morning = await repo.saveAlert({ userId: USER, kind: 'DAILY', sourceRef: 'LECTURA_MANANA:2099-01-05', text: 'Revisemos las decisiones de hoy.', conversationId, createdAt: at });
    assert.equal(morning.conversationId, conversationId);
    assert.equal((await repo.alertById(morning.id)).conversationId, conversationId, 'la selección puede recuperar su chat después del envío');
    await repo.markAlertFailed(saved.id, 'Meta no lo aceptó');
    assert.equal((await repo.alertById(saved.id)).error, 'Meta no lo aceptó');
    assert.equal(await repo.alertById('no-es-un-id'), null);
    await assert.rejects(pool.query("INSERT INTO bria_memory.whatsapp_alerts(id,user_id,kind,source_ref,text) VALUES(gen_random_uuid(),$1,'SEMAFORO','x','y')", [USER]), /check/i, 'el semáforo no es un tipo de aviso');
  } finally {
    await clean();
    await pool.end();
  }
});
