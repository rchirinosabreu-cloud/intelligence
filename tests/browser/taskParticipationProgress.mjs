import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';

let preview, browser;
test.before(async () => {
  preview = await createNavigationPreview({ port: 0 });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-gpu'] });
  await mkdir('output/task-participation', { recursive: true });
});
test.after(async () => { await browser?.close(); await preview?.close(); });
const now = () => new Date().toISOString();
const fixture = () => {
  const members = [{ id: 'navigation-member', userId: 'navigation-user', name: 'Lucía Faro' }, { id: 'partner', userId: 'partner-user', name: 'Mateo Sol' }];
  return { id: 'shared-task', title: 'Preparar campaña compartida', sharedProgress: true, rosterVersion: 3, status: 'EN_CURSO',
    assigneeId: members[0].id, assignee: members[0], collaborators: [{ memberId: members[1].id, member: members[1] }],
    creatorId: 'navigation-user', creator: { id: 'navigation-user', name: 'Lucía Faro' },
    clientId: 'navigation-client', client: { id: 'navigation-client', name: 'Cliente de prueba', slug: 'cliente-de-prueba' },
    dueDate: now(), createdAt: now(), sortOrder: 0, taskComments: [], taskAttachments: [],
    participants: members.map((member, i) => ({ memberId: member.id, member, role: i ? 'COLLABORATOR' : 'ASSIGNEE',
      status: 'EN_CURSO', revision: 7, completedAt: null, startedAt: now(), accumulatedWorkMs: i ? 32000 : 10000,
      permissions: { canChangeStatus: !i, canReturn: !i, canReopen: true, canReintegrate: !i } })),
    workSessions: members.map(member => ({ id: `clock-${member.id}`, workerId: member.id, startedAt: now(), endedAt: null })) };
};
const json = value => JSON.parse(JSON.stringify(value));
const allPeople = async page => {
  await page.getByRole('combobox', { name: 'Responsable', exact: true }).click();
  await page.getByRole('option', { name: 'Todos los responsables', exact: true }).click();
};

test('cada persona tiene su tarjeta y terminar una parte conserva el reloj de la otra', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  let task = fixture(), writes = [];
  let release; const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/api/tasks**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tasks') return route.fulfill({ json: [task] });
    if (path === '/api/tasks/shared-task' && route.request().method() === 'GET') return route.fulfill({ json: task });
    if (path === '/api/tasks/shared-task/participants/navigation-member') {
      writes.push(route.request().postDataJSON());
      await delay;
      task = { ...task, participants: task.participants.map((row, i) => i ? row : { ...row, status: 'REALIZADA', startedAt: null, completedAt: now(), revision: 8 }),
        workSessions: task.workSessions.filter(row => row.workerId === 'partner'),
        participationTransition: { memberId: 'navigation-member', changed: true, completed: true, globalCompleted: false } };
      return route.fulfill({ json: task });
    }
    return route.continue();
  });
  try {
    await page.goto(`${preview.origin}/gestion`);
    await allPeople(page);
    const mine = page.locator('[data-task-member="navigation-member"]');
    const partner = page.locator('[data-task-member="partner"]');
    await mine.waitFor(); await partner.waitFor();
    assert.equal(await page.locator('[data-task-id="shared-task"]').count(), 2);
    assert.equal(await partner.getAttribute('data-rfd-drag-handle-draggable-id'), null, 'los permisos de la participación gobiernan el arrastre');
    const partnerBefore = json(task.participants[1]);
    const savingRequest = page.waitForRequest(request => request.url().includes('/participants/navigation-member'));
    await mine.focus(); await page.keyboard.press('Space'); await page.waitForTimeout(250);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.press('Space');
    await savingRequest;
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0], { status: 'REALIZADA', expectedRevision: 7, expectedRosterVersion: 3 });
    await mine.getByRole('status').filter({ hasText: 'Guardando' }).waitFor();
    assert.equal(await partner.getAttribute('data-participation-status'), 'EN_CURSO');
    assert.equal(await page.locator('body > canvas').count(), 0);
    release();
    await mine.locator('text=Terminó su parte').waitFor();
    assert.equal(task.status, 'EN_CURSO');
    assert.deepEqual(task.participants[1], partnerBefore);
    assert.equal(await partner.getAttribute('data-participation-status'), 'EN_CURSO');
    assert.equal(await partner.getAttribute('data-participation-running'), 'true');
    await page.screenshot({ path: 'output/task-participation/partes-tablero.png', animations: 'disabled' });
  } finally { release(); await page.close(); }
});

