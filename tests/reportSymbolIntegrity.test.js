import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('top content filtering uses the shared helper instead of a legacy global', () => {
  const presentation = readFileSync(new URL('../src/lib/reportPresentation.js', import.meta.url), 'utf8');
  const vision = readFileSync(new URL('../src/services/reportVisionService.js', import.meta.url), 'utf8');
  const reports = readFileSync(new URL('../src/components/modules/Reports.jsx', import.meta.url), 'utf8');
  const routes = readFileSync(new URL('../src/routes/api/reports.js', import.meta.url), 'utf8');

  assert.match(presentation, /export const filterTopContentRows/);
  assert.match(vision, /import \{[^}]*filterTopContentRows[^}]*\} from '..\/lib\/reportPresentation\.js'/s);
  assert.match(reports, /import \{[^}]*filterTopContentRows[^}]*\} from '@\/lib\/reportPresentation'/s);
  assert.doesNotMatch(routes, /globalThis\.filterTopContentRows/);
});
