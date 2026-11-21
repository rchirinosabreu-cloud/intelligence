import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Rodny, 21 de noviembre de 2026: «¿no haría pesada la plataforma para esa persona?», «¿y no se guardaría el
// vídeo entonces en los buckets?», «¿y cómo y cuándo se limpia, esa limpieza puede ser automática?» — «Dale,
// procede». La copia vive en un espacio propio del navegador, en el disco y no en la memoria de la pestaña; el
// original sigue en el almacenamiento; y se limpia sola: al cerrar sesión, a los 7 días sin abrirse, por tope
// de tamaño y cuando entra otra persona.

// El espacio del navegador (Cache Storage), en pequeño.
class FakeCache {
  constructor() { this.store = new Map(); }
  async match(key) { const hit = this.store.get(String(key)); return hit ? hit.clone() : undefined; }
  async put(key, response) { this.store.set(String(key), new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers })); }
  async delete(key) { return this.store.delete(String(key)); }
}
class FakeCacheStorage {
  constructor() { this.caches = new Map(); }
  async open(name) { if (!this.caches.has(name)) this.caches.set(name, new FakeCache()); return this.caches.get(name); }
  async delete(name) { return this.caches.delete(name); }
  files() { return [...this.caches.values()].flatMap(cache => [...cache.store.keys()]).filter(key => !key.includes('__private-media-index__')); }
}

let instance = 0;
/** Cada «pestaña» es una copia nueva del módulo: su memoria empieza vacía, el disco es el mismo. */
const openTab = () => import(`../src/lib/privateMediaCache.js?tab=${instance += 1}`);
const useDisk = () => { globalThis.caches = new FakeCacheStorage(); return globalThis.caches; };
const network = (calls, size = 5) => async (url, options) => {
  calls.push({ url, authorization: options?.headers?.Authorization });
  return new Response('x'.repeat(size), { status: 200, headers: { 'content-length': String(size) } });
};

test('recargar la página o abrir otra pestaña no vuelve a bajar el archivo: sale de la copia del dispositivo', async () => {
  const disk = useDisk();
  const calls = [];
  const first = await openTab();
  const shown = await first.acquirePrivateMedia('/api/x/1?v=a', { fetchImpl: network(calls) });
  shown.release();
  await first.claimPrivateMedia('u1');
  assert.deepEqual(disk.files(), ['/api/x/1?v=a']);

  const reloaded = await openTab();
  const again = await reloaded.acquirePrivateMedia('/api/x/1?v=a', { fetchImpl: network(calls) });
  assert.equal(await again.blob.text(), 'xxxxx');
  assert.equal(calls.length, 1, 'la segunda pestaña no pidió nada a la red');
  again.release();
});

test('un video que se reproduce por pedazos se guarda aparte, y solo entonces «onlyCached» lo encuentra', async () => {
  useDisk();
  const calls = [];
  const tab = await openTab();
  assert.equal(await tab.acquirePrivateMedia('/api/v/1?v=a', { onlyCached: true }), null, 'sin copia no toca la red: se reproduce por pedazos');
  assert.equal(calls.length, 0);
  assert.equal(await tab.savePrivateMedia('/api/v/1?v=a', { fetchImpl: network(calls) }), true);
  assert.equal(await tab.savePrivateMedia('/api/v/1?v=a', { fetchImpl: network(calls) }), true);
  assert.equal(calls.length, 1, 'ya guardado, no se baja otra vez');
  const saved = await (await openTab()).acquirePrivateMedia('/api/v/1?v=a', { onlyCached: true });
  assert.equal(saved.blob.size, 5);
  saved.release();
});

test('una entrega nueva descarta la copia de la versión anterior', async () => {
  const disk = useDisk();
  const tab = await openTab();
  await tab.savePrivateMedia('/api/v/2?v=old', { fetchImpl: network([]) });
  await tab.savePrivateMedia('/api/v/2?v=new', { fetchImpl: network([]) });
  await tab.claimPrivateMedia('u1');
  assert.deepEqual(disk.files(), ['/api/v/2?v=new']);
});

