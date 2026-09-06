import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewPayload } from './helpers/briaReview.js';

import {
  buildContentPlanAnalysisHash,
  buildContentPlanRevisionHash,
  buildFindingFingerprint,
  calculateContentPlanReviewScore,
  transitionContentPlanFinding,
  reviewContentPlanWithBria
} from '../src/services/briaContentPlanReviewService.js';

const plan = {
  id: 'plan-1',
  clientId: 'client-1',
  month: 9,
  year: 2026,
  strategicObjectives: 'Posicionar a Aristea como aliada estratégica.',
  internalNotes: 'Evitar promesas absolutas.',
  client: {
    id: 'client-1',
    name: 'Aristea',
    slug: 'aristea',
    aiInstructions: 'Tono experto, claro y sobrio.'
  },
  items: [
    {
      id: 'piece-2',
      objective: 'Conversión',
      format: 'Reel',
      copyText: 'Segundo contenido',
      captionText: 'Caption dos',
      publishDate: '2026-09-10T00:00:00.000Z',
      status: 'APROBADO'
    },
    {
      id: 'piece-1',
      objective: 'Reconocimiento',
      format: 'Carrusel',
      copyText: 'Primer contenido',
      captionText: 'Caption uno',
      publishDate: '2026-09-04T00:00:00.000Z',
      status: 'BORRADOR'
    }
  ]
};

test('content-plan revision is deterministic and changes with reviewable content', () => {
  const reordered = { ...plan, items: [...plan.items].reverse() };
  const changed = {
    ...plan,
    items: plan.items.map((item) => item.id === 'piece-1' ? { ...item, copyText: 'Texto corregido' } : item)
  };

  assert.equal(buildContentPlanRevisionHash(plan), buildContentPlanRevisionHash(reordered));
  assert.notEqual(buildContentPlanRevisionHash(plan), buildContentPlanRevisionHash(changed));
});

test('revision invalidation includes pieces beyond 60 and untruncated reviewable text', () => {
  const large = { ...plan, items: Array.from({ length: 61 }, (_, index) => ({ ...plan.items[0], id: `piece-${index}` })) };
  const changed = structuredClone(large);
  changed.items[60].copyText = 'Changed outside the first prompt window';
  assert.notEqual(buildContentPlanRevisionHash(large), buildContentPlanRevisionHash(changed));
  const long = { ...plan, items: [{ ...plan.items[0], copyText: 'a'.repeat(2000) }] };
  assert.notEqual(buildContentPlanRevisionHash(long), buildContentPlanRevisionHash({ ...long, items: [{ ...long.items[0], copyText: `${long.items[0].copyText} correction` }] }));
});

test('deleted pieces never change the review snapshot used for publication', () => {
  const stored = { ...plan, items: [...plan.items, { ...plan.items[0], id: 'deleted', deletedAt: new Date() }] };
  assert.equal(buildContentPlanRevisionHash(stored), buildContentPlanRevisionHash(plan));
});

test('analysis hash includes the plan revision, evidence and prompt version', () => {
  const revisionHash = buildContentPlanRevisionHash(plan);
  const first = buildContentPlanAnalysisHash({
    revisionHash,
    promptVersion: 'content-plan-review-v2',
    evidence: [{ id: 'memory-1', content: 'Regla vigente' }]
  });
  const same = buildContentPlanAnalysisHash({
    revisionHash,
    promptVersion: 'content-plan-review-v2',
    evidence: [{ id: 'memory-1', content: 'Regla vigente' }]
  });
  const newEvidence = buildContentPlanAnalysisHash({
    revisionHash,
    promptVersion: 'content-plan-review-v2',
    evidence: [{ id: 'memory-2', content: 'Nueva decisión' }]
  });

  assert.equal(first, same);
  assert.notEqual(first, newEvidence);
});

test('score is calculated by the backend and ignores dimensions without evidence', () => {
  const result = calculateContentPlanReviewScore({
    ESTRATEGIA: { score: 80, assessable: true },
    MARCA: { score: 10, assessable: false },
    GRAMATICA: { score: 90, assessable: true },
    CONSISTENCIA: { score: 70, assessable: true }
  });

  assert.equal(result.score, 81);
  assert.equal(result.coverage, 75);
  assert.deepEqual(result.assessableDimensions, ['ESTRATEGIA', 'GRAMATICA', 'CONSISTENCIA']);
});

