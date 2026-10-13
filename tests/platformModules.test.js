import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
    hasModuleAccess,
    MODULE_KEYS,
    PLATFORM_MODULES,
    presetModulePermissions,
    readModulePermissions,
    sanitizeModulePermissions
} from '../src/lib/platformModules.js';
import { hasModulePermission } from '../src/config/security.js';
import { welcomeCatalog, getWelcomeModules } from '../src/lib/welcomeContent.js';

// Una sola lista de módulos (Rodny, 12 de octubre de 2026: «cada vez que exista un módulo
// nuevo, debe reflejarse ahí y en todos lados … la plataforma debe reconocer esto y
// actualizarse en todo, es algo global»). Drive estrena su propia casilla.

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('el catálogo tiene claves únicas, nombre visible y ruta', () => {
    assert.equal(new Set(MODULE_KEYS).size, MODULE_KEYS.length);
    for (const module of PLATFORM_MODULES) {
        assert.match(module.key, /^[a-z]+$/, module.key);
        assert.ok(module.label, module.key);
        assert.match(module.path, /^\/[a-z-]+$/, module.key);
    }
    assert.ok(MODULE_KEYS.includes('drive'), 'Drive tiene su propia casilla');
    assert.ok(MODULE_KEYS.includes('crm'));
    assert.ok(!MODULE_KEYS.includes('bria'), 'Bria no es un módulo del menú: va en su propia casilla');
    assert.ok(!MODULE_KEYS.includes('dashboard'), 'el dashboard lo tiene todo el mundo');
});

test('quien tenía Minutas conserva Drive mientras nadie lo cambie', () => {
    assert.equal(readModulePermissions({ minutas: true }).drive, true);
    assert.equal(readModulePermissions({ minutas: false }).drive, false);
    assert.equal(readModulePermissions({ minutas: true, drive: false }).drive, false, 'quitarlo a mano se respeta');
    assert.equal(readModulePermissions({ minutas: false, drive: true }).drive, true);
    assert.equal(hasModuleAccess({ role: 'EDITOR', modulePermissions: { minutas: true } }, 'drive'), true);
    assert.equal(hasModuleAccess({ role: 'EDITOR', modulePermissions: { minutas: true, drive: false } }, 'drive'), false);
});

test('los permisos viejos se leen igual: claves con mayúscula, «Tareas», texto JSON', () => {
    const read = readModulePermissions('{"Tareas":true,"Manager":true,"Clientes":true}');
    assert.equal(read.gestion, true);
    assert.equal(read.manager, true);
    assert.equal(read.clientes, true);
    assert.equal(read.crm, false);
    assert.deepEqual(Object.keys(readModulePermissions(null)).sort(), [...MODULE_KEYS, 'bria'].sort());
    assert.equal(readModulePermissions('{roto').gestion, false);
    assert.equal(readModulePermissions({ bria: 'true' }).bria, false, 'Bria solo con un true de verdad');
    assert.equal(readModulePermissions({ bria: true }).bria, true);
});

test('guardar deja todas las casillas, quita lo desconocido y conserva CRM y Bria', () => {
    const saved = sanitizeModulePermissions({ crm: true, bria: true, inventado: true, Tareas: true });
    assert.equal(saved.crm, true, 'antes una de las copias borraba CRM al guardar');
    assert.equal(saved.bria, true);
    assert.equal(saved.gestion, true);
    assert.equal(saved.dashboard, true);
    assert.equal('inventado' in saved, false);
    assert.equal('Tareas' in saved, false);
    for (const key of MODULE_KEYS) assert.equal(typeof saved[key], 'boolean', key);
    assert.equal(sanitizeModulePermissions({ minutas: true }).drive, true, 'al guardar, Drive queda escrito');
});

test('los permisos por rol salen del catálogo y cubren todos los módulos', () => {
    for (const role of ['ADMIN', 'PROJECT_MANAGER', 'EDITOR', 'VIEWER']) {
        const preset = presetModulePermissions(role);
        assert.deepEqual(Object.keys(preset).sort(), [...MODULE_KEYS].sort(), role);
    }
    assert.ok(MODULE_KEYS.every((key) => presetModulePermissions('ADMIN')[key]));
    assert.ok(MODULE_KEYS.every((key) => presetModulePermissions('PROJECT_MANAGER')[key]));
    const editor = presetModulePermissions('EDITOR');
    assert.equal(editor.gestion, true);
    assert.equal(editor.drive, true);
    assert.equal(editor.manager, false);
    assert.equal(editor.financiero, false);
    const viewer = presetModulePermissions('VIEWER');
    assert.equal(viewer.gestion, false);
    assert.equal(viewer.minutas, true);
    assert.equal(viewer.drive, true);
    assert.equal(presetModulePermissions('DESCONOCIDO').reportes, false);
});

