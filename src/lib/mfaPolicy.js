import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';

// Segundo factor (27 de septiembre de 2026): qué roles lo tienen obligatorio y el pase
// intermedio entre «contraseña correcta» y «código correcto».

// MFA_REQUIRED_ROLES=ADMIN,PROJECT_MANAGER. Sin la variable no se obliga a nadie: la
// obligación se enciende en Railway cuando las personas de ese rol ya lo activaron.
export const isMfaRequiredForRole = (role, requiredRoles = process.env.MFA_REQUIRED_ROLES) => {
    const roles = String(requiredRoles || '')
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
    return roles.includes(String(role || '').toUpperCase());
};

// Lo único que puede hacer alguien a quien le falta activar el MFA obligatorio.
export const isMfaEnrollmentRoute = (method, url) => {
    const path = String(url || '').split('?')[0];
    const verb = String(method || '').toUpperCase();
    if (verb === 'GET' && (path === '/api/user/mfa' || path === '/api/auth/me')) return true;
    return verb === 'POST' && (path === '/api/user/mfa/setup' || path === '/api/user/mfa/confirm');
};

// El guardián del middleware: devuelve el 428 que corresponde o null si la petición sigue.
export const mfaEnrollmentBlock = (dbUser, req, requiredRoles = process.env.MFA_REQUIRED_ROLES) => {
    if (!dbUser || dbUser.mfaEnabledAt || !isMfaRequiredForRole(dbUser.role, requiredRoles)) return null;
    if (isMfaEnrollmentRoute(req.method, req.originalUrl)) return null;
    return {
        error: 'MFA enrollment required',
        message: 'Tu rol exige activar la verificación en dos pasos para continuar.',
        code: 'MFA_ENROLLMENT_REQUIRED'
    };
};

const CHALLENGE_PURPOSE = 'mfa-challenge';
export const MFA_CHALLENGE_TTL = '5m';

// Clave derivada: un pase firmado así no verifica con la clave de sesión, así que no hay
// forma de usarlo como token aunque lleve el id de la persona.
const challengeKey = (secret) => createHmac('sha256', secret).update(CHALLENGE_PURPOSE).digest();

export const signMfaChallenge = ({ userId, sessionVersion }, secret, { expiresIn = MFA_CHALLENGE_TTL } = {}) =>
    jwt.sign({ sub: userId, sv: sessionVersion ?? 0, purpose: CHALLENGE_PURPOSE }, challengeKey(secret), { expiresIn });

export const verifyMfaChallenge = (token, secret) => {
    try {
        const payload = jwt.verify(String(token || ''), challengeKey(secret));
        if (payload?.purpose !== CHALLENGE_PURPOSE || !payload.sub) return null;
        return { userId: payload.sub, sessionVersion: payload.sv ?? 0 };
    } catch {
        return null;
    }
};

// Dispositivo recordado (Rodny, 12 de octubre de 2026: «una vez por semana podría ser y,
// por supuesto, cada ingreso desde un dispositivo nuevo lo solicitaría también»). Tras un
// código correcto, el navegador guarda este pase y lo manda con la contraseña: durante 7
// días la contraseña basta en ese dispositivo. La contraseña se sigue pidiendo siempre.
// El pase muere solo al cambiar la contraseña, cerrar todas las sesiones o restablecer el
// MFA (`sessionVersion`), y al desactivar y volver a vincular la app (`mfaEnabledAt`).
const TRUSTED_DEVICE_PURPOSE = 'mfa-trusted-device';
export const TRUSTED_DEVICE_DAYS = 7;

const trustedDeviceKey = (secret) => createHmac('sha256', secret).update(TRUSTED_DEVICE_PURPOSE).digest();
const enabledStamp = (value) => (value ? new Date(value).getTime() : null);

export const signTrustedDevice = (user, secret, { expiresIn = `${TRUSTED_DEVICE_DAYS}d` } = {}) => jwt.sign(
    { sub: user.id, sv: user.sessionVersion ?? 0, mfa: enabledStamp(user.mfaEnabledAt), purpose: TRUSTED_DEVICE_PURPOSE },
    trustedDeviceKey(secret),
    { expiresIn }
);

export const isTrustedDevice = (token, user, secret) => {
    if (!token || !user?.mfaEnabledAt) return false;
    try {
        const payload = jwt.verify(String(token), trustedDeviceKey(secret));
        return payload?.purpose === TRUSTED_DEVICE_PURPOSE
            && payload.sub === user.id
            && payload.sv === (user.sessionVersion ?? 0)
            && payload.mfa === enabledStamp(user.mfaEnabledAt);
    } catch {
        return false;
    }
};
