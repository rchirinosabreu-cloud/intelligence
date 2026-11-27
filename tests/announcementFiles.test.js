import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'isolated-announcement-image-tests-not-a-real-secret';
const {
  ANNOUNCEMENT_FILE_PREFIX,
  classifyAnnouncementFile,
  announcementFilePurgeDecision,
  announcementFileRetentionDays,
  assertAnnouncementFilesAttachable,
  setAnnouncementFiles,
  signAnnouncementFileTicket,
  sweepAnnouncementFiles,
  uploadAnnouncementFile,
  verifyAnnouncementFileTicket,
  withAnnouncementFiles
} = await import('../src/services/announcementFileService.js');

// Archivos en los anuncios (Rodny, 27 de noviembre de 2026): imágenes y documentos se suben al bucket compartido y el
// barrido los borra. Los sueltos (un anuncio que nunca se publicó) al día siguiente; los de un anuncio a los 30 días.

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
    announcementFile: {
      create: async ({ data }) => { const row = { position: 0, scope: null, announcementId: null, purgedAt: null, ...data }; table.set(row.id, row); return row; },
      delete: async ({ where }) => { const row = table.get(where.id); table.delete(where.id); return row; },
      findMany: async ({ where } = {}) => [...table.values()].filter(row => matches(row, where)).sort((a, b) => a.position - b.position),
      update: async ({ where, data }) => Object.assign(table.get(where.id), data),
      updateMany: async ({ where, data }) => { let count = 0; for (const row of table.values()) if (matches(row, where)) { Object.assign(row, data); count += 1; } return { count }; }
    }
  };
};

test('solo quien publica anuncios sube archivos, y el tipo de una imagen lo dicen los bytes', async () => {
  const db = fakeDb();
  const puestos = [];
  const storage = { put: async (object) => puestos.push(object), remove: async () => {} };
  await assert.rejects(uploadAnnouncementFile({ file: { buffer: PNG }, requester: { userId: 'e', role: 'EDITOR' } }, { db, storage }), { statusCode: 403 });
  await assert.rejects(uploadAnnouncementFile({ file: { buffer: HEIC, originalname: 'foto.jpg' }, requester: GERENTE }, { db, storage }), { statusCode: 415 });
  await assert.rejects(uploadAnnouncementFile({ file: { buffer: Buffer.from('no soy una imagen, aunque me llame así'), originalname: 'x.png', mimetype: 'image/png' }, requester: GERENTE }, { db, storage }), { statusCode: 415 });
  const imagen = await uploadAnnouncementFile({ file: { buffer: PNG, originalname: 'cartel.png' }, requester: GERENTE }, { db, storage });
  assert.equal(puestos.length, 1);
  assert.ok(puestos[0].key.startsWith(ANNOUNCEMENT_FILE_PREFIX) && puestos[0].key.endsWith('.png'));
  assert.equal(puestos[0].contentType, 'image/png');
  assert.equal(imagen.removed, false);
  assert.match(imagen.url, /^\/api\/announcement-files\/[^?]+\?access_token=/);
});

test('si el bucket falla no queda una fila sin archivo', async () => {
  const db = fakeDb();
  const storage = { put: async () => { throw new Error('caído'); } };
  await assert.rejects(uploadAnnouncementFile({ file: { buffer: PNG, originalname: 'a.png' }, requester: GERENTE }, { db, storage }), { statusCode: 502 });
  assert.equal(db.table.size, 0);
});

test('un archivo de otro anuncio, borrado o inexistente no se puede publicar', async () => {
  const db = fakeDb([
    { id: 'suelta', storageKey: 'announcements/suelta.png', createdAt: hace(1) },
    { id: 'ajena', storageKey: 'announcements/ajena.png', createdAt: hace(1), scope: 'GLOBAL', announcementId: 'otro' },
    { id: 'vencida', storageKey: 'announcements/vencida.png', createdAt: hace(1000), scope: 'GLOBAL', announcementId: 'a1', purgedAt: hace(1) }
  ]);
  assert.deepEqual(await assertAnnouncementFilesAttachable(db, { fileIds: ['suelta'], scope: 'GLOBAL' }), ['suelta']);
  await assert.rejects(assertAnnouncementFilesAttachable(db, { fileIds: ['ajena'], scope: 'GLOBAL', announcementId: 'a1' }), { statusCode: 409 });
  await assert.rejects(assertAnnouncementFilesAttachable(db, { fileIds: ['vencida'], scope: 'GLOBAL', announcementId: 'a1' }), { statusCode: 409 });
  await assert.rejects(assertAnnouncementFilesAttachable(db, { fileIds: ['no-existe'], scope: 'GLOBAL' }), { statusCode: 409 });
  await assert.rejects(assertAnnouncementFilesAttachable(db, { fileIds: Array.from({ length: 11 }, (_, i) => String(i)), scope: 'GLOBAL' }), { statusCode: 400 });
  assert.equal(await assertAnnouncementFilesAttachable(db, { fileIds: undefined, scope: 'GLOBAL' }), undefined);
});

