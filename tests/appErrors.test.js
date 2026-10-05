import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isChunkLoadError, normalizeClientErrorReport, newErrorReference } from '../src/lib/appErrors.js';
import { attemptVersionRecovery, loadWithRecovery, PRELOAD_RECOVERY_KEY } from '../src/pwa/preloadRecovery.js';
import { reportClientErrorHandler } from '../src/controllers/clientErrorController.js';

// Rodny, 5 de octubre de 2026: a Elisa le salía «No pudimos cargar esta sección» cada vez que
// entraba. Había días de 9 a 12 despliegues: la pestaña abierta pedía archivos de la versión
// anterior, que ya no existían, y la pantalla de error se pintaba antes de la recarga. Además,
// esa misma pantalla tapaba cualquier error real con el mismo texto, y nada quedaba registrado.

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const memoryStorage = () => {
    const map = new Map();
    return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), map };
};

test('reconoce un archivo de una versión anterior en los navegadores de todo el equipo', () => {
    for (const message of [
        'Failed to fetch dynamically imported module: https://x/assets/FinancialDashboard-a1b2.js',
        'error loading dynamically imported module',
        'Importing a module script failed.',
        'Unable to preload CSS for /assets/index-1.css',
        'Loading chunk 12 failed.',
        // React.lazy cuando la recuperación ya pidió recargar y la importación quedó vacía.
        'Element type is invalid. Received a promise that resolves to: undefined. Lazy element type must resolve to a class or function.',
        'lazy: Expected the result of a dynamic import() call. Instead received: undefined'
    ]) {
        assert.equal(isChunkLoadError(new Error(message)), true, message);
    }
    const named = new Error('x');
    named.name = 'ChunkLoadError';
    assert.equal(isChunkLoadError(named), true);
    assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'amount')")), false);
    assert.equal(isChunkLoadError(null), false);
    assert.equal(isChunkLoadError('Failed to fetch dynamically imported module'), true, 'también un texto suelto');
});

test('una versión vieja se recupera recargando una sola vez por versión y pantalla', () => {
    const storage = memoryStorage();
    const location = { pathname: '/financiero', search: '' };
    let reloads = 0;
    const reload = () => { reloads += 1; };
    assert.equal(attemptVersionRecovery({ storage, buildVersion: 'abc', location, reload }), true);
    assert.equal(reloads, 1);
    assert.equal(storage.getItem(PRELOAD_RECOVERY_KEY), 'abc:/financiero');
    // Si tras recargar vuelve a fallar lo mismo, no se entra en un bucle de recargas.
    assert.equal(attemptVersionRecovery({ storage, buildVersion: 'abc', location, reload }), false);
    assert.equal(reloads, 1);
    // Otra pantalla u otra versión sí se pueden recuperar.
    assert.equal(attemptVersionRecovery({ storage, buildVersion: 'abc', location: { pathname: '/gestion', search: '' }, reload }), true);
    assert.equal(reloads, 2);
});

test('mientras se recarga se sigue mostrando «cargando», nunca la pantalla de error', async () => {
    const storage = memoryStorage();
    const location = { pathname: '/financiero', search: '' };
    let reloads = 0;
    const options = { storage, buildVersion: 'abc', location, reload: () => { reloads += 1; } };
    const pending = Symbol('pending');
    const settle = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(pending), 20))]);

    // El archivo no está: se recarga y la promesa queda pendiente (Suspense sigue en «cargando»).
    const missing = loadWithRecovery(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/x.js')), options);
    assert.equal(await settle(missing), pending);
    assert.equal(reloads, 1);

    // La recuperación de Vite ya pidió recargar y la importación llegó vacía: también se espera.
    storage.removeItem(PRELOAD_RECOVERY_KEY);
    assert.equal(await settle(loadWithRecovery(() => Promise.resolve(undefined), options)), pending);

    // Si ya se intentó y sigue fallando, el error sube para que se vea la pantalla de versión.
    storage.setItem(PRELOAD_RECOVERY_KEY, 'abc:/financiero');
    await assert.rejects(loadWithRecovery(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), options));

    // Un error que no es de versión sube tal cual, sin recargar.
    const before = reloads;
    await assert.rejects(loadWithRecovery(() => Promise.reject(new SyntaxError('Unexpected token')), options), SyntaxError);
    assert.equal(reloads, before);

    // Lo que carga bien, carga.
    const module = { default: () => null };
    assert.equal(await loadWithRecovery(() => Promise.resolve(module), options), module);
});

