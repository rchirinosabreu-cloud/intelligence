import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeResponsePolicy, noticeAllows } from '../src/lib/alertResponsePolicy.js';
import { getDashboardAnnouncements } from '../src/services/personalDashboardService.js';
import { announcementExcerpt } from '../src/services/announcementDeliveryService.js';

test('el extracto separa párrafos y termina en palabras completas', () => {
  assert.equal(announcementExcerpt('<h2>Aviso</h2><p>Texto</p>'), 'Aviso Texto');
  const preview = announcementExcerpt('<p>' + 'palabra '.repeat(40) + '</p>');
  assert.match(preview, /palabra…$/);
  assert.ok(preview.length <= 160);
});

test('un anuncio permite abrir en el lugar o cerrar sin declarar lectura ni cumplimiento', () => {
  const notice = { kind: 'ANUNCIO_GENERAL' };
  assert.equal(noticeResponsePolicy(notice)?.family, 'ANNOUNCEMENT');
  assert.equal(noticeAllows(notice, 'preview'), true);
  assert.equal(noticeAllows(notice, 'dismiss'), true);
  assert.equal(noticeAllows(notice, 'acknowledge'), false);
  assert.equal(noticeAllows(notice, 'close'), false);
});

test('el historial no inventa lectura para un anuncio general legado', async () => {
  const rows = await getDashboardAnnouncements('reader', { db: {
    globalAnnouncement: { findMany: async () => [{ id: 'legacy', content: 'Mensaje', createdAt: new Date(), deliveries: [] }] },
    notification: { findMany: async () => [] },
  } });
  assert.equal(rows[0].isRead, false);
  assert.equal(rows[0].openedAt, null);
});
