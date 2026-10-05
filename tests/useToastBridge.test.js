import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createToastBridge } from '../src/components/ui/use-toast.js';

// Siete pantallas (Kanban, panel de la tarea, Perfil, historial de logros…) avisan con `useToast()`,
// pero su `<Toaster/>` nunca se montó: ningún aviso suyo aparecía, ni los de error. La aplicación
// solo monta el de react-hot-toast, así que `toast()` le entrega el aviso a ese (4 de octubre de 2026).

const fakeHot = () => {
  const calls = [];
  const record = (kind) => (message, options) => { calls.push({ kind, message, options }); return `id-${calls.length}`; };
  const hot = record('blank');
  hot.success = record('success');
  hot.error = record('error');
  hot.dismiss = (id) => calls.push({ kind: 'dismiss', id });
  return { hot, calls };
};

const textOf = (node) => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.props?.children);
};

test('a destructive toast reaches the mounted toaster as an error, with title and description', () => {
  const { hot, calls } = fakeHot();
  const toast = createToastBridge(hot);
  toast({ title: 'Error', description: 'No se pudo reintegrar la tarea.', variant: 'destructive' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'error');
  assert.match(textOf(calls[0].message), /Error/);
  assert.match(textOf(calls[0].message), /No se pudo reintegrar la tarea\./);
  assert.ok(calls[0].options.duration >= 5000, 'un error se lee con calma');
});

test('a normal toast reaches the mounted toaster as a success', () => {
  const { hot, calls } = fakeHot();
  createToastBridge(hot)({ title: 'Tarea reintegrada', description: 'La tarea volvió a Pendiente.' });
  assert.equal(calls[0].kind, 'success');
  assert.match(textOf(calls[0].message), /Tarea reintegrada/);
});

test('a title alone is enough, and the duration the screen asked for is kept', () => {
  const { hot, calls } = fakeHot();
  createToastBridge(hot)({ title: 'Nota eliminada', duration: 1500 });
  assert.equal(textOf(calls[0].message).trim(), 'Nota eliminada');
  assert.equal(calls[0].options.duration, 1500);
});

test('the returned handle can dismiss the toast, as before', () => {
  const { hot, calls } = fakeHot();
  const handle = createToastBridge(hot)({ title: 'Borrador restaurado' });
  handle.dismiss();
  assert.deepEqual(calls.at(-1), { kind: 'dismiss', id: handle.id });
});

test('the screens keep their import; no screen needs to change', () => {
  for (const file of ['modules/NativeTasks.jsx', 'modules/TaskSidePanel.jsx', 'modules/Profile.jsx', 'modules/ClientTasksWidget.jsx', 'modules/CompletedTasksHistoryModal.jsx', 'security/MfaAdminReset.jsx', 'tasks/FocusExtensionDialog.jsx']) {
    const source = readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8');
    assert.match(source, /from '@\/components\/ui\/use-toast'/, file);
  }
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /from 'react-hot-toast'/);
  assert.match(app, /<Toaster/);
});