test('el panel muestra participación personal y un conflicto refresca sin reenviar ni cerrar relojes ajenos', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(8000);
  let task = fixture(), writes = 0;
  await page.route('**/api/tasks**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tasks') return route.fulfill({ json: [task] });
    if (path === '/api/tasks/shared-task' && route.request().method() === 'GET') return route.fulfill({ json: task });
    if (path === '/api/tasks/shared-task/participants/navigation-member') {
      writes++; task = { ...task, participants: task.participants.map((row, i) => i ? row : { ...row, revision: 8 }) };
      return route.fulfill({ status: 409, json: { error: 'La participación cambió. Revisa la versión actual.' } });
    }
    return route.continue();
  });
  try {
    await page.goto(`${preview.origin}/gestion?taskId=shared-task&participantId=navigation-member&dark`);
    const section = page.locator('[data-task-participations]');
    await section.waitFor();
    await section.getByRole('button', { name: 'Terminar mi parte', exact: true }).click();
    await section.getByRole('alert').filter({ hasText: 'cambió' }).waitFor();
    assert.equal(writes, 1);
    assert.equal(await section.locator('[data-participant-row="partner"]').getAttribute('data-participation-running'), 'true');
    assert.equal(await page.locator('body > canvas').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: 'output/task-participation/conflicto-celular-oscuro.png', animations: 'disabled' });
  } finally { await page.close(); }
});

test('devolver y reabrir una participación nombran a la persona y guardar datos comunes no modifica estados', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  let task = fixture(), metadata;
  const changes = [];
  await page.route('**/api/tasks**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tasks') return route.fulfill({ json: [task] });
    if (path === '/api/tasks/shared-task') {
      if (route.request().method() === 'PATCH') metadata = route.request().postDataJSON();
      return route.fulfill({ json: task });
    }
    if (path === '/api/tasks/shared-task/participants/navigation-member') {
      const change = route.request().postDataJSON(); changes.push(change);
      task = { ...task, status: change.status === 'DEVUELTA' ? 'DEVUELTA' : 'EN_CURSO',
        participants: task.participants.map((row, i) => i ? row : { ...row, status: change.status, startedAt: null, completedAt: change.status === 'REALIZADA' ? now() : null, revision: row.revision + 1 }),
        participationTransition: { memberId: 'navigation-member', changed: true, completed: change.status === 'REALIZADA', globalCompleted: false } };
      return route.fulfill({ json: task });
    }
    return route.continue();
  });
  try {
    await page.goto(`${preview.origin}/gestion?taskId=shared-task`);
    const section = page.locator('[data-task-participations]');
    await section.getByRole('button', { name: 'Devolver mi parte', exact: true }).click();
    const returnDialog = page.getByRole('dialog', { name: 'Devolver participación', exact: true });
    await returnDialog.getByText(/Parte de Lucía Faro/).waitFor();
    await returnDialog.getByRole('textbox', { name: 'Nota', exact: true }).fill('Falta mi revisión de copy');
    await returnDialog.getByRole('button', { name: 'Devolver participación', exact: true }).click();
    await section.getByRole('button', { name: 'Reintegrar mi parte', exact: true }).waitFor();
    assert.equal(changes[0].expectedRevision, 7);
    assert.equal(changes[0].returnNote, 'Falta mi revisión de copy');
    assert.equal(task.participants[1].status, 'EN_CURSO');
    await section.getByRole('button', { name: 'Reintegrar mi parte', exact: true }).click();
    const reintegrate = page.getByRole('dialog', { name: 'Reintegrar participación', exact: true });
    await reintegrate.getByRole('textbox', { name: 'Nota', exact: true }).fill('Ya tengo la información');
    await reintegrate.getByRole('button', { name: 'Reintegrar participación', exact: true }).click();
    await section.getByRole('button', { name: 'Terminar mi parte', exact: true }).click();
    await section.getByRole('button', { name: 'Reabrir mi parte', exact: true }).click();
    const reopen = page.getByRole('dialog', { name: 'Reabrir participación', exact: true });
    await reopen.getByRole('textbox', { name: 'Nota', exact: true }).fill('Ajustar mi versión');
    await reopen.getByRole('button', { name: 'Reabrir participación', exact: true }).click();
    await section.getByRole('button', { name: 'Empezar mi parte', exact: true }).waitFor();
    assert.equal(changes[3].status, 'PENDIENTE'); assert.equal(changes[3].expectedRevision, 10);
    await page.locator('[data-task-title-input]').fill('Campaña con título corregido');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await page.locator('[data-task-participations]').waitFor({ state: 'hidden' });
    assert.equal(metadata.title, 'Campaña con título corregido');
    for (const field of ['status', 'assigneeId', 'collaboratorIds']) assert.equal(Object.hasOwn(metadata, field), false, `guardar título no envía ${field}`);
    assert.equal(changes.length, 4);
  } finally { await page.close(); }
});