test('el servidor y la pantalla deciden igual', () => {
    const editor = { role: 'EDITOR', modulePermissions: { Tareas: true, minutas: true } };
    for (const key of MODULE_KEYS) {
        assert.equal(hasModulePermission(editor, key), hasModuleAccess(editor, key), key);
    }
    assert.equal(hasModulePermission({ role: 'ADMIN', modulePermissions: {} }, 'drive'), true);
    assert.equal(hasModuleAccess({ role: 'VIEWER', modulePermissions: { gestion: true } }, 'inventado'), false);
    assert.equal(hasModuleAccess(null, 'gestion'), false);
});

// El contrato global: un módulo existe en un solo sitio y todo lo demás lo lee de ahí.

const sidebar = source('src/components/layout/Sidebar.jsx');
const app = source('src/App.jsx');
const team = source('src/components/modules/Team.jsx');

const routeSources = () => {
    const files = ['src/routes/index.js', ...readdirSync(new URL('../src/routes/api/', import.meta.url)).map((name) => `src/routes/api/${name}`)];
    return files.filter((file) => file.endsWith('.js')).map((file) => [file, source(file)]);
};

test('todo módulo del catálogo tiene su entrada en el menú y su ruta con su guardián', () => {
    for (const { key, path } of PLATFORM_MODULES) {
        assert.match(sidebar, new RegExp(`path: '${path}', moduleKey: '${key}'`), `menú: ${key}`);
        assert.match(app, new RegExp(`path="${path}"\\s+element={\\s*<ModuleGuard module="${key}">`), `ruta: ${key}`);
    }
});

test('ninguna pantalla ni ruta usa un módulo que el catálogo no conoce', () => {
    const sidebarKeys = [...sidebar.matchAll(/moduleKey: '(\w+)'/g)].map((m) => m[1]);
    assert.ok(sidebarKeys.length >= MODULE_KEYS.length);
    for (const key of sidebarKeys) assert.ok(key === 'dashboard' || MODULE_KEYS.includes(key), `menú usa ${key}`);
    for (const [, key] of app.matchAll(/<ModuleGuard module="(\w+)"/g)) assert.ok(MODULE_KEYS.includes(key), `App usa ${key}`);
    for (const [file, text] of routeSources()) {
        for (const [, key] of text.matchAll(/requireModulePermission\('(\w+)'\)/g)) {
            assert.ok(MODULE_KEYS.includes(key), `${file} usa ${key}`);
        }
    }
    // Todo elemento del menú es un módulo del catálogo o algo solo de administradores.
    const items = [...sidebar.matchAll(/\{ id: '[^']+',[^}]*\}/g)].map((m) => m[0]);
    for (const item of items) {
        assert.ok(/moduleKey: '/.test(item) || /roles: \['ADMIN'\]/.test(item), `sin permiso: ${item}`);
    }
});

test('Drive se protege con su propia casilla en el menú, la pantalla y el servidor', () => {
    assert.match(sidebar, /path: '\/drive', moduleKey: 'drive'/);
    assert.match(app, /path="\/drive"\s+element={\s*<ModuleGuard module="drive">/);
    assert.match(source('src/routes/index.js'), /router\.use\('\/drive', requireModulePermission\('drive'\), driveRouter\)/);
});

test('la ventana de Equipo, el servidor y la bienvenida no copian la lista', () => {
    assert.match(team, /PLATFORM_MODULES/);
    assert.match(team, /presetModulePermissions\(/);
    assert.match(team, /readModulePermissions\(/);
    assert.doesNotMatch(team, /minutas: (true|false)/, 'nada de listas escritas a mano');
    for (const file of ['src/routes/api/team.js', 'src/services/userService.js']) {
        const text = source(file);
        assert.match(text, /sanitizeModulePermissions\(/, file);
        assert.doesNotMatch(text, /minutas: (true|false)/, file);
    }
    assert.match(sidebar, /hasModuleAccess\(/);
    assert.match(app, /hasModuleAccess\(/);
    assert.match(source('src/lib/dashboardTips.js'), /hasModuleAccess\(/);
});

test('la bienvenida presenta todos los módulos y respeta la casilla de Drive', () => {
    const ids = welcomeCatalog.map((item) => item.id);
    for (const key of MODULE_KEYS) assert.ok(ids.includes(key), `bienvenida: ${key}`);
    const visible = (perms) => getWelcomeModules({ role: 'EDITOR', modulePermissions: perms }).map((item) => item.id);
    assert.ok(visible({ minutas: true }).includes('drive'));
    assert.ok(!visible({ minutas: true, drive: false }).includes('drive'));
    assert.ok(visible({ crm: true }).includes('crm'));
});
