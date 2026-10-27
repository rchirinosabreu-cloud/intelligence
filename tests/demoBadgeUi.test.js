import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// La versión «Demo» (Rodny, 26 de octubre de 2026) lleva un distintivo en el header para que ninguna captura
// se confunda con producción y el cliente sepa que puede tocar lo que quiera. Lo decide el servidor
// (`/api/health` → `demo`), nunca una variable del navegador: el mismo build sirve para las dos instancias.

test('el distintivo lo decide el servidor y en producción no se dibuja', async () => {
    const badge = await read('src/components/layout/DemoBadge.jsx');
    assert.match(badge, /\/api\/health/, 'lee el modo del servidor');
    assert.match(badge, /staleTime: Infinity/, 'una sola consulta por sesión: el modo no cambia');
    assert.match(badge, /if \(!data\?\.demo\) return null/, 'sin modo demo no hay distintivo');
    assert.match(badge, /data-demo-badge/);
    assert.match(badge, /brand-yellow/, 'el amarillo de la marca, como token; nunca un hexadecimal local');
    assert.doesNotMatch(badge, /#[0-9a-f]{6}/i);
    assert.doesNotMatch(badge, /import\.meta\.env/, 'nunca una variable de compilación: el build es el mismo');
    assert.match(badge, /title=/, 'explica qué significa al pasar el ratón');
});

test('el header monta el distintivo junto al menú, en claro y oscuro', async () => {
    const shell = await read('src/components/layout/AppLayout.jsx');
    assert.match(shell, /import DemoBadge from '\.\/DemoBadge'/);
    assert.match(shell, /<DemoBadge \/>/);
    const badge = await read('src/components/layout/DemoBadge.jsx');
    assert.match(badge, /dark:/, 'soporta modo oscuro');
});
