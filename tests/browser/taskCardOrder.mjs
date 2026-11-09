import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createNavigationPreview } from '../../scripts/preview-navigation.js';
import { applyTaskCardOrder } from '../../src/lib/taskCardOrder.js';

const statuses = { pendiente: 'PENDIENTE', 'en-proceso': 'EN_CURSO', devuelto: 'DEVUELTA', realizado: 'REALIZADA' };
for (const role of ['ADMIN', 'PROJECT_MANAGER']) test(`${role}: arrastre vertical en cada columna, partes ajenas y privadas, recarga y permisos`, async () => {
  const preview = await createNavigationPreview({ port: 0, role });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  page.setDefaultTimeout(12000);
  const now = new Date().toISOString();
  const member = { id: 'navigation-member', userId: 'navigation-user', name: 'Lucía Faro' };
  const partner = { id: 'partner', userId: 'partner-user', name: 'Mateo Sol' };
  const base = (id, status, sortOrder) => ({ id, status, sortOrder, title: `Prioridad ${id}`, dueDate: now, createdAt: now, updatedAt: now,
    completedAt: status === 'REALIZADA' ? now : null, clientId: 'navigation-client', client: { name: 'Cliente de prueba' },
    assigneeId: member.id, assignee: member, creatorId: member.userId, creator: { id: member.userId, name: member.name },
    collaborators: [], taskComments: [], taskAttachments: [] });
  let rows = Object.entries(statuses).flatMap(([column, status]) => [
    { ...base(`${column}-team`, status, 0), sharedProgress: true, rosterVersion: 1, collaborators: [{ memberId: partner.id, member: partner }],
      participants: [member, partner].map((m, i) => ({ memberId: m.id, member: m, role: i ? 'COLLABORATOR' : 'ASSIGNEE', status, revision: 2,
        completedAt: status === 'REALIZADA' ? now : null, accumulatedWorkMs: 24000,
        permissions: { canChangeStatus: false, canReturn: false, canReopen: false, canReintegrate: false } })) },
    { ...base(`${column}-private`, status, 1), isPrivate: true, isLocked: true },
  ]);
  const writes = [], forbidden = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/tasks**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/tasks') return route.fulfill({ json: rows });
    if (pathname === '/api/tasks/reorder') {
      const body = route.request().postDataJSON(); writes.push(body);
      const order = body.cards.map((c, sortOrder) => ({ id: c.id, memberId: c.memberId, status: c.status, sortOrder, revision: c.revision + 1 }));
      rows = applyTaskCardOrder(rows, order);
      return route.fulfill({ json: { success: true, order } });
    }
    forbidden.push(pathname);
    return route.fulfill({ status: 403, json: { error: 'No autorizado' } });
  });
  const allPeople = async () => {
    await page.getByRole('combobox', { name: 'Responsable', exact: true }).click();
    await page.getByRole('option', { name: 'Todos los responsables', exact: true }).click();
  };
  const drag = async (card, direction) => {
    await card.focus(); await page.keyboard.press('Space'); await page.waitForTimeout(180);
    await page.keyboard.press(direction); await page.waitForTimeout(180); await page.keyboard.press('Space');
  };
  const ids = column => column.locator('[data-rfd-draggable-id]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-rfd-draggable-id')));
  try {
    await page.goto(`${preview.origin}/gestion`); await allPeople();
    const expected = new Map();
    for (const columnId of Object.keys(statuses)) {
      if (columnId === 'devuelto') await page.getByRole('button', { name: '3 Devueltas', exact: true }).click();
      const column = page.locator(`[data-rfd-droppable-id="${columnId}"]`);
      await column.locator('[data-rfd-draggable-id]').first().waitFor();
      const before = await ids(column); assert.equal(before.length, 3);
      const saved = page.waitForResponse(r => r.url().endsWith('/api/tasks/reorder'));
      await drag(column.locator('[data-rfd-draggable-id]').last(), 'ArrowUp'); await saved;
      await page.waitForFunction(({columnId, first, second, third}) => {
        const actual = [...document.querySelectorAll(`[data-rfd-droppable-id="${columnId}"] [data-rfd-draggable-id]`)].map(n => n.getAttribute('data-rfd-draggable-id'));
        return JSON.stringify(actual) === JSON.stringify([first, second, third]);
      }, { columnId, first: before[0], second: before[2], third: before[1] });
      expected.set(columnId, [before[0], before[2], before[1]]);
      assert.equal(writes.at(-1).cards.length, 3);
      if (columnId === 'devuelto') await page.keyboard.press('Escape');
    }
    // Poder ordenar no autoriza a sacar de columna una parte ajena ni una privada.
    const pending = page.locator('[data-rfd-droppable-id="pendiente"]');
    for (const direction of ['ArrowUp', 'ArrowDown']) {
      const saved = page.waitForResponse(r => r.url().endsWith('/api/tasks/reorder'));
      await drag(pending.locator('[data-task-member="partner"]'), direction); await saved;
      await page.waitForTimeout(300);
    }
    assert.deepEqual(await ids(pending), expected.get('pendiente'), 'una parte ajena se mueve hacia arriba y hacia abajo');
    await drag(pending.locator('[data-task-member="partner"]'), 'ArrowRight');
    await page.getByText('Puedes ordenar esta tarjeta, pero no cambiar el estado de esta participación.', { exact: true }).waitFor();
    await drag(pending.locator('[data-rfd-draggable-id="pendiente-private"]'), 'ArrowRight');
    await page.getByText('Puedes ordenar esta tarjeta, pero su estado solo lo cambia quien tiene acceso a la tarea.', { exact: true }).waitFor();
    assert.deepEqual(forbidden, []);
    await page.reload(); await allPeople();
    for (const [columnId, order] of expected) {
      if (columnId === 'devuelto') await page.getByRole('button', { name: '3 Devueltas', exact: true }).click();
      const column = page.locator(`[data-rfd-droppable-id="${columnId}"]`);
      await column.locator('[data-rfd-draggable-id]').first().waitFor();
      assert.deepEqual(await ids(column), order);
      if (columnId === 'devuelto') await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
    await page.getByRole('dialog', { name: 'Tareas devueltas', exact: true }).waitFor({ state: 'hidden' });
    await mkdir('output/task-card-order', { recursive: true });
    await page.screenshot({ path: `output/task-card-order/${role}.png`, fullPage: true, animations: 'disabled' });
  } finally { await page.close(); await browser.close(); await preview.close(); }
});
