import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contentItemStatusFromTask } from '../src/lib/contentTaskMirror.js';

// Rodny, 12 de noviembre de 2026: «por qué esta pieza dice en producción si ya está en realizado?». Sara guardó el
// pendiente «[Publicar]» sin cambiarle el estado y el espejo leyó «pendiente = en producción».

test('la tarea de producción mueve la pieza como siempre', () => {
    assert.equal(contentItemStatusFromTask({ newStatus: 'REALIZADA' }), 'REALIZADO');
    assert.equal(contentItemStatusFromTask({ newStatus: 'EN_CURSO' }), 'EN_PRODUCCION');
    assert.equal(contentItemStatusFromTask({ newStatus: 'PENDIENTE' }), 'EN_PRODUCCION');
    assert.equal(contentItemStatusFromTask({ newStatus: 'DEVUELTA' }), 'DEVUELTO');
});

test('el pendiente de publicar no devuelve a producción una pieza ya hecha', () => {
    assert.equal(contentItemStatusFromTask({ newStatus: 'PENDIENTE', isPublication: true, itemStatus: 'REALIZADO' }), null);
    assert.equal(contentItemStatusFromTask({ newStatus: 'EN_CURSO', isPublication: true, itemStatus: 'REALIZADO' }), null);
    assert.equal(contentItemStatusFromTask({ newStatus: 'PENDIENTE', isPublication: true, itemStatus: 'PUBLICADO' }), 'REALIZADO', 'reabrir la publicación deja la pieza realizada');
    assert.equal(contentItemStatusFromTask({ newStatus: 'REALIZADA', isPublication: true }), 'PUBLICADO');
});

test('solo un cambio de estado de verdad toca la pieza, en la tarea suelta y en la compartida', () => {
    const native = fs.readFileSync(new URL('../src/services/nativeTaskService.js', import.meta.url), 'utf8');
    assert.match(native, /currentTask\.contentItemId && currentTask\.status !== newStatus/);
    assert.match(native, /contentItemStatusFromTask\(/);
    assert.doesNotMatch(native, /newStatus === 'PENDIENTE' \|\| newStatus === 'EN_CURSO'\) \{\s*contentItemStatus = 'EN_PRODUCCION'/);
    const shared = fs.readFileSync(new URL('../src/services/taskCompletionEffectsService.js', import.meta.url), 'utf8');
    assert.match(shared, /contentItemStatusFromTask\(/);
});
