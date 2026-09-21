import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FOCUS_ACTIVE_STATUSES, LOCK_RETRY_WINDOW_MS, bogotaTimeOf, findFocusTaskFor, focusDeadlineIso, focusLockMessage, focusTimeFromIso, getTaskLock, isActiveFocusTask, isManagerUser, nextLockReaction
} from '../src/lib/taskFocus.js';
import { assertTaskNotLocked, findActiveFocusTaskForUser } from '../src/services/taskFocusService.js';

// Rodny, 21 September 2026: a deadline with an hour means the person works only on that task; the rest of
// their pending work is locked until it is done. Only admins and project managers set it.

const focus = { id: 'focus', title: 'Redactar parrilla', status: 'EN_CURSO', assigneeId: 'member-helen', assigneeUserId: 'user-helen', focusDeadlineAt: '2026-09-21T19:00:00.000Z' };
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
  const later = { ...focus, id: 'later', focusDeadlineAt: '2026-09-21T22:00:00.000Z' };
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
        return { id: 'focus', title: 'Redactar parrilla', focusDeadlineAt: new Date('2026-09-21T19:00:00.000Z'), status: 'EN_CURSO' };
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
  assert.match(card, /<Lock/, 'locked cards show a lock');
  assert.match(board, /focusLockNotice/, 'the explanation is a platform dialog');
  assert.match(board, /const deepLinkLock = getTaskLock\(\{[\s\S]*?task: taskToOpen[\s\S]*?\}\);\s*if \(deepLinkLock\) \{\s*setFocusLockNotice\(deepLinkLock\);\s*\} else \{\s*setEditingTask\(taskToOpen\);/, 'a locked task does not open from ?taskId= (notifications, alerts, deep links) either: the popup explains instead (Rodny, 21 September 2026)');
  assert.match(board, /focusLockMessage\(focusLockNotice\.focusTask, focusLockNotice\.inProgressTask\)/, 'the popup names what is already in progress');
  assert.match(board, /if \(!isPMOrAdmin\)[\s\S]*?getTaskLock|const lock = getTaskLock\(\{ tasks, task: targetTask/, 'drag and drop respects the lock too');
});
