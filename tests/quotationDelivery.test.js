import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalEmail, proposalWhatsAppText, quotationPublicUrl, whatsAppLink, whatsAppNumber } from '../src/lib/quotationDelivery.js';
import { emailQuotation, sendQuotationByChannel } from '../src/services/quotationDeliveryService.js';

// Enviar la propuesta al cliente al emitirla (reunión del 4 de noviembre de 2026): correo con el enlace para aceptar y el
// PDF adjunto, WhatsApp con el mensaje listo, y las dos registradas en el CRM como «Propuesta enviada».

const NOW = new Date('2026-11-04T20:00:00Z');
const quotation = {
    id: 'q1', consecutive: 42, uuid_slug: 'abc-123', status: 'ACTIVA', emisor_type: 'BRAIN_STUDIO', lead_id: 'lead-1',
    client_name: 'Darling Pérez', client_company: 'Café Altura', client_email: 'darling@cafealtura.test', client_phone: '300 123 4567',
    expires_at: new Date('2026-11-19T05:00:00Z')
};
const issuers = { BRAIN_STUDIO: { razonSocial: 'BRAIN STUDIO AGENCIA CREATIVA S.A.S' } };

const fakeDb = ({ quotations = [quotation] } = {}) => {
    const activities = [];
    const lead = { id: 'lead-1', company: 'Café Altura', stage: 'PROPUESTA_ENVIADA', archivedAt: null, activities: [] };
    return {
        activities,
        quotation: { findUnique: async ({ where }) => quotations.find((row) => row.id === where.id) || null },
        crmLead: {
            findUnique: async ({ where }) => (where.id === 'lead-1' ? { ...lead, activities, owner: null, request: null, quotations: [] } : null),
            update: async ({ data }) => ({ ...lead, ...data, activities, owner: null, request: null, quotations: [] })
        },
        crmActivity: {
            findUnique: async ({ where }) => activities.find((row) => row.requestId === where.authorId_requestId?.requestId && row.authorId === where.authorId_requestId?.authorId) || null,
            create: async ({ data }) => { const row = { id: `a${activities.length + 1}`, createdAt: NOW, ...data }; activities.push(row); return row; },
            update: async ({ where, data }) => Object.assign(activities.find((row) => row.id === where.id), data),
            findMany: async () => activities
        },
        $transaction: async (run) => run(fakeDbRef.current)
    };
};
const fakeDbRef = { current: null };
const makeDb = (options) => { fakeDbRef.current = fakeDb(options); return fakeDbRef.current; };

test('el correo saluda por el nombre, lleva el enlace para aceptar, la vigencia y el PDF adjunto', () => {
    const link = quotationPublicUrl('abc-123');
    assert.equal(link, 'https://labs.brainstudioagencia.com/cotizaciones/ver/abc-123');
    const email = proposalEmail({ consecutive: 42, clientName: 'Darling Pérez', clientCompany: 'Café Altura', link, issuerName: 'Brain Studio', expiresAt: quotation.expires_at });
    assert.equal(email.subject, 'Propuesta COT-0042 de Brain Studio para Café Altura');
    assert.match(email.text, /^Hola Darling,/);
    assert.match(email.text, /Puedes verla y aceptarla en este enlace:\nhttps:\/\/labs\.brainstudioagencia\.com\/cotizaciones\/ver\/abc-123/);
    assert.match(email.text, /vigencia hasta el 19 de noviembre de 2026/);
    assert.match(email.html, /<a href="https:\/\/labs\.brainstudioagencia\.com\/cotizaciones\/ver\/abc-123">/);
    assert.equal(email.attachmentName, 'Propuesta_COT-0042.pdf');
    assert.doesNotMatch(email.text, /vosotros|podéis/);
    const nameless = proposalEmail({ consecutive: 7, clientName: '', clientCompany: null, link });
    assert.match(nameless.text, /^Hola,\n/);
    assert.equal(nameless.subject, 'Propuesta COT-0007 de Brain Studio');
});

test('el mensaje de WhatsApp y el enlace que abre el chat con el número colombiano completo', () => {
    const text = proposalWhatsAppText({ consecutive: 42, clientName: 'Darling Pérez', clientCompany: 'Café Altura', link: 'https://x/ver/abc' });
    assert.match(text, /^Hola Darling, te compartimos la propuesta COT-0042 para Café Altura\. Puedes verla y aceptarla aquí: https:\/\/x\/ver\/abc/);
    assert.equal(whatsAppNumber('300 123 4567'), '573001234567');
    assert.equal(whatsAppNumber('+57 301 324 5468'), '573013245468');
    assert.equal(whatsAppNumber('12'), null);
    assert.match(whatsAppLink('300 123 4567', 'hola mundo'), /^https:\/\/wa\.me\/573001234567\?text=hola%20mundo$/);
    assert.equal(whatsAppLink('', 'x'), null);
});

