// Verificación en dos pasos en la pantalla (27 de septiembre de 2026): reglas puras que
// comparten los interceptores, el login y los formularios.

// El servidor responde 428 por dos motivos distintos; solo el código dice cuál.
export const authBlockKind = (status, body) => {
    if (status !== 428) return null;
    return body?.code === 'MFA_ENROLLMENT_REQUIRED' ? 'mfa-enrollment' : 'password-change';
};

export const formatTotpSecret = (secret) => String(secret || '').replace(/(.{4})(?=.)/g, '$1 ');

// Seis dígitos de la app, o un código de respaldo («abcde-fghjk»).
export const normalizeSecondFactorInput = (value) => {
    const raw = String(value || '');
    if (/^[\d\s]*$/.test(raw)) return raw.replace(/\D/g, '').slice(0, 6);
    const chars = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
    return chars.length > 5 ? `${chars.slice(0, 5)}-${chars.slice(5)}` : chars;
};

export const recoveryCodesFileText = (codes, email, date = new Date()) => [
    'Brainstudio Intelligence · Códigos de respaldo de la verificación en dos pasos',
    `Cuenta: ${email || ''}`,
    `Generados: ${date.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
    '',
    'Cada código sirve una sola vez para entrar si no tienes tu teléfono.',
    'Guárdalos en un lugar seguro y no los compartas.',
    '',
    ...codes,
    ''
].join('\n');
