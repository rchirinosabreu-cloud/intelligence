import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';

const read = (file) => readFile(file, 'utf8');

test('el resumen público de gobernanza distingue validación local de operación productiva', async () => {
  const page = await read('src/components/public/AiGovernancePolicy.jsx');
  for (const text of ['Gobernanza de la inteligencia artificial', 'En validación local', 'no está activado en producción', 'Inventario de sistemas', 'Autorizaciones por cliente', 'Evaluación de riesgos', 'Registro de incidentes', 'Trazabilidad de cambios', 'Control previo al envío']) {
    assert.ok(page.includes(text), `Falta el alcance público: ${text}`);
  }
  assert.match(page, /id="gobernanza"/);
  assert.match(page, /Rodny Chirinos/);
  assert.match(page, /Francisco Villa/);
});

test('el resumen no expone expedientes, clientes piloto ni enlaces administrativos', async () => {
  const page = await read('src/components/public/AiGovernancePolicy.jsx');
  assert.doesNotMatch(page, /PromoGroup|HDI|localhost|127\.0\.0\.1|href="\/gobierno-ia|docs\/seguridad-ia/);
  assert.match(page, /expedientes.*privados/);
});

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
