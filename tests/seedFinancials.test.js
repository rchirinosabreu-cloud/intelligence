import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Financial Seeding & Horizontal Parsing Engine', async (t) => {
    const dataDir = path.join(__dirname, '../data');
    const file2026 = path.join(dataDir, 'FINANZAS_BRAIN_STUDIO_2026.xlsx');
    const fileHist = path.join(dataDir, 'FINANZAS_BRAIN_STUDIO_2021_2025.xlsx');

    await t.test('Prueba 1: Presencia de archivos Excel generados/descargados', () => {
        assert.ok(fs.existsSync(file2026), 'El archivo 2026 de finanzas debe existir');
        assert.ok(fs.existsSync(fileHist), 'El archivo histórico de finanzas debe existir');
    });

    await t.test('Prueba 2: Estructura interna de Resumen BRAIN AÑOS', () => {
        const wbHist = xlsx.readFile(fileHist);
        const sheetName = wbHist.SheetNames[0];
        assert.strictEqual(sheetName, 'Resumen BRAIN AÑOS');

        const ws = wbHist.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });

        // Assert headers & section markers
        assert.ok(rows.length >= 5, 'Deben existir filas en el histórico');
        const headers = rows[0];
        assert.strictEqual(headers[0], 'Concepto');
        assert.strictEqual(headers[1], '2021-01-01');

        // Check sections
        const concepts = rows.map(r => r[0]);
        assert.ok(concepts.includes('INGRESOS'), 'Debe existir la sección de ingresos');
        assert.ok(concepts.includes('EGRESOS'), 'Debe existir la sección de egresos');
        assert.ok(concepts.includes('Bonsai CTG'), 'Debe existir el cliente Bonsai CTG');
    });

    await t.test('Prueba 3: Estructura interna de FINANZAS BRAIN STUDIO 2026', () => {
        const wb = xlsx.readFile(file2026);
        assert.ok(wb.SheetNames.includes('FINANZAS BRAIN STUDIO 2026'), 'Debe existir la hoja de 2026');
        assert.ok(wb.SheetNames.includes('MOROSOS'), 'Debe existir la hoja de MOROSOS');
        assert.ok(wb.SheetNames.includes('NOMINA'), 'Debe existir la hoja de NOMINA');
        assert.ok(wb.SheetNames.includes('AJUSTES_NOMINA'), 'Debe existir la hoja de AJUSTES_NOMINA');

        // Verify Morosos structure
        const wsMorosos = wb.Sheets['MOROSOS'];
        const rowsMorosos = xlsx.utils.sheet_to_json(wsMorosos, { header: 1 });
        const headersMorosos = rowsMorosos[0];
        assert.strictEqual(headersMorosos[0], 'Cliente');
        assert.strictEqual(headersMorosos[1], 'Mes');
        assert.strictEqual(headersMorosos[2], 'Monto');
        assert.strictEqual(rowsMorosos[1][0], 'Muebles Nuva');
        assert.strictEqual(rowsMorosos[1][4], 'DEBE');
    });

    await t.test('Prueba 4: Estructura de Personal (NOMINA Sheet Column check)', () => {
        const wb = xlsx.readFile(file2026);
        const wsNomina = wb.Sheets['NOMINA'];
        const rowsNomina = xlsx.utils.sheet_to_json(wsNomina, { header: 1 });
        const headersNomina = rowsNomina[0].map(h => String(h).trim().toUpperCase());

        assert.ok(headersNomina.includes('COLABORADOR/EMAIL'), 'La hoja de NOMINA debe contener la columna Colaborador/Email');
        assert.ok(headersNomina.includes('SALARIO BASE'), 'La hoja de NOMINA debe contener la columna Salario Base');
        assert.ok(headersNomina.includes('SEGURIDAD SOCIAL'), 'La hoja de NOMINA debe contener la columna Seguridad Social');
    });
});
