import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTRACT_TERM_LIBRARY,
  buildContractTermsText,
  parseContractTermsText,
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

  assert.ok(ids.includes('general-extra-services'));
  assert.ok(ids.includes('branding-naming'));
  assert.ok(ids.includes('branding-slogan'));
  assert.ok(ids.includes('branding-rebranding'));
  assert.ok(ids.includes('production-session'));
  assert.ok(ids.includes('international-fees'));
});

test('a production session does not infer marketing or editing terms from generic content words', () => {
  const ids = resolveSuggestedContractTermIds([
    service({
      name: 'Jornada de producción New Pueblito',
      category: 'PRODUCCION_AUDIOVISUAL',
      description: 'Producción de contenido para redes sociales. La jornada no incluye edición de videos ni publicación.'
    })
  ], { currency: 'COP' });

  assert.ok(ids.includes('production-session'));
  assert.ok(!ids.some((id) => id.startsWith('marketing-')));
  assert.ok(!ids.includes('production-client-material'));
  assert.ok(!ids.includes('production-files-only'));
});

test('selected and custom clauses become a sanitized immutable text snapshot', () => {
  const text = buildContractTermsText(['general-contact', 'web-access'], ['  Cláusula personalizada.  ']);
  assert.match(text, /^● /);
  assert.match(text, /Cláusula personalizada\./);
  assert.equal(text.split('\n').length, 3);
  assert.equal(sanitizeContractTermsText('● Uno\n\n• Dos'), '● Uno\n● Dos');
  assert.ok(CONTRACT_TERM_LIBRARY.length > 20);
});

test('contract terms are deduplicated consistently for storage, HTML and PDF consumers', () => {
  const duplicated = '● Cada contenido incluye dos ajustes.\n•  cada CONTENIDO incluye dos ajustes!  \n● Otra condición.';
  assert.deepEqual(parseContractTermsText(duplicated), [
    'Cada contenido incluye dos ajustes.',
    'Otra condición.'
  ]);
  assert.equal(
    sanitizeContractTermsText(duplicated),
    '● Cada contenido incluye dos ajustes.\n● Otra condición.'
  );
});

test('overlapping category clauses are consolidated into shared proposal terms', () => {
  const ids = resolveSuggestedContractTermIds([
    service({ category: 'MARKETING', name: 'Gestión de redes' }),
    service({ category: 'BRANDING', name: 'Identidad visual' }),
    service({ category: 'WEB', name: 'Sitio web' })
  ], { currency: 'COP' });

  assert.ok(ids.includes('general-adjustments'));
  assert.ok(ids.includes('general-client-delays'));
  assert.ok(ids.includes('general-extra-services'));
  assert.ok(!ids.includes('marketing-adjustments'));
  assert.ok(!ids.includes('branding-adjustments'));
  assert.ok(!ids.includes('web-adjustments'));
  assert.ok(!ids.includes('marketing-inputs'));
  assert.ok(!ids.includes('web-client-delays'));
  assert.ok(!ids.includes('branding-scope'));
  assert.ok(!ids.includes('web-extra-features'));
});

test('stored legacy category variants collapse into one clause per shared theme', () => {
  const textById = new Map(CONTRACT_TERM_LIBRARY.map((entry) => [entry.id, entry.text]));
  const parsed = parseContractTermsText([
    textById.get('marketing-adjustments'),
    textById.get('branding-adjustments'),
    textById.get('web-adjustments'),
    textById.get('marketing-inputs'),
    textById.get('web-client-delays'),
    textById.get('branding-scope'),
    textById.get('web-extra-features')
  ].join('\n'));

  assert.deepEqual(parsed, [
    textById.get('general-adjustments'),
    textById.get('general-client-delays'),
    textById.get('general-extra-services')
  ]);
});
