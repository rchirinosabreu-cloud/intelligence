// Que Bria entienda un nombre mal escrito, como una persona (Rodny, 9 de octubre de 2026: «que entiende si uno
// dice una palabra mal, que sabe a lo que uno se refiere»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { rankByName, nameSimilarity } from '../src/lib/fuzzyMatch.js';

const clients = ['Aristea', 'Abitat Insurance', 'SunPartners', 'Promo Group', 'FoobeSpain', 'New Pueblito', "Mima's Kitchen", 'Corporación Titanes', 'Haad Aesthetic Center', 'Bonsai'].map((name, i) => ({ id: `c${i}`, name }));
const top = (query) => rankByName(clients, query, (c) => c.name)[0]?.name || null;

test('exact, partial, accents and spacing still find the client', () => {
  assert.equal(top('aristea'), 'Aristea');
  assert.equal(top('sun partners'), 'SunPartners');
  assert.equal(top('promogroup'), 'Promo Group');
  assert.equal(top('corporacion titanes'), 'Corporación Titanes');
  assert.equal(top('titanes'), 'Corporación Titanes');
  assert.equal(top('mimas'), "Mima's Kitchen");
});

test('a misspelled name finds what the person meant', () => {
  assert.equal(top('aristia'), 'Aristea');
  assert.equal(top('sumpartners'), 'SunPartners');
  assert.equal(top('fobespain'), 'FoobeSpain');
  assert.equal(top('nuevo pueblito'), 'New Pueblito');
  assert.equal(top('habitat'), 'Abitat Insurance');
  assert.equal(top('bonzai'), 'Bonsai');
});

test('nothing close means nothing, never a random client', () => {
  assert.deepEqual(rankByName(clients, 'zzqqxx', (c) => c.name), []);
  assert.deepEqual(rankByName(clients, '', (c) => c.name), []);
});

test('the closer match comes first and the score explains it', () => {
  const ranked = rankByName(clients, 'aristea', (c) => c.name);
  assert.equal(ranked[0].score, 1);
  assert.ok(nameSimilarity('aristia', 'Aristea') > nameSimilarity('aristia', 'Abitat Insurance'));
});
