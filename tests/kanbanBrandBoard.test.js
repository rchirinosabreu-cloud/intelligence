import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Rodny, 21 September 2026: the Gestión Kanban follows the brand board layout — ambient background,
// glass columns with a count and a "+" button, cards with a priority tag, assignee row, date, snippet and footer.

const source = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');
const card = source.slice(source.indexOf('const TaskCard ='), source.indexOf('export default NativeTasks'));
const board = source.slice(source.indexOf('<div className="task-board-grid'), source.indexOf('const TaskCard ='));

test('the board sits on the brand ambient and its columns are glass panels with a count and a create button', () => {
  assert.match(source, /<div className="brain-ambient space-y-6 h-full flex flex-col">/, 'the page carries the dashboard ambient');
  assert.match(board, /brain-glass/, 'columns are glass panels');
  assert.match(board, /data-column-count/, 'each column shows how many tasks it holds');
  assert.match(board, /aria-label=\{`Nueva tarea en \$\{col\.title\}`\}/, 'the dashed plus button opens the creation panel from the column');
  assert.match(board, /border-dashed/, 'the create button is the dashed square of the reference');
  assert.match(board, /ring-brand-cyan/, 'drag-over feedback uses the brand cyan');
  assert.doesNotMatch(board, /indigo|violet|purple|emerald|blue-/, 'no legacy hues on the board');
  assert.match(source, /const columns = \[/, 'the columns definition keeps its name (other contracts depend on it)');
});

test('the card shows priority as a tag, then title, assignee and date, a snippet and a footer with client, files and comments', () => {
  assert.match(card, /data-task-priority-tag/, 'priority is a tab standing above the card');
  assert.match(card, /<svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 28" preserveAspectRatio="none"/, 'the tab is a drawn folder shape: rounded top-left and a curve that slopes into the card edge (Rodny, 21 September 2026)');
  assert.match(source, /const TASK_TAB_FILL_PATH = 'M0,28 V10 A10,10 0 0 1 10,0 H68 C[^']*100,24 V28 Z'/, 'the fill closes below the card edge so the card border disappears under the tab');
  assert.match(source, /const TASK_TAB_STROKE_PATH = 'M0\.5,28[^']*100,24'/, 'the outline is open at the bottom and ends tangent to the card top edge');
  assert.match(card, /style=\{\{ fill: 'hsl\(var\(--card\)\)' \}\}/, 'the tab is filled with the card surface: it is part of the card, not a badge on top');
  assert.match(card, /stopOpacity="0\.14"[\s\S]*?stopOpacity="0"/, 'the priority only tints the tab faintly, fading to nothing (Rodny, 21 September 2026)');
  assert.match(card, /stroke-zinc-200 dark:stroke-white\/10/, 'the tab outline is the same thin grey as the card border, so the outline reads as one shape');
  assert.match(card, /stroke-destructive\/50/, 'overdue and returned cards keep their red outline on the tab too');
  assert.doesNotMatch(card, /stroke="currentColor"/, 'the outline never takes the priority colour');
  assert.match(card, /priorityBadgeClass && "pt-6"/, 'the wrapper reserves room above the body with padding (a margin would collapse and drag the tab down with the body)');
  assert.match(card, /priorityBadgeClass && "rounded-tl-none"/, 'the card body squares its top-left corner so the tab arc becomes its corner');
  assert.match(source, /URGENTE: 'text-destructive'/, 'urgent keeps the historical red');
  assert.match(source, /NORMAL: 'text-blue-600/, 'normal priority keeps the historical blue (Rodny, 21 September 2026)');
  assert.match(source, /ALTA: 'text-amber-600/, 'high priority keeps the historical orange');
  assert.match(card, /taskPriorityBadgeConfig\[task\.priority\]/, 'the tab reads the shared priority config');
  assert.doesNotMatch(card, /data-task-category-tab/, 'the AI category never takes the tab: it lives in the footer only');
  assert.match(card, /data-task-assignee/, 'assignee name and avatar are a row of their own');
  assert.match(card, /formatTaskCardDate\(task\.dueDateFormatted\)/, 'the compact date stays');
  assert.match(card, /line-clamp-2/, 'the description snippet is clamped');
  assert.match(card, /taskAttachments/, 'the footer counts attachments');
  assert.match(card, /<Paperclip/, 'attachments use the paperclip icon');
  assert.match(card, /task\.clientName/, 'the client stays on the card');
  assert.match(card, /aiCategory/, 'the AI category stays on the card');
  assert.match(card, /Creado por/, 'the creator stays on the card');
  assert.match(card, /border-brand-magenta/, 'special tasks use the brand magenta border');
  assert.doesNotMatch(card, /indigo|violet|purple-|emerald|#009EB9/, 'no legacy hues or local hex on the card (priority colours are the historical red/orange/blue by decision of Rodny)');
  assert.match(card, /rounded-2xl border/, 'full soft border, rounded like the dashboard cards');
  assert.match(card, /sm:opacity-0 sm:group-hover\/card:opacity-100/, 'card actions appear on hover on desktop and stay visible on touch');
});
