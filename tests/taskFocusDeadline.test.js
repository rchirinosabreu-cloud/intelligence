import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FOCUS_ACTIVE_STATUSES, FOCUS_EXTENSION_EVENT_TYPE, FOCUS_EXTENSION_OPTIONS, FOCUS_OVERDUE_EVENT_TYPE, LOCK_RETRY_WINDOW_MS, bogotaTimeOf,
  extendedFocusDeadline, findFocusTaskFor, focusDeadlineIso, focusEventPresentation, focusExtensionRequestMessage, focusLockMessage, focusOverdueMessages,
  focusTimeFromIso, formatFocusExtensionEventContent, formatFocusOverdueEventContent, getTaskLock, isActiveFocusTask, isFocusOverdue,
  isManagerUser, nextLockReaction, parseFocusExtensionRequest
} from '../src/lib/taskFocus.js';
import { getTaskSystemEventPresentation } from '../src/lib/taskTiming.js';
import { assertTaskNotLocked, findActiveFocusTaskForUser, notifyFocusOverdue, requestFocusExtension } from '../src/services/taskFocusService.js';

// Rodny, 21 September 2026: a deadline with an hour means the person works only on that task; the rest of
// their pending work is locked until it is done. Only admins and project managers set it.

// The calm fixture lives far in the future so the suite never turns "overdue" with the wall clock.
const focus = { id: 'focus', title: 'Redactar parrilla', status: 'EN_CURSO', assigneeId: 'member-helen', assigneeUserId: 'user-helen', focusDeadlineAt: '2036-09-21T19:00:00.000Z' };
const other = { id: 'other', title: 'Caption', status: 'PENDIENTE', assigneeId: 'member-helen', assigneeUserId: 'user-helen', focusDeadlineAt: null };
const foreign = { id: 'foreign', title: 'Reel', status: 'PENDIENTE', assigneeId: 'member-melissa', assigneeUserId: 'user-melissa', focusDeadlineAt: null };
const done = { ...focus, id: 'done', status: 'REALIZADA' };

test('a focus task is active while it has an hour and is not done, whatever the clock says', () => {
  assert.equal(isActiveFocusTask(focus), true);
  assert.equal(isActiveFocusTask({ ...focus, status: 'DEVUELTA' }), true, 'a returned focus task still needs the person');
  assert.equal(isActiveFocusTask(done), false);
  assert.equal(isActiveFocusTask(other), false);
  assert.deepEqual([...FOCUS_ACTIVE_STATUSES], ['PENDIENTE', 'EN_CURSO', 'DEVUELTA']);
  assert.equal(findFocusTaskFor([other, focus, done], { assigneeUserId: 'user-helen' })?.id, 'focus');
  assert.equal(findFocusTaskFor([other, focus], { assigneeId: 'member-helen' })?.id, 'focus');
  assert.equal(findFocusTaskFor([other, focus], { assigneeUserId: 'user-melissa' }), null);
  const later = { ...focus, id: 'later', focusDeadlineAt: '2036-09-21T22:00:00.000Z' };
  assert.equal(findFocusTaskFor([later, focus], { assigneeUserId: 'user-helen' })?.id, 'focus', 'the earliest commitment wins');
});

test('a locked card shakes on the first touch and explains itself on a retry (Rodny, 21 September 2026)', () => {
  const t0 = 1_000_000;
  const first = nextLockReaction(null, t0);
  assert.equal(first.reaction, 'shake', 'first attempt: the card shakes');
  assert.deepEqual(first.record, { at: t0 });
  const retry = nextLockReaction(first.record, t0 + 2000);
  assert.equal(retry.reaction, 'explain', 'a retry shortly after: the popup');
  assert.equal(retry.record, null, 'after the popup the count starts over');
  assert.equal(nextLockReaction(retry.record, t0 + 3000).reaction, 'shake', 'after the popup, the next touch shakes again');
  assert.equal(nextLockReaction(first.record, t0 + LOCK_RETRY_WINDOW_MS + 1).reaction, 'shake', 'a touch long after the first one is a fresh attempt');
  assert.equal(LOCK_RETRY_WINDOW_MS, 8000);
});

