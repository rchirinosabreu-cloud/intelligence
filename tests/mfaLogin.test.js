import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createMfaLoginHandlers } from '../src/controllers/mfaLoginController.js';
import { mfaEnrollmentBlock, signMfaChallenge } from '../src/lib/mfaPolicy.js';
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

test('guardián: un rol obligado sin MFA solo puede activarlo', () => {
    const admin = { role: 'ADMIN', mfaEnabledAt: null };
    assert.equal(mfaEnrollmentBlock(admin, { method: 'GET', originalUrl: '/api/tasks' }, 'ADMIN')?.code, 'MFA_ENROLLMENT_REQUIRED');
    assert.equal(mfaEnrollmentBlock(admin, { method: 'POST', originalUrl: '/api/user/mfa/setup' }, 'ADMIN'), null);
    assert.equal(mfaEnrollmentBlock({ ...admin, mfaEnabledAt: new Date() }, { method: 'GET', originalUrl: '/api/tasks' }, 'ADMIN'), null);
    assert.equal(mfaEnrollmentBlock({ role: 'EDITOR', mfaEnabledAt: null }, { method: 'GET', originalUrl: '/api/tasks' }, 'ADMIN'), null);
    assert.equal(mfaEnrollmentBlock(admin, { method: 'GET', originalUrl: '/api/tasks' }, ''), null);
});
