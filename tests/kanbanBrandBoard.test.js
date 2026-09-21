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

test('the dragged card is drawn through a portal, so it never paints behind the neighbouring glass column', () => {
  // Rodny, 21 September 2026: "cuando arrastro una card a En proceso, queda detrás". Each brain-glass column
  // (backdrop-blur) is a stacking context; a z-index inside the source column cannot beat a later sibling.
  assert.match(board, /<Droppable\s+droppableId=\{col\.id\}\s+renderClone=\{\(provided, snapshot, rubric\) =>/, 'column droppables render the moving card with renderClone');
  assert.match(board, /columnTasks\[rubric\.source\.index\]/, 'the clone shows the task being dragged from that column');
  assert.match(board, /<TaskCardSurface[\s\S]*?provided=\{provided\}[\s\S]*?snapshot=\{snapshot\}/, 'the clone is the same card surface as the in-column card');
  assert.match(card, /const TaskCardSurface = \(\{ task, provided, snapshot,/, 'the card surface takes the dnd props from outside so both the list and the clone can render it');
  assert.match(card, /id=\{snapshot\.isClone \? undefined : `task-\$\{task\.id\}`\}/, 'the clone never duplicates the card DOM id (deep links scroll to the real card)');
  assert.doesNotMatch(source, /getContainerForClone/, 'the default container (document.body) is enough: nothing there clips or restacks the card');
});

test('the card shows priority as a tag, then title, assignee and date, a snippet and a footer with client, files and comments', () => {
  assert.match(card, /data-task-priority-tag/, 'priority is a tab standing above the card');
  assert.match(card, /<svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 28" preserveAspectRatio="none"/, 'the tab is a drawn folder shape: rounded top-left and a curve that slopes into the card edge (Rodny, 21 September 2026)');
  assert.match(source, /const TASK_TAB_FILL_PATH = 'M0,28 V10 A10,10 0 0 1 10,0 H68 C[^']*100,24 V28 Z'/, 'the fill closes below the card edge so the card border disappears under the tab');
  assert.match(source, /const TASK_TAB_STROKE_PATH = 'M0\.5,28[^']*100,24'/, 'the outline is open at the bottom and ends tangent to the card top edge');
  assert.match(card, /<path d=\{TASK_TAB_FILL_PATH\} className="fill-white dark:fill-zinc-900" \/>/, 'the tab is filled with the very same surface as the card body (white, zinc-900 in dark mode): part of the card, never a black badge (Rodny, 21 September 2026)');
  assert.doesNotMatch(card, /hsl\(var\(--card\)\)/, 'the card token is near black in dark mode, so the tab never uses it');
  assert.match(card, /<linearGradient id=\{`task-tab-\$\{task\.id\}`\} x1="0" y1="0" x2="0" y2="1">/, 'the tint runs top to bottom (Rodny, 21 September 2026)');
  assert.match(card, /stopOpacity="0\.18"[\s\S]*?offset="0\.85" stopColor="currentColor" stopOpacity="0"/, 'the priority tints the tab faintly and fades out completely before the card edge');
  assert.match(card, /stroke-zinc-200 dark:stroke-white\/10/, 'the tab outline is the same thin grey as the card border, so the outline reads as one shape');
  assert.match(card, /stroke-destructive\/50/, 'overdue and returned cards keep their red outline on the tab too');
  assert.doesNotMatch(card, /stroke="currentColor"/, 'the outline never takes the priority colour');
  assert.match(card, /priorityBadgeClass && "pt-6"/, 'the wrapper reserves room above the body with padding (a margin would collapse and drag the tab down with the body)');
  assert.match(card, /priorityBadgeClass && "rounded-tl-none"/, 'the card body squares its top-left corner so the tab arc becomes its corner');
  assert.match(source, /URGENTE: 'text-destructive'/, 'urgent keeps the historical red');
  assert.match(source, /NORMAL: 'text-blue-600/, 'normal priority keeps the historical blue (Rodny, 21 September 2026)');
  assert.match(source, /ALTA: 'text-amber-600/, 'high priority keeps the historical orange');
  assert.match(card, /taskPriorityBadgeConfig\[task\.priority\]/, 'the tab reads the shared priority config');
  assert.match(source, /const taskPriorityLabels = \{\s*URGENTE: 'Urgente',[^}]*ALTA: 'Alta',\s*NORMAL: 'Normal'\s*\}/, 'one word per priority so the three tabs share the same size (Rodny, 21 September 2026)');
  assert.doesNotMatch(source, /'Prioridad (alta|normal)'/, 'no "Prioridad …" prefix on the tab');
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
