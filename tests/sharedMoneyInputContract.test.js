import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Un solo campo de dinero en toda la plataforma (Rodny, 30 de septiembre de 2026: «cuando
// lo estoy escribiendo no hace los puntos de cada tres dígitos … esto debe ser GLOBAL»).
// Un `<input type="number">` no puede mostrar los puntos, así que en los valores de dinero
// está prohibido: se usa `src/components/ui/MoneyInput.jsx`.
//
// Lo que sí puede seguir siendo un campo numérico del navegador son los números que no son
// dinero. Están contados aquí, archivo por archivo: un campo de dinero nuevo con
// `type="number"` sube la cuenta y esta prueba lo frena.
const NON_MONEY_NUMBER_FIELDS = {
    // Año de la parrilla.
    'src/components/modules/ContentGrids/CreatePlanModal.jsx': 1,
    // Cantidad de un servicio, meses de duración y el descuento cuando es un porcentaje
    // (en el escenario y en el resumen).
    'src/components/modules/Quotations/QuotationForm.jsx': 4,
    // Duración «desde» y «hasta», días de una cuota y la cuota cuando es un porcentaje.
    'src/components/modules/Quotations/ProposalDetailsEditor.jsx': 4,
    // Variación porcentual de una métrica.
    'src/components/reports/ReportEvidenceWorkspace.jsx': 1
};

const ROOT = new URL('..', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, ROOT), 'utf8');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(jsx?|tsx?)$/.test(entry.name) ? [full] : [];
});

const componentsDir = new URL('src/components/', ROOT);
const files = walk(componentsDir.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const relativeOf = (file) => path.relative(new URL('.', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'), file).split(path.sep).join('/');

// Los ejes de las gráficas también dicen `type="number"` y no son campos.
const numberInputsIn = (source) => {
    const all = (source.match(/type=["']number["']/g) || []).length;
    const axes = (source.match(/<[XYZ]Axis\s+type=["']number["']/g) || []).length;
    return all - axes;
};

test('ningún campo de dinero es un campo numérico del navegador', () => {
    const found = {};
    for (const file of files) {
        const count = numberInputsIn(fs.readFileSync(file, 'utf8'));
        if (count) found[relativeOf(file)] = count;
    }
    assert.deepEqual(found, NON_MONEY_NUMBER_FIELDS,
        'Si es un valor de dinero, usa MoneyInput. Si de verdad no lo es (una cantidad, un año, un porcentaje), añádelo a la lista con su razón.');
});

test('los campos de dinero de cada módulo usan el campo compartido', () => {
    const uses = (file) => assert.match(read(file), /import MoneyInput from '@\/components\/ui\/MoneyInput'/, `${file} tiene que usar MoneyInput`);
    [
        'src/components/modules/FinancialDashboard.jsx',
        'src/components/modules/financial/FinancialLedger.jsx',
        'src/components/modules/financial/ReceivablePaymentDialog.jsx',
        'src/components/modules/Quotations/QuotationForm.jsx',
        'src/components/modules/Quotations/ServiceCatalogModal.jsx',
        'src/components/modules/Quotations/ProposalDetailsEditor.jsx',
        'src/components/modules/Crm/CrmLeadForm.jsx',
        'src/components/public/CommercialRequest/CommercialRequestForm.jsx',
        'src/components/modules/Reports.jsx',
        'src/components/reports/ReportEvidenceWorkspace.jsx'
    ].forEach(uses);
});

test('el campo compartido es de texto con teclado numérico y entrega el valor limpio', () => {
    const source = read('src/components/ui/MoneyInput.jsx');
    assert.match(source, /type="text"/);
    assert.match(source, /inputMode=\{decimals > 0 \|\| allowNegative \? 'decimal' : 'numeric'\}/);
    assert.match(source, /onChange\?\.\(next\.value\)/);
    // Los topes que daba el campo numérico siguen avisando.
    assert.match(source, /setCustomValidity/);
});

// En el CRM «1.200» se guardaba como 1,20 y «1.200.000» daba error.
test('el CRM lee el valor cotizado con la misma regla que el campo', () => {
    assert.match(read('src/services/crmService.js'), /parseAmountText/);
});
