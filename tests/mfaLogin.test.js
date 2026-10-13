import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createMfaLoginHandlers } from '../src/controllers/mfaLoginController.js';
import { isMfaEnrollmentRoute, isMfaRequiredForRole, mfaEnrollmentBlock, signMfaChallenge, signTrustedDevice, TRUSTED_DEVICE_DAYS } from '../src/lib/mfaPolicy.js';
import { MfaError } from '../src/services/mfaService.js';

// Inicio de sesión en dos pasos (27 de septiembre de 2026): con el MFA activo, la
// contraseña correcta ya no entrega la sesión, solo un pase de cinco minutos para el código.

const SECRET = 'y'.repeat(40);

const user = (extra = {}) => ({
    id: 'u1', name: 'Rodny', email: 'rodny@brainstudio.co', role: 'ADMIN', isActive: true,
    teamMember: { isActive: true }, sessionVersion: 2, mustChangePassword: false,
    hasFinancialAccess: false, financialRole: 'NONE', modulePermissions: {}, mfaEnabledAt: null, ...extra
});

const response = () => {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
};

const handlers = ({ dbUser = user(), verify, requiredRoles = '' } = {}) => {
    const traces = [];
    const calls = [];
    const mfa = {
        verifySecondFactor: async (userId, code) => {
            calls.push([userId, code]);
            if (verify) return verify(code);
            throw new MfaError(400, 'MFA_CODE_INVALID', 'El código no es válido');
        }
    };
    const db = { user: { findUnique: async () => dbUser } };
    const h = createMfaLoginHandlers({ db, mfa, jwtSecret: SECRET, expiresIn: '12h', trace: async (t) => traces.push(t), requiredRoles });
    return { h, traces, calls };
};

test('sin MFA activo la contraseña entrega la sesión como siempre', async () => {
    const { h, traces } = handlers();
    const res = response();
    await h.respondAfterPassword(user(), res);

    assert.ok(res.body.token);
    assert.equal(jwt.verify(res.body.token, SECRET).userId, 'u1');
    assert.equal(res.body.user.mfaEnabled, false);
    assert.equal(res.body.user.mfaEnrollmentRequired, false);
    assert.equal(traces[0].metadata.method, 'PASSWORD');
});

test('un rol obligado sin MFA recibe la sesión marcada para activarlo', async () => {
    const { h } = handlers({ requiredRoles: 'ADMIN' });
    const res = response();
    await h.respondAfterPassword(user(), res);
    assert.ok(res.body.token);
    assert.equal(res.body.user.mfaEnrollmentRequired, true);
});

test('con MFA activo la contraseña solo entrega el pase, nunca un token de sesión', async () => {
    const { h } = handlers();
    const res = response();
    await h.respondAfterPassword(user({ mfaEnabledAt: new Date() }), res);

    assert.equal(res.body.mfaRequired, true);
    assert.equal(res.body.token, undefined);
    assert.equal(res.body.user, undefined, 'tampoco los datos de la cuenta');
    assert.ok(res.body.challengeToken);
    assert.throws(() => jwt.verify(res.body.challengeToken, SECRET));
});

