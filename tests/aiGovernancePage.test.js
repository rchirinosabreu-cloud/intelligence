import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const read = (file) => readFile(file, 'utf8');

test('la plataforma publica la pagina de seguridad y uso responsable de IA', async () => {
  const [app, login, page] = await Promise.all([
    read('src/App.jsx'),
    read('src/components/Login.jsx'),
    read('src/components/public/AiGovernancePolicy.jsx')
  ]);

  assert.match(app, /path="\/seguridad"/);
  assert.doesNotMatch(app, /path="\/seguridad-ia"/);
  assert.match(login, /to="\/seguridad"/);
  assert.doesNotMatch(login, /to="\/seguridad-ia"/);
  assert.match(login, />\s*Seguridad e IA\s*</);
  assert.match(page, /Seguridad y uso responsable de la inteligencia artificial/);
});

test('la pagina publica contiene controles y responsabilidades sin exponer la hoja de ruta interna', async () => {
  const page = await read('src/components/public/AiGovernancePolicy.jsx');

  for (const expected of [
    'Controles implementados',
    'Uso responsable por parte del equipo',
    'Protección de datos',
    'Ciberseguridad',
    'Supervisión humana',
    'Gestión de incidentes',
    'no constituye una certificación'
  ]) {
    assert.ok(page.includes(expected), `Falta el contenido requerido: ${expected}`);
  }

  assert.ok(!page.includes('Hoja de ruta'), 'La hoja de ruta interna no debe aparecer en la pagina publica');
  assert.ok(!page.includes('En fortalecimiento'), 'Las brechas internas no deben aparecer en la pagina publica');
  assert.ok(!page.includes('Inventario de herramientas, modelos, proveedores'), 'La lista interna de mejoras no debe exponerse');
});

test('las mejoras viven en un documento interno con prioridades y responsables', async () => {
  const roadmap = await read('docs/SEGURIDAD_IA_HOJA_DE_RUTA.md');
  const normalizedRoadmap = roadmap.toLowerCase();

  for (const expected of [
    'documento interno',
    'prioridad 0',
    'prioridad 1',
    'prioridad 2',
    'responsable sugerido',
    'criterio de finalización',
    'mfa',
    'pasarela central de IA',
    'prevención de fuga de datos',
    'respuesta a incidentes'
  ]) {
    assert.ok(normalizedRoadmap.includes(expected.toLowerCase()), `Falta el contenido interno requerido: ${expected}`);
  }
});

test('la pagina de gobernanza de IA compila como JSX', async () => {
  const file = 'src/components/public/AiGovernancePolicy.jsx';
  const source = await read(file);
  await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
});