test('al editar quedan exactamente las imágenes enviadas, en su orden; sin lista no cambia nada', async () => {
  const db = fakeDb([
    { id: 'i1', storageKey: 'announcements/i1.png', createdAt: hace(2), scope: 'MEMBER', announcementId: 'n1', position: 0 },
    { id: 'i2', storageKey: 'announcements/i2.png', createdAt: hace(2), scope: 'MEMBER', announcementId: 'n1', position: 1 },
    { id: 'i3', storageKey: 'announcements/i3.png', createdAt: hace(1) }
  ]);
  await setAnnouncementFiles(db, { fileIds: undefined, scope: 'MEMBER', announcementId: 'n1' });
  assert.equal(db.table.get('i1').announcementId, 'n1');
  await setAnnouncementFiles(db, { fileIds: ['i3', 'i2'], scope: 'MEMBER', announcementId: 'n1', now: AHORA });
  assert.equal(db.table.get('i1').announcementId, null, 'la quitada queda suelta para el barrido');
  assert.deepEqual([db.table.get('i3').position, db.table.get('i2').position], [0, 1]);
  const [anuncio] = await withAnnouncementFiles(db, [{ id: 'n1', scope: 'MEMBER' }], 'u1');
  assert.deepEqual(anuncio.attachments.map(image => image.id), ['i3', 'i2']);
});

test('el pase abre solo esa imagen, para esa persona, y es el mismo durante su ventana', () => {
  const ticket = signAnnouncementFileTicket({ fileId: 'img', userId: 'u1' }, { now: AHORA.getTime() });
  assert.equal(signAnnouncementFileTicket({ fileId: 'img', userId: 'u1' }, { now: AHORA.getTime() + 60_000 }), ticket, 'el refresco de cada minuto no cambia la dirección');
  const payload = verifyAnnouncementFileTicket(ticket, { now: AHORA.getTime() });
  assert.equal(payload.fileId, 'img');
  assert.equal(payload.userId, 'u1');
  assert.ok(payload.exp * 1000 - AHORA.getTime() >= 3 * 3600 * 1000, 'nunca vale menos de tres horas');
  assert.throws(() => verifyAnnouncementFileTicket(ticket, { secret: 'otro-secreto', now: AHORA.getTime() }));
  assert.throws(() => verifyAnnouncementFileTicket(ticket, { now: AHORA.getTime() + 7 * 3600 * 1000 }), /jwt expired/, 'pasada su ventana, vence');
});

