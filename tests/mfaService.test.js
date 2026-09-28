import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createMfaService, MfaError, MFA_MAX_FAILED_ATTEMPTS } from '../src/services/mfaService.js';
import { hashRecoveryCode, totpCode, TOTP_PERIOD_SECONDS } from '../src/lib/totp.js';
import {
    isMfaEnrollmentRoute,
    isMfaRequiredForRole,
    signMfaChallenge,
    verifyMfaChallenge
} from '../src/lib/mfaPolicy.js';

// Segundo factor (27 de septiembre de 2026). El servicio recibe la base por inyección, así
// que estas pruebas usan una tabla en memoria con la misma forma que Prisma.

const SECRET = 'x'.repeat(40);
const fakeEncrypt = (text) => `enc:${text}`;
const fakeDecrypt = (text) => text.replace(/^enc:/, '');

const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'equals' in value) return JSON.stringify(row[key]) === JSON.stringify(value.equals);
    return (row[key] ?? null) === value;
});

const makeDb = (initial) => {
    const rows = new Map(initial.map((row) => [row.id, { ...row }]));
    const apply = (row, data) => {
        for (const [key, value] of Object.entries(data)) {
            row[key] = value && typeof value === 'object' && 'increment' in value ? (row[key] || 0) + value.increment : value;
        }
    };
    return {
        rows,
        user: {
            findUnique: async ({ where }) => (rows.has(where.id) ? { ...rows.get(where.id) } : null),
            update: async ({ where, data }) => { const row = rows.get(where.id); apply(row, data); return { ...row }; },
            updateMany: async ({ where, data }) => {
                const row = rows.get(where.id);
                if (!row || !matches(row, where)) return { count: 0 };
                apply(row, data);
                return { count: 1 };
            }
        }
    };
};

const baseUser = async (extra = {}) => ({
    id: 'u1',
    email: 'rodny@brainstudio.co',
    role: 'ADMIN',
    password: await bcrypt.hash('clave-segura', 4),
    sessionVersion: 3,
    mfaSecret: null,
    mfaPendingSecret: null,
    mfaEnabledAt: null,
    mfaLastUsedStep: null,
    mfaRecoveryCodes: null,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    ...extra
});

const setup = async (extra, { clock = 1_800_000_000_000, requiredRoles = '' } = {}) => {
    const db = makeDb([await baseUser(extra), await baseUser({ id: 'u2', email: 'ana@brainstudio.co', role: 'EDITOR' })]);
    const time = { now: clock };
    const service = createMfaService({
        db,
        encrypt: fakeEncrypt,
        decrypt: fakeDecrypt,
        now: () => new Date(time.now),
        renderQr: async (uri) => `data:image/png;base64,${Buffer.from(uri).toString('base64')}`,
        requiredRoles
    });
    const codeAt = (secret, offsetSteps = 0) => totpCode(secret, Math.floor(time.now / 1000 / TOTP_PERIOD_SECONDS) + offsetSteps);
    return { db, service, time, codeAt };
};

const expectMfaError = async (promise, code) => {
    await assert.rejects(promise, (error) => {
        assert.ok(error instanceof MfaError, `esperaba MfaError, llegó ${error}`);
        assert.equal(error.code, code);
        return true;
    });
};

const enroll = async (ctx) => {
    const { secret } = await ctx.service.beginEnrollment('u1');
    const { recoveryCodes } = await ctx.service.confirmEnrollment('u1', ctx.codeAt(secret));
    ctx.time.now += TOTP_PERIOD_SECONDS * 1000; // el siguiente código ya es otro
    return { secret, recoveryCodes };
};

test('activar: el secreto queda pendiente y cifrado hasta confirmar con un código', async () => {
    const ctx = await setup();
    const started = await ctx.service.beginEnrollment('u1');

    assert.match(started.secret, /^[A-Z2-7]{32}$/);
    assert.ok(started.otpauthUri.includes(encodeURIComponent('rodny@brainstudio.co')));
    assert.ok(started.qrDataUrl.startsWith('data:image/png;base64,'));
    const row = ctx.db.rows.get('u1');
    assert.equal(row.mfaPendingSecret, `enc:${started.secret}`, 'nunca en claro');
    assert.equal(row.mfaSecret, null);
    assert.equal(row.mfaEnabledAt, null, 'empezar no activa nada');

    await expectMfaError(ctx.service.confirmEnrollment('u1', '000000'), 'MFA_CODE_INVALID');
    assert.equal(ctx.db.rows.get('u1').mfaEnabledAt, null);

    const { recoveryCodes } = await ctx.service.confirmEnrollment('u1', ctx.codeAt(started.secret));
    const enabled = ctx.db.rows.get('u1');
    assert.ok(enabled.mfaEnabledAt instanceof Date);
    assert.equal(enabled.mfaSecret, `enc:${started.secret}`);
    assert.equal(enabled.mfaPendingSecret, null);
    assert.equal(recoveryCodes.length, 10);
    assert.deepEqual(enabled.mfaRecoveryCodes, recoveryCodes.map(hashRecoveryCode), 'solo huellas');
});

