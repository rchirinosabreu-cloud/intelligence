import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';
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

test('dos imágenes del mismo mensaje con igual nombre conservan sus dos identidades', async () => {
  const { service, calls } = build();
  const sameName = 'foto-whatsapp-OUI4MUIyRDMA.jpg';
  const images = ['image-one', 'image-two'].map(id => ({ ...photo, id, name: sameName, current: true }));
  const historical = { ...photo, id: 'older-image', name: sameName, current: false };
  const action = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [...images, historical], args: { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Estas son las referencias que quiero revisar.' }, que_hace: 'Agrego las imágenes', archivos: sameName } });
  assert.deepEqual(action.payload.files.map(file => file.id), ['image-one', 'image-two']);
  assert.match(actionReply(action).answer, /2 archivos/);
  const loaded = [];
  await service.execute({ user: admin, action, session, loadAttachment: async id => { loaded.push(id); return { name: sameName, mime: 'image/png', buffer: Buffer.concat([pngBytes, Buffer.from(id)]) }; } });
  assert.deepEqual(loaded, ['image-one', 'image-two']);
  assert.equal(calls[0].files.length, 2);
  assert.notDeepEqual(calls[0].files[0].buffer, calls[0].files[1].buffer);
});

test('una selección histórica ambigua pide precisar, y un id elige exactamente ese archivo', async () => {
  const { service } = build();
  const images = ['image-one', 'image-two'].map(id => ({ ...photo, id, name: 'referencia.jpg', current: false }));
  const args = { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Referencia' }, que_hace: 'Agrego la referencia' };
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', attachments: images, args: { ...args, archivos: 'referencia.jpg' } }), /varios archivos.*precisa/i);
  const action = await service.prepare({ user: admin, type: 'PLATFORM', attachments: images, args: { ...args, archivos: 'image-two' } });
  assert.deepEqual(action.payload.files, [{ id: 'image-two', name: 'referencia.jpg' }]);
});

test('ningún término pedido se omite y una coincidencia parcial ambigua no elige el primero', async () => {
  const { service, calls } = build();
  const args = { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Referencias' }, que_hace: 'Agrego referencias' };
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', attachments: [photo], args: { ...args, archivos: 'foto-whatsapp, imagen-ausente.png' } }), /No encuentro «imagen-ausente.png»/);
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', attachments: [{ ...photo, name: 'portada-a.jpg' }, { ...receipt, name: 'portada-b.jpg' }], args: { ...args, archivos: 'portada' } }), /varios archivos.*precisa/i);
  assert.equal(calls.length, 0);
});

test('el último es un selector singular y no permite omitir otros nombres pedidos', async () => {
  const { service } = build();
  const args = { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Referencia' }, que_hace: 'Agrego referencias' };
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', attachments: [photo, receipt], args: { ...args, archivos: 'el último, imagen-ausente.png' } }), /No encuentro/);
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', attachments: [photo, receipt], args: { ...args, archivos: 'los últimos' } }), /precisa/i);
});

test('el comentario muestra su texto exacto y el conteo real aunque el modelo prometa otra cantidad', async () => {
  const { service } = build();
  const content = 'Kamila, revisa el encuadre.\nConserva el logo y dime qué cambiarías.';
  const action = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [{ ...photo, current: true }], args: { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content }, que_hace: 'Agrego dos imágenes y le pido rehacer todo' } });
  const reply = actionReply(action);
  assert.ok(reply.answer.includes(content));
  assert.match(reply.answer, /1 archivo/);
  assert.doesNotMatch(reply.answer, /dos imágenes|rehacer todo/);
  assert.match(reply.answer, /\/gestion\?taskId=t1/);
  assert.deepEqual(reply.quickReplies, ['Confirmar', 'Cancelar']);
});

test('la vista real no oculta HTML ni interpreta el Markdown que pertenece al comentario', async () => {
  const { service, calls } = build();
  const content = 'Primera línea\n\n<p>No publiques todavía: espera mi aprobación.</p>\n\n![texto literal](https://example.test/no-imagen.png)\n\n**Conservar asteriscos** y &lt;referencia&gt;';
  const action = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [{ ...photo, current: true }], args: { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content }, que_hace: 'Agrego el comentario' } });
  const markup = renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], skipHtml: true }, actionReply(action).answer));
  assert.match(markup, /No publiques todavía: espera mi aprobación/);
  assert.match(markup, /&lt;p&gt;No publiques/, 'las etiquetas del texto permanecen visibles');
  assert.match(markup.replace(/<[^>]*>/g, ''), /!\[texto literal\]\(https:\/\/example.test\/no-imagen.png\)/, 'GFM puede enlazar la URL, pero no sustituye el texto por una imagen');
  assert.doesNotMatch(markup, /<img|<strong>/);
  assert.match(markup, /\*\*Conservar asteriscos\*\*/);
  assert.match(markup, /&amp;lt;referencia&amp;gt;/, 'una entidad que forma parte del texto no se decodifica en otra cosa');
  assert.match(markup, /Adjuntaré 1 archivo/);
  assert.match(markup, /¿Lo hago así/);
  await service.execute({ user: admin, action, session, loadAttachment: load });
  assert.equal(calls[0].body.content, content, 'escapar la vista previa no cambia lo que se envía');
});

