import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as finalAssetOrder from '../src/lib/finalAssetOrder.js';
import { reorderContentItemFinalAssets } from '../src/services/finalAssetOrderService.js';

const { finalAssetOrderProblem, moveAssetId, moveAssetToIndex } = finalAssetOrder;

// Rodny, 1 October 2026: the order of the files of a piece is the order of the carousel that goes out,
// and a replaced image landed last. «Sí, añade lo del orden.» The first version had two buttons per
// thumbnail and he sent it back the same day: «no me gusta así, prefiero drag and drop». The second
// one marked the landing place with a cyan line and he sent that back too: «no quiero que salga ese
// borde azul sino que al hacer drag, se reorganice de una vez hasta que yo la suelte», like the task board.

test('dropping a file on another one puts it in that place and shifts the rest', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveAssetToIndex(ids, 'a', 2), ['b', 'c', 'a', 'd'], 'dragged forward: lands after the target');
  assert.deepEqual(moveAssetToIndex(ids, 'd', 1), ['a', 'd', 'b', 'c'], 'dragged back: lands before the target');
  assert.deepEqual(moveAssetToIndex(ids, 'd', 0), ['d', 'a', 'b', 'c']);
  assert.equal(moveAssetToIndex(ids, 'b', 1), ids, 'dropping on itself changes nothing');
  assert.equal(moveAssetToIndex(ids, 'zz', 1), ids, 'an unknown file changes nothing');
  assert.equal(moveAssetToIndex(ids, 'a', -1), ids, 'a place that does not exist changes nothing');
  assert.equal(moveAssetToIndex(ids, 'a', 4), ids);
  assert.deepEqual(ids, ['a', 'b', 'c', 'd'], 'never a mutation');
});

test('while dragging, every thumbnail the pointer crosses makes room on top of the order already shown', () => {
  // The grid applies each crossing to the order it is showing, not to the saved one.
  let shown = ['a', 'b', 'c', 'd'];
  shown = moveAssetToIndex(shown, 'a', shown.indexOf('b'));
  assert.deepEqual(shown, ['b', 'a', 'c', 'd']);
  shown = moveAssetToIndex(shown, 'a', shown.indexOf('c'));
  assert.deepEqual(shown, ['b', 'c', 'a', 'd']);
  shown = moveAssetToIndex(shown, 'a', shown.indexOf('b'));
  assert.deepEqual(shown, ['a', 'b', 'c', 'd'], 'going back over the same thumbnails undoes it');
  assert.equal(moveAssetToIndex(shown, 'a', shown.indexOf('legacy')), shown, 'the inherited file is not a place to land');
});

test('there is no landing mark any more', () => {
  assert.equal(finalAssetOrder.dropSide, undefined);
});

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
  assert.match(card, /data-final-asset-position/);
  // Dragging is the way; the two buttons per thumbnail are gone and do not come back.
  assert.match(card, /moveAssetToIndex\(/);
  assert.match(card, /draggable=\{canDrag\}/);
  assert.match(card, /onDragStart=/);
  assert.match(card, /onDrop=/);
  assert.doesNotMatch(card, /Mover antes|Mover después/);
  // The thumbnails rearrange while dragging, as the cards of the task board do; no landing mark.
  assert.match(card, /setPreview\(/);
  assert.doesNotMatch(card, /data-final-asset-drop-mark|dropSide/);
  // The ones that make room slide to their new place, unless the person asked for less motion.
  assert.match(card, /\.animate\(/);
  assert.match(card, /prefers-reduced-motion/);
  // An image is draggable by itself: without this the browser drags the picture, not the thumbnail.
  assert.match(card, /<img[^>]*draggable=\{false\}/);
  // Whoever cannot drag moves it with the arrow keys from the position badge.
  assert.match(card, /moveAssetId\(/);
  assert.match(card, /ArrowLeft/);
  assert.match(card, /ArrowRight/);
  // The mutation waits for the reloaded plan, so the thumbnails never jump back for an instant.
  assert.match(card, /finalAssetOrderMutation\.mutateAsync\(/);
  // The publisher reads the files by position: what the card shows is what goes out.
  const publisher = readFileSync('src/services/socialPublishingService.js', 'utf8');
  assert.match(publisher, /finalAssets: \{ orderBy: \[\{ position: 'asc' \}, \{ createdAt: 'asc' \}\] \}/);
});
