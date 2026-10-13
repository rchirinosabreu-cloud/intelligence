import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    authBlockKind,
    completesOtp,
    forgetTrustedDevice,
    formatTotpSecret,
    normalizeSecondFactorInput,
    otpDigits,
    recoveryCodesFileText,
    rememberTrustedDevice,
    TRUSTED_DEVICE_STORAGE_KEY,
    trustedDeviceFor
} from '../src/lib/mfaClient.js';

// Verificación en dos pasos en la pantalla (27 de septiembre de 2026).

test('un 428 se reparte según el código: cambio de contraseña o activar el MFA', () => {
    assert.equal(authBlockKind(428, { code: 'MFA_ENROLLMENT_REQUIRED' }), 'mfa-enrollment');
    assert.equal(authBlockKind(428, { code: 'PASSWORD_CHANGE_REQUIRED' }), 'password-change');
    assert.equal(authBlockKind(428, null), 'password-change', 'sin cuerpo se conserva lo de siempre');
    assert.equal(authBlockKind(403, { code: 'MFA_ENROLLMENT_REQUIRED' }), null);
    assert.equal(authBlockKind(200, {}), null);
});

test('el secreto se muestra en grupos de cuatro para copiarlo a mano', () => {
    assert.equal(formatTotpSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), 'GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ');
    assert.equal(formatTotpSecret(''), '');
});

test('el campo del código acepta seis dígitos o un código de respaldo', () => {
    assert.equal(normalizeSecondFactorInput('12 34 56 7'), '123456');
    assert.equal(normalizeSecondFactorInput('ABCDE-FGHJK'), 'abcde-fghjk');
    assert.equal(normalizeSecondFactorInput('abcde fghjkXYZ'), 'abcde-fghjk');
    assert.equal(normalizeSecondFactorInput('abc'), 'abc');
});

test('las casillas del código solo aceptan seis dígitos, también al pegar', () => {
    assert.equal(otpDigits('123456'), '123456');
    assert.equal(otpDigits('123 456'), '123456');
    assert.equal(otpDigits('12-34-56-78'), '123456');
    assert.equal(otpDigits('a1b2'), '12');
    assert.equal(otpDigits(null), '');
    assert.equal(otpDigits('1234', 4), '1234');
});

test('el envío automático salta una sola vez: al completar el sexto dígito', () => {
    assert.equal(completesOtp('12345', '123456'), true);
    assert.equal(completesOtp('', '123456'), true, 'pegado o autocompletado de una vez');
    assert.equal(completesOtp('123456', '123456'), false, 'sin cambio no se reenvía');
    assert.equal(completesOtp('1234', '12345'), false);
    assert.equal(completesOtp('123456', '12345'), false, 'borrar no envía');
});

const memoryStorage = () => {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key),
        raw: data
    };
};

test('el pase del dispositivo se guarda por cuenta y sobrevive al cierre de sesión', () => {
    const storage = memoryStorage();
    rememberTrustedDevice(storage, ' Rodny@BrainStudio.co ', 'pase-rodny');
    rememberTrustedDevice(storage, 'ana@brainstudio.co', 'pase-ana');
    assert.equal(trustedDeviceFor(storage, 'rodny@brainstudio.co'), 'pase-rodny');
    assert.equal(trustedDeviceFor(storage, 'ANA@brainstudio.co'), 'pase-ana');
    assert.equal(trustedDeviceFor(storage, 'otra@brainstudio.co'), null);

    forgetTrustedDevice(storage, 'rodny@brainstudio.co');
    assert.equal(trustedDeviceFor(storage, 'rodny@brainstudio.co'), null);
    assert.equal(trustedDeviceFor(storage, 'ana@brainstudio.co'), 'pase-ana');

    const auth = source('src/context/AuthContext.jsx');
    assert.doesNotMatch(auth, new RegExp(TRUSTED_DEVICE_STORAGE_KEY), 'cerrar sesión no olvida el dispositivo');
});

