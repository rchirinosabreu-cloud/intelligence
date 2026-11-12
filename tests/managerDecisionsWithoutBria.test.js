import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasBriaAccess } from '../src/lib/platformModules.js';
import { createPulseHandler } from '../src/controllers/managerDecisionController.js';

// Rodny, 12 de noviembre de 2026: a Kamila le salía «No tienes permisos para realizar esta acción» en cualquier
// módulo y a cada rato. Tiene Manager pero no Bria, y el punto de Decisiones del menú preguntaba cada pocos minutos
// por las decisiones que prepara Bria: el servidor respondía 403 y saltaba el aviso global.

test('hasBriaAccess pide lo mismo que el servidor: rol de dirección o PM y la casilla Bria', () => {
    assert.equal(hasBriaAccess({ role: 'PROJECT_MANAGER', modulePermissions: { manager: true, bria: false } }), false, 'Kamila');
    assert.equal(hasBriaAccess({ role: 'ADMIN', modulePermissions: { manager: true, bria: false } }), false, 'un administrador también necesita la casilla');
    assert.equal(hasBriaAccess({ role: 'ADMIN', modulePermissions: { bria: true } }), true);
    assert.equal(hasBriaAccess({ role: 'PROJECT_MANAGER', modulePermissions: JSON.stringify({ bria: true }) }), true);
    assert.equal(hasBriaAccess({ role: 'EDITOR', modulePermissions: { bria: true } }), false);
});

test('sin Bria, la consulta del punto responde «nada nuevo» y no «sin permiso»', async () => {
    const handler = createPulseHandler(() => ({ pulse: async () => { throw Object.assign(new Error('Bria ya no está disponible para esta cuenta.'), { status: 403, code: 'BRIA_DISABLED' }); } }));
    let statusCode = 200; let body;
    await handler({ user: { id: 'kamila' } }, { status(code) { statusCode = code; return this; }, json(data) { body = data; return this; } });
    assert.equal(statusCode, 200);
    assert.deepEqual(body, { keys: [] });
});

test('el menú y la pestaña de Decisiones no consultan nada sin Bria', () => {
    const sidebar = fs.readFileSync(new URL('../src/components/layout/Sidebar.jsx', import.meta.url), 'utf8');
    assert.match(sidebar, /<ManagerDecisionsBadge userId=\{currentUser\?\.id\} enabled=\{isManagerRole\(currentUser\?\.role\) && hasBriaAccess\(currentUser\)\} \/>/);
    const decisions = fs.readFileSync(new URL('../src/components/modules/ManagerDecisions.jsx', import.meta.url), 'utf8');
    assert.match(decisions, /if \(!hasBriaAccess\(currentUser\)\) \{/);
    assert.match(decisions, /data-manager-decisions-without-bria/);
});

test('Actividad no pide los buzones de Bria a quien no tiene Bria', () => {
    const activity = fs.readFileSync(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');
    assert.match(activity, /\{isAdmin && hasBriaAccess\(currentUser\) && <MailboxConnections/);
});
