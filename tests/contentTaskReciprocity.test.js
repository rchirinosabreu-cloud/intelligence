import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildContentTaskTitle,
  buildContentItemUpdateFromTask,
  buildLinkedTaskUpdates,
  isPublicationTask
} from '../src/lib/contentTaskReciprocity.js';

const date = (value) => new Date(`${value}T00:00:00.000Z`);

test('rescheduling a content item shifts every active linked deadline by the same interval', () => {
  const updates = buildLinkedTaskUpdates({
    previousItem: {
      objective: 'Lanzamiento de campaña',
      format: 'Carrusel',
      publishDate: date('2026-09-10')
    },
    nextItem: {
      objective: 'Lanzamiento de campaña',
      format: 'Carrusel',
      publishDate: date('2026-09-15')
    },
    tasks: [
      {
        id: 'production',
        title: '[Producción] Carrusel: Lanzamiento de campaña',
        dueDate: date('2026-09-08'),
        status: 'EN_CURSO'
      },
      {
        id: 'publication',
        title: '[Publicar] Carrusel: Lanzamiento de campaña',
        dueDate: date('2026-09-10'),
        status: 'PENDIENTE'
      }
    ]
  });

  assert.deepEqual(
    updates.map(({ id, data }) => ({ id, dueDate: data.dueDate.toISOString() })),
    [
      { id: 'production', dueDate: '2026-09-13T00:00:00.000Z' },
      { id: 'publication', dueDate: '2026-09-15T00:00:00.000Z' }
    ]
  );
});

test('reciprocity never rewrites completed work', () => {
  const updates = buildLinkedTaskUpdates({
    previousItem: {
      objective: 'Contenido anterior',
      format: 'Reel',
      publishDate: date('2026-09-10')
    },
    nextItem: {
      objective: 'Contenido nuevo',
      format: 'Video',
      publishDate: date('2026-09-12')
    },
    tasks: [{
      id: 'completed',
      title: '[Producción] Reel: Contenido anterior',
      dueDate: date('2026-09-08'),
      status: 'REALIZADA'
    }]
  });

  assert.deepEqual(updates, []);
});

test('generated titles follow content edits while manually customized titles are preserved', () => {
  const previousItem = {
    objective: 'Contenido anterior',
    format: 'Reel',
    publishDate: date('2026-09-10')
  };
  const nextItem = {
    objective: 'Contenido actualizado',
    format: 'Carrusel',
    publishDate: date('2026-09-10')
  };

  const updates = buildLinkedTaskUpdates({
    previousItem,
    nextItem,
    tasks: [
      {
        id: 'generated',
        title: '[Producción] Reel: Contenido anterior',
        dueDate: date('2026-09-08'),
        status: 'PENDIENTE'
      },
      {
        id: 'custom',
        title: 'Preparar propuesta visual urgente',
        dueDate: date('2026-09-08'),
        status: 'PENDIENTE'
      }
    ]
  });

  assert.deepEqual(updates, [{
    id: 'generated',
    data: { title: '[Producción] Carrusel: Contenido actualizado' }
  }]);
  assert.equal(buildContentTaskTitle('publication', nextItem), '[Publicar] Carrusel: Contenido actualizado');
  assert.equal(isPublicationTask('[Publicar] Carrusel: Contenido actualizado'), true);
  assert.equal(isPublicationTask('[Producción] Carrusel: Contenido actualizado'), false);
});

test('a task without its own deadline inherits the new publication date', () => {
  const updates = buildLinkedTaskUpdates({
    previousItem: {
      objective: 'Historia',
      format: 'Story',
      publishDate: date('2026-09-10')
    },
    nextItem: {
      objective: 'Historia',
      format: 'Story',
      publishDate: date('2026-09-12')
    },
    tasks: [{
      id: 'without-date',
      title: '[Producción] Story: Historia',
      dueDate: null,
      status: 'PENDIENTE'
    }]
  });

  assert.equal(updates[0].data.dueDate.toISOString(), '2026-09-12T00:00:00.000Z');
});

test('moving a publication task reschedules its content item', () => {
  const update = buildContentItemUpdateFromTask({
    task: { title: '[Publicar] Reel: Campaña', contentItemId: 'content-1' },
    taskUpdate: { dueDate: '2026-09-18' }
  });

  assert.equal(update.publishDate.toISOString(), '2026-09-18T00:00:00.000Z');
});

test('moving a production deadline preserves the content publication date', () => {
  const update = buildContentItemUpdateFromTask({
    task: { title: '[Producción] Reel: Campaña', contentItemId: 'content-1' },
    taskUpdate: { dueDate: '2026-09-18' }
  });

  assert.equal(update, null);
});

test('content and task services apply reciprocal updates inside their existing transactions', async () => {
  const [contentService, taskService] = await Promise.all([
    readFile(new URL('../src/services/contentService.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/nativeTaskService.js', import.meta.url), 'utf8')
  ]);

  assert.match(contentService, /buildLinkedTaskUpdates/);
  assert.match(contentService, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(contentService, /tx\.task\.update/);
  assert.match(taskService, /buildContentItemUpdateFromTask/);
  assert.match(taskService, /buildLinkedTaskUpdates/);
  assert.match(taskService, /excludedTaskIds:\s*\[id\]/);
});