test('cerrar sesión borra todo lo guardado en el dispositivo, también lo que se estaba guardando', async () => {
  const disk = useDisk();
  const tab = await openTab();
  await tab.savePrivateMedia('/api/v/3?v=a', { fetchImpl: network([]) });
  let finish;
  const slow = async () => { await new Promise(resolve => { finish = resolve; }); return new Response('late', { status: 200 }); };
  const pending = tab.savePrivateMedia('/api/v/4?v=a', { fetchImpl: slow });
  await new Promise(resolve => setTimeout(resolve, 5));
  const cleared = tab.clearPrivateMedia();
  finish();
  await pending;
  await cleared;
  await tab.claimPrivateMedia('u1');
  assert.deepEqual(disk.files(), []);
  assert.match(readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8'), /clearPrivateMedia\(\)/);
});

test('lo que nadie abre en 7 días se borra solo', async () => {
  const disk = useDisk();
  const tab = await openTab();
  await tab.savePrivateMedia('/api/v/5?v=a', { fetchImpl: network([]) });
  await tab.claimPrivateMedia('u1', { now: Date.now() + tab.PRIVATE_MEDIA_MAX_IDLE_MS - 60_000 });
  assert.equal(disk.files().length, 1, 'a los 6 días y pico sigue ahí');
  await tab.claimPrivateMedia('u1', { now: Date.now() + tab.PRIVATE_MEDIA_MAX_IDLE_MS + 60_000 });
  assert.deepEqual(disk.files(), []);
});

test('con el tope lleno se borra lo más viejo primero', async () => {
  const disk = useDisk();
  const tab = await openTab();
  for (const name of ['a', 'b', 'c']) {
    await tab.savePrivateMedia(`/api/v/${name}?v=1`, { fetchImpl: network([], 40) });
    await new Promise(resolve => setTimeout(resolve, 3));
  }
  (await tab.acquirePrivateMedia('/api/v/a?v=1', { onlyCached: true })).release();
  await tab.claimPrivateMedia('u1', { limit: 100 });
  assert.deepEqual(disk.files().sort(), ['/api/v/a?v=1', '/api/v/c?v=1'], 'se fue «b», el que llevaba más tiempo sin abrirse');
  assert.equal(tab.PRIVATE_MEDIA_DISK_LIMIT_DESKTOP, 500 * 1024 * 1024);
  assert.equal(tab.PRIVATE_MEDIA_DISK_LIMIT_MOBILE, 150 * 1024 * 1024);
});

test('si entra otra persona en el mismo navegador, lo de la anterior se borra', async () => {
  const disk = useDisk();
  const tab = await openTab();
  await tab.claimPrivateMedia('u1');
  await tab.savePrivateMedia('/api/v/6?v=a', { fetchImpl: network([]) });
  await tab.claimPrivateMedia('u1');
  assert.equal(disk.files().length, 1, 'la misma persona conserva lo suyo');
  await (await openTab()).claimPrivateMedia('u2');
  assert.deepEqual(disk.files(), []);
  const auth = readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');
  assert.match(auth, /claimPrivateMedia\(currentUserId\)/);
});

test('un fallo no se guarda, y sin espacio en el navegador todo sigue funcionando con la memoria de la pestaña', async () => {
  const disk = useDisk();
  const tab = await openTab();
  assert.equal(await tab.savePrivateMedia('/api/v/7?v=a', { fetchImpl: async () => new Response('no', { status: 503 }) }), false);
  assert.equal(await tab.savePrivateMedia('/api/v/8?v=a', { fetchImpl: async () => new Response('part', { status: 206 }) }), false, 'un pedazo no es el archivo');
  assert.deepEqual(disk.files(), []);
  delete globalThis.caches;
  const memoryOnly = await openTab();
  assert.equal(await memoryOnly.savePrivateMedia('/api/v/9?v=a', { fetchImpl: network([]) }), false);
  assert.equal(await memoryOnly.acquirePrivateMedia('/api/v/9?v=a', { onlyCached: true }), null);
  const shown = await memoryOnly.acquirePrivateMedia('/api/v/9?v=a', { fetchImpl: network([]) });
  assert.equal(shown.blob.size, 5);
  shown.release();
});
