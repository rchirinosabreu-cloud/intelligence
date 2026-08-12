import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  TASK_CATEGORIES,
  classifyTaskDeterministically
} from '../src/services/deterministicTaskClassifier.js';
import { processUnclassifiedTasks } from '../src/services/taskClassificationService.js';

const cases = [
  ['Definir estrategia de posicionamiento y objetivos de marca', 'Estrat\u00e9gico'],
  ['[Dise\u00f1o] Crear carrusel y piezas gr\u00e1ficas', 'Creativo & Dise\u00f1o'],
  ['Planificar parrilla de Instagram y pauta digital', 'Marketing & Social Media'],
  ['[Producci\u00f3n] Editar Reel y agregar motion graphics', 'Producci\u00f3n Audiovisual'],
  ['Redactar copy y caption para lanzamiento', 'Creaci\u00f3n de Contenido'],
  ['Reuni\u00f3n de seguimiento con el equipo y ajustes', 'Operaciones & Reuniones'],
  ['Preparar factura, contrato y presupuesto mensual', 'Administrativo & Finanzas'],
  ['Investigar mercado y preparar capacitaci\u00f3n interna', 'Educaci\u00f3n']
];

test('deterministic classifier preserves every official task category', () => {
  assert.equal(TASK_CATEGORIES.length, 8);

  for (const [title, expectedCategory] of cases) {
    const result = classifyTaskDeterministically({ title });
    assert.equal(result.category, expectedCategory, title);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.ok(result.reasons.length > 0);
  }
});

test('task complexity is deterministic and urgency does not increase it', () => {
  assert.equal(
    classifyTaskDeterministically({ title: '[URGENTE] Cambiar una tipograf\u00eda del banner' }).complexity,
    'BAJA'
  );
  assert.equal(
    classifyTaskDeterministically({ title: 'Dise\u00f1ar carrusel siguiendo la identidad existente' }).complexity,
    'MEDIA'
  );
  assert.equal(
    classifyTaskDeterministically({ title: 'Crear desde cero la estrategia integral de campa\u00f1a' }).complexity,
    'ALTA'
  );
});

test('description and operational metadata contribute without requiring AI', () => {
  const result = classifyTaskDeterministically({
    title: 'Preparar entrega',
    description: '<p>Editar el video principal y crear tres reels.</p>',
    attachmentCount: 3
  });

  assert.equal(result.category, 'Producci\u00f3n Audiovisual');
  assert.equal(result.complexity, 'MEDIA');
  assert.match(result.reasons.join(' '), /video|reel/i);
});

test('unknown work falls back to operations with medium complexity', () => {
  const result = classifyTaskDeterministically({ title: 'Resolver pendiente de MIO' });

  assert.equal(result.category, 'Operaciones & Reuniones');
  assert.equal(result.complexity, 'MEDIA');
  assert.equal(result.confidence, 0);
});

test('task classification runtime has no Gemini or AI service dependency', () => {
  const serviceSource = readFileSync('src/services/taskClassificationService.js', 'utf8');
  const nativeTaskSource = readFileSync('src/services/nativeTaskService.js', 'utf8');
  const aiServiceSource = readFileSync('src/services/aiService.js', 'utf8');

  assert.doesNotMatch(serviceSource, /aiService|aiConfig|classifyTaskWithAI|classifyTasksBatch|Gemini/i);
  assert.doesNotMatch(nativeTaskSource, /enqueueTaskClassification/);
  assert.doesNotMatch(aiServiceSource, /classifyTaskWithAI|classifyTasksBatch|MASTER_PROMPT/);
  assert.match(nativeTaskSource, /classifyTaskDeterministically/);
  assert.match(nativeTaskSource, /aiCategory:\s*taskClassification\.category/);
  assert.match(nativeTaskSource, /aiComplexity:\s*taskClassification\.complexity/);
});

test('legacy unclassified tasks are backfilled with local rules only', async () => {
  const updates = [];
  const db = {
    task: {
      findMany: async () => [{
        id: 'task-legacy',
        title: '[Producci\u00f3n] Editar video testimonial',
        comments: null,
        taskComments: [{ content: '<p>Agregar subt\u00edtulos.</p>' }],
        _count: { taskAttachments: 1 }
      }],
      update: async (payload) => {
        updates.push(payload);
        return payload;
      }
    }
  };

  const result = await processUnclassifiedTasks({ db });

  assert.equal(result.processed, 1);
  assert.deepEqual(updates, [{
    where: { id: 'task-legacy' },
    data: {
      aiCategory: 'Producci\u00f3n Audiovisual',
      aiComplexity: 'MEDIA'
    }
  }]);
});