test('the lock applies to the person\'s other tasks only, never to managers and never to the focus task itself', () => {
  const tasks = [focus, other, foreign];
  assert.deepEqual(getTaskLock({ tasks, task: other, viewerUserId: 'user-helen' }), { focusTask: focus, inProgressTask: null });
  assert.equal(getTaskLock({ tasks, task: focus, viewerUserId: 'user-helen' }), null, 'the focus task stays open');
  // Rodny, 21 September 2026: what was already in progress can be finished; then only the commitment moves.
  const working = { id: 'working', title: 'Caption Expo', status: 'EN_CURSO', assigneeId: 'member-helen', assigneeUserId: 'user-helen', focusDeadlineAt: null };
  assert.equal(getTaskLock({ tasks: [focus, other, working], task: working, viewerUserId: 'user-helen' }), null, 'the task already in progress is not locked');
  assert.deepEqual(getTaskLock({ tasks: [focus, other, working], task: other, viewerUserId: 'user-helen' }), { focusTask: focus, inProgressTask: working }, 'the other pending tasks stay locked and the notice knows what is in progress');
  assert.equal(focusLockMessage(focus, working), 'Tienes un compromiso hasta las 14:00. En cuanto termines «Caption Expo», deberás continuar con «Redactar parrilla». Mientras tanto, tus demás pendientes quedan bloqueados.', 'Rodny\'s wording: "en cuanto termines tal, deberás continuar con tal"');
  assert.equal(getTaskLock({ tasks, task: foreign, viewerUserId: 'user-helen' }), null, 'somebody else\'s task is not hers to be locked');
  assert.equal(getTaskLock({ tasks, task: other, viewerUserId: 'user-helen', viewerIsManager: true }), null, 'managers are never locked');
  assert.equal(getTaskLock({ tasks, task: other, viewerUserId: 'user-melissa' }), null, 'a colleague looking at her board is not locked by her commitment');
  assert.equal(getTaskLock({ tasks: [done, other], task: other, viewerUserId: 'user-helen' }), null, 'once done, everything unlocks');
  assert.equal(isManagerUser({ role: 'PROJECT_MANAGER' }), true);
  assert.equal(isManagerUser({ role: 'EDITOR' }), false);
});

test('hours travel as Bogotá wall-clock time and round-trip through ISO', () => {
  const iso = focusDeadlineIso('2026-09-21', '14:00');
  assert.equal(iso, '2026-09-21T19:00:00.000Z');
  assert.equal(focusTimeFromIso(iso), '14:00');
  assert.equal(bogotaTimeOf('2026-09-22T03:30:00.000Z'), '22:30');
  assert.equal(focusDeadlineIso('2026-09-21', ''), null, 'no hour, no commitment');
  assert.equal(focusDeadlineIso('', '14:00'), null);
  assert.equal(focusDeadlineIso('21/09/2026', '14:00'), null);
  assert.match(focusLockMessage(focus), /«Redactar parrilla» hasta las 14:00/);
  assert.match(focusLockMessage(focus), /cuando la marques como realizada/);
});

