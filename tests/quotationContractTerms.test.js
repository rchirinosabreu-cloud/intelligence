import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRACT_TERM_LIBRARY,
  buildContractTermsText,
  resolveSuggestedContractTermIds,
  sanitizeContractTermsText
} from '../src/services/quotationContractTerms.js';

const service = (overrides = {}) => ({
  name: 'Servicio base',
  description: '',
  category: 'MARKETING',
  ...overrides
});

test('contract terms always include general clauses and add service-specific clauses', () => {
  const ids = resolveSuggestedContractTermIds([
    service({ name: 'Administración de pauta Meta Ads', category: 'ADS' }),
    service({ name: 'Rediseño de sitio web', category: 'WEB' })
  ], { currency: 'COP' });

  assert.ok(ids.includes('general-contact'));
  assert.ok(ids.includes('ads-investment'));
  assert.ok(ids.includes('ads-results'));
  assert.ok(ids.includes('web-access'));
  assert.ok(ids.includes('web-third-party-results'));
  assert.ok(!ids.includes('international-fees'));
});

test('contract terms detect branding variants, production conditions and international payments', () => {
  const ids = resolveSuggestedContractTermIds([
    service({ name: 'Rebranding, naming y slogan', category: 'BRANDING' }),
    service({ name: 'Jornada de producción audiovisual', category: 'PRODUCCION_AUDIOVISUAL' })
  ], { currency: 'USD' });

  assert.ok(ids.includes('branding-scope'));
  assert.ok(ids.includes('branding-naming'));
  assert.ok(ids.includes('branding-slogan'));
  assert.ok(ids.includes('branding-rebranding'));
  assert.ok(ids.includes('production-session'));
  assert.ok(ids.includes('international-fees'));
});

test('selected and custom clauses become a sanitized immutable text snapshot', () => {
  const text = buildContractTermsText(['general-contact', 'web-access'], ['  Cláusula personalizada.  ']);
  assert.match(text, /^● /);
  assert.match(text, /Cláusula personalizada\./);
  assert.equal(text.split('\n').length, 3);
  assert.equal(sanitizeContractTermsText('● Uno\n\n• Dos'), '● Uno\n● Dos');
  assert.ok(CONTRACT_TERM_LIBRARY.length > 20);
});
