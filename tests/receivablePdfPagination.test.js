import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { generateReceivablePdfBuffer } from '../src/services/receivablePdfService.js';

const MM = 72 / 25.4;
const normalize = value => value.replace(/\s+/g, ' ').trim();
const issuer = {
    RECEIVABLE_ISSUER_NAME: 'EMISOR DE PRUEBA',
    RECEIVABLE_ISSUER_DOCUMENT: 'Documento de prueba',
    RECEIVABLE_ISSUER_BANK_LINE: 'Transferencia a la cuenta de prueba, referencia del documento.',
    RECEIVABLE_ISSUER_ROLE: 'Responsable de prueba',
    RECEIVABLE_ISSUER_SIGNATURE_LINE: 'Firma de prueba',
    RECEIVABLE_ISSUER_EMAIL: 'prueba@example.invalid'
};
const invoice = {
    id: 'ficticio', number: 9999, issuedAt: '2026-11-04T12:00:00Z', amount: 1000000,
    servicePeriod: 'Octubre de 2026', client: { name: 'Cliente de prueba' },
    items: [{ description: 'Servicio', amount: 1000000 }]
};

async function readPdf(receivable) {
    const data = new Uint8Array(generateReceivablePdfBuffer(receivable, issuer));
    const loading = getDocument({ data, useSystemFonts: true, isEvalSupported: false });
    const pdf = await loading.promise;
    try {
        const pages = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
            const page = await pdf.getPage(number);
            const { items } = await page.getTextContent();
            const view = page.getViewport({ scale: 1 });
            pages.push({ number, width: view.width, height: view.height, items: items.filter(item => item.str.trim()) });
        }
        return pages;
    } finally {
        await loading.destroy();
    }
}

function assertInsideMargins(pages) {
    for (const page of pages) {
        for (const item of page.items) {
            const [,,,, x, y] = item.transform;
            const location = `página ${page.number}: ${item.str}`;
            assert.ok(x >= 20 * MM - 1, `margen izquierdo, ${location}`);
            assert.ok(x + item.width <= page.width - 20 * MM + 1, `margen derecho, ${location}`);
            assert.ok(y >= 18 * MM, `margen inferior, ${location}`);
            assert.ok(y <= page.height - 18 * MM, `margen superior, ${location}`);
        }
    }
}

test('el concepto largo conserva el periodo, la instrucción de pago y la firma completos dentro de la página', async () => {
    // La longitud intermedia cortaba la firma; un concepto aún mayor sí abría otra página.
    for (const count of [22, 25, 29]) {
        const concept = Array.from({ length: count }, (_, index) =>
            `- Servicio de prueba ${index + 1}: revisión, producción y publicación de piezas aprobadas para el periodo.`).join('\n');
        const pages = await readPdf({ ...invoice, concept });
        const text = normalize(pages.flatMap(page => page.items.map(item => item.str)).join(' '));
        for (const expected of ['Periodo: Octubre de 2026', issuer.RECEIVABLE_ISSUER_BANK_LINE, 'Cordialmente,',
            'Emisor De Prueba', issuer.RECEIVABLE_ISSUER_ROLE, issuer.RECEIVABLE_ISSUER_SIGNATURE_LINE, issuer.RECEIVABLE_ISSUER_EMAIL]) {
            assert.ok(text.includes(expected), `${count} viñetas: falta ${expected}`);
        }
        assertInsideMargins(pages);
        const lastPage = normalize(pages.at(-1).items.map(item => item.str).join(' '));
        assert.ok(lastPage.includes('Cordialmente,') && lastPage.includes(issuer.RECEIVABLE_ISSUER_EMAIL), 'la despedida y la firma permanecen juntas');
    }
});

test('la tabla envuelve conceptos largos, conserva todos los importes y repite la cabecera al pasar de página', async () => {
    const items = Array.from({ length: 40 }, (_, index) => ({
        description: `Detalle ${index + 1}: ${'producción y revisión de materiales aprobados '.repeat(5)}cierre ${index + 1}.`,
        amount: 25000
    }));
    const pages = await readPdf({ ...invoice, concept: 'Servicios del periodo de prueba.', items });
    const text = normalize(pages.flatMap(page => page.items.map(item => item.str)).join(' '));
    assert.ok(pages.length > 1, 'cuarenta filas largas necesitan varias páginas');
    for (const item of items) assert.ok(text.includes(item.description), `se conserva ${item.description}`);
    assertInsideMargins(pages);
    let values = 0;
    for (const page of pages) {
        const pageText = normalize(page.items.map(item => item.str).join(' '));
        if (/Detalle \d+:/.test(pageText)) {
            assert.ok(pageText.includes('Descripción') && pageText.includes('Valor'), `cabecera en página ${page.number}`);
        }
        for (const item of page.items) {
            if (item.str.includes('producción') || item.str.includes('materiales aprobados')) {
                assert.ok(item.transform[4] + item.width <= (20 + 136 - 2.5) * MM + 1, 'la descripción no invade la columna de importe');
            }
            if (item.str.replace(/\s/g, '') === '$25.000') values += 1;
        }
    }
    assert.equal(values, items.length, 'cada importe aparece una sola vez');
    assert.ok(text.includes(issuer.RECEIVABLE_ISSUER_EMAIL), 'la firma sigue después de la tabla');
});
