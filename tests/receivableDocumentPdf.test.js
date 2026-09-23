import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildReceivableDocumentModel,
    generateReceivablePdfBuffer,
    openReceivablePdf,
    receivablePdfFilename,
    receivablePdfStorageKey,
    storeReceivablePdf
} from '../src/services/receivablePdfService.js';
import { issueReceivableDocument } from '../src/services/receivableDocumentService.js';

// El PDF de la cuenta de cobro, comprobado contra el documento real No. 0389
// (Corporación Deportiva Los Titanes, agosto–septiembre de 2026) que Rodny pasó el 22
// de septiembre. Lo que se comprueba es lo que el documento dice, no cómo se dibuja.

const titanes = {
    id: 'debt-0389',
    number: 389,
    issuedAt: '2026-09-21T12:00:00.000Z',
    amount: 1200000,
    servicePeriod: '20 de agosto al 19 de septiembre',
    concept: [
        'Prestación de servicios para el diseño y ejecución de estrategias de comunicación digital para la marca, con el objetivo de visibilizar, posicionar y promocionar los servicios y productos que ofrecen en las diferentes redes sociales. Este servicio incluye:',
        '- Planeación mensual de contenidos (parrilla) con enfoque estratégico',
        '- Definición de línea visual y narrativa de marca',
        '- 6 contenidos mensuales distribuidos así: 3 videos tipo reels, 2 post, 1 carrusel.',
        '- 4 historias mensuales.',
        '- Copywriting profesional orientado a atracción y conversión.',
        '- 1 jornada mensual de producción audiovisual (2 horas) para generación de contenido.',
        '- Administración y gestión de pauta digital.'
    ].join('\n'),
    items: [
        { description: 'Fee mensual', amount: 800000 },
        { description: 'Inversión de pauta en Meta Ads', amount: 400000 }
    ],
    client: {
        id: 'client-1',
        name: 'Titanes',
        legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES',
        documentType: 'NIT',
        documentNumber: '901378858'
    }
};

test('el documento dice lo mismo que la cuenta de cobro real 0389', () => {
    const model = buildReceivableDocumentModel(titanes);
    assert.equal(model.title, 'Cuenta de cobro No. 0389');
    assert.equal(model.place, 'Cartagena de Indias D.T y C. 21 de septiembre de 2026');
    // El deudor es el nombre legal y el NIT de su ficha, nunca el nombre corto del equipo.
    assert.equal(model.debtorName, 'CORPORACIÓN DEPORTIVA LOS TITANES');
    assert.equal(model.debtorDocument, 'NIT: 901378858');
    assert.equal(model.amountInWords, 'UN MILLÓN DOSCIENTOS MIL PESOS');
    assert.match(model.amountInFigures, /1\.200\.000/);
    assert.equal(model.servicePeriod, '20 de agosto al 19 de septiembre');
});

// La cuenta de cobro la firma Francisco Villa como persona natural: eso es lo que la
// hace cuenta de cobro y no factura, y por eso nunca lleva IVA.
test('quien cobra es la persona natural, y el documento no menciona impuestos', () => {
    const model = buildReceivableDocumentModel(titanes);
    assert.equal(model.issuer.name, 'FRANCISCO VILLA ZÚÑIGA');
    assert.equal(model.issuer.documentLabel, "CC. 1'235.038.569");
    assert.match(model.issuer.bankLine, /Bancolombia 08579170345/);
    assert.equal(model.tax, undefined);
    assert.equal(model.subtotal, undefined);
});

test('el emisor se puede cambiar por entorno sin tocar el código', () => {
    const model = buildReceivableDocumentModel(titanes, { RECEIVABLE_ISSUER_NAME: 'OTRA PERSONA', RECEIVABLE_ISSUER_CITY: 'Bogotá' });
    assert.equal(model.issuer.name, 'OTRA PERSONA');
    assert.equal(model.place, 'Bogotá 21 de septiembre de 2026');
});

