import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaPlatformClient } from '../src/lib/briaPlatformClient.js';
import { createBriaActionService } from '../src/services/briaActionService.js';
import { actionReply, actionStage } from '../src/lib/briaActions.js';

// Las manos de Bria con archivos (Rodny, 22 de octubre de 2026: «me preocupa que haya que hacer lo mismo para cada
// cosita … la idea es que Bria aprenda a usar la plataforma, a vivirla»). Una ruta que recibe archivos lo dice en su
// código (`receivesFiles`); Bria manda el que llegó al chat o por WhatsApp por la misma API que la pantalla, sin una
// herramienta propia para cada pantalla.

const admin = { userId: 'u-elisa', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, financiero: true, gestion: true } };
const session = { token: 'token-de-la-persona' };
const uploads = async (key) => ({ 'POST /financials/records/:id/documents': { field: 'file', max: 1 }, 'POST /tasks/:taskId/comments': { field: 'file', max: 10 } }[key] || null);
const receipt = { id: 'f1', name: 'comprobante-canva.pdf', mime: 'application/pdf', status: 'PDF', current: true };
const photo = { id: 'f2', name: 'foto-whatsapp-ABC.jpg', mime: 'image/jpeg', status: 'IMAGE', current: false };
const pdfBytes = Buffer.from('%PDF-1.7 comprobante');
const pngBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const load = async (id) => ({ f1: { name: 'comprobante-canva.pdf', mime: 'application/pdf', buffer: pdfBytes }, f2: { name: 'foto-whatsapp-ABC.jpg', mime: 'image/jpeg', buffer: pngBytes } }[id] || null);
const build = () => {
  const calls = [];
  const platform = { call: async (input) => { calls.push(input); return { ok: true, status: 201, data: { id: 'd1' }, text: '{}' }; } };
  return { calls, service: createBriaActionService({ platform, routePermissions: async () => null, routeUploads: uploads }) };
};

test('el comprobante que llegó con el mensaje va solo, con el campo que dice la ruta y su tipo real', async () => {
  const { service, calls } = build();
  const action = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [receipt, photo], args: { metodo: 'POST', ruta: '/financials/records/r1/documents', cuerpo: null, que_hace: 'Le pego el comprobante al pago de Canva del lunes 19 de octubre' } });
  assert.equal(actionStage(action), 'READY');
  assert.equal(actionReply(action).answer.split('\n\n')[0], 'Le pego el comprobante al pago de Canva del lunes 19 de octubre. Va con «comprobante-canva.pdf».');
  await service.execute({ user: admin, action, session, loadAttachment: load });
  assert.deepEqual(calls[0].files, [{ field: 'file', buffer: pdfBytes, name: 'comprobante-canva.pdf', mime: 'application/pdf' }]);
  assert.equal(calls[0].token, 'token-de-la-persona');
});

test('uno anterior se nombra; una pantalla de un archivo pide cuál si no llegó; el tipo sale del contenido', async () => {
  const { service, calls } = build();
  const asked = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [{ ...receipt, current: false }, photo], args: { metodo: 'POST', ruta: '/financials/records/r1/documents', cuerpo: null, que_hace: 'Pego el comprobante' } });
  assert.equal(actionStage(asked), 'MISSING');
  assert.deepEqual(asked.missing[0].options, ['comprobante-canva.pdf', 'foto-whatsapp-ABC.jpg']);
  const named = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [{ ...receipt, current: false }, photo], args: { metodo: 'POST', ruta: '/financials/records/r1/documents', cuerpo: null, que_hace: 'Pego el comprobante', archivos: 'foto-whatsapp' } });
  await service.execute({ user: admin, action: named, session, loadAttachment: load });
  assert.equal(calls[0].files[0].mime, 'image/png', 'el chat la etiquetó JPEG; sus bytes dicen PNG');
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', attachments: [receipt, { ...photo, current: true }], args: { metodo: 'POST', ruta: '/financials/records/r1/documents', cuerpo: null, que_hace: 'Pego los dos' } }), /un archivo por vez/);
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', attachments: [receipt], args: { metodo: 'POST', ruta: '/financials/records/r1/documents', cuerpo: null, que_hace: 'x', archivos: 'factura-inexistente' } }), /No encuentro «factura-inexistente»/);
});

test('un comentario lleva texto y, si los hay, adjuntos; sin archivos va como siempre', async () => {
  const { service, calls } = build();
  const withFile = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [{ ...photo, current: true }], args: { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Así quedó la portada' }, que_hace: 'Comento en la tarea del reel con la foto de la portada' } });
  await service.execute({ user: admin, action: withFile, session, loadAttachment: load });
  assert.deepEqual([calls[0].body, calls[0].files.length], [{ content: 'Así quedó la portada' }, 1]);
  const plain = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [], args: { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Listo' }, que_hace: 'Comento «Listo»' } });
  assert.equal(actionStage(plain), 'READY', 'el comentario no exige archivo');
  await service.execute({ user: admin, action: plain, session, loadAttachment: load });
  assert.equal('files' in calls[1], false);
});

test('una ruta que no recibe archivos no los acepta, y avisa que el del mensaje va después', async () => {
  const { service } = build();
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', attachments: [receipt], args: { metodo: 'POST', ruta: '/global-announcements', cuerpo: { content: 'Hola' }, que_hace: 'Publico', archivos: 'comprobante' } }), /no recibe archivos/);
  const record = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [receipt], args: { metodo: 'POST', ruta: '/financials/records', cuerpo: { type: 'EXPENSE', amount: 45000 }, que_hace: 'Registro el egreso de Canva' } });
  assert.match(actionReply(record).answer, /lo adjunto después/);
  assert.equal('files' in record.payload, false);
  const action = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [receipt], args: { metodo: 'POST', ruta: '/financials/records/r1/documents', cuerpo: null, que_hace: 'Pego el comprobante' } });
  await assert.rejects(() => service.execute({ user: admin, action, session, loadAttachment: async () => null }), /ya no está en el chat/);
});

test('el cliente arma el formulario como el navegador y dice el motivo, no el código', async () => {
  let sent;
  const client = createBriaPlatformClient({ fetchFn: async (_url, init) => { sent = init; return { status: 413, headers: { get: () => 'application/json' }, json: async () => ({ error: 'FINANCIAL_DOCUMENT_TOO_LARGE', message: 'El documento supera el máximo de 25 MB.' }) }; } });
  const out = await client.call({ token: 't', method: 'POST', path: '/tasks/t1/comments', body: { content: 'Hola', mentions: ['u1'] }, files: [{ field: 'file', name: 'a.pdf', mime: 'application/pdf', buffer: pdfBytes }] });
  assert.ok(sent.body instanceof FormData);
  assert.equal(sent.headers['Content-Type'], undefined, 'el límite del formulario lo pone fetch');
  assert.equal(sent.body.get('content'), 'Hola');
  assert.equal(sent.body.get('mentions'), '["u1"]');
  assert.equal(sent.body.get('file').name, 'a.pdf');
  assert.equal(out.error, 'El documento supera el máximo de 25 MB.');
});
