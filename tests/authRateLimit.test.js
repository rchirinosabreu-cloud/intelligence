import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import {
    AUTH_MAX_PER_ACCOUNT,
    AUTH_MAX_PER_NETWORK,
    AUTH_WINDOW_MS,
    authAttemptKey,
    authLimitMessage,
    createAuthRateLimiters
} from '../src/lib/authRateLimit.js';

// Intentos de ingreso (Rodny, 13 de octubre de 2026): el límite era de 20 intentos cada 15
// minutos por conexión, así que toda la oficina compartía el cupo; con la verificación en dos
// pasos obligatoria cada ingreso cuenta dos veces y el equipo quedó afuera con un 429.

const req = (path, body = {}, ip = '190.0.0.1') => ({ ip, path, originalUrl: path, body });
const res = () => {
    const r = { statusCode: 200, headers: {}, body: null };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.getHeader = (k) => r.headers[k];
    r.status = (code) => { r.statusCode = code; return r; };
    r.json = (body) => { r.body = body; return r; };
    return r;
};
const run = (limiters, request) => {
    const response = res();
    let passed = false;
    const chain = [...limiters];
    const next = () => { const fn = chain.shift(); if (fn) fn(request, response, next); else passed = true; };
    next();
    return { passed, response };
};

test('cada persona tiene su cupo: los intentos de una no bloquean a otra en la misma oficina', () => {
    const limiters = createAuthRateLimiters();
    for (let i = 0; i < AUTH_MAX_PER_ACCOUNT; i += 1) {
        assert.equal(run(limiters, req('/api/login', { email: 'mariceth@brainstudio.co' })).passed, true);
    }
    const blocked = run(limiters, req('/api/login', { email: 'mariceth@brainstudio.co' }));
    assert.equal(blocked.passed, false);
    assert.equal(blocked.response.statusCode, 429);
    assert.equal(blocked.response.body.code, 'AUTH_RATE_LIMITED');

    assert.equal(run(limiters, req('/api/login', { email: 'rodny@brainstudio.co' })).passed, true, 'Rodny entra igual');
    assert.equal(run(limiters, req('/api/login', { email: 'mariceth@brainstudio.co' }, '181.0.0.9')).passed, true, 'otra conexión, otro cupo');
});

test('el correo cuenta igual con mayúsculas o espacios', () => {
    assert.equal(authAttemptKey(req('/api/login', { email: ' Rodny@BrainStudio.co ' })), authAttemptKey(req('/api/login', { email: 'rodny@brainstudio.co' })));
    assert.notEqual(authAttemptKey(req('/api/login', { email: 'a@x.co' })), authAttemptKey(req('/api/login', { email: 'b@x.co' })));
    assert.notEqual(authAttemptKey(req('/api/login', { email: 'a@x.co' }, '1.1.1.1')), authAttemptKey(req('/api/login', { email: 'a@x.co' }, '2.2.2.2')));
});

test('el código de seis dígitos y la recuperación de contraseña tienen su propio cupo por persona', () => {
    const challengeToken = jwt.sign({ sub: 'user-rodny', purpose: 'mfa-challenge' }, 'clave-cualquiera');
    const login = authAttemptKey(req('/api/login', { email: 'rodny@brainstudio.co' }));
    const mfa = authAttemptKey(req('/api/login/mfa', { challengeToken, code: '123456' }));
    const reset = authAttemptKey(req('/api/password-reset/request', { email: 'rodny@brainstudio.co' }));
    assert.match(mfa, /user-rodny/);
    assert.notEqual(login, mfa, 'escribir el código no gasta los intentos de contraseña');
    assert.notEqual(login, reset);
    assert.equal(authAttemptKey(req('/api/login/mfa', { challengeToken: 'basura' })), authAttemptKey(req('/api/login/mfa', {})), 'un pase ilegible cae en un cupo común');
});

test('una misma conexión tiene un tope alto que frena a quien prueba muchas cuentas', () => {
    const limiters = createAuthRateLimiters();
    for (let i = 0; i < AUTH_MAX_PER_NETWORK; i += 1) {
        assert.equal(run(limiters, req('/api/login', { email: `persona${i}@x.co` })).passed, true, String(i));
    }
    const blocked = run(limiters, req('/api/login', { email: 'otra@x.co' }));
    assert.equal(blocked.passed, false);
    assert.equal(blocked.response.statusCode, 429);
    assert.ok(AUTH_MAX_PER_NETWORK >= 100);
    assert.equal(AUTH_WINDOW_MS, 15 * 60 * 1000);
});

test('el cupo vuelve solo al pasar los 15 minutos', () => {
    let clock = 1_000_000;
    const limiters = createAuthRateLimiters({ now: () => clock });
    for (let i = 0; i <= AUTH_MAX_PER_ACCOUNT; i += 1) run(limiters, req('/api/login', { email: 'a@x.co' }));
    assert.equal(run(limiters, req('/api/login', { email: 'a@x.co' })).passed, false);
    clock += AUTH_WINDOW_MS + 1;
    assert.equal(run(limiters, req('/api/login', { email: 'a@x.co' })).passed, true);
});

test('el aviso dice cuánto esperar, en español y sin código', () => {
    assert.equal(authLimitMessage(30), 'Demasiados intentos. Espera 1 minuto e intenta de nuevo.');
    assert.equal(authLimitMessage(61), 'Demasiados intentos. Espera 2 minutos e intenta de nuevo.');
    assert.equal(authLimitMessage(900), 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.');
    assert.equal(authLimitMessage(undefined), 'Demasiados intentos. Espera unos minutos e intenta de nuevo.');
    let clock = 0;
    const limiters = createAuthRateLimiters({ now: () => clock });
    for (let i = 0; i < AUTH_MAX_PER_ACCOUNT; i += 1) run(limiters, req('/api/login', { email: 'a@x.co' }));
    clock = 3 * 60 * 1000;
    const { response } = run(limiters, req('/api/login', { email: 'a@x.co' }));
    assert.equal(response.body.message, 'Demasiados intentos. Espera 12 minutos e intenta de nuevo.');
});

test('el servidor cuenta los intentos después de leer el cuerpo, en las tres puertas', () => {
    const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
    const parse = server.indexOf('app.use(express.json(');
    const login = server.indexOf("app.use('/api/login', authRateLimiters)");
    const reset = server.indexOf("app.use('/api/password-reset', authRateLimiters)");
    assert.ok(parse > 0 && login > parse && reset > parse, 'después de express.json, para poder leer el correo');
    assert.doesNotMatch(server, /max: 20 \}\);/, 'el cupo compartido de 20 se retiró');
});
