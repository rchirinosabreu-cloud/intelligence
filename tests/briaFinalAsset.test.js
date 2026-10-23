import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaActionService } from '../src/services/briaActionService.js';
import { actionReply, actionStage } from '../src/lib/briaActions.js';
import { isPlainAgreement, ACTION_VERBS } from '../src/lib/briaAgreement.js';
import { readBriaAttachment } from '../src/services/briaAttachmentReader.js';

// Subir la pieza final conversando, desde el chat o por WhatsApp (22 de octubre de 2026): el video o la foto que llega
// en el mensaje, o el enlace de Drive cuando pesa más de lo que cabe en un mensaje. Va por la misma vía que el editor.

const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, parrillas: true } };
const item = { id: 'i1', objective: 'Lanzamiento del menú de otoño', format: 'Reel', status: 'EN_REVISION', publishDate: new Date('2026-10-23T12:00:00Z'), publishTime: '18:00', planId: 'p1', plan: { month: 10, year: 2026, status: 'ACTIVO', client: { name: 'Aristea', isArchived: false } }, publications: [], _count: { finalAssets: 0 } };
const build = (row = item, { existingDrive = null } = {}) => {
  const uploads = [];
  const drives = [];
  const service = createBriaActionService({
    db: { contentItem: { findFirst: async ({ where }) => (where.id === row.id ? row : null) }, contentItemFinalAsset: { findFirst: async () => existingDrive } },
    uploadFinalAssets: async (id, files) => { uploads.push([id, files]); return []; },
    addDriveAsset: async (id, input) => { drives.push([id, input]); return {}; },
    now: () => new Date('2026-10-22T17:00:00Z')
  });
  return { service, uploads, drives };
};
const none = { archivos: null, enlace: null };
const video = { id: 'f1', name: 'Reel final.mp4', mime: 'video/mp4', status: 'UNREADABLE', current: true };
const pdf = { id: 'f0', name: 'factura.pdf', mime: 'application/pdf', status: 'PDF', current: false };
const oldPhoto = { id: 'f2', name: 'portada.png', mime: 'image/png', status: 'IMAGE', current: false };
const bytes = Buffer.from('video');

test('el video que llegó con el mensaje: un párrafo y, al confirmar, se sube por la vía del editor', async () => {
  const { service, uploads } = build();
  const action = await service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [video, pdf] });
  assert.equal(actionStage(action), 'READY');
  const reply = actionReply(action);
  assert.equal(reply.answer.split('\n\n')[0], 'Subo «Reel final.mp4» como pieza final de «Lanzamiento del menú de otoño» (Reel de Aristea, viernes 23 de octubre).');
  assert.deepEqual(reply.quickReplies, ['Confirmar', 'Cancelar']);
  const out = await service.execute({ user: pm, action, loadAttachment: async (id) => (id === 'f1' ? { name: 'Reel final.mp4', mime: 'video/mp4', buffer: bytes } : null) });
  assert.deepEqual(uploads, [['i1', [{ buffer: bytes, originalname: 'Reel final.mp4', mimetype: 'video/mp4', size: bytes.length }]]]);
  assert.equal(out.text, 'Listo, quedó subida como pieza final.\n\n[Abrir la pieza](/parrillas/p1?item=i1)');
  assert.equal(isPlainAgreement('sí, súbela', { verbs: ACTION_VERBS.FINAL_ASSET }), true);
});

test('sin archivo en el mensaje pregunta cuál; «el último» y el nombre lo eligen; un PDF no es una pieza', async () => {
  const { service } = build();
  const asked = await service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [{ ...video, current: false }, pdf, oldPhoto] });
  assert.equal(actionStage(asked), 'MISSING');
  assert.deepEqual(asked.missing[0].options, ['Reel final.mp4', 'portada.png']);
  const last = await service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', archivos: 'el último', enlace: null }, attachments: [{ ...video, current: false }, oldPhoto] });
  assert.deepEqual(last.payload.files, [{ id: 'f1', name: 'Reel final.mp4' }]);
  const named = await service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', archivos: 'portada.png y Reel final', enlace: null }, attachments: [{ ...video, current: false }, oldPhoto] });
  assert.deepEqual(named.payload.files.map((file) => file.id), ['f2', 'f1']);
  assert.match(actionReply(named).answer, /^Subo 2 archivos \(portada\.png y Reel final\.mp4\) como pieza final/);
  const empty = await service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [] });
  assert.match(empty.missing[0].question, /enlace de Drive/);
  await assert.rejects(() => service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [{ ...pdf, current: true }] }), /solo fotos o videos/i);
});

