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

// 18 de noviembre de 2026: el manual de marca no abría en producción porque el visor volvía a pedir la dirección
// `blob:` con `fetch` y la política de seguridad (`connect-src 'self' https: wss:`) lo bloquea. Los bytes salen
// de la caché; nadie pide una `blob:` por la red.
test('la caché entrega los bytes y nadie vuelve a pedir una dirección blob: con fetch', async () => {
    const calls = [];
    const media = await acquirePrivateMedia('/api/manual?v=1', { fetchImpl: okFetch(calls) });
    assert.ok(media.blob, 'devuelve los bytes además de la dirección');
    assert.equal((await media.blob.arrayBuffer()).byteLength > 0, true);
    media.release();
    const again = await acquirePrivateMedia('/api/manual?v=1', { fetchImpl: okFetch(calls) });
    assert.ok(again.blob, 'también desde la caché');
    assert.equal(calls.length, 1);
    again.release();
    const sheet = readFileSync(new URL('../src/components/modules/Brands/BrandSheet.jsx', import.meta.url), 'utf8');
    assert.match(sheet, /loadBrandBytes\(brandFileUrl/);
    assert.doesNotMatch(sheet, /fetch\(objectUrl\)/);
    const csp = readFileSync(new URL('../src/config/security.js', import.meta.url), 'utf8');
    assert.doesNotMatch(csp.match(/connect-src[^"]*/)?.[0] || '', /blob:/, 'si algún día se permite blob:, esta regla ya no hace falta');
});
