import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/components/modules/FinancialDashboard.jsx', import.meta.url), 'utf8');

test('financial dashboard confirms audited files through the commit endpoint', () => {
    assert.match(source, /import\/commit/);
    assert.match(source, /Importar a base de datos/);
    assert.match(source, /invalidateQueries\(\{\s*queryKey:\s*\['financials-dashboard-data'\]/);
    assert.match(source, /data\.sourceSummary\?\.totals/);
    assert.match(source, /Total oficial/);
    assert.match(source, /Celdas detectadas/);
});