test('lo que conviene saber antes: WhatsApp comprime, el cliente ya aprobó, ya se publicó, no caben más', async () => {
  const photo = { id: 'w1', name: 'foto-whatsapp-ABC.jpg', mime: 'image/jpeg', status: 'IMAGE', current: true };
  const compressed = await build().service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [photo] });
  assert.match(actionReply(compressed).answer, /WhatsApp la comprime/);
  const approved = await build({ ...item, status: 'APROBADO' }).service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [video] });
  assert.match(actionReply(approved).answer, /el cliente ya la aprobó.*la vuelve a ver/i);
  const published = await build({ ...item, status: 'PUBLICADO' }).service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [video] });
  assert.match(actionReply(published).answer, /ya se publicó/i);
  await assert.rejects(() => build({ ...item, _count: { finalAssets: 20 } }).service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [video] }), /hasta 20 archivos y esta ya tiene 20/);
  await assert.rejects(() => build().service.prepare({ user: { ...pm, modulePermissions: { bria: true } }, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [video] }), { status: 403 });
});

test('un enlace de Drive: se valida antes, avisa del permiso y se guarda por la vía del editor', async () => {
  const { service, drives } = build();
  const url = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing';
  const action = await service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', archivos: null, enlace: url }, attachments: [video] });
  const reply = actionReply(action);
  assert.equal(reply.answer.split('\n\n')[0], 'Agrego el enlace de Drive como pieza final de «Lanzamiento del menú de otoño» (Reel de Aristea, viernes 23 de octubre).');
  assert.match(reply.answer, /cualquier persona con el enlace/);
  const out = await service.execute({ user: pm, action });
  assert.deepEqual(drives, [['i1', { url }]]);
  assert.equal(out.text, 'Listo, el enlace quedó como pieza final.\n\n[Abrir la pieza](/parrillas/p1?item=i1)');
  await assert.rejects(() => service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', archivos: null, enlace: 'https://drive.google.com/drive/folders/1AbCdEfGhIj' } }), /carpeta/);
  await assert.rejects(() => build(item, { existingDrive: { id: 'a1' } }).service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', archivos: null, enlace: url } }), /ya está en esta pieza/);
});

test('el chat conserva un video con su tipo real, y al subirlo el tipo sale del contenido, no de la etiqueta', async () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(20)]);
  const read = await readBriaAttachment({ originalname: 'Reel final.mp4', buffer: mp4 });
  assert.deepEqual([read.mime, read.status], ['video/mp4', 'UNREADABLE']);
  assert.match(read.warning, /pieza final/);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const { service, uploads } = build();
  const action = await service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [{ id: 'p1', name: 'portada.png', mime: 'image/jpeg', status: 'IMAGE', current: true }] });
  await service.execute({ user: pm, action, loadAttachment: async () => ({ name: 'portada.png', mime: 'image/jpeg', buffer: png }) });
  assert.equal(uploads[0][1][0].mimetype, 'image/png');
});

test('si el archivo ya no está en el chat o el editor lo rechaza, se dice el motivo; nada se sube a medias', async () => {
  const { service, uploads } = build();
  const action = await service.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [video] });
  await assert.rejects(() => service.execute({ user: pm, action, loadAttachment: async () => null }), /ya no está en el chat/);
  assert.equal(uploads.length, 0);
  const rejecting = createBriaActionService({
    db: { contentItem: { findFirst: async () => item } },
    uploadFinalAssets: async () => { throw Object.assign(new Error('«02.png» es un video MP4 con la extensión cambiada.'), { status: 400 }); }
  });
  const prepared = await rejecting.prepare({ user: pm, type: 'FINAL_ASSET', args: { pieza: 'i1', ...none }, attachments: [video] });
  await assert.rejects(() => rejecting.execute({ user: pm, action: prepared, loadAttachment: async () => ({ name: 'Reel final.mp4', mime: 'video/mp4', buffer: bytes }) }), { status: 400, message: /extensión cambiada/ });
});