test('el concepto separa el párrafo de sus viñetas, como se escribe en Word', () => {
    const { concept } = buildReceivableDocumentModel(titanes);
    assert.equal(concept[0].kind, 'paragraph');
    assert.match(concept[0].text, /^Prestación de servicios/);
    const bullets = concept.filter((block) => block.kind === 'bullet');
    assert.equal(bullets.length, 7);
    assert.equal(bullets[0].text, 'Planeación mensual de contenidos (parrilla) con enfoque estratégico');
    // El guion de la línea es la marca de viñeta: no se imprime dentro del texto.
    assert.ok(bullets.every((block) => !block.text.startsWith('-')));
});

// Con un solo concepto el documento no lleva tabla, como el de Elvira Utria.
test('la tabla de conceptos solo aparece cuando hay más de uno', () => {
    assert.equal(buildReceivableDocumentModel(titanes).items.length, 2);
    const unico = buildReceivableDocumentModel({ ...titanes, items: [{ description: 'Fee mensual', amount: 1200000 }] });
    assert.equal(unico.items.length, 0);
    assert.equal(unico.total, 1200000);
});

test('el PDF se genera y es un PDF', () => {
    const buffer = generateReceivablePdfBuffer(titanes);
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(buffer.length > 1000);
});

// Escribir el importe en letras es parte del documento: sin eso no se manda.
test('un importe que no se puede escribir en letras no se convierte en un PDF mudo', () => {
    assert.throws(
        () => generateReceivablePdfBuffer({ ...titanes, amount: 9_999_999_999 }),
        /no se puede escribir en letras/
    );
});

test('el archivo se nombra como lo nombra Elisa, y su clave es estable', () => {
    assert.equal(receivablePdfFilename(titanes), 'Cuenta de cobro No. 0389 - CORPORACIÓN DEPORTIVA LOS TITANES.pdf');
    assert.equal(receivablePdfStorageKey(titanes), 'receivables/debt-0389/cuenta-de-cobro-0389.pdf');
    // Una barra en el nombre del cliente no puede inventar una carpeta ni romper la cabecera.
    assert.equal(receivablePdfFilename({ ...titanes, client: { name: 'A/B\nC' } }), 'Cuenta de cobro No. 0389 - A B C.pdf');
});

const fakeStorage = () => {
    const objects = new Map();
    return {
        objects,
        isConfigured: () => true,
        upload: async ({ key, body }) => { objects.set(key, body); return key; },
        get: async (key) => {
            if (!objects.has(key)) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
            return { ContentLength: objects.get(key).length, Body: objects.get(key) };
        }
    };
};

const fakePrisma = (receivable) => {
    const updates = [];
    return {
        updates,
        client: {
            accountsReceivable: {
                findUnique: async () => receivable,
                update: async (args) => { updates.push(args); Object.assign(receivable, args.data); return receivable; }
            }
        }
    };
};

test('guardar el PDF deja su clave en la obligación', async () => {
    const storage = fakeStorage();
    const { client, updates } = fakePrisma({ ...titanes });

    const key = await storeReceivablePdf(client, storage, titanes);

    assert.equal(key, 'receivables/debt-0389/cuenta-de-cobro-0389.pdf');
    assert.equal(updates[0].data.pdfStorageKey, key);
    assert.equal(storage.objects.get(key).subarray(0, 5).toString('latin1'), '%PDF-');
});

// La cuenta de cobro ya tiene su número: tumbar la petición haría creer que no se
// emitió, y el número no volvería atrás.
test('un fallo del almacenamiento no tumba la emisión', async () => {
    const storage = { isConfigured: () => true, upload: async () => { throw new Error('el bucket no responde'); } };
    const { client, updates } = fakePrisma({ ...titanes });

    const key = await storeReceivablePdf(client, storage, titanes);

    assert.equal(key, null);
    assert.equal(updates.length, 0);
});

