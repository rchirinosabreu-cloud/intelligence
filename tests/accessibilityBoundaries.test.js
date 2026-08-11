import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('authenticated header icon controls have accessible names and touch targets', async () => {
  const source = await read('src/components/layout/AppLayout.jsx');

  assert.match(source, /aria-label="Buscar en Brainstudio"/);
  assert.match(source, /aria-label="Cambiar tema"/);
  assert.match(source, /aria-label="Abrir notificaciones"/);
  assert.match(source, /aria-label="Abrir menú de cuenta"/);
  assert.match(source, /group-focus-within\/item:opacity-100/);
  assert.match(source, /min-w-11 min-h-11/);
});

test('task panel icon-only actions expose their purpose to assistive technology', async () => {
  const source = await read('src/components/modules/TaskSidePanel.jsx');

  for (const label of [
    'Cerrar vista previa',
    'Descargar archivo',
    'Abrir acciones del comentario',
    'Quitar archivo seleccionado',
    'Quitar adjunto del borrador',
    'Enviar comentario'
  ]) {
    assert.match(source, new RegExp(`aria-label=["']${label}["']`));
  }
});

test('platform confirmation dialog has an accessible title and description', async () => {
  const source = await read('src/components/ui/ConfirmDialog.jsx');
  assert.match(source, /AlertDialog\.Title/);
  assert.match(source, /AlertDialog\.Description/);
});