test('no se puede empezar otra activación con el MFA ya activo', async () => {
    const ctx = await setup();
    await enroll(ctx);
    await expectMfaError(ctx.service.beginEnrollment('u1'), 'MFA_ALREADY_ENABLED');
    await expectMfaError(ctx.service.confirmEnrollment('u2', '123456'), 'MFA_NO_PENDING_ENROLLMENT');
});

test('verificar: el código vale una sola vez', async () => {
    const ctx = await setup();
    const { secret } = await enroll(ctx);
    const code = ctx.codeAt(secret);

    assert.deepEqual(await ctx.service.verifySecondFactor('u1', code), { method: 'totp', recoveryCodesRemaining: 10 });
    await expectMfaError(ctx.service.verifySecondFactor('u1', code), 'MFA_CODE_INVALID');
});

test('un código de respaldo sirve una vez y se descuenta', async () => {
    const ctx = await setup();
    const { recoveryCodes } = await enroll(ctx);

    const result = await ctx.service.verifySecondFactor('u1', recoveryCodes[3].toUpperCase());
    assert.deepEqual(result, { method: 'recovery', recoveryCodesRemaining: 9 });
    await expectMfaError(ctx.service.verifySecondFactor('u1', recoveryCodes[3]), 'MFA_CODE_INVALID');
});

test(`tras ${MFA_MAX_FAILED_ATTEMPTS} fallos seguidos la cuenta espera 15 minutos, aunque luego acierte`, async () => {
    const ctx = await setup();
    const { secret } = await enroll(ctx);

    for (let i = 1; i < MFA_MAX_FAILED_ATTEMPTS; i += 1) {
        await expectMfaError(ctx.service.verifySecondFactor('u1', '000000'), 'MFA_CODE_INVALID');
    }
    await expectMfaError(ctx.service.verifySecondFactor('u1', '000000'), 'MFA_LOCKED');
    await expectMfaError(ctx.service.verifySecondFactor('u1', ctx.codeAt(secret)), 'MFA_LOCKED');

    ctx.time.now += 15 * 60 * 1000 + 1;
    const ok = await ctx.service.verifySecondFactor('u1', ctx.codeAt(secret));
    assert.equal(ok.method, 'totp');
    assert.equal(ctx.db.rows.get('u1').mfaFailedAttempts, 0, 'un acierto limpia el contador');
});

test('desactivar exige la contraseña y un código, y lo borra todo', async () => {
    const ctx = await setup({ role: 'EDITOR' });
    const { secret } = await enroll(ctx);

    await expectMfaError(ctx.service.disable('u1', { password: 'otra', code: ctx.codeAt(secret) }), 'PASSWORD_INVALID');
    await ctx.service.disable('u1', { password: 'clave-segura', code: ctx.codeAt(secret) });

    const row = ctx.db.rows.get('u1');
    for (const key of ['mfaSecret', 'mfaPendingSecret', 'mfaEnabledAt', 'mfaRecoveryCodes', 'mfaLastUsedStep']) {
        assert.equal(row[key], null, key);
    }
});

test('un rol con MFA obligatorio no puede quitárselo', async () => {
    const ctx = await setup({}, { requiredRoles: 'ADMIN' });
    const { secret } = await enroll(ctx);
    await expectMfaError(ctx.service.disable('u1', { password: 'clave-segura', code: ctx.codeAt(secret) }), 'MFA_REQUIRED_FOR_ROLE');
    assert.ok(ctx.db.rows.get('u1').mfaEnabledAt);
});

