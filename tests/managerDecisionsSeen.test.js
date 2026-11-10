// El punto de «hay algo nuevo» en Manager (Rodny, 10 de noviembre de 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decisionFingerprint, hasUnseen, markSeen, readSeen } from '../src/lib/managerDecisionsSeen.js';

const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };

test('una decisión es nueva hasta que se ve en la pantalla, por persona', () => {
  const storage = memory();
  const keys = ['L:2026-11-10:1', 'O:s1'];
  assert.equal(hasUnseen(keys, readSeen('u1', storage)), true);
  markSeen('u1', keys, { storage, target: null });
  assert.equal(hasUnseen(keys, readSeen('u1', storage)), false);
  assert.equal(hasUnseen(keys, readSeen('u2', storage)), true, 'lo que vio otra persona no cuenta');
  assert.equal(hasUnseen([...keys, 'O:s2'], readSeen('u1', storage)), true, 'una nueva vuelve a encender el punto');
});

test('una tarjeta agrupada es nueva cuando cambia lo que reúne', () => {
  assert.equal(decisionFingerprint({ key: 'O:s1' }), 'O:s1');
  assert.equal(decisionFingerprint({ key: 'G:ROJO_SOSTENIDO', refs: ['2026-11-10:1', '2026-11-10:2'] }), 'G:ROJO_SOSTENIDO|2026-11-10:1,2026-11-10:2');
  assert.equal(decisionFingerprint({ key: 'L:2026-11-10:3', refs: ['2026-11-10:3'] }), 'L:2026-11-10:3');
});

test('sin almacenamiento no se rompe nada', () => {
  const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  assert.equal(readSeen('u1', broken).size, 0);
  assert.doesNotThrow(() => markSeen('u1', ['x'], { storage: broken, target: null }));
});

test('el punto vive en el icono de Manager del menú, coral y sutil', () => {
  const sidebar = readFileSync('src/components/layout/Sidebar.jsx', 'utf8');
  const badge = readFileSync('src/components/layout/ManagerDecisionsBadge.jsx', 'utf8');
  assert.match(sidebar, /item\.id === 'brain-core' && <ManagerDecisionsBadge/);
  assert.match(badge, /\/api\/manager\/decisions\/pulse/);
  assert.match(badge, /bg-brand-coral/);
  assert.match(badge, /motion-safe:animate-ping/);
  assert.match(badge, /document\.hidden \? false : 600_000/);
});