test('pase válido y código correcto: entrega la sesión y registra el método', async () => {
    const dbUser = user({ mfaEnabledAt: new Date() });
    const { h, traces, calls } = handlers({ dbUser, verify: () => ({ method: 'totp', recoveryCodesRemaining: 10 }) });
    const challengeToken = signMfaChallenge({ userId: 'u1', sessionVersion: 2 }, SECRET);
    const res = response();
    await h.verifyLogin({ body: { challengeToken, code: '123456' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [['u1', '123456']]);
    const payload = jwt.verify(res.body.token, SECRET);
    assert.equal(payload.userId, 'u1');
    assert.equal(payload.sessionVersion, 2);
    assert.deepEqual(payload.amr, ['pwd', 'otp']);
    assert.equal(res.body.user.mfaEnabled, true);
    assert.equal(traces[0].metadata.method, 'PASSWORD_TOTP');
});

test('con un código de respaldo avisa cuántos quedan', async () => {
    const { h, traces } = handlers({ dbUser: user({ mfaEnabledAt: new Date() }), verify: () => ({ method: 'recovery', recoveryCodesRemaining: 2 }) });
    const res = response();
    await h.verifyLogin({ body: { challengeToken: signMfaChallenge({ userId: 'u1', sessionVersion: 2 }, SECRET), code: 'abcde-fghjk' } }, res);
    assert.equal(res.body.recoveryCodesRemaining, 2);
    assert.equal(traces[0].metadata.method, 'PASSWORD_RECOVERY_CODE');
});

test('código incorrecto: responde el error del servicio y no hay sesión', async () => {
    const { h } = handlers({ dbUser: user({ mfaEnabledAt: new Date() }) });
    const res = response();
    await h.verifyLogin({ body: { challengeToken: signMfaChallenge({ userId: 'u1', sessionVersion: 2 }, SECRET), code: '000000' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'MFA_CODE_INVALID');
    assert.equal(res.body.token, undefined);
});

test('pase vencido, falso o de una sesión ya revocada: vuelve a la contraseña', async () => {
    const cases = [
        ['basura', user({ mfaEnabledAt: new Date() })],
        [signMfaChallenge({ userId: 'u1', sessionVersion: 2 }, SECRET, { expiresIn: -1 }), user({ mfaEnabledAt: new Date() })],
        [signMfaChallenge({ userId: 'u1', sessionVersion: 1 }, SECRET), user({ mfaEnabledAt: new Date() })],
        [signMfaChallenge({ userId: 'u1', sessionVersion: 2 }, SECRET), user({ mfaEnabledAt: new Date(), isActive: false })],
        [signMfaChallenge({ userId: 'u1', sessionVersion: 2 }, SECRET), user({ mfaEnabledAt: null })]
    ];
    for (const [challengeToken, dbUser] of cases) {
        const { h, calls } = handlers({ dbUser, verify: () => ({ method: 'totp' }) });
        const res = response();
        await h.verifyLogin({ body: { challengeToken, code: '123456' } }, res);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.code, 'MFA_CHALLENGE_INVALID');
        assert.equal(calls.length, 0, 'ni siquiera se prueba el código');
    }
});

// Dispositivo recordado (Rodny, 12 de octubre de 2026: «me parece excesivo usar el
// autenticador cada vez que la sesión se cierra … una vez por semana podría ser y, por
// supuesto, cada ingreso desde un dispositivo nuevo lo solicitaría también»).

const ENABLED_AT = new Date('2026-09-27T15:00:00Z');
const challengeFor = (sv = 2) => signMfaChallenge({ userId: 'u1', sessionVersion: sv }, SECRET);

test('con «recordar este dispositivo» el código entrega además el pase del dispositivo, de 7 días', async () => {
    const { h } = handlers({ dbUser: user({ mfaEnabledAt: ENABLED_AT }), verify: () => ({ method: 'totp' }) });
    const res = response();
    await h.verifyLogin({ body: { challengeToken: challengeFor(), code: '123456', rememberDevice: true } }, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token);
    assert.ok(res.body.trustedDeviceToken);
    assert.equal(TRUSTED_DEVICE_DAYS, 7);
    const { exp, iat } = jwt.decode(res.body.trustedDeviceToken);
    assert.equal(exp - iat, 7 * 24 * 60 * 60);
    assert.throws(() => jwt.verify(res.body.trustedDeviceToken, SECRET), 'no sirve como sesión');
});

test('sin marcar «recordar» no hay pase del dispositivo', async () => {
    for (const rememberDevice of [undefined, false, 'true', 1]) {
        const { h } = handlers({ dbUser: user({ mfaEnabledAt: ENABLED_AT }), verify: () => ({ method: 'totp' }) });
        const res = response();
        await h.verifyLogin({ body: { challengeToken: challengeFor(), code: '123456', rememberDevice } }, res);
        assert.equal(res.body.trustedDeviceToken, undefined, String(rememberDevice));
    }
});

test('un código equivocado nunca entrega pase del dispositivo', async () => {
    const { h } = handlers({ dbUser: user({ mfaEnabledAt: ENABLED_AT }) });
    const res = response();
    await h.verifyLogin({ body: { challengeToken: challengeFor(), code: '000000', rememberDevice: true } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.trustedDeviceToken, undefined);
});

test('desde un dispositivo recordado la contraseña basta durante la semana', async () => {
    const dbUser = user({ mfaEnabledAt: ENABLED_AT });
    const trustedDevice = signTrustedDevice(dbUser, SECRET);
    const { h, traces } = handlers({ dbUser });
    const res = response();
    await h.respondAfterPassword(dbUser, res, { trustedDevice });

    assert.equal(res.body.mfaRequired, undefined);
    const payload = jwt.verify(res.body.token, SECRET);
    assert.equal(payload.userId, 'u1');
    assert.deepEqual(payload.amr, ['pwd', 'device']);
    assert.equal(res.body.user.mfaEnabled, true);
    assert.equal(traces[0].metadata.method, 'PASSWORD_TRUSTED_DEVICE');
});

test('el pase del dispositivo no vale vencido, de otra persona, tras cambiar la contraseña ni tras volver a vincular la app', async () => {
    const base = user({ mfaEnabledAt: ENABLED_AT });
    const cases = [
        ['sin pase', undefined, base],
        ['basura', 'basura', base],
        ['vencido', signTrustedDevice(base, SECRET, { expiresIn: -1 }), base],
        ['de otra persona', signTrustedDevice({ ...base, id: 'u2' }, SECRET), base],
        ['contraseña cambiada o sesiones cerradas', signTrustedDevice(base, SECRET), user({ mfaEnabledAt: ENABLED_AT, sessionVersion: 3 })],
        ['app vinculada de nuevo', signTrustedDevice(base, SECRET), user({ mfaEnabledAt: new Date('2026-10-12T15:00:00Z') })],
        ['firmado con otra clave', signTrustedDevice(base, 'z'.repeat(40)), base],
        ['un token de sesión', jwt.sign({ userId: 'u1', sub: 'u1', sv: 2 }, SECRET), base],
        ['el pase del código', challengeFor(), base]
    ];
    for (const [label, trustedDevice, dbUser] of cases) {
        const { h } = handlers({ dbUser });
        const res = response();
        await h.respondAfterPassword(dbUser, res, { trustedDevice });
        assert.equal(res.body.mfaRequired, true, label);
        assert.equal(res.body.token, undefined, label);
    }
});

test('sin MFA activo un pase del dispositivo no cambia nada', async () => {
    const dbUser = user();
    const { h, traces } = handlers({ dbUser });
    const res = response();
    await h.respondAfterPassword(dbUser, res, { trustedDevice: signTrustedDevice({ ...dbUser, mfaEnabledAt: ENABLED_AT }, SECRET) });
    assert.ok(res.body.token);
    assert.deepEqual(jwt.verify(res.body.token, SECRET).amr, ['pwd']);
    assert.equal(traces[0].metadata.method, 'PASSWORD');
});

test('MFA_REQUIRED_ROLES=* obliga a todo el equipo, también a un rol que se cree después', () => {
    for (const role of ['ADMIN', 'PROJECT_MANAGER', 'EDITOR', 'VIEWER', 'ROL_NUEVO']) {
        assert.equal(isMfaRequiredForRole(role, '*'), true, role);
        assert.equal(isMfaRequiredForRole(role, ' * '), true, role);
    }
    assert.equal(isMfaRequiredForRole('', '*'), false, 'sin rol no hay a quién obligar');
    assert.equal(isMfaRequiredForRole('EDITOR', 'ADMIN'), false);
    assert.equal(isMfaRequiredForRole('EDITOR', ''), false);
    const editor = { role: 'EDITOR', mfaEnabledAt: null };
    assert.equal(mfaEnrollmentBlock(editor, { method: 'GET', originalUrl: '/api/tasks' }, '*')?.code, 'MFA_ENROLLMENT_REQUIRED');
});

test('una cuenta nueva puede cambiar su clave temporal aunque le falte el autenticador', () => {
    // Mariceth, 13 de octubre de 2026: el cambio de contraseña pasaba el control de «clave
    // pendiente» y lo frenaba el de «autenticador pendiente»; la pantalla volvía al formulario.
    const nueva = { role: 'EDITOR', mfaEnabledAt: null };
    assert.equal(mfaEnrollmentBlock(nueva, { method: 'PUT', originalUrl: '/api/user/password' }, '*'), null);
    assert.equal(isMfaEnrollmentRoute('PUT', '/api/user/password'), true);
    assert.equal(isMfaEnrollmentRoute('GET', '/api/user/password'), false);
    assert.equal(isMfaEnrollmentRoute('PUT', '/api/user/password/otra'), false);
    assert.equal(mfaEnrollmentBlock(nueva, { method: 'PUT', originalUrl: '/api/user/profile' }, '*')?.code, 'MFA_ENROLLMENT_REQUIRED');
});

test('guardián: un rol obligado sin MFA solo puede activarlo', () => {
    const admin = { role: 'ADMIN', mfaEnabledAt: null };
    assert.equal(mfaEnrollmentBlock(admin, { method: 'GET', originalUrl: '/api/tasks' }, 'ADMIN')?.code, 'MFA_ENROLLMENT_REQUIRED');
    assert.equal(mfaEnrollmentBlock(admin, { method: 'POST', originalUrl: '/api/user/mfa/setup' }, 'ADMIN'), null);
    assert.equal(mfaEnrollmentBlock({ ...admin, mfaEnabledAt: new Date() }, { method: 'GET', originalUrl: '/api/tasks' }, 'ADMIN'), null);
    assert.equal(mfaEnrollmentBlock({ role: 'EDITOR', mfaEnabledAt: null }, { method: 'GET', originalUrl: '/api/tasks' }, 'ADMIN'), null);
    assert.equal(mfaEnrollmentBlock(admin, { method: 'GET', originalUrl: '/api/tasks' }, ''), null);
});
