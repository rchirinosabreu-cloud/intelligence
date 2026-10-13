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

// Las seis casillas del código (Rodny, 12 de octubre de 2026): solo dígitos, también al
// pegar «123 456», y el envío automático salta una vez, al completar el último.
export const otpDigits = (value, length = 6) => String(value ?? '').replace(/\D/g, '').slice(0, length);

export const completesOtp = (previous, next, length = 6) =>
    String(next || '').length === length && String(previous || '') !== String(next);

// Dispositivo recordado: el pase de 7 días que entrega el servidor, guardado por cuenta en
// este navegador. Cerrar sesión no lo borra (es justo lo que se quiere recordar); el
// servidor decide si sigue valiendo. Un almacenamiento bloqueado nunca tumba el login.
export const TRUSTED_DEVICE_STORAGE_KEY = 'brain:mfa-trusted-devices';

const accountKey = (email) => String(email || '').trim().toLowerCase();

const readDevices = (storage) => {
    try {
        const parsed = JSON.parse(storage?.getItem(TRUSTED_DEVICE_STORAGE_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const writeDevices = (storage, devices) => {
    try {
        if (Object.keys(devices).length) storage?.setItem(TRUSTED_DEVICE_STORAGE_KEY, JSON.stringify(devices));
        else storage?.removeItem(TRUSTED_DEVICE_STORAGE_KEY);
    } catch (error) {
        console.error('No se pudo guardar el dispositivo recordado:', error?.message || error);
    }
};

export const trustedDeviceFor = (storage, email) => {
    const token = readDevices(storage)[accountKey(email)];
    return typeof token === 'string' && token ? token : null;
};

export const rememberTrustedDevice = (storage, email, token) => {
    if (!accountKey(email) || !token) return;
    writeDevices(storage, { ...readDevices(storage), [accountKey(email)]: token });
};

export const forgetTrustedDevice = (storage, email) => {
    const devices = readDevices(storage);
    if (!(accountKey(email) in devices)) return;
    delete devices[accountKey(email)];
    writeDevices(storage, devices);
};

export const recoveryCodesFileText =(codes, email, date = new Date()) => [
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
