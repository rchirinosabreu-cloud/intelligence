import jwt from 'jsonwebtoken';
import { isActiveTeamUser } from '../services/teamRosterService.js';
import {
    isMfaRequiredForRole,
    isTrustedDevice,
    signMfaChallenge,
    signTrustedDevice,
    verifyMfaChallenge
} from '../lib/mfaPolicy.js';
import { MfaError } from '../services/mfaService.js';

// Inicio de sesión en dos pasos (27 de septiembre de 2026). Con el MFA activo, la
// contraseña correcta solo entrega un pase de cinco minutos; la sesión llega con el código.
// Dependencias inyectadas para poder probarlo sin base de datos.

const sessionUser = (user, requiredRoles) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasFinancialAccess: user.hasFinancialAccess,
    financialRole: user.financialRole,
    modulePermissions: user.modulePermissions,
    mustChangePassword: user.mustChangePassword,
    sessionVersion: user.sessionVersion,
    mfaEnabled: Boolean(user.mfaEnabledAt),
    mfaEnrollmentRequired: !user.mfaEnabledAt && isMfaRequiredForRole(user.role, requiredRoles)
});

const METHOD_TRACE = { totp: 'PASSWORD_TOTP', recovery: 'PASSWORD_RECOVERY_CODE' };

const challengeInvalid = (res) => res.status(401).json({
    code: 'MFA_CHALLENGE_INVALID',
    message: 'La verificación venció o ya no es válida. Ingresa de nuevo tu correo y contraseña.'
});

export const createMfaLoginHandlers = ({ db, mfa, jwtSecret, expiresIn, trace, requiredRoles }) => {
    const roles = () => (requiredRoles === undefined ? process.env.MFA_REQUIRED_ROLES : requiredRoles);

    const issueSession = async (user, res, { method, amr, extra = {} }) => {
        const token = jwt.sign(
            {
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                hasFinancialAccess: user.hasFinancialAccess,
                financialRole: user.financialRole,
                modulePermissions: user.modulePermissions,
                sessionVersion: user.sessionVersion,
                amr
            },
            jwtSecret,
            { expiresIn }
        );
        await trace({
            eventType: 'SESSION_STARTED',
            actorId: user.id,
            subjectUserId: user.id,
            metadata: { method }
        }).catch((error) => console.error('[Auth] Login trace failed:', error?.message || error));
        return res.json({ token, user: sessionUser(user, roles()), ...extra });
    };

    // Se llama cuando la contraseña ya se comprobó. Desde un dispositivo recordado
    // (`trustedDevice`, 7 días) la contraseña basta; desde uno nuevo se pide el código.
    const respondAfterPassword = async (user, res, { trustedDevice } = {}) => {
        if (user.mfaEnabledAt && isTrustedDevice(trustedDevice, user, jwtSecret)) {
            return issueSession(user, res, { method: 'PASSWORD_TRUSTED_DEVICE', amr: ['pwd', 'device'] });
        }
        if (user.mfaEnabledAt) {
            return res.json({
                mfaRequired: true,
                challengeToken: signMfaChallenge({ userId: user.id, sessionVersion: user.sessionVersion }, jwtSecret)
            });
        }
        return issueSession(user, res, { method: 'PASSWORD', amr: ['pwd'] });
    };

    const verifyLogin = async (req, res) => {
        const challenge = verifyMfaChallenge(req.body?.challengeToken, jwtSecret);
        if (!challenge) return challengeInvalid(res);

        const user = await db.user.findUnique({
            where: { id: challenge.userId },
            include: { teamMember: { select: { isActive: true } } }
        });
        if (!user || user.isActive === false || !isActiveTeamUser(user)
            || (user.sessionVersion ?? 0) !== challenge.sessionVersion || !user.mfaEnabledAt) {
            return challengeInvalid(res);
        }

        try {
            const result = await mfa.verifySecondFactor(user.id, req.body?.code);
            const extra = result.method === 'recovery' ? { recoveryCodesRemaining: result.recoveryCodesRemaining } : {};
            // Solo un `true` de verdad: «recordar» no se activa por un valor que parezca sí.
            if (req.body?.rememberDevice === true) extra.trustedDeviceToken = signTrustedDevice(user, jwtSecret);
            return issueSession(user, res, {
                method: METHOD_TRACE[result.method] || 'PASSWORD_MFA',
                amr: ['pwd', 'otp'],
                extra
            });
        } catch (error) {
            if (error instanceof MfaError) return res.status(error.status).json({ code: error.code, message: error.message });
            throw error;
        }
    };

    return { respondAfterPassword, verifyLogin };
};
