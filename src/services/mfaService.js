import bcrypt from 'bcryptjs';
import {
    buildOtpauthUri,
    generateRecoveryCodes,
    generateTotpSecret,
    hashRecoveryCode,
    verifyTotp
} from '../lib/totp.js';
import { isMfaRequiredForRole } from '../lib/mfaPolicy.js';

// Segundo factor con app autenticadora (27 de septiembre de 2026). El secreto se guarda
// cifrado con ENCRYPTION_KEY (el mismo cifrado de los tokens de integraciones) y los
// códigos de respaldo solo como huella. La base llega por inyección para poder probarlo.

export const MFA_MAX_FAILED_ATTEMPTS = 5;
export const MFA_LOCK_MINUTES = 15;

export class MfaError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const MFA_FIELDS_CLEARED = {
    mfaSecret: null,
    mfaPendingSecret: null,
    mfaEnabledAt: null,
    mfaLastUsedStep: null,
    mfaRecoveryCodes: null,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null
};

const codeInvalid = () => new MfaError(400, 'MFA_CODE_INVALID', 'El código no es válido o ya se usó. Revisa tu app autenticadora e inténtalo de nuevo.');

export const createMfaService = ({ db, encrypt, decrypt, now = () => new Date(), renderQr, requiredRoles }) => {
    const required = (role) => isMfaRequiredForRole(role, requiredRoles === undefined ? process.env.MFA_REQUIRED_ROLES : requiredRoles);

    const loadUser = async (userId) => {
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user) throw new MfaError(404, 'USER_NOT_FOUND', 'No encontramos la cuenta.');
        return user;
    };

    const recoveryList = (user) => (Array.isArray(user.mfaRecoveryCodes) ? user.mfaRecoveryCodes : []);

    const getStatus = async (userId) => {
        const user = await loadUser(userId);
        return {
            enabled: Boolean(user.mfaEnabledAt),
            enabledAt: user.mfaEnabledAt || null,
            required: required(user.role),
            recoveryCodesRemaining: user.mfaEnabledAt ? recoveryList(user).length : 0
        };
    };

    const beginEnrollment = async (userId) => {
        const user = await loadUser(userId);
        if (user.mfaEnabledAt) throw new MfaError(409, 'MFA_ALREADY_ENABLED', 'La verificación en dos pasos ya está activa en tu cuenta.');
        const secret = generateTotpSecret();
        await db.user.update({ where: { id: userId }, data: { mfaPendingSecret: encrypt(secret) } });
        const otpauthUri = buildOtpauthUri({ secret, account: user.email });
        return { secret, otpauthUri, qrDataUrl: await renderQr(otpauthUri) };
    };

    const confirmEnrollment = async (userId, code) => {
        const user = await loadUser(userId);
        if (user.mfaEnabledAt) throw new MfaError(409, 'MFA_ALREADY_ENABLED', 'La verificación en dos pasos ya está activa en tu cuenta.');
        if (!user.mfaPendingSecret) {
            throw new MfaError(409, 'MFA_NO_PENDING_ENROLLMENT', 'Primero genera el código QR para vincular tu app autenticadora.');
        }
        const step = verifyTotp(decrypt(user.mfaPendingSecret), code, { now: now().getTime() });
        if (step === null) throw codeInvalid();

        const recoveryCodes = generateRecoveryCodes();
        const { count } = await db.user.updateMany({
            where: { id: userId, mfaEnabledAt: null, mfaPendingSecret: user.mfaPendingSecret },
            data: {
                mfaSecret: user.mfaPendingSecret,
                mfaPendingSecret: null,
                mfaEnabledAt: now(),
                mfaLastUsedStep: step,
                mfaRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
                mfaFailedAttempts: 0,
                mfaLockedUntil: null
            }
        });
        if (count !== 1) throw new MfaError(409, 'MFA_ENROLLMENT_CHANGED', 'La activación cambió mientras confirmabas. Vuelve a empezar.');
        return { recoveryCodes };
    };

    const registerFailure = async (user) => {
        const attempts = (user.mfaFailedAttempts || 0) + 1;
        if (attempts >= MFA_MAX_FAILED_ATTEMPTS) {
            await db.user.update({
                where: { id: user.id },
                data: { mfaFailedAttempts: 0, mfaLockedUntil: new Date(now().getTime() + MFA_LOCK_MINUTES * 60 * 1000) }
            });
            return new MfaError(429, 'MFA_LOCKED', `Demasiados códigos incorrectos. Espera ${MFA_LOCK_MINUTES} minutos antes de intentarlo otra vez.`);
        }
        await db.user.update({ where: { id: user.id }, data: { mfaFailedAttempts: attempts } });
        return codeInvalid();
    };

    // Acepta el código de seis dígitos de la app o un código de respaldo.
    const verifySecondFactor = async (userId, code) => {
        const user = await loadUser(userId);
        if (!user.mfaEnabledAt || !user.mfaSecret) throw new MfaError(409, 'MFA_NOT_ENABLED', 'La verificación en dos pasos no está activa.');
        if (user.mfaLockedUntil && new Date(user.mfaLockedUntil).getTime() > now().getTime()) {
            throw new MfaError(429, 'MFA_LOCKED', `Demasiados códigos incorrectos. Espera ${MFA_LOCK_MINUTES} minutos antes de intentarlo otra vez.`);
        }

        const step = verifyTotp(decrypt(user.mfaSecret), code, { now: now().getTime(), lastUsedStep: user.mfaLastUsedStep });
        if (step !== null) {
            // La condición sobre el último paso evita que dos peticiones simultáneas usen el mismo código.
            const { count } = await db.user.updateMany({
                where: { id: userId, mfaLastUsedStep: user.mfaLastUsedStep ?? null },
                data: { mfaLastUsedStep: step, mfaFailedAttempts: 0, mfaLockedUntil: null }
            });
            if (count === 1) return { method: 'totp', recoveryCodesRemaining: recoveryList(user).length };
            throw codeInvalid();
        }

        const codes = recoveryList(user);
        const hash = hashRecoveryCode(code);
        if (String(code ?? '').trim() && codes.includes(hash)) {
            const remaining = codes.filter((item) => item !== hash);
            const { count } = await db.user.updateMany({
                where: { id: userId, mfaRecoveryCodes: { equals: codes } },
                data: { mfaRecoveryCodes: remaining, mfaFailedAttempts: 0, mfaLockedUntil: null }
            });
            if (count === 1) return { method: 'recovery', recoveryCodesRemaining: remaining.length };
        }

        throw await registerFailure(user);
    };

    const disable = async (userId, { password, code } = {}) => {
        const user = await loadUser(userId);
        if (!user.mfaEnabledAt) throw new MfaError(409, 'MFA_NOT_ENABLED', 'La verificación en dos pasos no está activa.');
        if (required(user.role)) {
            throw new MfaError(409, 'MFA_REQUIRED_FOR_ROLE', 'Tu rol exige la verificación en dos pasos: no se puede desactivar. Si perdiste el teléfono, pide a un administrador que la restablezca.');
        }
        if (!password || !(await bcrypt.compare(String(password), user.password))) {
            throw new MfaError(400, 'PASSWORD_INVALID', 'La contraseña no es correcta.');
        }
        await verifySecondFactor(userId, code);
        await db.user.update({ where: { id: userId }, data: { ...MFA_FIELDS_CLEARED } });
        return { enabled: false };
    };

    const regenerateRecoveryCodes = async (userId, code) => {
        await verifySecondFactor(userId, code);
        const recoveryCodes = generateRecoveryCodes();
        await db.user.update({ where: { id: userId }, data: { mfaRecoveryCodes: recoveryCodes.map(hashRecoveryCode) } });
        return { recoveryCodes };
    };

    const adminReset = async (requester, targetUserId) => {
        if (requester?.role !== 'ADMIN') throw new MfaError(403, 'FORBIDDEN', 'Solo un administrador puede restablecer la verificación en dos pasos de otra persona.');
        const requesterId = requester.userId || requester.id;
        if (requesterId === targetUserId) {
            throw new MfaError(400, 'USE_SELF_SERVICE', 'Para tu propia cuenta usa la sección de seguridad de tu perfil.');
        }
        await loadUser(targetUserId);
        await db.user.update({
            where: { id: targetUserId },
            data: { ...MFA_FIELDS_CLEARED, sessionVersion: { increment: 1 } }
        });
        return { enabled: false };
    };

    return { getStatus, beginEnrollment, confirmEnrollment, verifySecondFactor, disable, regenerateRecoveryCodes, adminReset, isRequired: required };
};
