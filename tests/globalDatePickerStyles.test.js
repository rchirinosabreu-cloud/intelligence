import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readSource = (relativePath) => fs.readFileSync(
    new URL(`../${relativePath}`, import.meta.url),
    'utf8'
);

test('the React DatePicker base stylesheet is loaded once at the application entry point', () => {
    const stylesheetImport = /react-datepicker\/dist\/react-datepicker\.css/g;
    const entrySource = readSource('src/main.jsx');
    const moduleSources = [
        'src/components/modules/Activity/OperationalCalendar.jsx',
        'src/components/modules/ContentPlanDetail.jsx',
        'src/components/modules/TaskCreateModal.jsx',
        'src/components/modules/TaskEditModal.jsx',
        'src/components/modules/TaskSidePanel.jsx',
        'src/components/modules/FinancialDashboard.jsx',
        'src/components/modules/financial/FinancialLedger.jsx'
    ].map(readSource);

    assert.equal((entrySource.match(stylesheetImport) || []).length, 1);
    assert.equal(moduleSources.reduce(
        (total, source) => total + (source.match(stylesheetImport) || []).length,
        0
    ), 0);
});