test('al emitir, el correo sale con el PDF y queda como «Propuesta enviada» en la oportunidad; sin correo del cliente se dice', async () => {
    const db = makeDb();
    const sent = [];
    const send = async (mail) => { sent.push(mail); return { sent: true }; };
    const pdf = async (row) => Buffer.from(`pdf-${row.consecutive}`);
    const result = await emailQuotation(db, quotation, issuers.BRAIN_STUDIO, { send, pdf, actor: { userId: 'u-elisa' }, now: NOW });
    assert.deepEqual([result.sent, result.to], [true, 'darling@cafealtura.test']);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, 'Propuesta COT-0042 de BRAIN STUDIO AGENCIA CREATIVA S.A.S para Café Altura');
    assert.deepEqual(sent[0].attachments.map((file) => [file.filename, file.contentType, file.content.toString()]), [['Propuesta_COT-0042.pdf', 'application/pdf', 'pdf-42']]);
    // Rodny, 12 de noviembre de 2026: las propuestas salen de contacto@ y las respuestas del cliente vuelven ahí.
    assert.equal(sent[0].from, 'Brain Studio <contacto@brainstudioagencia.com>');
    assert.equal(sent[0].replyTo, 'contacto@brainstudioagencia.com');
    assert.equal(db.activities.length, 1);
    assert.equal(db.activities[0].type, 'PROPUESTA_ENVIADA');
    assert.match(db.activities[0].note, /Propuesta COT-0042 enviada por correo a darling@cafealtura\.test/);
    assert.equal(db.activities[0].authorId, 'u-elisa');

    const noEmail = await emailQuotation(makeDb(), { ...quotation, client_email: '' }, issuers.BRAIN_STUDIO, { send, pdf, now: NOW });
    assert.deepEqual([noEmail.sent, noEmail.reason], [false, 'sin-correo']);

    const unconfigured = await emailQuotation(makeDb(), quotation, issuers.BRAIN_STUDIO, { send: async () => ({ sent: false, reason: 'smtp-not-configured' }), pdf, now: NOW });
    assert.match(unconfigured.message, /no está configurado/);
    const failing = await emailQuotation(makeDb(), quotation, issuers.BRAIN_STUDIO, { send: async () => { throw new Error('SMTP caído'); }, pdf, now: NOW });
    assert.deepEqual([failing.sent, failing.reason], [false, 'error']);
    assert.match(failing.message, /SMTP caído/);
});

test('reenviar exige una propuesta emitida; WhatsApp solo registra la gestión, el envío lo hace la persona', async () => {
    const send = async () => ({ sent: true });
    const pdf = async () => Buffer.from('pdf');
    await assert.rejects(sendQuotationByChannel(makeDb(), 'q1', 'PALOMA', issuers, {}, { send, pdf }), { statusCode: 400 });
    await assert.rejects(sendQuotationByChannel(makeDb({ quotations: [] }), 'q1', 'CORREO', issuers, {}, { send, pdf }), { statusCode: 404 });
    await assert.rejects(sendQuotationByChannel(makeDb({ quotations: [{ ...quotation, status: 'BORRADOR' }] }), 'q1', 'CORREO', issuers, {}, { send, pdf }), { statusCode: 409 });
    const db = makeDb();
    const whatsapp = await sendQuotationByChannel(db, 'q1', 'WHATSAPP', issuers, { userId: 'u-francys' }, { now: NOW });
    assert.equal(whatsapp.recorded, true);
    assert.match(db.activities[0].note, /enviada por WhatsApp/);
    const again = await sendQuotationByChannel(db, 'q1', 'WHATSAPP', issuers, { userId: 'u-francys' }, { now: NOW });
    assert.equal(again.recorded, true);
    assert.equal(db.activities.length, 1, 'el mismo canal el mismo día no se repite en la bitácora');
    const resent = await sendQuotationByChannel(db, 'q1', 'CORREO', issuers, { userId: 'u-francys' }, { send, pdf, now: NOW });
    assert.equal(resent.sent, true);
    assert.equal(db.activities.length, 2);
});
