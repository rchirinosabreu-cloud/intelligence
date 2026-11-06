import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasModuleAccess, readModulePermissions } from '../src/lib/platformModules.js';
import { inferAreasFromCargo } from '../src/lib/teamAreas.js';

// Lo que une Pautas con el resto de la plataforma, y las reglas de la casa que una pantalla nueva tiene que cumplir.
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('las tablas del esquema y las del arranque dicen las mismas columnas', () => {
    const schema = source('prisma/schema.prisma');
    const script = source('scripts/ensure-ad-budgets-schema.js');
    for (const model of ['AdBudget', 'AdBudgetCycle', 'AdSpendReading', 'AdCampaign', 'AdBudgetAlert']) {
        const body = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)[1];
        const table = new RegExp(`CREATE TABLE IF NOT EXISTS "${model}" \\(([\\s\\S]*?)\\n    \\);`).exec(script)[1];
        const columns = body.split('\n').map((line) => line.trim()).filter((line) => /^[a-z]/.test(line))
            .filter((line) => /^\w+\s+(String|Decimal|DateTime|Boolean)\b/.test(line)).map((line) => line.split(/\s+/)[0]);
        assert.ok(columns.length >= 4, model);
        for (const column of columns) assert.match(table, new RegExp(`(^|\\s|")${column}("|\\s)`), `${model}.${column}`);
    }
    assert.match(source('package.json'), /ensure-ad-budgets-schema\.js && node scripts\/ensure-audit-immutability/);
});

test('quien ya tiene Manager entra a Pautas sin tocar la base, y a quien lleva la pauta se le marca la casilla', () => {
    assert.equal(hasModuleAccess({ role: 'PROJECT_MANAGER', modulePermissions: { manager: true } }, 'pautas'), true);
    assert.equal(hasModuleAccess({ role: 'EDITOR', modulePermissions: { gestion: true } }, 'pautas'), false);
    assert.equal(hasModuleAccess({ role: 'EDITOR', modulePermissions: { pautas: true } }, 'pautas'), true);
    assert.equal(readModulePermissions({ manager: true, pautas: false }).pautas, false, 'quitarlo a mano se respeta');
});

test('el área de Pauta se deduce del cargo mientras nadie la elija', () => {
    assert.deepEqual(inferAreasFromCargo('Encargada de pauta'), ['PAUTA']);
    assert.deepEqual(inferAreasFromCargo('Trafficker digital'), ['PAUTA']);
});

test('la pantalla usa los controles compartidos y respeta el servidor', () => {
    const screens = ['src/components/modules/AdBudgets/AdBudgets.jsx', 'src/components/modules/AdBudgets/AdBudgetDialogs.jsx', 'src/components/modules/AdBudgets/ClientAdBudgets.jsx'].map(source).join('\n');
    assert.doesNotMatch(screens, /<select\b/, 'toda selección simple usa Select');
    assert.doesNotMatch(screens, /type="(date|datetime-local|time|number)"/, 'fechas con BrainDatePicker y dinero con MoneyInput');
    assert.doesNotMatch(screens, /(purple|violet|indigo|fuchsia|sky|teal|emerald|red|rose)-\d/, 'solo tokens de marca');
    assert.doesNotMatch(screens, /#[0-9a-f]{6}/i);
    assert.doesNotMatch(screens, /[^:]bg-white(?![^"'`]*dark:)/, 'todo fondo blanco tiene su pareja oscura');
    const dialogs = source('src/components/modules/AdBudgets/AdBudgetDialogs.jsx');
    const successes = [...dialogs.matchAll(/toast\.success/g)];
    assert.ok(successes.length >= 7);
    for (const { index } of successes) assert.match(dialogs.slice(Math.max(0, index - 260), index), /await \w+\.mutateAsync/, 'el éxito se dice después de la respuesta');
});

test('Operación muestra la pauta del cliente y la banda abre la pauta sin decidir nada', () => {
    assert.match(source('src/components/modules/Clients/operations/ClientOperationRoute.jsx'), /adBudgetsSection=\{<ClientAdBudgets clientId=\{client\.id\} \/>\}/);
    assert.match(source('src/components/modules/Clients/operations/ClientOperationPage.jsx'), /\{adBudgetsSection\}/);
    const band = source('src/components/notifications/ImportantNoticeBand.jsx');
    assert.match(band, /data-notice-action="open-ad-budget"/);
    assert.match(source('src/services/importantNoticeService.js'), /isAdNotice\(notice\)\) return \(await import\('\.\/adBudgetNoticeService\.js'\)\)/);
    assert.match(source('server.js'), /initAdBudgetAlertScheduler\(\)/);
});

test('la campana del project manager no lleva cifras: llega al celular', () => {
    assert.doesNotMatch(source('src/lib/adBudgetNotices.js').match(/export const adManagerSteps[\s\S]*$/)[0], /formatAdMoney|percent\}/);
});
