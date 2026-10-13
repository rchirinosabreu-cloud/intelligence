import jwt from 'jsonwebtoken';
import { createRateLimiter } from '../config/security.js';

// Intentos de ingreso (Rodny, 13 de octubre de 2026). Antes eran 20 intentos cada 15
// minutos por conexión: toda la oficina sale a internet por la misma, así que compartía el
// cupo, y con la verificación en dos pasos obligatoria cada ingreso cuenta dos veces (la
// contraseña y el código). El primer día el equipo entero quedó afuera con un 429.
//
// Ahora hay dos topes. Cada persona tiene su cupo en cada conexión, y la contraseña, el
// código y la recuperación se cuentan aparte: equivocarse de clave no bloquea a nadie más.
// La conexión entera tiene un tope alto para frenar a quien pruebe muchas cuentas. El código
// de seis dígitos conserva además su propio bloqueo: cinco fallos y la cuenta espera 15
// minutos (`mfaService`). Los contadores viven en memoria: un despliegue los pone en cero.

export const AUTH_WINDOW_MS = 15 * 60 * 1000;
export const AUTH_MAX_PER_ACCOUNT = 10;
export const AUTH_MAX_PER_NETWORK = 100;

const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const normalizedEmail = (value) => String(value || '').trim().toLowerCase();

// Quién intenta entrar, sin confiar en nada: el pase del código solo se lee para agrupar,
// nunca para autorizar (eso lo hace el controlador verificando la firma).
const challengeSubject = (token) => {
    try {
        const payload = jwt.decode(String(token || ''));
        return typeof payload?.sub === 'string' && payload.sub ? payload.sub : 'sin-pase';
    } catch {
        return 'sin-pase';
    }
};

const doorOf = (req) => {
    const path = String(req.originalUrl || req.path || '').split('?')[0];
    if (path.startsWith('/api/login/mfa')) return 'codigo';
    if (path.startsWith('/api/password-reset')) return 'recuperacion';
    return 'contrasena';
};

export const authAttemptKey = (req) => {
    const door = doorOf(req);
    const who = door === 'codigo' ? challengeSubject(req.body?.challengeToken) : normalizedEmail(req.body?.email) || 'sin-correo';
    return `auth:${door}:${clientIp(req)}:${who}`;
};

export const authLimitMessage = (retryAfterSeconds) => {
    const seconds = Number(retryAfterSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return `Demasiados intentos. Espera ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} e intenta de nuevo.`;
};

const respondLimited = (_req, res) => res.status(429).json({
    error: 'Too many requests',
    code: 'AUTH_RATE_LIMITED',
    message: authLimitMessage(res.getHeader?.('Retry-After'))
});

// Va después de `express.json`: necesita el correo o el pase del cuerpo.
export const createAuthRateLimiters = ({ now = Date.now } = {}) => [
    createRateLimiter({
        windowMs: AUTH_WINDOW_MS,
        max: AUTH_MAX_PER_NETWORK,
        now,
        keyGenerator: (req) => `auth:red:${clientIp(req)}`,
        onLimit: respondLimited
    }),
    createRateLimiter({
        windowMs: AUTH_WINDOW_MS,
        max: AUTH_MAX_PER_ACCOUNT,
        now,
        keyGenerator: authAttemptKey,
        onLimit: respondLimited
    })
];
