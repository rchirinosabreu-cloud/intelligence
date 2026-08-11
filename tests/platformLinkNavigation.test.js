import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolvePlatformLink, openPlatformLink } from '../src/lib/platformNavigation.js';

test('same-origin links resolve to an in-app route', () => {
  assert.deepEqual(
    resolvePlatformLink('https://labs.brainstudioagencia.com/parrillas/plan-1?item=item-2', 'https://labs.brainstudioagencia.com'),
    { kind: 'internal', path: '/parrillas/plan-1?item=item-2' }
  );
  assert.deepEqual(
    resolvePlatformLink('/cotizaciones/ver/propuesta-1', 'https://labs.brainstudioagencia.com'),
    { kind: 'internal', path: '/cotizaciones/ver/propuesta-1' }
  );
});

test('external links keep a secure separate-window flow', () => {
  assert.deepEqual(
    resolvePlatformLink('https://drive.google.com/file/d/example', 'https://labs.brainstudioagencia.com'),
    { kind: 'external', url: 'https://drive.google.com/file/d/example' }
  );
});

test('openPlatformLink delegates same-origin links to the app router', () => {
  const navigations = [];
  const externalOpens = [];

  const result = openPlatformLink('https://labs.brainstudioagencia.com/parrillas/plan-1', {
    origin: 'https://labs.brainstudioagencia.com',
    navigate: path => navigations.push(path),
    openExternal: (...args) => externalOpens.push(args),
  });

  assert.equal(result, 'internal');
  assert.deepEqual(navigations, ['/parrillas/plan-1']);
  assert.deepEqual(externalOpens, []);
});

test('internal platform actions no longer request new browser windows', async () => {
  const [taskPanel, quotationList, successModal, linkDropdown] = await Promise.all([
    readFile('src/components/modules/TaskSidePanel.jsx', 'utf8'),
    readFile('src/components/modules/Quotations/QuotationList.jsx', 'utf8'),
    readFile('src/components/modules/Quotations/SuccessModal.jsx', 'utf8'),
    readFile('src/components/ui/LinkDropdown.jsx', 'utf8'),
  ]);

  assert.match(taskPanel, /navigate\(`\/parrillas\/\$\{/);
  assert.doesNotMatch(taskPanel, /window\.open\(`\/parrillas\//);
  assert.match(quotationList, /navigate\(`\/cotizaciones\/ver\/\$\{/);
  assert.doesNotMatch(quotationList, /window\.open\(`\/cotizaciones\/ver\//);
  assert.match(successModal, /openPlatformLink\(link/);
  assert.match(linkDropdown, /openPlatformLink\(sanitizeUrl\(/);
});
