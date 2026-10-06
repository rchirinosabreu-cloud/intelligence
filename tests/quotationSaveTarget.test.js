import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { quotationSaveTarget } from '../src/lib/quotationSaveTarget.js';

// Elisa, 6 de octubre de 2026: «hice una sola cotización, la primera de 800 la di guardar en
// borrador, y luego ajusté el precio y le di emitir y quedaron 2» (COT-0040 borrador y COT-0041
// activa, Colegio Pablo Hoff). La página «Nueva propuesta» decidía crear o actualizar por la
// dirección; tras guardar el borrador seguía siendo «nueva» y el segundo guardado creaba otra.

test('la primera vez se crea; desde que existe, se actualiza la misma', () => {
    assert.deepEqual(quotationSaveTarget(undefined, null), { method: 'POST', path: '/api/quotations' });
    assert.deepEqual(quotationSaveTarget(undefined, 'q-40'), { method: 'PUT', path: '/api/quotations/q-40' }, 'tras guardar el borrador');
    assert.deepEqual(quotationSaveTarget('q-12', null), { method: 'PUT', path: '/api/quotations/q-12' }, 'abierta desde «Editar»');
    assert.deepEqual(quotationSaveTarget('q-12', 'q-99'), { method: 'PUT', path: '/api/quotations/q-12' }, 'manda la de la dirección');
});

test('el formulario recuerda la cotización que creó y no guarda dos veces a la vez', () => {
    const form = fs.readFileSync(new URL('../src/components/modules/Quotations/QuotationForm.jsx', import.meta.url), 'utf8');
    assert.match(form, /quotationSaveTarget\(id, savedQuotationId\)/);
    assert.match(form, /setSavedQuotationId\(data\.id\)/, 'tras crear, guarda el número de la cotización');
    assert.match(form, /savingRef\.current/, 'dos toques rápidos no mandan dos guardados');
    assert.doesNotMatch(form, /const method = isEditing \? 'PUT' : 'POST'/);
});