test('finding fingerprint is stable but scoped to the affected piece and rule', () => {
  const base = buildFindingFingerprint({
    planId: 'plan-1', itemId: 'piece-1', ruleKey: 'GRAMATICA_ORTOGRAFIA', field: 'copyText'
  });

  assert.equal(base, buildFindingFingerprint({
    planId: 'plan-1', itemId: 'piece-1', ruleKey: 'gramatica_ortografia', field: 'copyText'
  }));
  assert.notEqual(base, buildFindingFingerprint({
    planId: 'plan-1', itemId: 'piece-2', ruleKey: 'GRAMATICA_ORTOGRAFIA', field: 'copyText'
  }));
});

test('finding lifecycle distinguishes human correction from dismissal', () => {
  const now = new Date('2026-09-02T16:00:00.000Z');

  assert.deepEqual(
    transitionContentPlanFinding('OPEN', 'MARK_CORRECTED', { now, actorUserId: 'user-1' }),
    {
      status: 'VERIFYING',
      resolvedAt: null,
      dismissedAt: null,
      lastActionAt: now,
      lastActionById: 'user-1',
      actionReason: null
    }
  );
  assert.deepEqual(
    transitionContentPlanFinding('OPEN', 'DISMISS', { now, actorUserId: 'admin-1', reason: 'No aplica al cliente' }),
    {
      status: 'DISMISSED',
      resolvedAt: null,
      dismissedAt: now,
      lastActionAt: now,
      lastActionById: 'admin-1',
      actionReason: 'No aplica al cliente'
    }
  );
  assert.throws(
    () => transitionContentPlanFinding('OPEN', 'DISMISS', { now, actorUserId: 'admin-1' }),
    /motivo/i
  );
});

test('the same plan and memory snapshot reuse one persisted global review', async () => {
  const persisted = new Map();
  let aiCalls = 0;
  const repository = {
    findByAnalysisHash: async (analysisHash) => persisted.get(analysisHash) || null,
    saveCompletedReview: async ({ analysisHash, result }) => {
      persisted.set(analysisHash, result);
      return result;
    }
  };
  const ai = {
    generate: async () => {
      aiCalls += 1;
      return {
        model: 'gpt-5.6-luna',
        requestId: 'request-1',
        text: JSON.stringify({
          summary: 'Revisión compartida.',
          reviewedItemIds: ['piece-1', 'piece-2'],
          verdict: 'ALINEADA',
          dimensions: {
            ESTRATEGIA: { score: 90, confidence: 0.8, assessable: true, note: 'Alineada.' },
            MARCA: { score: 90, confidence: 0.8, assessable: true, note: 'Alineada.' },
            GRAMATICA: { score: 90, confidence: 0.9, assessable: true, note: 'Correcta.' },
            CONSISTENCIA: { score: 90, confidence: 0.9, assessable: true, note: 'Coherente.' }
          },
          findings: []
        })
      };
    }
  };
  const options = {
    planId: 'plan-1',
    getPlan: async () => plan,
    searchMemory: async () => [{ id: 'memory-1', clientId: 'client-1', content: 'Regla vigente' }],
    repository,
    ai,
    now: () => new Date('2026-09-02T16:00:00.000Z')
  };

  const first = await reviewContentPlanWithBria(options);
  const second = await reviewContentPlanWithBria(options);

  assert.equal(aiCalls, 1);
  assert.equal(first.meta.analysisHash, second.meta.analysisHash);
  assert.equal(second.meta.cached, true);
  assert.equal(second.review.score, 90);
});

test('marking corrected triggers verification even when the content hash is unchanged', async () => {
  let calls = 0;
  const result = await reviewContentPlanWithBria({
    planId: plan.id, getPlan: async () => plan, searchMemory: async () => [],
    repository: {
      findByAnalysisHash: async () => ({ review: { findings: [{ status: 'VERIFYING' }] }, meta: {} }),
      saveCompletedReview: async ({ result }) => result
    },
    ai: { generate: async request => { calls++; return { text: JSON.stringify(reviewPayload(request)) }; } }
  });
  assert.equal(calls, 1);
  assert.equal(result.meta.cached, false);
});