test('viajar a la pieza y regresar conserva la participación que estaba abierta', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const task = { ...fixture(), contentItemId: 'uno', contentItem: { id: 'uno', planId: 'navigation-plan', objective: 'Preparar campaña compartida' }, plan: { id: 'navigation-plan' } };
  await page.route('**/api/tasks**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tasks') return route.fulfill({ json: [task] });
    if (path === '/api/tasks/shared-task') return route.fulfill({ json: task });
    return route.continue();
  });
  try {
    await page.goto(`${preview.origin}/gestion?taskId=shared-task`);
    await page.locator('[data-participant-row="partner"] button').click();
    await page.getByRole('heading', { name: 'Participación de Mateo Sol', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Abrir Parrilla', exact: true }).click();
    await page.locator('#item-uno').waitFor();
    await page.locator('[data-back-to-origin] button').click();
    await page.getByRole('heading', { name: 'Participación de Mateo Sol', exact: true }).waitFor();
  } finally { await page.close(); }
});

test('el acceso rápido del cliente abre las partes de una tarea compartida sin modificar el estado global', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(8000);
  const task = fixture(); const writes = [];
  await page.route('**/api/tasks**', async route => {
    const request = route.request();
    if (request.method() === 'PATCH') writes.push(request.postDataJSON());
    const path = new URL(request.url()).pathname;
    if (path === '/api/tasks') return route.fulfill({ json: [task] });
    if (path === '/api/tasks/shared-task') return route.fulfill({ json: task });
    return route.continue();
  });
  try {
    await page.goto(`${preview.origin}/muestra-pendientes`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: `Revisar participaciones de ${task.title}` }).click();
    await page.locator('[data-task-participations]').waitFor();
    assert.equal(writes.length, 0);
    assert.equal(task.status, 'EN_CURSO');
  } finally { await page.close(); }
});

test('un rechazo al devolver conserva el formulario y muestra el motivo dentro del diálogo', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(8000);
  const task = fixture();
  await page.route('**/api/tasks**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tasks') return route.fulfill({ json: [task] });
    if (path === '/api/tasks/shared-task') return route.fulfill({ json: task });
    if (path.includes('/participants/')) return route.fulfill({ status: 400, json: { error: 'El motivo necesita más detalle.' } });
    return route.continue();
  });
  try {
    await page.goto(`${preview.origin}/gestion?taskId=shared-task`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Devolver mi parte', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Devolver participación', exact: true });
    await dialog.getByRole('textbox', { name: 'Nota', exact: true }).fill('Mi revisión');
    await dialog.getByRole('button', { name: 'Devolver participación', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'El motivo necesita más detalle.' }).waitFor();
    assert.equal(await dialog.getByRole('textbox', { name: 'Nota', exact: true }).inputValue(), 'Mi revisión');
    await page.screenshot({ path: 'output/task-participation/devolucion-error-claro.png', animations: 'disabled' });
  } finally { await page.close(); }
});

