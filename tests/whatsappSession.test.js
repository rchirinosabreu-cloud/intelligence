import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { signWhatsAppSession, WHATSAPP_SESSION_SECONDS } from '../src/lib/whatsappSession.js';
import { createOperationalAuditMiddleware } from '../src/middlewares/operationalAuditMiddleware.js';

// Las manos de Bria por WhatsApp (Rodny, 22 de octubre de 2026: «sí» a darle una sesión corta). Por WhatsApp no hay
// navegador; la plataforma firma, por cada mensaje, una sesión de la persona vinculada que dura minutos, entra por las
// mismas puertas que el navegador y queda marcada «vía WhatsApp».

const SECRET = 'x'.repeat(40);
const person = { id: 'u-rodny', name: 'Rodny', email: 'r@b.co', role: 'ADMIN', modulePermissions: { bria: true }, hasFinancialAccess: false, financialRole: null, sessionVersion: 4 };

test('la sesión de WhatsApp es de la persona vinculada, vive minutos y dice por dónde llegó', () => {
  const at = 1_800_000_000;
  const token = signWhatsAppSession(person, SECRET, { now: at });
  const claims = jwt.verify(token, SECRET, { clockTimestamp: at });
  assert.deepEqual([claims.userId, claims.role, claims.sessionVersion, claims.channel, claims.amr], ['u-rodny', 'ADMIN', 4, 'whatsapp', ['whatsapp']]);
  assert.equal(claims.exp - claims.iat, WHATSAPP_SESSION_SECONDS);
  assert.ok(WHATSAPP_SESSION_SECONDS <= 300, 'nunca más de cinco minutos');
  assert.throws(() => jwt.verify(token, SECRET, { clockTimestamp: at + WHATSAPP_SESSION_SECONDS + 1 }), /expired/);
  assert.throws(() => signWhatsAppSession(person, 'corta'), /JWT_SECRET/);
});

test('un cambio hecho con esa sesión queda en el registro como hecho vía WhatsApp', async () => {
  const traces = [];
  const listeners = {};
  const req = { method: 'POST', originalUrl: '/api/activity/events', user: { userId: 'u-rodny', channel: 'whatsapp' } };
  const res = { statusCode: 201, on: (event, fn) => { listeners[event] = fn; } };
  createOperationalAuditMiddleware({ record: async (row) => { traces.push(row); } })(req, res, () => {});
  listeners.finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(traces[0]?.metadata?.via, 'whatsapp');
});
