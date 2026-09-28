import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';

// Segundo factor con app autenticadora (27 de septiembre de 2026): TOTP según el RFC 6238
// (HMAC-SHA1, 6 dígitos, pasos de 30 s), lo que calculan Google Authenticator, Microsoft
// Authenticator, 1Password y compañía. Se implementa aquí, sin dependencia, porque son
// veinte líneas y las pruebas lo comprueban contra los vectores oficiales del RFC.

export const TOTP_ISSUER = 'Brainstudio Intelligence';
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// Sin i, l, o, 0 ni 1: la persona los copia a mano de un papel.
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const base32Encode = (buffer) => {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
};

export const base32Decode = (text) => {
    const clean = String(text || '').toUpperCase().replace(/[\s=-]/g, '');
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of clean) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) throw new Error('Secreto TOTP inválido');
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
};

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export const totpCode = (secret, step) => {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
    return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
};

const safeEqual = (a, b) => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
};

// Devuelve el paso que coincidió (para guardarlo y que el código no se reutilice) o null.
// Acepta un paso a cada lado por la deriva del reloj del teléfono.
export const verifyTotp = (secret, code, { now = Date.now(), window = 1, lastUsedStep = null } = {}) => {
    const clean = String(code ?? '').replace(/\s/g, '');
    if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(clean)) return null;
    const current = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
    for (let step = current - window; step <= current + window; step += 1) {
        if (lastUsedStep !== null && lastUsedStep !== undefined && step <= lastUsedStep) continue;
        if (safeEqual(totpCode(secret, step), clean)) return step;
    }
    return null;
};

export const buildOtpauthUri = ({ secret, account, issuer = TOTP_ISSUER }) => {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
    const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: String(TOTP_DIGITS),
        period: String(TOTP_PERIOD_SECONDS)
    });
    return `otpauth://totp/${label}?${params.toString()}`;
};

const randomChunk = (length) => Array.from({ length }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');

export const generateRecoveryCodes = (count = 10) => {
    const codes = new Set();
    while (codes.size < count) codes.add(`${randomChunk(5)}-${randomChunk(5)}`);
    return [...codes];
};

export const normalizeRecoveryCode = (code) => String(code ?? '').toLowerCase().replace(/[\s-]/g, '');

// Los códigos de respaldo tienen unos 50 bits de azar: basta una huella SHA-256 para no
// guardarlos en claro.
export const hashRecoveryCode = (code) => createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