test('el historial distingue dos logros de la misma tarea y reabre solo la parte elegida con su revisión', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(8000);
  const task = fixture();
  const completions = task.participants.map(p => ({ ...task, status: 'REALIZADA', globalStatus: 'REALIZADA', completedAt: now(),
    participantMemberId: p.memberId, participantRevision: p.revision, participationKey: `${task.id}:${p.memberId}`,
    assigneeId: p.memberId, assignee: p.member, accumulatedWorkMs: p.accumulatedWorkMs }));
  const removedAt = new Date(Date.now() - 60000).toISOString();
  completions.push({ ...completions[0], participationKey: 'shared-task:archive:old', participantArchiveId: 'old', isArchivedParticipation: true, removedAt });
  const writes = [];
  await page.route('**/api/tasks**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tasks/completed') return route.fulfill({ json: completions });
    if (path === '/api/tasks/shared-task/participants/partner') {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...task, status: 'PENDIENTE', participants: task.participants.map(p => ({ ...p, status: p.memberId === 'partner' ? 'PENDIENTE' : 'REALIZADA', revision: p.revision + (p.memberId === 'partner' ? 1 : 0) })),
        participationTransition: { memberId: 'partner', fromStatus: 'REALIZADA', toStatus: 'PENDIENTE', changed: true, completed: false, globalCompleted: false } } });
    }
    if (path.endsWith('/work-history')) return route.fulfill({ json: { task: { ...task, accumulatedWorkMs: 7200000 }, cycles: [{ id: 'cycle', sequence: 1, kind: 'INITIAL', sessions: [
      { id: 'own-session', workerId: 'navigation-member', startedAt: now(), endedAt: now(), durationMs: 10000 },
      { id: 'old-own-session', workerId: 'navigation-member', startedAt: new Date(Date.now() - 100000).toISOString(), endedAt: new Date(Date.now() - 90000).toISOString(), durationMs: 10000 },
      { id: 'partner-session', workerId: 'partner', startedAt: now(), endedAt: now(), durationMs: 32000, isRework: true },
    ] }] } });
    return route.continue();
  });
  try {
    await page.goto(`${preview.origin}/muestra-logros?dark`);
    const mine = page.locator('[data-completed-participant-id="navigation-member"]:not([data-archived-participation="true"])');
    const partner = page.locator('[data-completed-participant-id="partner"]');
    const archived = page.locator('[data-archived-participation="true"]');
    await archived.waitFor();
    assert.equal(await archived.getByRole('button', { name: 'Regresar al tablero', exact: true }).count(), 0);
    await archived.locator('[data-completed-task-toggle]').click();
    await archived.getByRole('button', { name: 'Ver sesiones', exact: true }).click();
    await archived.locator('[data-work-session="old-own-session"]').waitFor();
    assert.equal(await archived.locator('[data-work-session="own-session"]').count(), 0, 'el logro retirado no suma sesiones posteriores al reingreso');
    await mine.getByText('Terminó su parte', { exact: true }).waitFor();
    await partner.getByText('Terminó su parte', { exact: true }).waitFor();
    await partner.locator('[data-completed-task-toggle]').click();
    assert.equal(await partner.locator('[data-completed-task-toggle]').getAttribute('aria-expanded'), 'true');
    assert.equal(await mine.locator('[data-completed-task-toggle]').getAttribute('aria-expanded'), 'false');
    await partner.getByRole('button', { name: 'Ver sesiones', exact: true }).click();
    await partner.locator('[data-work-session="partner-session"]').waitFor();
    await partner.getByText(/Retrabajo/).waitFor();
    assert.equal(await partner.locator('[data-work-session="own-session"]').count(), 0);
    assert.equal(await partner.locator('[data-task-work-history]').getByText('00:00:32', { exact: true }).count() > 0, true);
    await page.screenshot({ path: 'output/task-participation/logros-oscuro.png', animations: 'disabled' });
    await partner.getByRole('button', { name: 'Regresar al tablero', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Regresar participación al tablero', exact: true });
    await dialog.getByText(/Mateo Sol/).waitFor();
    await dialog.getByRole('textbox', { name: 'Nota de corrección', exact: true }).fill('Corregir la entrega de Mateo');
    await dialog.getByRole('button', { name: 'Regresar a Pendiente', exact: true }).click();
    await partner.waitFor({ state: 'hidden' });
    await mine.waitFor();
    assert.deepEqual(writes, [{ status: 'PENDIENTE', reopenReason: 'CLIENT_CORRECTION', reopenNote: 'Corregir la entrega de Mateo', expectedRevision: 7, expectedRosterVersion: 3 }]);
  } finally { await page.close(); }
});

test('el dashboard presenta logros personales aunque la tarea siga abierta', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(8000);
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  const task = fixture();
  const achievements = task.participants.map(p => ({ ...task, status: 'REALIZADA', globalStatus: 'EN_CURSO', completedAt: now(),
    participantMemberId: p.memberId, participationKey: `${task.id}:${p.memberId}`, assignee: p.member }));
  await page.route('**/api/dashboard/personal/**', route => route.fulfill({ json: {
    member: { name: 'Lucía Faro', userId: 'navigation-user' }, stats: {}, announcements: [], achievements, upcomingTasks: [], meetings: [], clients: [], reminders: [],
  } }));
  try {
    await page.goto(`${preview.origin}/muestra-dashboard`, { waitUntil: 'domcontentloaded' });
    const feed = page.locator('[data-achievements-feed]');
    await feed.getByText('Lucía Faro terminó su parte de:', { exact: true }).waitFor();
    await feed.getByText('Mateo Sol terminó su parte de:', { exact: true }).waitFor();
    await feed.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/task-participation/logros-recientes-claro.png', animations: 'disabled' });
  } catch (error) { console.error({ pageErrors, body: await page.locator('body').innerText() }); throw error; }
  finally { await page.close(); }
});
