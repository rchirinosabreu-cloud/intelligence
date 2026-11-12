import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canSeeClientOperations } from '../src/lib/clientOperations.js';
import { CLIENT_OPERATIONS_KEY, EXTRA_PERMISSIONS, extraPermissionsFor, presetPermissions } from '../src/lib/platformModules.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const clientsSource = read('../src/components/modules/Clients.jsx');
const sectionSource = read('../src/components/modules/Clients/operations/ClientsSection.jsx');
const routeSource = read('../src/components/modules/Clients/operations/ClientOperationRoute.jsx');
const pageSource = read('../src/components/modules/Clients/operations/ClientOperationPage.jsx');
const apiSource = read('../src/routes/api/clientOperations.js');

const withPermission = (role, permissions) => ({ role, modulePermissions: permissions });

test('la operación completa se abre por cargo o por la casilla, y nadie pierde lo que tenía', () => {
    // Como desde el 2 de octubre de 2026: dirección y project managers, por su cargo.
    assert.equal(canSeeClientOperations(withPermission('ADMIN', {})), true);
    assert.equal(canSeeClientOperations(withPermission('PROJECT_MANAGER', {})), true);
    // La puerta nueva: a quien se le marque la casilla, sea cual sea su cargo.
    assert.equal(canSeeClientOperations(withPermission('EDITOR', { [CLIENT_OPERATIONS_KEY]: true })), true);
    assert.equal(canSeeClientOperations(withPermission('VIEWER', { [CLIENT_OPERATIONS_KEY]: true })), true);
    // Y sin ella, un community manager sigue viendo el directorio.
    assert.equal(canSeeClientOperations(withPermission('EDITOR', {})), false);
    assert.equal(canSeeClientOperations(withPermission('EDITOR', { clientes: true })), false, 'entrar al módulo no es ver la operación');
    assert.equal(canSeeClientOperations(null), false);
    // Solo un true de verdad, como el resto de las casillas.
    assert.equal(canSeeClientOperations(withPermission('EDITOR', { [CLIENT_OPERATIONS_KEY]: 'true' })), false);
});

test('la casilla se le ofrece a quien le sirve, y a nadie viene marcada', () => {
    const extra = EXTRA_PERMISSIONS.find((item) => item.key === CLIENT_OPERATIONS_KEY);
    assert.ok(extra, 'la casilla vive en la lista única');
    assert.match(extra.label, /operación completa de clientes/i);

    const ofrecidas = (role, permissions) => extraPermissionsFor(role, permissions).map((item) => item.key);
    // A quien ya la ve por su cargo no se le ofrece: marcarla no cambiaría nada y confunde.
    assert.ok(!ofrecidas('PROJECT_MANAGER', { clientes: true }).includes(CLIENT_OPERATIONS_KEY));
    assert.ok(!ofrecidas('ADMIN', { clientes: true }).includes(CLIENT_OPERATIONS_KEY));
    // A quien tiene el módulo Clientes, sí.
    assert.ok(ofrecidas('EDITOR', { clientes: true }).includes(CLIENT_OPERATIONS_KEY));
    // Sin el módulo Clientes no tiene sentido: no hay pantalla donde usarla.
    assert.ok(!ofrecidas('EDITOR', { clientes: false }).includes(CLIENT_OPERATIONS_KEY));
    // Ningún rol la trae encendida: se marca persona por persona.
    for (const role of ['ADMIN', 'PROJECT_MANAGER', 'EDITOR', 'VIEWER']) {
        assert.equal(presetPermissions(role)[CLIENT_OPERATIONS_KEY], false, role);
    }
});

test('el servidor deja leer con la casilla y reserva los cambios para el cargo', () => {
    assert.match(apiSource, /canSeeClientOperations\(req\.user\)/);
    assert.match(apiSource, /router\.use\(requireClientOperations, requireManager\)/);
    // Escribir sigue pidiendo el cargo; leer pasa.
    assert.match(apiSource, /if \(req\.method === 'GET'\) return next\(\);/);
    assert.match(apiSource, /isManagerRole\(req\.user\.role\)/);
});

test('la pantalla esconde lo que el servidor va a negar, nunca lo ofrece para fallar', () => {
    // Ver la operación y poder cambiar clientes son dos cosas distintas.
    assert.match(clientsSource, /const canManage = canSeeClientOperations\(currentUser\)/);
    assert.match(clientsSource, /const canEditClients = isManagerRole\(currentUser\?\.role\)/);
    // «Nuevo cliente», el menú de cada fila y el filtro por CM son del cargo.
    assert.match(sectionSource, /\{canEdit && <Button onClick=\{onNewClient\}/);
    assert.match(clientsSource, /\{!canEdit \? null : client\.isArchived \?/);
    assert.match(clientsSource, /\{canEdit && \(\s*\n\s*<div className="flex items-center gap-2 rounded-xl bg-zinc-100/);
    // En la página de un cliente, ver no es cambiar.
    assert.match(routeSource, /canManage=\{isManagerRole\(currentUser\?\.role\)\}/);
    assert.match(pageSource, /const ifManager = \(handler\) => \(canManage \? handler : null\)/);
    for (const handler of ['onEditProfile', 'onMarkPublished', 'onSaveReport', 'onConfirmClose', 'onSuspend', 'onAddObservation']) {
        assert.match(pageSource, new RegExp(`${handler} = ifManager\\(${handler}\\)`), handler);
    }
    // Abrir la parrilla, una pieza o el espacio del cliente no cambia nada: se conservan.
    for (const handler of ['onOpenPlan', 'onOpenPiece', 'onOpenTask', 'onOpenWorkspace']) {
        assert.doesNotMatch(pageSource, new RegExp(`${handler} = ifManager\\(`), handler);
    }
});

test('quien no administra ve sus cuentas primero, no una tabla de administración', () => {
    assert.match(clientsSource, /const isMine = \(client\) =>/);
    assert.match(clientsSource, /client\.responsible\?\.id === myMemberId \|\| client\.projectManager\?\.id === myMemberId/);
    assert.match(clientsSource, /data-directory-mine/);
    assert.match(clientsSource, /Tus clientes/);
    // Un manager conserva la lista de siempre, sin dividir.
    assert.match(clientsSource, /const mine = canEdit \? \[\] : active\.filter\(isMine\)/);
    assert.match(clientsSource, /const others = canEdit \? active : active\.filter\(\(client\) => !isMine\(client\)\)/);
    // La identidad sale del Equipo, no de adivinar por nombre.
    assert.match(clientsSource, /team\.find\(\(member\) => member\.userId === currentUser\?\.id\)/);
});