test('el barrido: sueltas al día siguiente, las de un anuncio a los 30 días, y ante la duda conserva', () => {
  const opciones = { now: AHORA, retentionDays: 30 };
  const decision = (row) => announcementFilePurgeDecision({ storageKey: 'announcements/x.png', id: 'x', ...row }, opciones);
  assert.equal(decision({ createdAt: hace(2) }).reason, 'draft');
  assert.equal(decision({ createdAt: hace(25) }).action, 'delete');
  assert.equal(decision({ createdAt: hace(24 * 29), announcementId: 'a' }).reason, 'inside-window');
  assert.equal(decision({ createdAt: hace(24 * 31), announcementId: 'a' }).action, 'purge');
  assert.equal(decision({ createdAt: hace(24 * 31), announcementId: 'a', purgedAt: hace(1) }).action, 'keep');
  assert.equal(decision({ createdAt: 'no es fecha', announcementId: 'a' }).reason, 'missing-date');
  assert.equal(announcementFilePurgeDecision({ id: 'x', storageKey: 'chat/otra.png', createdAt: hace(9999) }, opciones).reason, 'not-ours');
  assert.equal(announcementFileRetentionDays({ ANNOUNCEMENT_FILE_RETENTION_DAYS: 'nada' }), 30);
  assert.equal(announcementFileRetentionDays({ ANNOUNCEMENT_FILE_RETENTION_DAYS: '45' }), 45);
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
  const resultado = await sweepAnnouncementFiles({ db, storage, now: AHORA, retentionDays: 30 });
  assert.deepEqual({ ...resultado, dryRun: undefined }, { deleted: 1, purged: 1, kept: 1, failed: 1, dryRun: undefined });
  assert.deepEqual(borrados.sort(), ['announcements/suelta.png', 'announcements/vieja.png']);
  assert.equal(db.table.has('suelta'), false);
  assert.ok(db.table.get('vieja').purgedAt, 'la fila queda para que el anuncio diga que se borró');
  assert.ok(db.table.has('falla'), 'si el bucket no responde, vuelve en el próximo barrido');
  const [anuncio] = await withAnnouncementFiles(db, [{ id: 'a1', scope: 'GLOBAL' }], 'u1');
  const vieja = anuncio.attachments.find(image => image.id === 'vieja');
  assert.equal(vieja.removed, true);
  assert.equal(vieja.url, null);
});

test('también documentos, como en las tareas; solo imágenes, PDF y texto se muestran dentro de la plataforma', () => {
  const pdf = classifyAnnouncementFile({ buffer: Buffer.from('%PDF-1.7 contenido'), originalname: 'Brief.pdf', mimetype: 'application/pdf' });
  assert.deepEqual(pdf, { name: 'Brief.pdf', mimeType: 'application/pdf', extension: 'pdf' });
  const word = classifyAnnouncementFile({ buffer: Buffer.from('PK\u0003\u0004 docx de prueba'), originalname: 'Guion.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  assert.equal(word.extension, 'docx');
  assert.equal(word.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const csv = classifyAnnouncementFile({ buffer: Buffer.from('cliente,valor\nAlpina,10'), originalname: 'cifras.csv', mimetype: 'text/csv' });
  assert.equal(csv.mimeType, 'text/plain');
  // Un HTML o un SVG no se muestran: quedan con su tipo para el icono y se entregan como descarga.
  const html = classifyAnnouncementFile({ buffer: Buffer.from('<html><script>alert(1)</script></html>'), originalname: 'pagina.html', mimetype: 'text/html' });
  assert.equal(html.mimeType, 'text/html');
  const raro = classifyAnnouncementFile({ buffer: Buffer.from('cualquier cosa larga'), originalname: 'sin-extension', mimetype: 'algo raro; con=parametros' });
  assert.deepEqual([raro.mimeType, raro.extension], ['application/octet-stream', 'bin']);
});

test('al servir, lo que no es imagen, PDF ni texto siempre baja como descarga', async () => {
  const { serveAnnouncementFile, signAnnouncementFileTicket: sign } = await import('../src/services/announcementFileService.js');
  const serve = async (row) => {
    const headers = {};
    const res = { set: (key, value) => { if (typeof key === 'object') Object.assign(headers, key); else headers[key] = value; return res; },
      status: (code) => { res.code = code; return res; }, json: (body) => { res.body = body; return res; }, destroy: () => {} };
    const db = { user: { findUnique: async () => ({ isActive: true }) }, announcementFile: { findUnique: async () => row } };
    const storage = { get: async () => ({ Body: { pipe: () => {}, on: () => {} } }) };
    await serveAnnouncementFile({ params: { id: row.id }, query: { access_token: sign({ fileId: row.id, userId: 'u1' }) } }, res, { db, storage });
    return headers;
  };
  const html = await serve({ id: 'h', name: 'pagina.html', mimeType: 'text/html', storageKey: 'announcements/h.html' });
  assert.equal(html['Content-Type'], 'application/octet-stream');
  assert.match(html['Content-Disposition'], /^attachment;/);
  const pdf = await serve({ id: 'p', name: 'Brief.pdf', mimeType: 'application/pdf', storageKey: 'announcements/p.pdf' });
  assert.equal(pdf['Content-Type'], 'application/pdf');
  assert.match(pdf['Content-Disposition'], /^inline;/);
  assert.equal(pdf['X-Content-Type-Options'], 'nosniff');
});
