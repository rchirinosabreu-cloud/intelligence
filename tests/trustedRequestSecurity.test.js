import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isTrustedApiRequest } from '../src/lib/trustedRequest.js';

test('JWT injection is limited to the configured Brainstudio API origin and path', () => {
  const pageOrigin = 'https://labs.brainstudioagencia.com';
  const apiBaseUrl = 'https://api.brainstudioagencia.com';

  assert.equal(isTrustedApiRequest('/api/tasks', apiBaseUrl, pageOrigin), false);
  assert.equal(isTrustedApiRequest('https://api.brainstudioagencia.com/api/tasks', apiBaseUrl, pageOrigin), true);
  assert.equal(isTrustedApiRequest('https://api.brainstudioagencia.com/public/logo.png', apiBaseUrl, pageOrigin), false);
  assert.equal(isTrustedApiRequest('https://evil.example/api/tasks', apiBaseUrl, pageOrigin), false);
});

test('same-origin deployments accept relative API paths without trusting other paths', () => {
  const origin = 'https://intelligence.brainstudioagencia.com';
  assert.equal(isTrustedApiRequest('/api/auth/me', origin, origin), true);
  assert.equal(isTrustedApiRequest('/assets/app.js', origin, origin), false);
});

test('global interceptors consult the trusted request boundary before adding JWT', async () => {
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(main, /isTrustedApiRequest/);
  assert.doesNotMatch(main, /inject JWT Auth Token into every request/i);
});

test('production modules use the canonical authToken storage key', async () => {
  const files = [
    'src/components/modules/Chat.jsx',
    'src/components/modules/Reports.jsx',
    'src/components/modules/Quotations/QuotationList.jsx',
    'src/components/modules/Quotations/QuotationForm.jsx'
  ];

  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage\.getItem\(['"]token['"]\)/, file);
  }
});