test('the server refuses changes to the locked tasks of the person with a 423 and names the commitment', async () => {
  const calls = [];
  const db = {
    task: {
      findFirst: async (args) => {
        calls.push(['findFirst', args]);
        if (args.where.status === 'EN_CURSO') return { id: 'working', title: 'Caption Expo' };
        return { id: 'focus', title: 'Redactar parrilla', focusDeadlineAt: new Date('2036-09-21T19:00:00.000Z'), status: 'EN_CURSO' };
      },
      findUnique: async ({ where }) => ({
        status: where.id === 'working' ? 'EN_CURSO' : 'PENDIENTE',
        assignee: { userId: ['other', 'working'].includes(where.id) ? 'user-helen' : 'user-melissa' }
      })
    }
  };
  await assert.rejects(assertTaskNotLocked(db, { user: { userId: 'user-helen', role: 'EDITOR' }, taskId: 'other' }), (error) => error.statusCode === 423 && /En cuanto termines «Caption Expo», deberás continuar con «Redactar parrilla»/.test(error.message) && error.focusTask.id === 'focus' && error.inProgressTask.id === 'working');
  assert.deepEqual(calls[0][1].where, { focusDeadlineAt: { not: null }, status: { in: ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'] }, assignee: { userId: 'user-helen' } });
  assert.deepEqual(calls[1][1].where, { status: 'EN_CURSO', assignee: { userId: 'user-helen' }, id: { not: 'focus' } }, 'the notice names what is already in progress');
  assert.equal(await assertTaskNotLocked(db, { user: { userId: 'user-helen', role: 'EDITOR' }, taskId: 'working' }), null, 'what was already in progress can be finished (Rodny, 21 September 2026)');
  assert.equal(await assertTaskNotLocked(db, { user: { userId: 'user-helen', role: 'EDITOR' }, taskId: 'focus' }), null, 'the focus task itself can be worked and completed');
  assert.equal(await assertTaskNotLocked(db, { user: { userId: 'user-helen', role: 'EDITOR' }, taskId: 'foreign' }), null, 'tasks of other people are not hers to be locked');
  assert.equal(await assertTaskNotLocked(db, { user: { userId: 'user-rodny', role: 'ADMIN' }, taskId: 'other' }), null, 'managers are never locked');
  assert.equal(await findActiveFocusTaskForUser(db, null), null);
  const free = { task: { findFirst: async () => null, findUnique: async () => { throw new Error('must not run'); } } };
  assert.equal(await assertTaskNotLocked(free, { user: { userId: 'user-helen', role: 'EDITOR' }, taskId: 'other' }), null);
});

test('the schema, the start chain, the allowed fields and the controller carry the commitment', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const script = readFileSync('scripts/ensure-task-focus-schema.js', 'utf8');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const security = readFileSync('src/config/security.js', 'utf8');
  const controller = readFileSync('src/controllers/taskController.js', 'utf8');
  const service = readFileSync('src/services/nativeTaskService.js', 'utf8');

  assert.match(schema, /focusDeadlineAt\s+DateTime\?/);
  assert.match(schema, /@@index\(\[assigneeId, focusDeadlineAt\]\)/);
  assert.match(script, /ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "focusDeadlineAt" TIMESTAMP\(3\);/, 'additive and idempotent, never a destructive db push');
  assert.ok(pkg.scripts.start.includes('node scripts/ensure-task-focus-schema.js &&'));
  assert.ok(pkg.scripts.start.indexOf('ensure-task-focus-schema.js') < pkg.scripts.start.indexOf('npx prisma generate'));
  assert.match(security, /'dueDate',\s*'focusDeadlineAt',/, 'the PATCH accepts the field');
  assert.match(controller, /'focusDeadlineAt' in req\.body && !isManagerRole\(req\.user\?\.role\)/, 'only managers set or clear the hour on update');
  assert.match(controller, /status\(403\)\.json\(\{ error: 'Solo administradores y project managers pueden fijar o quitar un compromiso con hora\.' \}\)/);
  assert.match(controller, /assertTaskNotLocked\(prisma, \{ user: req\.user, taskId: req\.params\.taskId \}\)/, 'the lock is enforced server-side');
  assert.match(controller, /status\(423\)/, 'locked changes answer 423 with the commitment');
  assert.match(controller, /focusDeadlineAt[\s\S]*createNewTask|createNewTask[\s\S]*focusDeadlineAt/, 'creation also guards the field');
  assert.match(service, /focusDeadlineAt: focusDeadlineAt \? new Date\(focusDeadlineAt\) : null/, 'creation stores the hour');
  assert.match(service, /'focusDeadlineAt' in updateData/, 'update normalizes the hour and allows clearing it');
});

test('the panel edits the hour with the shared calendar and only for managers; the board locks and explains', () => {
  const panel = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
  const board = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');
  const card = board.slice(board.indexOf('const TaskCard ='), board.indexOf('export default NativeTasks'));

  assert.doesNotMatch(panel, /import DatePicker from 'react-datepicker'/, 'the raw picker is gone: the deadline uses BrainDatePicker');
  assert.match(panel, /<BrainDatePicker[\s\S]*?id="task-due-date"/);
  assert.match(panel, /const canSetFocusDeadline = \['ADMIN', 'PROJECT_MANAGER'\]\.includes\(currentUser\?\.role\)/);
  // Rodny, 21 September 2026: a clock icon beside the deadline, the platform's hour list on click, an X to clear.
  assert.match(panel, /import BrainDatePicker, \{ BrainTimePicker \} from '@\/components\/ui\/BrainDatePicker'/, 'the hour control is the shared clock button');
  assert.match(panel, /<BrainTimePicker\s+id="task-focus-time"[\s\S]*?hours=\{FOCUS_HOURS\}[\s\S]*?clearLabel="Quitar compromiso con hora"/, 'the clock sits beside the date, limited to the working day, with an X to remove the commitment');
  assert.match(panel, /<div className="flex w-full items-stretch gap-2">\s*<div className="relative min-w-0 flex-1">\s*<Calendar/, 'date and clock share one row');
  assert.match(panel, /data-task-focus-readonly/, 'the person sees the hour beside the date but cannot change it');
  assert.doesNotMatch(panel, /Sin hora: deadline normal/, 'no dropdown of "Compromiso hasta las…" options any more');

  const picker = readFileSync('src/components/ui/BrainDatePicker.jsx', 'utf8');
  assert.match(picker, /export function BrainTimeColumn\(\{ hours = QUARTER_HOURS, time, canSelectTime = true, onTimeChange, className \}\)/, 'the hour list is one shared column');
  assert.match(picker, /<BrainTimeColumn time=\{time\} canSelectTime=\{canSelectTime\} onTimeChange=\{onTimeChange\} \/>/, 'the calendar with clock uses that same column');
  assert.match(picker, /export function BrainTimePicker\(\{ id, value, onChange, hours = QUARTER_HOURS/, 'the clock button reuses it');
  assert.match(picker, /<Popover\.Content[\s\S]*?<BrainTimeColumn hours=\{hours\} time=\{value\}/, 'clicking the clock opens the platform hour list');
  assert.match(picker, /aria-label=\{clearLabel\}[\s\S]*?onClick=\{\(\) => onChange\(''\)\}/, 'the X clears the hour');
  assert.match(picker, /<Popover\.Content[\s\S]*?onFocusOutside=\{event => event\.preventDefault\(\)\}[\s\S]*?style=\{\{ pointerEvents: 'auto' \}\}/, 'inside the modal task dialog the list must keep pointer events and survive the dialog reclaiming focus (measured 21 September 2026: the body is pointer-events none)');
  assert.match(picker, /onMouseDown=\{event => event\.preventDefault\(\)\}/, 'hour buttons never move focus, so the dialog never dismisses the list mid-click');
  assert.match(panel, /focusDeadlineAt: canSetFocusDeadline \? focusDeadlineIso\(formData\.dueDate, formData\.focusTime\) : undefined/, 'non-managers never send the field');
  assert.match(panel, /focusTime: focusTimeFromIso\(taskData\.focusDeadlineAt\)/, 'editing shows the stored hour');
  assert.match(panel, /Compromiso hasta las/, 'the person sees the commitment on the task');

  assert.match(board, /focusDeadlineAt: task\.focusDeadlineAt/, 'the board reads the hour from the API');
  assert.match(board, /assigneeUserId: task\.assignee\?\.userId/, 'the board knows whose task it is');
  assert.match(board, /getTaskLock\(\{ tasks, task, viewerUserId: currentUser\?\.id, viewerIsManager \}\)/);
  assert.match(card, /isDragDisabled=\{Boolean\(lock\)\}/, 'locked cards cannot be moved');
  assert.match(card, /onPointerDown=\{lock \? \(\) => onLocked\(task, lock\) : undefined\}/, 'the very first touch on a locked card (click or drag start) is the attempt');
  assert.match(card, /onClick=\{\(\) => \{ if \(!lock\) onClick\(task\); \}\}/, 'a locked card never opens');
  assert.match(card, /shaking && "brain-shake"/, 'the first attempt shakes the card (Rodny, 21 September 2026)');
  assert.match(card, /onAnimationEnd=\{shaking \? \(\) => onShakeEnd\(task\) : undefined\}/, 'the shake class is removed when the animation ends, so it can shake again later');
  assert.match(board, /const \{ reaction, record \} = nextLockReaction\(lockAttemptsRef\.current\[key\]\)/, 'the board decides shake vs popup with the shared pure rule');
  assert.match(board, /if \(reaction === 'explain'\) \{\s*setShakingTaskId\(null\);\s*setFocusLockNotice\(lock\);/, 'a retry opens the "Primero tu compromiso" popup');
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(css, /@keyframes brain-shake \{/, 'the shake is a shared keyframe');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.brain-shake \{\s*animation: brain-shake-still/, 'reduced motion gets a still blink that still ends the animation');
  assert.match(card, /isActiveFocusTask\(task\)[\s\S]*?<Clock/, 'the focus task shows a clock with its hour');
  // Rodny, 21 September 2026: a locked card is only dimmed. No badge, no border, no lock icon.
  assert.match(card, /lock \? "cursor-not-allowed opacity-60" : "cursor-pointer"/, 'locked cards are dimmed and nothing else');
  assert.doesNotMatch(card, /data-task-lock-chip|Bloqueada|<Lock/, 'no "Bloqueada" badge and no lock icon on the card');
  assert.doesNotMatch(card, /lock && ["'`]/, 'the lock never adds a class of its own to the card body');
  assert.match(board, /if \(!deepLinkLock\) setHighlightedTaskId\(taskId\);/, 'a locked task is not highlighted (red ring) when reached by deep link');
  assert.match(board, /focusLockNotice/, 'the explanation is a platform dialog');
  assert.match(board, /const deepLinkLock = taskToOpen \? getTaskLock\(\{[\s\S]*?task: taskToOpen[\s\S]*?\}\) : null;[\s\S]*?if \(deepLinkLock\) \{\s*setFocusLockNotice\(deepLinkLock\);\s*\} else \{\s*setEditingTask\(taskToOpen\);/, 'a locked task does not open from ?taskId= (notifications, alerts, deep links) either: the popup explains instead (Rodny, 21 September 2026)');
  assert.match(board, /focusLockMessage\(focusLockNotice\.focusTask, focusLockNotice\.inProgressTask\)/, 'the popup names what is already in progress');
  assert.match(board, /if \(!isPMOrAdmin\)[\s\S]*?getTaskLock|const lock = getTaskLock\(\{ tasks, task: targetTask/, 'drag and drop respects the lock too');
});

// Rodny, 21 September 2026: past the hour the lock stays, the manager who set it is told, the person can ask
// for more time choosing how much and why, and the tone of card and popup changes.

const before = new Date('2036-09-21T18:00:00.000Z').getTime(); // 13:00 Bogotá
const after = new Date('2036-09-21T20:00:00.000Z').getTime();  // 15:00 Bogotá
const overdueFocus = { ...focus, focusDeadlineAt: '2026-09-21T19:00:00.000Z' }; // already past, whatever the clock says now
const panelSource = () => readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
const overdueDone = { ...overdueFocus, status: 'REALIZADA' };

test('an overdue commitment keeps the lock and changes the wording; the extension request is validated', () => {
  assert.equal(isFocusOverdue(focus, before), false);
  assert.equal(isFocusOverdue(focus, after), true);
  assert.equal(isFocusOverdue(overdueFocus), true, 'with the real clock too');
  assert.equal(isFocusOverdue(overdueDone), false, 'a finished task is never overdue');
  assert.deepEqual(getTaskLock({ tasks: [overdueFocus, other], task: other, viewerUserId: 'user-helen' }), { focusTask: overdueFocus, inProgressTask: null }, 'the lock does not release itself when the hour passes');
  assert.equal(focusLockMessage(overdueFocus, null), 'Tu compromiso «Redactar parrilla» venció a las 14:00 y sigue sin realizarse. Termínalo o pide más tiempo. Mientras tanto, tus demás pendientes siguen bloqueados.');
  assert.match(focusLockMessage(overdueFocus, { title: 'Caption Expo' }), /Termina «Caption Expo» y sigue con tu compromiso, o pide más tiempo/);
  assert.match(focusLockMessage(focus, null, before), /^Estás enfocado en «Redactar parrilla» hasta las 14:00/, 'before the hour the wording is the calm one');

  assert.deepEqual(FOCUS_EXTENSION_OPTIONS.map((option) => option.minutes), [15, 30, 60, 120, 240]);
  assert.deepEqual(parseFocusExtensionRequest({ minutes: '60', reason: '  Espero  la aprobación del cliente. ' }), { minutes: 60, label: '1 hora', reason: 'Espero la aprobación del cliente.' });
  assert.throws(() => parseFocusExtensionRequest({ minutes: 45, reason: 'x' }), (error) => error.statusCode === 400 && /cuánto tiempo/.test(error.message), 'only the listed amounts');
  assert.throws(() => parseFocusExtensionRequest({ minutes: 30, reason: '   ' }), (error) => error.statusCode === 400 && /por qué/.test(error.message), 'the reason is mandatory');
  assert.equal(parseFocusExtensionRequest({ minutes: 15, reason: 'a'.repeat(400) }).reason.length, 300, 'the reason is capped');

  const messages = focusOverdueMessages(focus, 'Helen');
  assert.equal(messages.manager, 'Helen no cumplió el compromiso «Redactar parrilla» a las 14:00. Ábrela para darle más tiempo, quitar la hora o reasignarla.');
  assert.equal(messages.person, 'Tu compromiso «Redactar parrilla» venció a las 14:00. Termínalo o pide más tiempo.');
  assert.equal(
    focusExtensionRequestMessage({ task: focus, assigneeName: 'Helen', label: '30 minutos', reason: 'espero al cliente', newTime: '14:30' }),
    'Helen necesitaba 30 minutos más para «Redactar parrilla»: espero al cliente. Su compromiso pasó a las 14:30.',
    'nothing to approve: the hour already changed (Rodny, 21 September 2026)'
  );
});

test('more time is granted on the spot, counted from now when the commitment already expired', () => {
  // Rodny, 21 September 2026: "si la persona dice que necesita una hora, pues se le añade una hora".
  const soon = new Date('2036-09-21T19:00:00.000Z');
  assert.equal(extendedFocusDeadline(soon, 60, new Date('2036-09-21T18:00:00.000Z').getTime()).toISOString(), '2036-09-21T20:00:00.000Z', 'before the hour it is added to the commitment');
  assert.equal(extendedFocusDeadline(soon, 15, new Date('2036-09-21T21:00:00.000Z').getTime()).toISOString(), '2036-09-21T21:15:00.000Z', 'once expired it is counted from now, never landing in the past');
  assert.equal(extendedFocusDeadline(null, 30), null);
});

test('the server tells the manager who set the hour (and the person) once per hour set, and receives extension requests', async () => {
  const notices = [];
  const updates = [];
  // A fixed hour in the future keeps the arithmetic of the extension deterministic whatever the wall clock says.
  const overdueTask = { id: 'focus', title: 'Redactar parrilla', focusDeadlineAt: new Date('2036-09-21T19:00:00.000Z'), focusSetById: 'user-rodny', creatorId: 'user-franci', assignee: { userId: 'user-helen', name: 'Helen' } };
  const db = {
    task: {
      findMany: async (args) => { updates.push(['findMany', args.where]); return [overdueTask]; },
      update: async (args) => { updates.push(['update', args]); return {}; },
      findUnique: async () => ({ ...overdueTask, status: 'EN_CURSO' })
    },
    taskComment: { create: async (args) => { updates.push(['comment', args.data]); return { id: 'c1' }; } }
  };
  const notify = async (data) => { notices.push(data); return data; };
  const now = new Date('2026-09-21T20:00:00.000Z');

  assert.equal(await notifyFocusOverdue({ db, now, notify }), 1);
  assert.deepEqual(updates[0][1], { focusDeadlineAt: { not: null, lt: now }, focusOverdueNotifiedAt: null, status: { in: ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'] } }, 'only active commitments past the hour that were not notified yet');
  assert.deepEqual(notices.map((n) => [n.userId, n.type]), [['user-rodny', 'TASK_FOCUS_OVERDUE'], ['user-helen', 'TASK_FOCUS_OVERDUE']], 'the manager who set the hour, then the person');
  // Rodny, 21 September 2026: the overdue is a novedad on the task, like a return or a reopen.
  assert.deepEqual(updates.find(([kind]) => kind === 'comment')[1], { taskId: 'focus', authorId: null, type: 'system_focus_overdue', content: '[FOCUS_OVERDUE]\nEl compromiso venció a las 14:00.' });
  assert.match(notices[0].message, /^Helen no cumplió el compromiso «Redactar parrilla» a las 14:00/);
  assert.deepEqual(updates.find(([kind]) => kind === 'update')[1], { where: { id: 'focus' }, data: { focusOverdueNotifiedAt: now } }, 'marked so it is not repeated');

  notices.length = 0;
  const result = await requestFocusExtension(db, { user: { userId: 'user-helen', role: 'EDITOR' }, taskId: 'focus', minutes: 30, reason: 'espero al cliente', notify });
  assert.deepEqual(result, { ok: true, minutes: 30, label: '30 minutos', newTime: '14:30', notifiedUserId: 'user-rodny' }, 'the hour moved by itself');
  assert.deepEqual(updates.filter(([kind]) => kind === 'comment').at(-1)[1], { taskId: 'focus', authorId: 'user-helen', type: 'system_focus_extension', content: '[FOCUS_EXTENSION:30@14:30]\nespero al cliente' }, 'the request stays in the task conversation as a novedad');
  const applied = updates.at(-1)[1];
  assert.equal(applied.where.id, 'focus');
  assert.equal(applied.data.focusDeadlineAt.toISOString(), '2036-09-21T19:30:00.000Z', 'the extension is applied on the task, nobody approves it');
  assert.equal(applied.data.focusOverdueNotifiedAt, null, 'and the overdue notice re-arms for the new hour');
  assert.deepEqual([notices[0].userId, notices[0].type, notices[0].actorId], ['user-rodny', 'TASK_FOCUS_EXTENSION', 'user-helen']);
  assert.match(notices[0].message, /Helen necesitaba 30 minutos más para «Redactar parrilla»[\s\S]*Su compromiso pasó a las 14:30\./);
  await assert.rejects(requestFocusExtension(db, { user: { userId: 'user-melissa', role: 'EDITOR' }, taskId: 'focus', minutes: 30, reason: 'x', notify }), (error) => error.statusCode === 403, 'only the responsible person asks');
  await assert.rejects(requestFocusExtension(db, { user: { userId: 'user-helen', role: 'EDITOR' }, taskId: 'focus', minutes: 30, reason: '', notify }), (error) => error.statusCode === 400);
  const noFocus = { ...db, task: { ...db.task, findUnique: async () => ({ ...overdueTask, focusDeadlineAt: null, status: 'PENDIENTE' }) } };
  await assert.rejects(requestFocusExtension(noFocus, { user: { userId: 'user-helen', role: 'EDITOR' }, taskId: 'focus', minutes: 30, reason: 'x', notify }), (error) => error.statusCode === 404);
});

test('schema, cron, route, notifications and screens carry the overdue notice and the extension request', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const script = readFileSync('scripts/ensure-task-focus-schema.js', 'utf8');
  const service = readFileSync('src/services/nativeTaskService.js', 'utf8');
  const focusService = readFileSync('src/services/taskFocusService.js', 'utf8');
  const controller = readFileSync('src/controllers/taskController.js', 'utf8');
  const routes = readFileSync('src/routes/index.js', 'utf8');
  const server = readFileSync('server.js', 'utf8');
  const layout = readFileSync('src/components/layout/AppLayout.jsx', 'utf8');
  const dialog = readFileSync('src/components/tasks/FocusExtensionDialog.jsx', 'utf8');
  const board = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');
  const card = board.slice(board.indexOf('const TaskCard ='), board.indexOf('export default NativeTasks'));
  const panel = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');

  assert.match(schema, /focusSetById\s+String\?/);
  assert.match(schema, /focusOverdueNotifiedAt\s+DateTime\?/);
  assert.match(script, /ADD COLUMN IF NOT EXISTS "focusSetById" TEXT;/, 'additive and idempotent');
  assert.match(script, /ADD COLUMN IF NOT EXISTS "focusOverdueNotifiedAt" TIMESTAMP\(3\);/);
  assert.match(service, /updateData\.focusSetById = updateData\.focusDeadlineAt \? \(updaterId \|\| null\) : null;\s*updateData\.focusOverdueNotifiedAt = null;/, 'setting or moving the hour records who did it and re-arms the overdue notice');
  assert.match(service, /focusSetById: focusDeadlineAt \? \(creatorId \|\| null\) : null/, 'creation records the setter too');
  assert.match(service, /type: 'TASK_FOCUS_SET'/, 'the person is told when a manager sets, moves or clears the hour');
  assert.match(focusService, /export const initFocusOverdueCron/, 'the overdue check runs on a schedule');
  assert.match(server, /initFocusOverdueCron\(\);/, 'the server starts it');
  assert.match(routes, /router\.post\('\/tasks\/:taskId\/focus-extension', taskController\.requestTaskFocusExtension\);/);
  assert.match(controller, /export const requestTaskFocusExtension = async \(req, res\)/);
  assert.match(layout, /notif\.type === 'TASK_FOCUS_SET' \|\| notif\.type === 'TASK_FOCUS_OVERDUE' \|\| notif\.type === 'TASK_FOCUS_EXTENSION'/, 'the notices open the task');
  assert.match(dialog, /fetch\(`\$\{getApiBaseUrl\(\)\}\/api\/tasks\/\$\{task\.id\}\/focus-extension`/, 'the dialog posts the request');
  assert.match(dialog, /FOCUS_EXTENSION_OPTIONS\.map/, 'the person picks how much time from the shared list');
  assert.match(dialog, /id="focus-extension-reason"[\s\S]*?required/, 'and must say why');
  assert.match(dialog, /const creatorName = task\?\.creatorName \|\| task\?\.creator\?\.name \|\| '';/, 'the toast names who was told');
  assert.match(panel, /creatorName: formData\.creator\?\.name \|\| formData\.creatorName,/, 'the task panel passes the creator name to the dialog');
  assert.match(card, /data-focus-overdue=\{focusOverdue \? 'true' : undefined\}/, 'the card chip knows when the hour passed');
  assert.match(card, /focusOverdue \? `Venció a las \$\{focusTime\}` : `Hasta las \$\{focusTime\}`/, 'and says so in red');
  // Rodny, 21 September 2026: three short actions in one row — Entendido / Más tiempo / Ver.
  assert.match(board, /data-focus-extension-open[\s\S]*?Más tiempo\s*<\/button>/, 'the lock popup offers to ask for more time');
  assert.match(board, /title="Abrir mi compromiso"[\s\S]{0,200}>\s*Ver\s*<\/button>/, 'and to open the commitment');
  assert.doesNotMatch(board, />\s*Pedir más tiempo\s*<\/button>|>\s*Abrir mi compromiso\s*<\/button>/, 'no long labels in the dialog');
  assert.match(board, /<FocusExtensionDialog[\s\S]*?task=\{extensionTask\}/);
  assert.match(panel, /data-focus-extension-open[\s\S]*?title="Pedir más tiempo"/, 'the task panel offers it beside the read-only hour');
  assert.match(panel, /<FocusExtensionDialog[\s\S]*?open=\{askingMoreTime\}/);
});

test('the overdue and the extension request are novedades of the task, like a return or a reopen', () => {
  assert.equal(FOCUS_OVERDUE_EVENT_TYPE, 'system_focus_overdue');
  assert.equal(FOCUS_EXTENSION_EVENT_TYPE, 'system_focus_extension');
  assert.equal(formatFocusOverdueEventContent(overdueFocus), '[FOCUS_OVERDUE]\nEl compromiso venció a las 14:00.', 'Rodny, 21 September 2026: nothing after the hour');
  // Rodny, 21 September 2026: the automatic line must not read like the reason. The new hour goes in the badge.
  assert.equal(formatFocusExtensionEventContent({ minutes: 30, reason: 'espero al cliente', newTime: '14:30' }), '[FOCUS_EXTENSION:30@14:30]\nespero al cliente');
  assert.deepEqual(focusEventPresentation(FOCUS_EXTENSION_EVENT_TYPE, '[FOCUS_EXTENSION:30@16:02]\nNo he podido terminar'), { badgeLabel: 'Se añadieron 30 minutos · hasta las 16:02', note: 'No he podido terminar' });
  assert.deepEqual(
    focusEventPresentation(FOCUS_EXTENSION_EVENT_TYPE, '[FOCUS_EXTENSION:30]\nNo he podido terminar\nEl compromiso pasó a las 16:02.'),
    { badgeLabel: 'Se añadieron 30 minutos · hasta las 16:02', note: 'No he podido terminar' },
    'the novedades already stored with the hour as a line read the same way'
  );
  // Rodny, 21 September 2026: no badge on the overdue card, it only repeats the event title.
  assert.deepEqual(focusEventPresentation(FOCUS_OVERDUE_EVENT_TYPE, '[FOCUS_OVERDUE]\nVenció.'), { badgeLabel: null, note: 'Venció.' });
  assert.deepEqual(focusEventPresentation(FOCUS_EXTENSION_EVENT_TYPE, '[FOCUS_EXTENSION:120]\nFalta la aprobación.'), { badgeLabel: 'Se añadieron 2 horas', note: 'Falta la aprobación.' });
  assert.match(readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8'), /data-focus-extension-open[\s\S]{0,700}<ClockPlus className="h-4 w-4"/, 'the task panel asks for more time with a clock-and-plus icon, no text (Rodny, 21 September 2026)');
  assert.match(readFileSync('src/components/ui/icons.jsx', 'utf8'), /export const ClockPlus = createIcon\(ClockPlusIconData, 'ClockPlus'\);/);
  assert.deepEqual(focusEventPresentation(FOCUS_EXTENSION_EVENT_TYPE, 'texto suelto'), { badgeLabel: 'Más tiempo añadido', note: 'texto suelto' }, 'an old or malformed note still reads');
  // The shared presentation of task events knows them, so the panel renders the same card as the other novedades.
  assert.deepEqual(getTaskSystemEventPresentation(FOCUS_EXTENSION_EVENT_TYPE, '[FOCUS_EXTENSION:15]\nCasi lista.'), { badgeLabel: 'Se añadieron 15 minutos', note: 'Casi lista.' });
  assert.deepEqual(getTaskSystemEventPresentation(FOCUS_OVERDUE_EVENT_TYPE, '[FOCUS_OVERDUE]\nVenció.'), { badgeLabel: null, note: 'Venció.' });
  assert.match(panelSource(), /\{eventPresentation\.badgeLabel && \(/, 'the card hides the badge when there is nothing new to say');

  const panel = panelSource();
  assert.match(panel, /const TASK_EVENT_STYLES = \{/, 'one catalogue of system events drives the card');
  assert.match(panel, /\[FOCUS_OVERDUE_EVENT_TYPE\]: \{\s*label: 'Evento: Compromiso vencido'/);
  assert.match(panel, /\[FOCUS_EXTENSION_EVENT_TYPE\]: \{\s*label: 'Evento: Solicitud de tiempo'/);
  assert.match(panel, /const eventStyle = TASK_EVENT_STYLES\[comment\.type\];/, 'the conversation renders them as event cards, never as a plain chat bubble');
  assert.match(panel, /label: 'Evento: Devolución'[\s\S]*?label: 'Evento: Reapertura'[\s\S]*?label: 'Evento: Reintegración'/, 'the three historical events keep their labels and colours');
});

test('once the commitment expires the dialog is inescapable, and it sits above the task panel', () => {
  const board = readFileSync('src/components/modules/NativeTasks.jsx', 'utf8');
  const dialog = readFileSync('src/components/tasks/FocusExtensionDialog.jsx', 'utf8');

  assert.match(board, /\(myFocusTask && isFocusOverdue\(myFocusTask\) \? myFocusTask : null\)/, 'an expired commitment always asks');
  assert.match(board, /setExtensionTask\(myOverdueFocusTask\);\s*setExtensionRequired\(true\);/, 'the dialog opens by itself (Rodny, 21 September 2026)');
  assert.match(board, /setOverdueTick\(\(value\) => value \+ 1\)/, 'the clock is a counter, never a Date in a dependency array');
  assert.doesNotMatch(board, /\[[^\]]*new Date\(\)[^\]]*\]\s*\)/, 'no Date inside a dependency array (the September render loop)');
  assert.match(board, /extensionSentRef\.current\[String\(myOverdueFocusTask\.id\)\] >= new Date\(myOverdueFocusTask\.focusDeadlineAt\)\.getTime\(\)/, 'the granted hour stops it from flashing back before the refetch');

  // The task panel is z-[100]/[111] and its emoji popover z-[125]; the dialog must sit above all of them.
  assert.match(dialog, /overlayClassName="z-\[130\]"/, 'so it never opens behind the task panel (Rodny saw it behind, 21 September 2026)');
  assert.match(dialog, /className="z-\[131\] sm:max-w-md/);
  assert.match(dialog, /showCloseButton=\{!required\}/, 'a mandatory request has no X');
  assert.match(dialog, /const blockDismiss = \(event\) => \{ if \(required\) event\.preventDefault\(\); \};/);
  assert.match(dialog, /onEscapeKeyDown=\{blockDismiss\}[\s\S]*?onPointerDownOutside=\{blockDismiss\}[\s\S]*?onInteractOutside=\{blockDismiss\}/, 'Escape and clicking outside do not dismiss it');
  assert.match(dialog, /\{!required && \(\s*<button type="button" onClick=\{\(\) => onOpenChange\(false\)\}/, 'once expired there is no way out: no cancel either (Rodny, 21 September 2026)');
  assert.doesNotMatch(dialog, /Abrir mi compromiso/, 'and no escape hatch to the task');
  assert.match(dialog, /explica el motivo\./, 'the text no longer names anybody: "y explica el motivo"');
  assert.doesNotMatch(dialog, /cuéntale por qué a/);
  assert.match(dialog, /Se añadieron \$\{data\.label[\s\S]*?Tu compromiso ahora es hasta las \$\{data\.newTime\}/, 'the toast says the time is already added');
  assert.match(dialog, /\{sending && <Loader2 className="h-4 w-4 animate-spin" \/>\}[\s\S]{0,140}Confirmar/, 'the action is "Confirmar": nothing is sent for approval (Rodny, 21 September 2026)');
  assert.doesNotMatch(dialog, /Enviar petición|Añadir tiempo y avisar/);
});
