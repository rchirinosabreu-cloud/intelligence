import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acquirePrivateMedia, cachedPrivateMedia, clearPrivateMedia, forgetPrivateMedia } from '../src/lib/privateMediaCache.js';

const okFetch = (calls) => async (url) => { calls.push(url); return { ok: true, blob: async () => new Blob(['video']) }; };

test('reabrir una pieza no vuelve a bajar el archivo: se pide una sola vez por dirección', async () => {
    clearPrivateMedia();
    const calls = [];
    const first = await acquirePrivateMedia('/api/x/1?v=a', { fetchImpl: okFetch(calls) });
    first.release();
    const again = await acquirePrivateMedia('/api/x/1?v=a', { fetchImpl: okFetch(calls) });
    assert.equal(again.url, first.url);
    assert.equal(calls.length, 1);
    assert.equal(cachedPrivateMedia('/api/x/1?v=a'), first.url);
    const otherVersion = await acquirePrivateMedia('/api/x/1?v=b', { fetchImpl: okFetch(calls) });
    assert.notEqual(otherVersion.url, first.url, 'una entrega nueva es otra dirección: nunca bytes viejos');
    assert.equal(calls.length, 2);
});

test('un fallo no se guarda, olvidar obliga a pedir de nuevo y cerrar sesión lo vacía todo', async () => {
    clearPrivateMedia();
    const calls = [];
    await assert.rejects(acquirePrivateMedia('/api/y', { fetchImpl: async () => ({ ok: false, status: 500 }) }));
    assert.equal(cachedPrivateMedia('/api/y'), null);
    (await acquirePrivateMedia('/api/y', { fetchImpl: okFetch(calls) })).release();
    forgetPrivateMedia('/api/y');
    (await acquirePrivateMedia('/api/y', { fetchImpl: okFetch(calls) })).release();
    assert.equal(calls.length, 2);
    clearPrivateMedia();
    assert.equal(cachedPrivateMedia('/api/y'), null);
    assert.match(readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8'), /clearPrivateMedia\(\)/);
});

test('el visor de piezas y las marcas usan la caché compartida', () => {
    const viewer = readFileSync(new URL('../src/components/modules/ContentPlan/FinalMediaPreview.jsx', import.meta.url), 'utf8');
    assert.match(viewer, /acquirePrivateMedia/);
    assert.doesNotMatch(viewer, /revokeObjectURL/, 'el visor no suelta los bytes al cerrarse');
    const brands = readFileSync(new URL('../src/components/modules/Brands/brandsApi.js', import.meta.url), 'utf8');
    assert.match(brands, /acquirePrivateMedia/);
});
