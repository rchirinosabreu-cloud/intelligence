import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Bria opens with a proactive Observer inbox instead of a search experience', () => {
  const manager = readFileSync('src/components/modules/ManagerTaskAnalytics.jsx', 'utf8');
  const inbox = readFileSync('src/components/modules/BriaObserverInbox.jsx', 'utf8');

  assert.match(manager, /<BriaObserverInbox/);
  assert.match(inbox, /Bandeja del Observer/);
  assert.match(inbox, /\/api\/manager\/observer-signals/);
  assert.match(inbox, /Revisar/);
  assert.match(inbox, /Aplazar/);
  assert.match(inbox, /Descartar/);
  assert.match(inbox, /Resolver/);
  assert.match(inbox, /aria-live="polite"/);
  assert.match(inbox, /antecedentes integrados en la memoria/i);
  assert.match(inbox, /min-h-11/);
  assert.match(manager, /hidden sm:inline[^>]*>Próxima etapa/);
  assert.match(manager, /min-h-11[^>]*periodDays === days/);
  assert.match(manager, /onClick=\{loadAnalytics\}[\s\S]{0,220}min-h-11/);
});

test('memory recovery remains available as a collapsed audit tool', () => {
  const memory = readFileSync('src/components/modules/BriaMemoryPanel.jsx', 'utf8');

  assert.match(memory, /<details/);
  assert.match(memory, /Auditoría de recuperación/);
  assert.doesNotMatch(memory, /<h2[^>]*>Probar recuperación<\/h2>/);
});
