import test from 'node:test';
import assert from 'node:assert/strict';
import {
    base32Decode,
    base32Encode,
    buildOtpauthUri,
    generateRecoveryCodes,
    generateTotpSecret,
    hashRecoveryCode,
    normalizeRecoveryCode,
    totpCode,
    verifyTotp
} from '../src/lib/totp.js';

// Segundo factor con app autenticadora (27 de septiembre de 2026). El código lo calcula
// el teléfono de la persona con el estándar TOTP (RFC 6238); si el servidor lo calcula
// distinto, nadie podría entrar. Por eso las pruebas usan los vectores oficiales del RFC.

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

test('base32 ida y vuelta conserva los bytes', () => {
    const bytes = Buffer.from('12345678901234567890', 'ascii');
    assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.deepEqual(base32Decode(RFC_SECRET), bytes);
    assert.deepEqual(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq'), bytes, 'tolera minúsculas y espacios');
});

test('coincide con los vectores del RFC 6238 (SHA-1, 6 dígitos)', () => {
    const vectors = [
        [59, '287082'],
        [1111111109, '081804'],
        [1111111111, '050471'],
        [1234567890, '005924'],
        [2000000000, '279037']
    ];
    for (const [seconds, expected] of vectors) {
        assert.equal(totpCode(RFC_SECRET, Math.floor(seconds / 30)), expected, `t=${seconds}`);
    }
});

test('acepta el código del paso actual y de un paso a cada lado, no más', () => {
    const now = 1234567890 * 1000;
    const step = Math.floor(1234567890 / 30);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), { now }), step);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), { now }), step - 1);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), { now }), step + 1);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), { now }), null);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), { now }), null);
});

// Sin esto, quien mira el código por encima del hombro lo reutiliza en los 30 segundos.
test('un código ya usado no vuelve a servir', () => {
    const now = 1234567890 * 1000;
    const step = Math.floor(1234567890 / 30);
    const code = totpCode(RFC_SECRET, step);
    assert.equal(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: step }), null);
    assert.equal(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), { now, lastUsedStep: step }), null,
        'tampoco uno anterior al último usado');
});

test('rechaza lo que no es un código de seis dígitos', () => {
    for (const value of ['', null, undefined, '12345', '1234567', 'abcdef', '12 34 56x']) {
        assert.equal(verifyTotp(RFC_SECRET, value, { now: 59_000 }), null, String(value));
    }
    assert.equal(verifyTotp(RFC_SECRET, ' 287 082 ', { now: 59_000 }), 1, 'los espacios del teléfono no molestan');
});

test('los secretos nuevos son de 160 bits y distintos', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    assert.equal(base32Decode(a).length, 20);
    assert.notEqual(a, b);
});

test('la dirección otpauth nombra la plataforma y la cuenta', () => {
    const uri = buildOtpauthUri({ secret: RFC_SECRET, account: 'rodny@brainstudio.co' });
    assert.ok(uri.startsWith('otpauth://totp/Brainstudio%20Intelligence:rodny%40brainstudio.co?'));
    const params = new URL(uri).searchParams;
    assert.equal(params.get('secret'), RFC_SECRET);
    assert.equal(params.get('issuer'), 'Brainstudio Intelligence');
    assert.equal(params.get('digits'), '6');
    assert.equal(params.get('period'), '30');
});

test('los códigos de respaldo son diez, legibles y únicos; se guardan como huella', () => {
    const codes = generateRecoveryCodes();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) assert.match(code, /^[a-z2-9]{5}-[a-z2-9]{5}$/);

    const [first] = codes;
    assert.equal(normalizeRecoveryCode(` ${first.toUpperCase().replace('-', ' ')} `), first.replace('-', ''));
    assert.equal(hashRecoveryCode(first), hashRecoveryCode(first.toUpperCase()));
    assert.notEqual(hashRecoveryCode(first), first);
    assert.match(hashRecoveryCode(first), /^[0-9a-f]{64}$/);
});
