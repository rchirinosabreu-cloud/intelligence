import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const read = (file) => readFile(file, 'utf8');

test('la plataforma expone el centro de ayuda en una ruta publica y desde el login', async () => {
  const [app, login] = await Promise.all([read('src/App.jsx'), read('src/components/Login.jsx')]);

  assert.match(app, /path="\/ayuda"/);
  assert.match(login, /to="\/ayuda"/);
  assert.match(login, />\s*Ayuda\s*</);
});

test('el manual publico cubre la navegacion y todos los modulos principales', async () => {
  const content = await read('src/content/publicHelpContent.js');

  for (const moduleName of [
    'Primeros pasos', 'Dashboard', 'Manager', 'Gestión', 'Actividad', 'Reportes',
    'Inspiración', 'Parrillas', 'Minutas', 'Drive', 'CRM', 'Cotizaciones',
    'Financiero', 'Radar de Mérito', 'Clientes', 'Equipo', 'Salud Operativa',
    'Perfil y cuenta', 'Notificaciones y chat', 'Seguridad y uso de IA'
  ]) {
    assert.ok(content.includes(moduleName), `Falta documentar el módulo: ${moduleName}`);
  }
});

test('cada articulo publico declara propósito, acceso, funciones y buenas practicas', async () => {
  const content = await read('src/content/publicHelpContent.js');

  for (const field of ['purpose:', 'access:', 'functions:', 'steps:', 'practices:']) {
    const appearances = content.split(field).length - 1;
    assert.ok(appearances >= 20, `${field} solo aparece ${appearances} veces`);
  }

  for (const sensitiveTerm of ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY', 'OPENAI_API_KEY', 'FIREFLIES_WEBHOOK_SECRET']) {
    assert.ok(!content.includes(sensitiveTerm), `El manual público expone un detalle sensible: ${sensitiveTerm}`);
  }
});

test('el centro de ayuda compila como JSX', async () => {
  const file = 'src/components/public/HelpCenter.jsx';
  const source = await read(file);
  await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
});