test('sin bucket configurado no se intenta guardar nada', async () => {
    let uploaded = false;
    const storage = { isConfigured: () => false, upload: async () => { uploaded = true; } };
    assert.equal(await storeReceivablePdf(fakePrisma({ ...titanes }).client, storage, titanes), null);
    assert.equal(uploaded, false);
});

test('emitir genera el PDF y lo guarda, y devuelve su clave con la obligación', async () => {
    const storage = fakeStorage();
    const issued = { ...titanes, number: null, pdfStorageKey: null };
    const tx = {
        accountsReceivable: {
            findUnique: async () => ({
                id: 'debt-0389', clientId: 'client-1', amount: 100, status: 'DEBE', number: null,
                client: titanes.client, period: new Date('2026-09-01T12:00:00Z'), year: 2026, month: 9, payments: []
            }),
            aggregate: async () => ({ _max: { number: 388 } }),
            update: async (args) => Object.assign(issued, args.data, { id: 'debt-0389', client: titanes.client, items: titanes.items })
        },
        receivableItem: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 2 }) },
        financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
        financialAuditEvent: { create: async () => ({ id: 'audit-1' }) }
    };
    const { client } = fakePrisma(issued);
    const prismaClient = { ...client, $transaction: async (callback) => callback(tx) };

    const result = await issueReceivableDocument(prismaClient, 'debt-0389', {
        concept: titanes.concept, items: titanes.items, servicePeriod: titanes.servicePeriod, issuedAt: '2026-09-21'
    }, { id: 'user-1' }, { storage, startNumber: 389 });

    assert.equal(result.document.formattedNumber, 'No. 0389');
    const key = 'receivables/debt-0389/cuenta-de-cobro-0389.pdf';
    assert.equal(result.receivable.pdfStorageKey, key);
    assert.equal(storage.objects.get(key).subarray(0, 5).toString('latin1'), '%PDF-');
});

test('el PDF guardado al emitir es el que se descarga después', async () => {
    const storage = fakeStorage();
    const receivable = { ...titanes, pdfStorageKey: null };
    const { client } = fakePrisma(receivable);
    await storeReceivablePdf(client, storage, receivable);
    const congelado = storage.objects.get(receivable.pdfStorageKey);
    // Aunque la ficha del cliente cambie de nombre después, lo que se descarga sigue
    // siendo el documento que se le mandó.
    receivable.client = { ...titanes.client, legalName: 'OTRO NOMBRE S.A.S.' };

    const { object, buffer } = await openReceivablePdf(client, storage, 'debt-0389');

    assert.equal(buffer, undefined);
    assert.equal(object.Body, congelado);
});

test('si el PDF guardado no se puede leer, la descarga lo regenera en vez de fallar', async () => {
    const storage = fakeStorage();
    const receivable = { ...titanes, pdfStorageKey: 'receivables/debt-0389/perdido.pdf' };
    const { client } = fakePrisma(receivable);

    const { buffer, filename } = await openReceivablePdf(client, storage, 'debt-0389');

    assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.equal(filename, 'Cuenta de cobro No. 0389 - CORPORACIÓN DEPORTIVA LOS TITANES.pdf');
    // Y se aprovecha para dejarlo guardado donde toca.
    assert.equal(receivable.pdfStorageKey, 'receivables/debt-0389/cuenta-de-cobro-0389.pdf');
});

test('una obligación sin emitir no tiene documento que descargar', async () => {
    const { client } = fakePrisma({ ...titanes, number: null });
    await assert.rejects(
        openReceivablePdf(client, fakeStorage(), 'debt-0389'),
        (error) => error.code === 'RECEIVABLE_NOT_ISSUED' && error.statusCode === 409 && /Emítela/.test(error.message)
    );
});

test('una obligación que no existe se dice, no se inventa un documento', async () => {
    const client = { accountsReceivable: { findUnique: async () => null } };
    await assert.rejects(
        openReceivablePdf(client, fakeStorage(), 'debt-404'),
        (error) => error.code === 'RECEIVABLE_NOT_FOUND' && error.statusCode === 404
    );
});