test('el registro que llega al servidor se recorta y nunca trae campos extra', () => {
    const long = 'x'.repeat(10000);
    const { valid, report } = normalizeClientErrorReport({
        kind: 'render', reference: 'E-AB12CD', message: long, stack: long, componentStack: long,
        route: '/financiero?tab=cartera', build: 'abc123', userAgent: long, password: 'nunca'
    });
    assert.equal(valid, true);
    assert.equal(report.message.length, 500);
    assert.equal(report.stack.length, 4000);
    assert.equal(report.componentStack.length, 2000);
    assert.equal(report.userAgent.length, 300);
    assert.equal(report.route, '/financiero?tab=cartera');
    assert.equal('password' in report, false);
    assert.equal(normalizeClientErrorReport({ kind: 'otra-cosa', message: 'x' }).valid, false);
    assert.equal(normalizeClientErrorReport({ kind: 'render' }).valid, false, 'sin mensaje no hay nada que registrar');
    assert.equal(normalizeClientErrorReport({ kind: 'render', message: 'x', reference: '<script>' }).report.reference, null);
    assert.match(newErrorReference(), /^E-[A-Z0-9]{6}$/);
});

test('el servidor deja una línea en el registro con la persona, la pantalla y la referencia', async () => {
    const lines = [];
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, end() { this.ended = true; return this; }, json(body) { this.body = body; return this; } };
    await reportClientErrorHandler(
        { body: { kind: 'render', reference: 'E-AB12CD', message: "Cannot read properties of undefined (reading 'amount')", route: '/financiero', build: 'abc123' }, user: { userId: 'user-elisa', email: 'elisa@brainstudio.co' } },
        res,
        { log: (line) => lines.push(line) }
    );
    assert.equal(res.statusCode, 204);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /\[Client error\]/);
    assert.match(lines[0], /E-AB12CD/);
    assert.match(lines[0], /user-elisa/);
    assert.match(lines[0], /\/financiero/);

    const bad = { ...res, statusCode: 200 };
    await reportClientErrorHandler({ body: { kind: 'nada' }, user: { userId: 'u' } }, bad, { log: (line) => lines.push(line) });
    assert.equal(bad.statusCode, 400);
    assert.equal(lines.length, 1, 'un registro inválido no se escribe');
});

test('las pantallas usan la carga con recuperación y la protección por pantalla', () => {
    const app = read('../src/App.jsx');
    assert.doesNotMatch(app, /= lazy\(\(\) => import/, 'ningún módulo se carga sin recuperación');
    assert.match(app, /lazyWithRecovery\(\(\) => import\('\.\/components\/modules\/FinancialDashboard'\)\)/);
    const layout = read('../src/components/layout/AppLayout.jsx');
    assert.match(layout, /<RouteErrorBoundary>/, 'un error de una pantalla deja el menú en pie');
    const boundary = read('../src/components/errors/ApplicationErrorBoundary.jsx');
    assert.match(boundary, /Hay una versión nueva de la plataforma/);
    assert.match(boundary, /Algo falló en esta pantalla/);
    assert.match(boundary, /reportClientError/);
    assert.doesNotMatch(boundary, /violet-/, 'los morados están en desuso');
    assert.doesNotMatch(boundary, /pudo haberse actualizado/, 'un error real ya no se disfraza de versión nueva');
});
