import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Rodny, 30 de octubre de 2026: «el icono del módulo de financiero y cotizaciones son el mismo … no deben ser
// idénticos». Cada módulo del menú lleva su propio icono, también en la bienvenida.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('en el menú lateral ningún módulo repite el icono de otro', () => {
    const icons = [...read('src/components/layout/Sidebar.jsx').matchAll(/icon: (\w+)/g)].map((match) => match[1]);
    const repeated = icons.filter((icon, index) => icons.indexOf(icon) !== index);
    assert.deepEqual(repeated, []);
});

test('en la bienvenida Cotizaciones y Financiero tampoco comparten icono', () => {
    const welcome = read('src/lib/welcomeContent.js');
    const iconOf = (id) => welcome.match(new RegExp(`id: '${id}'[^}]*icon: '(\\w+)'`))?.[1];
    assert.ok(iconOf('cotizaciones') && iconOf('financiero'));
    assert.notEqual(iconOf('cotizaciones'), iconOf('financiero'));
    assert.match(read('src/components/onboarding/WelcomeDialog.jsx'), new RegExp(`\\b${iconOf('financiero')}\\b`), 'la bienvenida importa el icono que nombra');
});
