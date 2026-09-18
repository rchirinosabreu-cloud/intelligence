import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const files = [
  'src/components/modules/Crm/CrmLayout.jsx',
  'src/components/modules/Crm/CrmDashboard.jsx',
  'src/components/modules/Crm/CrmLeadList.jsx',
  'src/components/modules/Crm/CrmLeadDetail.jsx',
  'src/components/modules/Crm/CrmLeadForm.jsx',
  'src/components/modules/Crm/CrmActivityForm.jsx',
  'src/components/modules/Crm/CrmActivityTimeline.jsx',
  'src/components/modules/Crm/CrmFollowUps.jsx',
  'src/components/modules/Crm/CrmFilters.jsx',
  'src/components/modules/Crm/CrmStatCard.jsx',
  'src/components/modules/Crm/crmPresentation.jsx'
];

for (const file of files) {
  test(`${file} compiles as JSX`, async () => {
    const source = await readFile(file, 'utf8');
    await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
  });
}

test('CRM screens use shared controls and brand tokens instead of local colors', async () => {
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /<select[\s>]/, `${file} must use the shared Select`);
    assert.doesNotMatch(source, /\b(bg|text|border)-(red|rose)-\d{2,3}\b/, `${file} must use the destructive token for red`);
    assert.doesNotMatch(source, /#(E11D48|009EB9|009BBF|31AA8A|A8118C|FF6A68|FCD200)/i, `${file} must not hardcode brand hexadecimals`);
  }
});
