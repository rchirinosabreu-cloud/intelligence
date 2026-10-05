import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readNativeTasks = () => readFile(
  new URL('../src/components/modules/NativeTasks.jsx', import.meta.url),
  'utf8'
);

test('the optimistic completed task remains visible while the server confirms it', async () => {
  const source = await readNativeTasks();

  assert.match(source, /movedTask\.completedAt\s*=\s*new Date\(\)\.toISOString\(\)/);
  assert.match(source, /if \(newStatusEnum !== 'REALIZADA'\) movedTask\.completedAt = null/);
});

test('completion confetti runs only after a successful backend response', async () => {
  const source = await readNativeTasks();
  // Desde el 5 de octubre de 2026 el rechazo lleva el motivo del servidor, pero sigue cortando antes del confeti.
  const responseGuard = source.indexOf('throw Object.assign(new Error("Failed to update status in backend")');
  const confetti = source.indexOf('triggerConfetti(', responseGuard);
  const catchBlock = source.indexOf('} catch (err)', responseGuard);

  assert.ok(responseGuard >= 0, 'the task update must validate the backend response');
  assert.ok(confetti > responseGuard, 'confetti must run after the backend confirms completion');
  assert.ok(confetti < catchBlock, 'confetti must remain inside the successful request path');
  // Rodny, 30 de septiembre de 2026: sale de la columna donde cayó la tarjeta, no del centro
  // de la ventana. La columna y no la tarjeta: con una respuesta rápida la tarjeta puede no
  // estar repintada todavía y el disparo salía de la columna de origen.
  assert.match(source, /triggerConfetti\(document\.querySelector\('\[data-rfd-droppable-id="realizado"\]'\)\)/);
});

test('cerrar una tarea desde el panel o el modal tampoco celebra antes de tiempo', async () => {
  // Regla 1 de AGENTS: la celebración es consecuencia de la respuesta del servidor, nunca del clic.
  // Los dos disparaban confeti **antes** del `fetch`, así que un guardado fallido celebraba igual.
  for (const file of ['TaskSidePanel']) {
    const source = await readFile(new URL(`../src/components/modules/${file}.jsx`, import.meta.url), 'utf8');
    // El import es `{ triggerConfetti }`, sin paréntesis: todo lo que casa aquí es una llamada.
    const llamadas = [...source.matchAll(/triggerConfetti\(/g)].map(m => m.index);
    assert.ok(llamadas.length > 0, `${file}: sigue celebrando una tarea terminada`);
    for (const posicion of llamadas) {
      const antes = source.slice(0, posicion);
      const ultimoOk = antes.lastIndexOf('if (res.ok)');
      const ultimoFetch = antes.lastIndexOf('await fetch(');
      assert.ok(ultimoOk > ultimoFetch, `${file}: el confeti va dentro del camino de éxito, después del fetch`);
    }
  }
});

test('la celebración se ve: colores de marca, dos ráfagas y salida desde la acción', async () => {
  const source = await readFile(new URL('../src/utils/confetti.js', import.meta.url), 'utf8');

  assert.match(source, /disableForReducedMotion:\s*true/, 'se respeta el movimiento reducido');

  // Rodny, 30 de septiembre de 2026: «a nadie le sale el confeti». Salía: 50 partículas diminutas,
  // un tercio blancas sobre un tablero claro, desde el centro de abajo de la ventana.
  assert.doesNotMatch(source, /'#ffffff'|"#ffffff"/i, 'el blanco no existe sobre una superficie clara');
  assert.doesNotMatch(source, /#009EB9|#00AC8A/, 'los hexadecimales locales fuera de la paleta se fueron');
  // Rodny, 30 de septiembre de 2026: «el verdesito y con moradito puede ser». Con los cinco
  // colores la ráfaga salía anaranjada: el coral y el amarillo se comen a los demás.
  assert.match(source, /BRAND_TOKENS = \['--brand-green', '--brand-cyan', '--brand-magenta'\]/,
    'los colores se leen de los tokens de marca, nunca se escriben aquí');
  assert.doesNotMatch(source, /--brand-coral|--brand-yellow/, 'el coral y el amarillo se salen de la celebración');
  assert.doesNotMatch(source, /purple|violet|indigo|fuchsia/i, 'el «moradito» de la marca es el magenta; los morados están en desuso');
  // **canvas-confetti solo entiende hexadecimales**: a cualquier otra cosa le arranca los
  // caracteres que no son hex y lee los seis primeros, así que `rgb(49 170 138)` se convertía en
  // `b49170…`, un marrón anaranjado. Los tokens son tripletas y hay que pasarlas a hex.
  assert.match(source, /const tripletToHex =/, 'las tripletas de los tokens se pasan a hexadecimal');
  assert.doesNotMatch(source, /rgb\(\$\{/, 'nunca se le pasa un color en notación rgb()');
  assert.match(source, /toString\(16\)\.padStart\(2, '0'\)/);

  assert.equal((source.match(/^\s*confetti\(\{/gm) || []).length, 2, 'dos ráfagas, no una');
  assert.match(source, /particleCount: 90/, 'la ráfaga principal se ve');
  assert.match(source, /export const originOfElement/, 'el disparo sale del elemento que cerró la tarea');
});