test('regenerar códigos de respaldo invalida los anteriores', async () => {
    const ctx = await setup();
    const { secret, recoveryCodes } = await enroll(ctx);
    const { recoveryCodes: fresh } = await ctx.service.regenerateRecoveryCodes('u1', ctx.codeAt(secret));

    assert.equal(fresh.length, 10);
    await expectMfaError(ctx.service.verifySecondFactor('u1', recoveryCodes[0]), 'MFA_CODE_INVALID');
    assert.equal((await ctx.service.verifySecondFactor('u1', fresh[0])).method, 'recovery');
});

// Teléfono perdido: un administrador lo restablece y las sesiones abiertas de esa persona
// se cierran, por si el teléfono lo tiene otra persona.
test('un administrador restablece el MFA de otra persona y le cierra las sesiones', async () => {
    const ctx = await setup({ id: 'u1', role: 'ADMIN' });
    const target = ctx.db.rows.get('u2');
    Object.assign(target, { mfaSecret: 'enc:ABC', mfaEnabledAt: new Date(), mfaRecoveryCodes: ['h'] });

    await expectMfaError(ctx.service.adminReset({ userId: 'u2', role: 'EDITOR' }, 'u1'), 'FORBIDDEN');
    await expectMfaError(ctx.service.adminReset({ userId: 'u1', role: 'ADMIN' }, 'u1'), 'USE_SELF_SERVICE');

    await ctx.service.adminReset({ userId: 'u1', role: 'ADMIN' }, 'u2');
    assert.equal(target.mfaEnabledAt, null);
    assert.equal(target.mfaSecret, null);
    assert.equal(target.sessionVersion, 4);
});

test('el estado dice si está activo, si es obligatorio y cuántos códigos quedan, nunca el secreto', async () => {
    const ctx = await setup({}, { requiredRoles: 'ADMIN' });
    assert.deepEqual(await ctx.service.getStatus('u1'), {
        enabled: false, enabledAt: null, required: true, recoveryCodesRemaining: 0
    });
    await enroll(ctx);
    const status = await ctx.service.getStatus('u1');
    assert.equal(status.enabled, true);
    assert.equal(status.recoveryCodesRemaining, 10);
    assert.equal(JSON.stringify(status).includes('enc:'), false);
});

test('política: roles obligatorios desde MFA_REQUIRED_ROLES', () => {
    assert.equal(isMfaRequiredForRole('ADMIN', 'ADMIN, project_manager'), true);
    assert.equal(isMfaRequiredForRole('PROJECT_MANAGER', 'ADMIN, project_manager'), true);
    assert.equal(isMfaRequiredForRole('EDITOR', 'ADMIN'), false);
    assert.equal(isMfaRequiredForRole('ADMIN', ''), false, 'sin variable no se obliga a nadie');
    assert.equal(isMfaRequiredForRole('ADMIN', undefined), false);
});

test('mientras falta activar el MFA solo se abren las rutas para activarlo', () => {
    assert.equal(isMfaEnrollmentRoute('GET', '/api/user/mfa'), true);
    assert.equal(isMfaEnrollmentRoute('POST', '/api/user/mfa/setup'), true);
    assert.equal(isMfaEnrollmentRoute('POST', '/api/user/mfa/confirm'), true);
    assert.equal(isMfaEnrollmentRoute('GET', '/api/auth/me'), true);
    assert.equal(isMfaEnrollmentRoute('GET', '/api/tasks'), false);
    assert.equal(isMfaEnrollmentRoute('DELETE', '/api/user/mfa'), false, 'desactivar no es activar');
});

// El pase intermedio (contraseña correcta, falta el código) no puede servir como sesión.
test('el pase de verificación dura minutos, lleva la versión de sesión y no es un token de sesión', () => {
    const challenge = signMfaChallenge({ userId: 'u1', sessionVersion: 3 }, SECRET);
    assert.deepEqual(verifyMfaChallenge(challenge, SECRET), { userId: 'u1', sessionVersion: 3 });
    assert.throws(() => jwt.verify(challenge, SECRET), 'con la clave de sesión no verifica');

    const session = jwt.sign({ userId: 'u1', sessionVersion: 3 }, SECRET);
    assert.equal(verifyMfaChallenge(session, SECRET), null, 'y un token de sesión no sirve de pase');
    assert.equal(verifyMfaChallenge('basura', SECRET), null);

    const expired = signMfaChallenge({ userId: 'u1', sessionVersion: 3 }, SECRET, { expiresIn: -1 });
    assert.equal(verifyMfaChallenge(expired, SECRET), null);
});
