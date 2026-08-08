import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('auth session policy supports revocation and mandatory password changes', async () => {
  const schema = await read('prisma/schema.prisma');
  const authController = await read('src/controllers/authController.js');
  const authMiddleware = await read('src/middlewares/authMiddleware.js');
  const userService = await read('src/services/userService.js');
  const userRoutes = await read('src/routes/api/user.js');
  const resetScript = await read('scripts/force-password-reset.js');

  assert.match(schema, /mustChangePassword\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /passwordChangedAt\s+DateTime\?/);
  assert.match(schema, /sessionVersion\s+Int\s+@default\(0\)/);

  assert.match(authController, /AUTH_TOKEN_EXPIRES_IN/);
  assert.match(authController, /AUTH_TOKEN_EXPIRES_IN\s*=\s*process\.env\.AUTH_TOKEN_EXPIRES_IN\s*\|\|\s*'12h'/);
  assert.match(authController, /sessionVersion:\s*user\.sessionVersion/);
  assert.match(authController, /mustChangePassword:\s*user\.mustChangePassword/);
  assert.doesNotMatch(authController, /expiresIn:\s*'30d'/);

  assert.match(authMiddleware, /select:\s*\{[\s\S]*sessionVersion:\s*true[\s\S]*mustChangePassword:\s*true/);
  assert.match(authMiddleware, /TOKEN_REVOKED/);
  assert.match(authMiddleware, /PASSWORD_CHANGE_REQUIRED/);
  assert.match(authMiddleware, /isPasswordChangeRoute/);

  assert.match(userService, /mustChangePassword:\s*false/);
  assert.match(userService, /passwordChangedAt:\s*new Date\(\)/);
  assert.match(userService, /sessionVersion:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(userService, /isSamePassword\s*=\s*await bcrypt\.compare\(newPassword,\s*user\.password\)/);
  assert.match(userService, /La nueva contrasena debe ser diferente a la actual/);
  assert.match(userRoutes, /requiresLogin:\s*true/);

  assert.match(resetScript, /mustChangePassword:\s*true/);
  assert.match(resetScript, /sessionVersion:\s*\{\s*increment:\s*1\s*\}/);
});

test('frontend detects expired tokens before rendering the app and owns the password-change flow', async () => {
  const authContext = await read('src/context/AuthContext.jsx');
  const main = await read('src/main.jsx');
  const app = await read('src/App.jsx');
  const forcePassword = await read('src/components/ForcePasswordChange.jsx');
  const login = await read('src/components/Login.jsx');

  assert.match(authContext, /decodeJwtPayload/);
  assert.match(authContext, /isJwtExpired/);
  assert.match(authContext, /clearAuthSession/);
  assert.match(authContext, /password-change-required/);

  assert.match(main, /response\.status === 428/);
  assert.match(main, /password-change-required/);
  assert.match(main, /window\.location\.href = '\/cambiar-password'/);

  assert.match(app, /ForcePasswordChange/);
  assert.match(app, /mustChangePassword/);
  assert.match(app, /path="\/cambiar-password"/);

  assert.match(forcePassword, /\/api\/user\/password/);
  assert.match(forcePassword, /logout\(\)/);
  assert.match(forcePassword, /Tu nueva contrasena/);
  assert.match(forcePassword, /newPassword === currentPassword/);

  assert.match(login, /Imagina\. Crea\. Conecta\. Trasciende\./);
  assert.match(login, /brainstudio-login-hero\.png/);
  assert.doesNotMatch(login, /Continue with Google|Google|Microsoft/);
});
