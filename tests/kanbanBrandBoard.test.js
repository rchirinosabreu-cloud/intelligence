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
  assert.match(card, /absolute left-0 top-0 z-10[^"]*rounded-t-2xl border border-b-0/, 'the tab protrudes above the top-left corner like a folder tab, outline continuous with the card (Rodny, 21 September 2026)');
  assert.match(card, /priorityBadgeClass && "pt-6"/, 'the wrapper reserves room above the body with padding (a margin would collapse and drag the tab down with the body)');
  assert.match(card, /priorityBadgeClass && "rounded-tl-none"/, 'the card body squares its top-left corner to meet the tab');
  assert.match(source, /URGENTE: 'bg-gradient-to-r from-destructive/, 'each priority tab has its own soft gradient');
  assert.match(source, /NORMAL: 'bg-gradient-to-r from-blue-500/, 'normal priority keeps the historical blue (Rodny, 21 September 2026)');
  assert.match(source, /ALTA: 'bg-gradient-to-r from-amber-500/, 'high priority keeps the historical orange');
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
