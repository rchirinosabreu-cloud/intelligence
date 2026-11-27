import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'isolated-announcement-image-tests-not-a-real-secret';
const {
  ANNOUNCEMENT_IMAGE_PREFIX,
  announcementImagePurgeDecision,
  announcementImageRetentionDays,
  assertAnnouncementImagesAttachable,
  setAnnouncementImages,
  signAnnouncementImageTicket,
  sweepAnnouncementImages,
  uploadAnnouncementImage,
  verifyAnnouncementImageTicket,
  withAnnouncementImages
} = await import('../src/services/announcementImageService.js');

// Imágenes en los anuncios (Rodny, 27 de noviembre de 2026): se suben al bucket compartido y el barrido las borra.
// Las sueltas (un anuncio que nunca se publicó) al día siguiente; las de un anuncio a los 30 días.

const AHORA = new Date('2026-11-27T12:00:00.000Z');
const hace = (horas) => new Date(AHORA.getTime() - horas * 3600 * 1000);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const HEIC = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]);
const GERENTE = { userId: 'pm', role: 'PROJECT_MANAGER' };

const fakeDb = (rows = []) => {
  const table = new Map(rows.map(row => [row.id, { position: 0, scope: null, announcementId: null, purgedAt: null, ...row }]));
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(part => matches(row, part));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('notIn' in value) return !value.notIn.includes(row[key]);
      if ('lt' in value) return row[key] < value.lt;
    }
    return row[key] === value;
  });
  return {
    table,
    announcementImage: {
      create: async ({ data }) => { const row = { position: 0, scope: null, announcementId: null, purgedAt: null, ...data }; table.set(row.id, row); return row; },
      delete: async ({ where }) => { const row = table.get(where.id); table.delete(where.id); return row; },
      findMany: async ({ where } = {}) => [...table.values()].filter(row => matches(row, where)).sort((a, b) => a.position - b.position),
      update: async ({ where, data }) => Object.assign(table.get(where.id), data),
      updateMany: async ({ where, data }) => { let count = 0; for (const row of table.values()) if (matches(row, where)) { Object.assign(row, data); count += 1; } return { count }; }
    }
  };
};

test('solo quien publica anuncios sube imágenes, y el tipo lo dicen los bytes', async () => {
  const db = fakeDb();
  const puestos = [];
  const storage = { put: async (object) => puestos.push(object), remove: async () => {} };
  await assert.rejects(uploadAnnouncementImage({ file: { buffer: PNG }, requester: { userId: 'e', role: 'EDITOR' } }, { db, storage }), { statusCode: 403 });
  await assert.rejects(uploadAnnouncementImage({ file: { buffer: HEIC, originalname: 'foto.jpg' }, requester: GERENTE }, { db, storage }), { statusCode: 415 });
  await assert.rejects(uploadAnnouncementImage({ file: { buffer: Buffer.from('no soy una imagen, aunque me llame así'), originalname: 'x.png' }, requester: GERENTE }, { db, storage }), { statusCode: 415 });
  const imagen = await uploadAnnouncementImage({ file: { buffer: PNG, originalname: 'cartel.png' }, requester: GERENTE }, { db, storage });
  assert.equal(puestos.length, 1);
  assert.ok(puestos[0].key.startsWith(ANNOUNCEMENT_IMAGE_PREFIX) && puestos[0].key.endsWith('.png'));
  assert.equal(puestos[0].contentType, 'image/png');
  assert.equal(imagen.removed, false);
  assert.match(imagen.url, /^\/api\/announcement-images\/[^?]+\?access_token=/);
});

test('si el bucket falla no queda una fila sin archivo', async () => {
  const db = fakeDb();
  const storage = { put: async () => { throw new Error('caído'); } };
  await assert.rejects(uploadAnnouncementImage({ file: { buffer: PNG, originalname: 'a.png' }, requester: GERENTE }, { db, storage }), { statusCode: 502 });
  assert.equal(db.table.size, 0);
});

test('una imagen de otro anuncio, borrada o inexistente no se puede publicar', async () => {
  const db = fakeDb([
    { id: 'suelta', storageKey: 'announcements/suelta.png', createdAt: hace(1) },
    { id: 'ajena', storageKey: 'announcements/ajena.png', createdAt: hace(1), scope: 'GLOBAL', announcementId: 'otro' },
    { id: 'vencida', storageKey: 'announcements/vencida.png', createdAt: hace(1000), scope: 'GLOBAL', announcementId: 'a1', purgedAt: hace(1) }
  ]);
  assert.deepEqual(await assertAnnouncementImagesAttachable(db, { imageIds: ['suelta'], scope: 'GLOBAL' }), ['suelta']);
  await assert.rejects(assertAnnouncementImagesAttachable(db, { imageIds: ['ajena'], scope: 'GLOBAL', announcementId: 'a1' }), { statusCode: 409 });
  await assert.rejects(assertAnnouncementImagesAttachable(db, { imageIds: ['vencida'], scope: 'GLOBAL', announcementId: 'a1' }), { statusCode: 409 });
  await assert.rejects(assertAnnouncementImagesAttachable(db, { imageIds: ['no-existe'], scope: 'GLOBAL' }), { statusCode: 409 });
  await assert.rejects(assertAnnouncementImagesAttachable(db, { imageIds: ['1', '2', '3', '4', '5', '6', '7'], scope: 'GLOBAL' }), { statusCode: 400 });
  assert.equal(await assertAnnouncementImagesAttachable(db, { imageIds: undefined, scope: 'GLOBAL' }), undefined);
});