test('el formato en un nombre de archivo no oculta archivos ni la pregunta de confirmación', async () => {
  const { service } = build();
  const name = '<span>referencia **final** & logo</span>.png';
  const action = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [{ ...photo, name, current: true }], args: { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Revisa esta referencia.' }, que_hace: 'Agrego la referencia' } });
  const markup = renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], skipHtml: true }, actionReply(action).answer));
  assert.match(markup, /&lt;span&gt;referencia \*\*final\*\* &amp; logo&lt;\/span&gt;.png/);
  assert.match(markup, /Adjuntaré 1 archivo/);
  assert.match(markup, /¿Lo hago así/);
  assert.doesNotMatch(markup, /<span>|<strong>/);
  assert.equal(action.payload.files[0].name, name);
});

test('corregir solo el texto mantiene los adjuntos por id y ejecuta el contenido nuevo con ambos', async () => {
  const { service, calls } = build();
  const images = ['image-one', 'image-two'].map(id => ({ ...photo, id, name: 'referencia.jpg', current: true }));
  const args = { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Texto inicial' }, que_hace: 'Agrego referencias' };
  const original = await service.prepare({ user: admin, type: 'PLATFORM', attachments: images, args });
  const content = 'Quiero revisar estas dos opciones contigo antes de avanzar.';
  const adjusted = await service.prepare({ user: admin, type: 'PLATFORM', previous: original, attachments: images.map(file => ({ ...file, current: false })), args: { ...args, cuerpo: { content }, archivos: null } });
  assert.equal(adjusted.id, original.id);
  assert.deepEqual(adjusted.payload.files, original.payload.files);
  assert.ok(actionReply(adjusted).answer.includes(content));
  assert.doesNotMatch(actionReply(adjusted).answer, /Texto inicial/);
  assert.equal(calls.length, 0, 'preparar y corregir no envían el comentario');
  await service.execute({ user: admin, action: adjusted, session, loadAttachment: async id => ({ name: 'referencia.jpg', mime: 'image/png', buffer: Buffer.concat([pngBytes, Buffer.from(id)]) }) });
  assert.deepEqual(calls[0].body, { content });
  assert.equal(calls[0].files.length, 2);
});

test('los adjuntos del borrador no se heredan por otra persona, destino, acción cerrada ni pedido nuevo', async () => {
  const { service } = build();
  const args = { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Referencia' }, que_hace: 'Agrego una referencia' };
  const original = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [{ ...photo, current: true }], args });
  for (const [previous, nextArgs] of [[{ ...original, ownerId: 'someone-else' }, args], [{ ...original, status: 'DONE' }, args], [original, { ...args, ruta: '/tasks/t2/comments' }], [original, { ...args, nuevo: true }]]) {
    const action = await service.prepare({ user: admin, type: 'PLATFORM', previous, attachments: [photo], args: nextArgs });
    assert.equal(action.payload.files, undefined);
    assert.notEqual(action.id, original.id);
  }
});

test('retirar adjuntos es explícito y un archivo perdido nunca se sustituye por otro con el mismo nombre', async () => {
  const { service, calls } = build();
  const current = { ...photo, current: true };
  const args = { metodo: 'POST', ruta: '/tasks/t1/comments', cuerpo: { content: 'Solo este texto' }, que_hace: 'Comento' };
  const original = await service.prepare({ user: admin, type: 'PLATFORM', attachments: [current], args });
  const without = await service.prepare({ user: admin, type: 'PLATFORM', previous: original, attachments: [current], args: { ...args, archivos: '' } });
  assert.equal(without.payload.files, undefined);
  assert.match(actionReply(without).answer, /Sin archivos adjuntos/);
  await assert.rejects(() => service.prepare({ user: admin, type: 'PLATFORM', previous: original, attachments: [{ ...photo, id: 'different-file' }], args }), /ya no está en el chat/);
  assert.equal(calls.length, 0);
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
