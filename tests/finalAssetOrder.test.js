import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { finalAssetOrderProblem, moveAssetId } from '../src/lib/finalAssetOrder.js';
import { reorderContentItemFinalAssets } from '../src/services/finalAssetOrderService.js';

// Rodny, 1 October 2026: the order of the files of a piece is the order of the carousel that goes out,
// and a replaced image landed last. «Sí, añade lo del orden.»

test('moving a file one place swaps it with its neighbour and never falls off the ends', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveAssetId(ids, 'c', -1), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveAssetId(ids, 'b', 1), ['a', 'c', 'b', 'd']);
  assert.deepEqual(moveAssetId(ids, 'a', -1), ids, 'the first one cannot go earlier');
  assert.deepEqual(moveAssetId(ids, 'd', 1), ids, 'the last one cannot go later');
  assert.deepEqual(moveAssetId(ids, 'zz', 1), ids, 'an unknown id changes nothing');
  assert.notEqual(moveAssetId(ids, 'c', -1), ids, 'a new array, never a mutation');
});

test('an order is accepted only if it names exactly the files of the piece, once each', () => {
  assert.equal(finalAssetOrderProblem(['a', 'b', 'c'], ['c', 'a', 'b']), null);
  assert.match(finalAssetOrderProblem(['a', 'b', 'c'], ['c', 'a']), /todos los archivos/);
  assert.match(finalAssetOrderProblem(['a', 'b'], ['a', 'b', 'x']), /todos los archivos|no pertenece/);
  assert.match(finalAssetOrderProblem(['a', 'b'], ['a', 'a']), /repetido/);
  assert.match(finalAssetOrderProblem(['a', 'b'], 'a,b'), /lista/);
  assert.match(finalAssetOrderProblem(['a', 'b'], ['a', 'legacy']), /no pertenece|todos los archivos/);
});

test('the server rewrites every position in one transaction and returns the files in the new order', async () => {
  const rows = [
    { id: 'a', contentItemId: 'item-1', position: 0, name: '01.png' },
    { id: 'b', contentItemId: 'item-1', position: 1, name: '02.png' },
    { id: 'c', contentItemId: 'item-1', position: 2, name: '03.png' }
  ];
  const log = [];
  const sorted = () => [...rows].sort((x, y) => x.position - y.position);
  const db = {
    contentItemFinalAsset: {
      findMany: async ({ where }) => sorted().filter((row) => row.contentItemId === where.contentItemId),
      update: ({ where, data }) => { log.push([where.id, data.position]); Object.assign(rows.find((row) => row.id === where.id), data); return Promise.resolve(); }
    },
    $transaction: async (operations) => { log.push(['transaction', operations.length]); await Promise.all(operations); }
  };
  const result = await reorderContentItemFinalAssets('item-1', ['c', 'a', 'b'], { db });
  assert.deepEqual(result.map((row) => row.id), ['c', 'a', 'b']);
  assert.deepEqual(sorted().map((row) => [row.id, row.position]), [['c', 0], ['a', 1], ['b', 2]]);
  assert.deepEqual(log.at(-1), ['transaction', 3], 'all positions change together or none does');

  await assert.rejects(reorderContentItemFinalAssets('item-1', ['c', 'a'], { db }), (error) => error.status === 400 && /todos los archivos/.test(error.message));
  await assert.rejects(reorderContentItemFinalAssets('item-1', ['c', 'a', 'x'], { db }), (error) => error.status === 400);
  await assert.rejects(reorderContentItemFinalAssets('ghost', ['a'], { db }), (error) => error.status === 404);
  assert.deepEqual(sorted().map((row) => row.id), ['c', 'a', 'b'], 'a rejected order changes nothing');
});

test('the route, the card and the publisher agree on the order', () => {
  const routes = readFileSync('src/routes/api/content.js', 'utf8');
  assert.match(routes, /router\.put\('\/items\/:id\/final-assets\/order'/);
  assert.match(routes, /reorderContentItemFinalAssets\(req\.params\.id, req\.body\?\.order\)/);
  const card = readFileSync('src/components/modules/ContentPlanDetail.jsx', 'utf8');
  assert.match(card, /final-assets\/order/);
  assert.match(card, /moveAssetId\(/);
  assert.match(card, /data-final-asset-position/);
  assert.match(card, /Mover antes/);
  assert.match(card, /Mover después/);
  // The publisher reads the files by position: what the card shows is what goes out.
  const publisher = readFileSync('src/services/socialPublishingService.js', 'utf8');
  assert.match(publisher, /finalAssets: \{ orderBy: \[\{ position: 'asc' \}, \{ createdAt: 'asc' \}\] \}/);
});