test('un almacenamiento roto o bloqueado no tumba el login', () => {
    const broken = memoryStorage();
    broken.setItem(TRUSTED_DEVICE_STORAGE_KEY, '{no es json');
    assert.equal(trustedDeviceFor(broken, 'rodny@brainstudio.co'), null);
    rememberTrustedDevice(broken, 'rodny@brainstudio.co', 'pase');
    assert.equal(trustedDeviceFor(broken, 'rodny@brainstudio.co'), 'pase');

    const blocked = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } };
    assert.equal(trustedDeviceFor(blocked, 'rodny@brainstudio.co'), null);
    assert.doesNotThrow(() => rememberTrustedDevice(blocked, 'rodny@brainstudio.co', 'pase'));
    assert.doesNotThrow(() => forgetTrustedDevice(blocked, 'rodny@brainstudio.co'));
    assert.equal(trustedDeviceFor(null, 'rodny@brainstudio.co'), null);
});

test('el archivo de códigos de respaldo dice de qué cuenta son y cómo se usan', () => {
    const text = recoveryCodesFileText(['aaaaa-bbbbb', 'ccccc-ddddd'], 'rodny@brainstudio.co', new Date('2026-09-27T15:00:00Z'));
    assert.match(text, /Brainstudio Intelligence/);
    assert.match(text, /rodny@brainstudio\.co/);
    assert.match(text, /aaaaa-bbbbb\n/);
    assert.match(text, /una sola vez/);
});

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('los dos interceptores distinguen el 428 del MFA del de la contraseña', () => {
    const main = source('src/main.jsx');
    assert.match(main, /authBlockKind\(/);
    assert.match(main, /mfa-enrollment-required/);
    assert.match(main, /\/activar-verificacion/);
    assert.ok((main.match(/authBlockKind\(/g) || []).length >= 2, 'axios y fetch');
});

test('la aplicación encierra en la activación a quien la tiene pendiente', () => {
    const app = source('src/App.jsx');
    assert.match(app, /currentUser\?\.mfaEnrollmentRequired/);
    assert.match(app, /path="\/activar-verificacion"/);
    const auth = source('src/context/AuthContext.jsx');
    assert.match(auth, /mfa-enrollment-required/);
    assert.match(auth, /updateCurrentUser/);
});

test('el login pide el código con el pase y nunca guarda sesión sin token', () => {
    const login = source('src/components/Login.jsx');
    assert.match(login, /data\.mfaRequired/);
    assert.match(login, /\/api\/login\/mfa/);
    assert.match(login, /challengeToken/);
});

test('el código de la app se escribe en seis casillas y entra solo al completar el último dígito', () => {
    const otp = source('src/components/ui/OtpCodeInput.jsx');
    assert.match(otp, /autoComplete="one-time-code"/, 'el teléfono puede sugerir el código');
    assert.match(otp, /inputMode="numeric"/, 'teclado numérico en el celular');
    assert.match(otp, /otpDigits\(/);
    assert.match(otp, /completesOtp\(/);
    assert.match(otp, /onComplete/);
    assert.match(otp, /dark:/, 'claro y oscuro');

    const login = source('src/components/Login.jsx');
    assert.match(login, /<OtpCodeInput[\s\S]*?onComplete=/);
    assert.match(login, /Usar un código de respaldo/, 'el respaldo sigue disponible');
    const enrollment = source('src/components/security/MfaEnrollment.jsx');
    assert.match(enrollment, /<OtpCodeInput[\s\S]*?onComplete=/);
    const settings = source('src/components/security/MfaSettings.jsx');
    assert.match(settings, /<OtpCodeInput[\s\S]*?onComplete=/);
    assert.match(settings, /Usar un código de respaldo/);
});

test('el login recuerda el dispositivo una semana y lo manda con la contraseña', () => {
    const login = source('src/components/Login.jsx');
    assert.match(login, /Recordar este dispositivo por 7 días/);
    assert.match(login, /rememberDevice/);
    assert.match(login, /trustedDeviceFor\(/);
    assert.match(login, /rememberTrustedDevice\(/);
    assert.match(login, /trustedDevice:/, 'el pase viaja con la contraseña');
    const controller = source('src/controllers/authController.js');
    assert.match(controller, /respondAfterPassword\(user, res, \{ trustedDevice: req\.body\?\.trustedDevice \}\)/);
});

test('el perfil ofrece la verificación en dos pasos y el restablecimiento para administradores', () => {
    const profile = source('src/components/modules/Profile.jsx');
    assert.match(profile, /<MfaSettings/);
    assert.match(profile, /<MfaAdminReset/);
});
