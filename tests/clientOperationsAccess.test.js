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

test('con la casilla se ve y se edita; lo que tiene su propia regla no se abre', () => {
    // Quien entra, entra a trabajar (Rodny, 13 de noviembre de 2026: «necesito que puedan editar la ficha»).
    assert.match(apiSource, /canSeeClientOperations\(req\.user\)/);
    assert.match(apiSource, /router\.use\(requireClientOperations\)/);
    assert.doesNotMatch(apiSource, /req\.method === 'GET'/, 'ya no hay una puerta aparte para escribir');
    assert.doesNotMatch(apiSource, /isManagerRole/, 'el cargo no decide dentro de esta ruta');

    // Lo que no depende de esta puerta lo sigue decidiendo el servicio, no el router.
    const service = read('../src/services/clientOperationsService.js');
    assert.match(service, /if \(!\(await canAuthorizeWork\(actorUserId\)\)\)/, 'autorizar trabajo sin propuesta');
    assert.match(service, /canSuspend/, 'suspender por cartera');
    assert.match(service, /canDecideContractContinuity/, 'la no renovación');
    // La ficha del proyecto exige el cargo en su propio servicio.
    assert.match(read('../src/services/projectOperationsService.js'), /isManagerRole\(user\.role\)/);
    // Y crear, renombrar o desactivar un cliente vive en otra ruta, que sigue pidiendo el cargo.
    assert.match(read('../src/routes/index.js'), /router\.patch\('\/clients\/:id', requireManagerRole/);
});

test('la pantalla esconde lo que el servidor va a negar, nunca lo ofrece para fallar', () => {
    // Ver la operación y poder cambiar clientes son dos cosas distintas.
    assert.match(clientsSource, /const canManage = canSeeClientOperations\(currentUser\)/);
    assert.match(clientsSource, /const canEditClients = isManagerRole\(currentUser\?\.role\)/);
    // «Nuevo cliente», el menú de cada fila y el filtro por CM son del cargo.
    assert.match(sectionSource, /\{canEdit && <Button onClick=\{onNewClient\}/);
    assert.match(clientsSource, /\{!canEdit \? null : client\.isArchived \?/);
    assert.match(clientsSource, /\{canEdit && \(\s*\n\s*<div className="flex items-center gap-2 rounded-xl bg-zinc-100/);
    // En la página de un cliente, quien entra edita: la puerta es la misma que para verla.
    assert.match(routeSource, /<ClientOperationPage [^>]*today=\{today\} canManage\b/);
    assert.doesNotMatch(pageSource, /ifManager/, 'ya no se anulan las acciones dentro de la página');
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
