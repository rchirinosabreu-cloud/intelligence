import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const moduleUrl = new URL('../src/lib/managementFilterSession.js', import.meta.url);
const api = async () => {
    assert.ok(fs.existsSync(moduleUrl), 'Gestión must persist filters for the signed-in session');
    return import(moduleUrl.href);
};
const storage = () => {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
const user = { id: 'user-1', name: 'Persona Uno' };

test('a new session defaults to Hoy + Vencidos and the current responsible', async () => {
    const { readManagementFilters } = await api();
    assert.deepEqual(readManagementFilters(storage(), user), {
        dateFilter: 'Hoy + Vencidos', responsibleFilter: user.name, clientFilter: 'Todos', responsibleInitialized: false
    });
});

test('all three choices survive unmount/remount and reload within the session', async () => {
    const { readManagementFilters, writeManagementFilters } = await api();
    const session = storage();
    const choices = { dateFilter: 'Todos', responsibleFilter: 'Persona Dos', clientFilter: 'Cliente Uno', responsibleInitialized: true };
    writeManagementFilters(session, user, choices);
    assert.deepEqual(readManagementFilters(session, { ...user }), choices);
    assert.deepEqual(readManagementFilters(session, { ...user, name: 'Nombre actualizado' }), choices);
});

test('clearing the auth session resets filters without clearing unrelated session data', async () => {
    const { readManagementFilters, writeManagementFilters, clearManagementFilters } = await api();
    const session = storage();
    session.setItem('unrelated-draft', 'keep');
    writeManagementFilters(session, user, { dateFilter: 'Solo Vencidos', responsibleFilter: 'Todos', clientFilter: 'Cliente Uno', responsibleInitialized: true });
    clearManagementFilters(session);
    assert.equal(readManagementFilters(session, user).dateFilter, 'Hoy + Vencidos');
    assert.equal(session.getItem('unrelated-draft'), 'keep');
});

test('saved choices cannot be inherited by another person', async () => {
    const { readManagementFilters, writeManagementFilters } = await api();
    const session = storage();
    writeManagementFilters(session, user, { dateFilter: 'Todos', responsibleFilter: 'Persona Dos', clientFilter: 'Privado', responsibleInitialized: true });
    const other = readManagementFilters(session, { id: 'user-2', name: 'Persona Dos' });
    assert.equal(other.dateFilter, 'Hoy + Vencidos');
    assert.equal(other.clientFilter, 'Todos');
    assert.equal(other.responsibleFilter, 'Persona Dos');
});

test('invalid or unavailable storage falls back safely and validates stored period values', async () => {
    const { readManagementFilters, writeManagementFilters, clearManagementFilters, MANAGEMENT_FILTERS_KEY } = await api();
    const session = storage();
    for (const value of ['{bad', 'null', '[]', JSON.stringify({ userId: user.id, filters: { dateFilter: 'invalid', responsibleFilter: 123 } })]) {
        session.setItem(MANAGEMENT_FILTERS_KEY, value);
        const restored = readManagementFilters(session, user);
        assert.equal(restored.dateFilter, 'Hoy + Vencidos');
        assert.equal(restored.responsibleFilter, user.name);
    }
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    assert.equal(readManagementFilters(blocked, user).dateFilter, 'Hoy + Vencidos');
    assert.doesNotThrow(() => writeManagementFilters(blocked, user, {}));
    assert.doesNotThrow(() => clearManagementFilters(blocked));
});

test('board restores the filters and auth boundaries clear them, including expiration and fresh login', () => {
    const board = fs.readFileSync(new URL('../src/components/modules/NativeTasks.jsx', import.meta.url), 'utf8');
    const auth = fs.readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');
    assert.match(board, /readManagementFilters\(window\.sessionStorage, currentUser\)/);
    assert.match(board, /writeManagementFilters\(window\.sessionStorage, currentUser, next\)/);
    assert.match(board, /responsibleInitialized/);
    assert.doesNotMatch(board, /defaultResponsibleValidatedRef/);
    assert.match(auth.slice(auth.indexOf('const clearAuthSession'), auth.indexOf('const decodeJwtPayload')), /clearManagementFilters\(sessionStorage\)/);
    assert.match(auth.slice(auth.indexOf('const login ='), auth.indexOf('const logout =')), /clearManagementFilters\(sessionStorage\)/);
});
