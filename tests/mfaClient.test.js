import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    authBlockKind,
    formatTotpSecret,
    normalizeSecondFactorInput,
    recoveryCodesFileText
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

test('el perfil ofrece la verificación en dos pasos y el restablecimiento para administradores', () => {
    const profile = source('src/components/modules/Profile.jsx');
    assert.match(profile, /<MfaSettings/);
    assert.match(profile, /<MfaAdminReset/);
});
