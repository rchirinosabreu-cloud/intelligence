import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FINANCIAL_CATEGORY_OPTIONS, financialCategoryLabel } from '../src/lib/financialCategories.js';
import { FINANCIAL_CATEGORIES } from '../src/services/financialRecordService.js';

const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

// La lista con nombres para leer y la que valida el servidor tienen que ser la misma.
// Si se separan, la barra de filtros ofrece una categoría que el backend rechaza,
// o deja de ofrecer una que sí existe y nadie puede filtrar por ella.
test('el catálogo de la pantalla coincide con el que valida el servidor', () => {
    const shown = FINANCIAL_CATEGORY_OPTIONS.map(([value]) => value);
    assert.deepEqual([...shown].sort(), [...FINANCIAL_CATEGORIES].sort());
});

test('el catálogo coincide con el enum de Prisma', () => {
    const block = /enum FinancialCategory \{([\s\S]*?)\}/.exec(schema);
    assert.ok(block, 'no se encontró el enum FinancialCategory');
    const inSchema = block[1].split('\n').map((line) => line.trim()).filter(Boolean);
    const shown = FINANCIAL_CATEGORY_OPTIONS.map(([value]) => value);
    assert.deepEqual([...shown].sort(), [...inSchema].sort());
});

test('cada categoría tiene una etiqueta legible y distinta', () => {
    const labels = FINANCIAL_CATEGORY_OPTIONS.map(([, label]) => label);
    assert.equal(new Set(labels).size, labels.length, 'dos categorías no pueden verse igual');
    for (const [value, label] of FINANCIAL_CATEGORY_OPTIONS) {
        assert.notEqual(label, value, `${value} se está mostrando en mayúsculas de base de datos`);
    }
});

test('una categoría desconocida se muestra tal cual en vez de desaparecer', () => {
    assert.equal(financialCategoryLabel('ADMINISTRATIVO'), 'Administrativo');
    assert.equal(financialCategoryLabel('INVENTADA'), 'INVENTADA');
});