test('al editar quedan exactamente las imágenes enviadas, en su orden; sin lista no cambia nada', async () => {
  const db = fakeDb([
    { id: 'i1', storageKey: 'announcements/i1.png', createdAt: hace(2), scope: 'MEMBER', announcementId: 'n1', position: 0 },
    { id: 'i2', storageKey: 'announcements/i2.png', createdAt: hace(2), scope: 'MEMBER', announcementId: 'n1', position: 1 },
    { id: 'i3', storageKey: 'announcements/i3.png', createdAt: hace(1) }
  ]);
  await setAnnouncementImages(db, { imageIds: undefined, scope: 'MEMBER', announcementId: 'n1' });
  assert.equal(db.table.get('i1').announcementId, 'n1');
  await setAnnouncementImages(db, { imageIds: ['i3', 'i2'], scope: 'MEMBER', announcementId: 'n1', now: AHORA });
  assert.equal(db.table.get('i1').announcementId, null, 'la quitada queda suelta para el barrido');
  assert.deepEqual([db.table.get('i3').position, db.table.get('i2').position], [0, 1]);
  const [anuncio] = await withAnnouncementImages(db, [{ id: 'n1', scope: 'MEMBER' }], 'u1');
  assert.deepEqual(anuncio.images.map(image => image.id), ['i3', 'i2']);
});

test('el pase abre solo esa imagen, para esa persona, y es el mismo durante su ventana', () => {
  const ticket = signAnnouncementImageTicket({ imageId: 'img', userId: 'u1' }, { now: AHORA.getTime() });
  assert.equal(signAnnouncementImageTicket({ imageId: 'img', userId: 'u1' }, { now: AHORA.getTime() + 60_000 }), ticket, 'el refresco de cada minuto no cambia la dirección');
  const payload = verifyAnnouncementImageTicket(ticket);
  assert.equal(payload.imageId, 'img');
  assert.equal(payload.userId, 'u1');
  assert.ok(payload.exp * 1000 - AHORA.getTime() >= 3 * 3600 * 1000, 'nunca vale menos de tres horas');
  assert.throws(() => verifyAnnouncementImageTicket(ticket, { secret: 'otro-secreto' }));
});

test('el barrido: sueltas al día siguiente, las de un anuncio a los 30 días, y ante la duda conserva', () => {
  const opciones = { now: AHORA, retentionDays: 30 };
  const decision = (row) => announcementImagePurgeDecision({ storageKey: 'announcements/x.png', id: 'x', ...row }, opciones);
  assert.equal(decision({ createdAt: hace(2) }).reason, 'draft');
  assert.equal(decision({ createdAt: hace(25) }).action, 'delete');
  assert.equal(decision({ createdAt: hace(24 * 29), announcementId: 'a' }).reason, 'inside-window');
  assert.equal(decision({ createdAt: hace(24 * 31), announcementId: 'a' }).action, 'purge');
  assert.equal(decision({ createdAt: hace(24 * 31), announcementId: 'a', purgedAt: hace(1) }).action, 'keep');
  assert.equal(decision({ createdAt: 'no es fecha', announcementId: 'a' }).reason, 'missing-date');
  assert.equal(announcementImagePurgeDecision({ id: 'x', storageKey: 'chat/otra.png', createdAt: hace(9999) }, opciones).reason, 'not-ours');
  assert.equal(announcementImageRetentionDays({ ANNOUNCEMENT_IMAGE_RETENTION_DAYS: 'nada' }), 30);
  assert.equal(announcementImageRetentionDays({ ANNOUNCEMENT_IMAGE_RETENTION_DAYS: '45' }), 45);
});

test('el barrido borra el archivo antes que la fila y deja constancia de las vencidas', async () => {
  const db = fakeDb([
    { id: 'suelta', storageKey: 'announcements/suelta.png', createdAt: hace(30) },
    { id: 'vieja', storageKey: 'announcements/vieja.png', createdAt: hace(24 * 40), scope: 'GLOBAL', announcementId: 'a1' },
    { id: 'reciente', storageKey: 'announcements/reciente.png', createdAt: hace(48), scope: 'GLOBAL', announcementId: 'a1' },
    { id: 'falla', storageKey: 'announcements/falla.png', createdAt: hace(30) }
  ]);
  const borrados = [];
  const storage = { remove: async (key) => { if (key.includes('falla')) throw new Error('bucket caído'); borrados.push(key); } };
  const resultado = await sweepAnnouncementImages({ db, storage, now: AHORA, retentionDays: 30 });
  assert.deepEqual({ ...resultado, dryRun: undefined }, { deleted: 1, purged: 1, kept: 1, failed: 1, dryRun: undefined });
  assert.deepEqual(borrados.sort(), ['announcements/suelta.png', 'announcements/vieja.png']);
  assert.equal(db.table.has('suelta'), false);
  assert.ok(db.table.get('vieja').purgedAt, 'la fila queda para que el anuncio diga que se borró');
  assert.ok(db.table.has('falla'), 'si el bucket no responde, vuelve en el próximo barrido');
  const [anuncio] = await withAnnouncementImages(db, [{ id: 'a1', scope: 'GLOBAL' }], 'u1');
  const vieja = anuncio.images.find(image => image.id === 'vieja');
  assert.equal(vieja.removed, true);
  assert.equal(vieja.url, null);
});
