import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { transformSync } from '@babel/core';
import * as taskTiming from '../src/lib/taskTiming.js';

test('task returns expose six operational reasons followed by other', () => {
  assert.ok(Array.isArray(taskTiming.RETURN_REASONS));
  assert.equal(taskTiming.RETURN_REASONS.length, 7);
  assert.deepEqual(
    taskTiming.RETURN_REASONS.map(reason => reason.label),
    [
      'Entregable incompleto',
      'No cumple con el brief o alcance',
      'Faltan insumos o referencias',
      'Ajustes de diseño o identidad visual',
      'Corrección de copy, gramática u ortografía',
      'Error técnico o de calidad',
      'Otro motivo',
    ]
  );
});

test('task return payload keeps the selected reason separate from its note', () => {
  assert.equal(typeof taskTiming.buildTaskReturnPayload, 'function');
  assert.deepEqual(
    taskTiming.buildTaskReturnPayload('MISSING_INPUTS', '  Falta el logo editable.  '),
    {
      status: 'DEVUELTA',
      isReturned: true,
      returnReason: 'MISSING_INPUTS',
      returnNote: 'Falta el logo editable.',
    }
  );
  assert.equal(taskTiming.buildTaskReturnPayload('MISSING_INPUTS', '   '), null);
  assert.equal(taskTiming.buildTaskReturnPayload('UNKNOWN_REASON', 'Detalle'), null);
});

test('structured and legacy return events remain readable', () => {
  assert.equal(typeof taskTiming.formatTaskReturnEventContent, 'function');
  assert.equal(
    taskTiming.formatTaskReturnEventContent('COPY_OR_LANGUAGE_CORRECTION', 'Corregir el titular.'),
    '[COPY_OR_LANGUAGE_CORRECTION]\nCorregir el titular.'
  );
  assert.deepEqual(
    taskTiming.getTaskSystemEventPresentation(
      'system_return',
      '[COPY_OR_LANGUAGE_CORRECTION]\nCorregir el titular.'
    ),
    {
      badgeLabel: 'Corrección de copy, gramática u ortografía',
      note: 'Corregir el titular.',
    }
  );
  assert.deepEqual(
    taskTiming.getTaskSystemEventPresentation('system_return', 'Comentario histórico'),
    { badgeLabel: 'Motivo de devolución', note: 'Comentario histórico' }
  );
});

test('return, reopen and reintegration share one responsive lifecycle dialog', () => {
  const componentPath = 'src/components/modules/TaskLifecycleDialog.jsx';
  assert.equal(existsSync(componentPath), true, 'TaskLifecycleDialog must be shared by all lifecycle flows');

  const component = readFileSync(componentPath, 'utf8');
  const result = transformSync(component, {
    presets: ['@babel/preset-react'],
    filename: 'TaskLifecycleDialog.jsx',
  });
  assert.ok(result.code);
  assert.match(component, /min-h-11/);
  assert.match(component, /dark:bg-zinc-950/);
  assert.match(component, /overlayClassName="z-\[130\]"/);
  assert.match(component, /z-\[131\]/);

  const kanban = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');
  const sidePanel = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
  assert.ok((kanban.match(/<TaskLifecycleDialog/g) || []).length >= 2);
  assert.match(sidePanel, /<TaskLifecycleDialog/);
  assert.doesNotMatch(sidePanel, /showReintegratePrompt\s*&&\s*\(\s*<motion\.div/);
  assert.match(sidePanel, /originalStatus\s*===\s*'DEVUELTA'[\s\S]{0,180}setShowReintegratePrompt\(true\)/);
});

test('backend requires and persists the structured return reason and note', () => {
  const security = readFileSync('src/config/security.js', 'utf8');
  const service = readFileSync('src/services/nativeTaskService.js', 'utf8');

  assert.match(security, /'returnNote'/);
  assert.match(service, /formatTaskReturnEventContent\(returnReason,\s*returnNote\)/);
  assert.match(service, /Reintegrating a returned task requires a note/);
});
