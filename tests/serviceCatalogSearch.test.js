import test from 'node:test';
import assert from 'node:assert/strict';

import { matchesServiceSearch, normalizeServiceSearchText } from '../src/utils/serviceCatalogSearch.js';

const service = {
  name: 'Producción audiovisual para redes sociales',
  description: 'Grabación, edición y entrega de piezas para campañas de educación digital.',
  category: 'Contenido y diseño'
};

test('service search ignores accents and letter case', () => {
  assert.equal(normalizeServiceSearchText('PRODUCCIÓN'), 'produccion');
  assert.equal(matchesServiceSearch(service, 'produccion'), true);
  assert.equal(matchesServiceSearch(service, 'EDUCACION'), true);
});

test('service search matches any part of title, description and category', () => {
  assert.equal(matchesServiceSearch(service, 'audiovisual'), true);
  assert.equal(matchesServiceSearch(service, 'entrega de piezas'), true);
  assert.equal(matchesServiceSearch(service, 'contenido diseño'), true);
  assert.equal(matchesServiceSearch(service, 'fotografía'), false);
});

test('service search is safe with missing optional fields', () => {
  assert.equal(matchesServiceSearch({ name: 'Consultoría' }, 'consultoria'), true);
  assert.equal(matchesServiceSearch({ name: 'Consultoría', description: null }, ''), true);
});
