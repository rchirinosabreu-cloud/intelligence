import test from 'node:test';
import assert from 'node:assert/strict';
import { isDemoMode, demoDatabaseProblem, describeDatabaseTarget, assertDemoDatabase } from '../src/lib/demoMode.js';

// La versión «Demo» de la plataforma (Rodny, 26 de octubre de 2026): el mismo código desplegado otra vez, con
// otra base y datos inventados. El `.env` local apunta a producción, así que la semilla y el reinicio solo
// pueden correr con dos candados a la vez: `DEMO_MODE=true` y una base cuyo nombre diga «demo».

const demoUrl = 'postgresql://user:secret@127.0.0.1:5432/intelligence_demo';
const productionUrl = 'postgresql://user:secret@hopper.proxy.rlwy.net:38902/railway';

test('el modo demo solo se enciende con DEMO_MODE=true, sin importar mayúsculas ni espacios', () => {
    assert.equal(isDemoMode({ DEMO_MODE: 'true' }), true);
    assert.equal(isDemoMode({ DEMO_MODE: ' TRUE ' }), true);
    assert.equal(isDemoMode({ DEMO_MODE: '1' }), false);
    assert.equal(isDemoMode({ DEMO_MODE: 'false' }), false);
    assert.equal(isDemoMode({}), false);
});

test('sin DEMO_MODE la semilla se niega aunque la base se llame demo', () => {
    assert.match(demoDatabaseProblem({ DATABASE_URL: demoUrl }), /DEMO_MODE/);
});

test('con DEMO_MODE pero una base sin la marca «demo» se niega nombrando la base, nunca la contraseña', () => {
    const problem = demoDatabaseProblem({ DEMO_MODE: 'true', DATABASE_URL: productionUrl });
    assert.match(problem, /hopper\.proxy\.rlwy\.net:38902\/railway/);
    assert.doesNotMatch(problem, /secret/);
});

test('sin DATABASE_URL, o con una que no se entiende, se niega', () => {
    assert.match(demoDatabaseProblem({ DEMO_MODE: 'true' }), /DATABASE_URL/);
    assert.match(demoDatabaseProblem({ DEMO_MODE: 'true', DATABASE_URL: 'no-es-una-url' }), /no se entiende/i);
    assert.match(demoDatabaseProblem({ DEMO_MODE: 'true', DATABASE_URL: 'mysql://x@h/demo' }), /postgres/i);
});

test('con los dos candados abiertos no hay problema', () => {
    assert.equal(demoDatabaseProblem({ DEMO_MODE: 'true', DATABASE_URL: demoUrl }), null);
    assert.equal(demoDatabaseProblem({ DEMO_MODE: 'true', DATABASE_URL: 'postgres://u:p@db.railway.internal:5432/railway_demo?sslmode=require' }), null);
    assert.equal(demoDatabaseProblem({ DEMO_MODE: 'true', DATABASE_URL: 'postgresql://u:p@h:5432/DemoAgencia' }), null);
});

test('describir el destino nunca enseña la contraseña', () => {
    assert.equal(describeDatabaseTarget(demoUrl), '127.0.0.1:5432/intelligence_demo');
    assert.equal(describeDatabaseTarget('postgresql://u:p@h/db'), 'h:5432/db');
    assert.equal(describeDatabaseTarget('basura'), '(dirección no legible)');
});

test('el servidor en modo demo se niega a arrancar sobre una base que no sea de demo', () => {
    assert.throws(() => assertDemoDatabase({ DEMO_MODE: 'true', DATABASE_URL: productionUrl }), /demo/i);
    assert.doesNotThrow(() => assertDemoDatabase({ DEMO_MODE: 'true', DATABASE_URL: demoUrl }));
    // Sin modo demo no hay nada que comprobar: producción arranca como siempre.
    assert.doesNotThrow(() => assertDemoDatabase({ DATABASE_URL: productionUrl }));
});
