import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readTaskPanel = () => readFile('src/components/modules/TaskSidePanel.jsx', 'utf8');
const readGlobalStyles = () => readFile('src/index.css', 'utf8');

test('new task panel teaches the minimum context needed to start without questions', async () => {
  const source = await readTaskPanel();

  assert.match(source, /data-task-context-tutorial/);
  assert.match(source, /src="\/brainstudio-mascot-tip\.png"/);
  assert.match(source, /alt="Mascota de Brainstudio"/);
  assert.match(source, /Una buena tarea evita una conversación adicional/);
  assert.match(source, /Información suficiente/);
  assert.match(source, /Insumos disponibles/);
  assert.match(source, /Responsable definido/);
  assert.match(source, /Prioridad clara/);
});

test('context tutorial keeps its principle visible and reveals the operational checklist on demand', async () => {
  const source = await readTaskPanel();

  assert.match(source, /!isEdition && \([\s\S]*?data-task-context-tutorial/);
  assert.match(source, /aria-expanded=\{showContextTutorialDetails\}/);
  assert.match(source, /Aprende cómo/);
  assert.match(source, /showContextTutorialDetails && \(/);
  assert.match(source, /contextReadinessSubject/);
  assert.match(source, /podría comenzar y completar esta tarea con la información suministrada\?/);
  assert.match(source, /Si la respuesta es no, reúne primero lo necesario/);
});

test('context tutorial stays out of the compact mobile task flow', async () => {
  const source = await readTaskPanel();

  assert.match(source, /data-task-context-tutorial[\s\S]*?className="[^"]*hidden[^"]*lg:block/);
});

test('new task title uses a compact single-row starting height', async () => {
  const source = await readTaskPanel();

  assert.match(source, /data-task-title-input[\s\S]*?rows=\{1\}/);
  assert.match(source, /min-h-\[52px\][\s\S]*?sm:min-h-\[56px\]/);
});

test('task tip uses a subtle static glow without a moving border', async () => {
  const [source, styles] = await Promise.all([readTaskPanel(), readGlobalStyles()]);

  assert.match(source, /brain-tip-highlight/);
  assert.match(styles, /\.brain-tip-highlight\s*\{[\s\S]*?box-shadow:/);
  assert.doesNotMatch(styles, /brain-tip-border-orbit/);
  assert.doesNotMatch(styles, /\.brain-tip-highlight::before/);
});
