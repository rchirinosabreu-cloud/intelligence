import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUOTATION_FILES, QUOTATION_EMAIL_ATTACHMENTS_MAX_BYTES, splitEmailAttachments } from '../src/lib/quotationAttachments.js';
import {
    assertQuotationFilesAttachable,
    classifyQuotationFile,
    servePublicQuotationFile,
    setQuotationFiles,
    sweepQuotationFiles,
    uploadQuotationFile
} from '../src/services/quotationFileService.js';

// Adjuntos de la propuesta (Rodny, 27 de noviembre de 2026).
const MB = 1024 * 1024;

const fakeDb = (rows = [], quotations = []) => ({
    rows,
    quotation: { findUnique: async ({ where }) => quotations.find(row => row.uuid_slug === where.uuid_slug) || null },
    quotationFile: {
        create: async ({ data }) => { const row = { quotationId: null, position: 0, attachedAt: null, ...data }; rows.push(row); return row; },
        delete: async ({ where }) => { rows.splice(rows.findIndex(row => row.id === where.id), 1); },
        findMany: async ({ where }) => rows.filter(row =>
            (where.id?.in ? where.id.in.includes(row.id) : true)
            && (where.quotationId !== undefined ? row.quotationId === where.quotationId : true)
            && (where.createdAt?.lt ? row.createdAt < where.createdAt.lt : true)),
        findUnique: async ({ where }) => rows.find(row => row.id === where.id) || null,
        updateMany: async ({ where, data }) => { for (const row of rows) if (row.quotationId === where.quotationId && !(where.id?.notIn || []).includes(row.id)) Object.assign(row, data); },
        update: async ({ where, data }) => Object.assign(rows.find(row => row.id === where.id), data)
    }
});

test('lo que pasa del tope del correo va como enlace, en el orden de la propuesta', () => {
    const files = [{ name: 'a', size: 4 * MB }, { name: 'b', size: 30 * MB }, { name: 'c', size: 2 * MB }, { name: 'd', size: 9 * MB }];
    const { attached, linked } = splitEmailAttachments(files);
    assert.deepEqual(attached.map(file => file.name), ['a', 'c']);
    assert.deepEqual(linked.map(file => file.name), ['b', 'd'], 'd ya no cabe con a, c y el PDF');
    assert.equal(QUOTATION_EMAIL_ATTACHMENTS_MAX_BYTES, 15 * MB);
    assert.deepEqual(splitEmailAttachments([]).linked, []);
});

test('subir guarda la fila antes del archivo y deshace la fila si el bucket falla', async () => {
    const db = fakeDb();
    const puts = [];
    const file = await uploadQuotationFile({ file: { buffer: Buffer.from('%PDF-1.7 hola'), originalname: 'Portafolio\n2026.pdf', mimetype: 'application/octet-stream' }, requester: { userId: 'u1' } }, { db, storage: { put: async (args) => puts.push(args) } });
    assert.equal(file.name, 'Portafolio 2026.pdf');
    assert.equal(file.mimeType, 'application/pdf');
    assert.match(puts[0].key, /^quotations\/.+\.pdf$/);
    assert.equal(puts[0].contentType, 'application/octet-stream', 'se sirve siempre como descarga');
    await assert.rejects(uploadQuotationFile({ file: { buffer: Buffer.from('x'), originalname: 'a.txt' }, requester: {} }, { db, storage: { put: async () => { throw new Error('caído'); } } }), { statusCode: 502 });
    assert.equal(db.rows.length, 1);
    await assert.rejects(uploadQuotationFile({ file: { buffer: Buffer.alloc(0) }, requester: {} }, { db }), { statusCode: 400 });
    assert.equal(classifyQuotationFile({ buffer: Buffer.from('<svg/>'), originalname: 'x.svg', mimetype: 'image/svg+xml' }).mimeType, 'image/svg+xml');
});

