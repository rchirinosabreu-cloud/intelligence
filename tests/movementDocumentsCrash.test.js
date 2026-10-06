import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { documentRecordId } from '../src/lib/financialDocumentsClient.js';

// Elisa, 6 de octubre de 2026 (referencia E-X88NJ2, desde el iPhone): «Algo falló en esta
// pantalla» cada vez que añadía un movimiento. Al registrar uno nuevo con fotos, la pantalla las
// subía y las pintaba en el formulario, que seguía en modo «nuevo» (`editingRecord` nulo); la
// miniatura de una imagen pedía su archivo con `editingRecord.id` y eso tumbaba la pantalla:
// «null is not an object (evaluating 'v.id')». Un PDF no pide miniatura, por eso no siempre pasaba.

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('el movimiento de un documento sale del propio documento, no del formulario', () => {
    assert.equal(documentRecordId({ id: 'doc-1', recordId: 'rec-nuevo' }, null), 'rec-nuevo', 'recién creado: el formulario aún no sabe su número');
    assert.equal(documentRecordId({ id: 'doc-1' }, { id: 'rec-editado' }), 'rec-editado');
    assert.equal(documentRecordId({ id: 'doc-1', recordId: 'rec-a' }, { id: 'rec-b' }), 'rec-a', 'manda el del documento');
    assert.equal(documentRecordId({ id: 'doc-1' }, null), null, 'sin número no se pide nada');
    assert.equal(documentRecordId(null, null), null);
});

test('el formulario de movimientos nunca lee el número del formulario para un documento', () => {
    const ledger = read('../src/components/modules/financial/FinancialLedger.jsx');
    const start = ledger.indexOf('{formDocuments.map((item) =>');
    assert.ok(start > 0, 'el bloque de documentos del formulario existe');
    const cards = ledger.slice(start, start + 1400);
    assert.doesNotMatch(cards, /editingRecord\.id/, 'con un movimiento nuevo editingRecord es nulo');
    assert.match(cards, /documentRecordId\(item, editingRecord\)/);
});

test('una compilación sin commit no se llama «development»', () => {
    // En producción todas las versiones salían como «development» y no se podían distinguir.
    const config = read('../vite.config.js');
    assert.match(config, /isBuild \? `build-\$\{Date\.now\(\)\.toString\(36\)\}` : 'development'/);
});

test('una miniatura que no carga no tumba la pantalla', () => {
    const gallery = read('../src/components/modules/financial/FinancialDocumentGallery.jsx');
    // Un fallo síncrono de fetchBlob se convierte en una promesa rechazada y se registra.
    assert.match(gallery, /Promise\.resolve\(\)\s*\.then\(\(\) => fetchBlob\(item\)\)/);
});