test('la propuesta queda con exactamente sus adjuntos; uno de otra propuesta no se puede tomar', async () => {
    const db = fakeDb([
        { id: 'a', name: 'A', quotationId: null, createdAt: new Date() },
        { id: 'b', name: 'B', quotationId: null, createdAt: new Date() },
        { id: 'c', name: 'C', quotationId: 'q-otra', createdAt: new Date() }
    ]);
    await setQuotationFiles(db, { fileIds: ['b', 'a'], quotationId: 'q1' });
    assert.deepEqual(db.rows.filter(row => row.quotationId === 'q1').sort((x, y) => x.position - y.position).map(row => row.id), ['b', 'a']);
    await setQuotationFiles(db, { fileIds: ['a'], quotationId: 'q1' });
    assert.equal(db.rows.find(row => row.id === 'b').quotationId, null, 'el que se quita queda suelto');
    assert.equal(await setQuotationFiles(db, { fileIds: undefined, quotationId: 'q1' }), undefined, 'sin lista no se toca nada');
    assert.equal(db.rows.find(row => row.id === 'a').quotationId, 'q1');
    await assert.rejects(assertQuotationFilesAttachable(db, { fileIds: ['c'], quotationId: 'q1' }), /pertenece a otra propuesta/);
    await assert.rejects(assertQuotationFilesAttachable(db, { fileIds: ['no-existe'] }), { statusCode: 409 });
    await assert.rejects(assertQuotationFilesAttachable(db, { fileIds: Array.from({ length: MAX_QUOTATION_FILES + 1 }, (_, i) => `f${i}`) }), { statusCode: 400 });
});

test('el cliente solo baja adjuntos de su propuesta emitida, y siempre como descarga', async () => {
    const db = fakeDb([{ id: 'a', name: 'Caso éxito.pdf', storageKey: 'quotations/a.pdf', quotationId: 'q1' }, { id: 'z', name: 'Otro', storageKey: 'quotations/z', quotationId: 'q2' }],
        [{ id: 'q1', uuid_slug: 'slug-1', status: 'ACTIVA' }, { id: 'q3', uuid_slug: 'slug-3', status: 'BORRADOR' }]);
    const response = () => ({ headers: {}, code: 200, set(values) { Object.assign(this.headers, values); return this; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
    const storage = { get: async () => ({ ContentLength: 3, Body: { on() {}, pipe: (res) => { res.piped = true; } } }) };
    const ok = response();
    await servePublicQuotationFile({ params: { uuid_slug: 'slug-1', fileId: 'a' } }, ok, { db, storage });
    assert.equal(ok.piped, true);
    assert.equal(ok.headers['Content-Type'], 'application/octet-stream');
    assert.match(ok.headers['Content-Disposition'], /^attachment; filename\*=UTF-8''Caso%20%C3%A9xito\.pdf$/);
    const other = response();
    await servePublicQuotationFile({ params: { uuid_slug: 'slug-1', fileId: 'z' } }, other, { db, storage });
    assert.equal(other.code, 404);
    const draft = response();
    await servePublicQuotationFile({ params: { uuid_slug: 'slug-3', fileId: 'a' } }, draft, { db, storage });
    assert.equal(draft.code, 404);
});

test('el barrido borra solo los sueltos de más de un día', async () => {
    const now = new Date('2026-11-28T12:00:00Z');
    const db = fakeDb([
        { id: 'viejo', storageKey: 'quotations/viejo.pdf', quotationId: null, createdAt: new Date('2026-11-26T12:00:00Z') },
        { id: 'nuevo', storageKey: 'quotations/nuevo.pdf', quotationId: null, createdAt: new Date('2026-11-28T08:00:00Z') },
        { id: 'ligado', storageKey: 'quotations/ligado.pdf', quotationId: 'q1', createdAt: new Date('2026-01-01T00:00:00Z') }
    ]);
    const removed = [];
    const result = await sweepQuotationFiles({ db, storage: { remove: async (key) => removed.push(key) }, now });
    assert.deepEqual(removed, ['quotations/viejo.pdf']);
    assert.equal(result.deleted, 1);
    assert.deepEqual(db.rows.map(row => row.id), ['nuevo', 'ligado']);
});
