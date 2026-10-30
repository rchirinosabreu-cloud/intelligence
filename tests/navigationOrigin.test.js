import test from 'node:test';
import assert from 'node:assert/strict';
import {
    clearPageLabel, labelForPath, originState, readOrigin, setPageLabel
} from '../src/lib/navigationOrigin.js';

// «Viajar y regresar» (Rodny, 30 de octubre de 2026: «la dificultad de viajar y regresar al módulo o ventana donde uno
// estaba»): quien sale de una pantalla por un enlace de la plataforma lleva consigo de dónde viene, y la pantalla de
// llegada le ofrece volver a ese mismo sitio.

test('el nombre de una pantalla sale de la lista de módulos y de unas pocas pantallas que no son módulos', () => {
    assert.equal(labelForPath('/gestion'), 'Gestión');
    assert.equal(labelForPath('/parrillas/abc123'), 'Parrillas');
    assert.equal(labelForPath('/clientes/operacion/verona'), 'Operación');
    assert.equal(labelForPath('/clientes'), 'Clientes');
    assert.equal(labelForPath('/'), 'Inicio');
    assert.equal(labelForPath('/algo-que-no-existe'), 'la pantalla anterior');
});

test('el origen guarda la dirección completa, un nombre legible y la posición en la página', () => {
    const state = originState({ pathname: '/clientes/operacion/verona', search: '?mes=10' }, { scrollY: 812.4 });
    assert.deepEqual(state, { from: { path: '/clientes/operacion/verona?mes=10', label: 'Operación', scrollY: 812 } });
    assert.equal(originState({ pathname: '/gestion' }, { label: 'Mi tablero' }).from.label, 'Mi tablero');
});

test('una pantalla puede ponerse su propio nombre, que vale solo mientras sigue abierta', () => {
    setPageLabel('/clientes/operacion/verona', 'Operación · Verona');
    assert.equal(originState({ pathname: '/clientes/operacion/verona' }).from.label, 'Operación · Verona');
    assert.equal(originState({ pathname: '/gestion' }).from.label, 'Gestión', 'el nombre de otra pantalla no se cuela');
    clearPageLabel('/clientes/operacion/verona');
    assert.equal(originState({ pathname: '/clientes/operacion/verona' }).from.label, 'Operación');
});

test('al llegar, se ofrece volver solo a una dirección interna y de otra pantalla', () => {
    const from = { path: '/clientes/operacion/verona', label: 'Operación · Verona', scrollY: 640 };
    assert.deepEqual(readOrigin({ from }, { pathname: '/parrillas/p1', search: '?item=i1' }), from);
    assert.equal(readOrigin({ from }, { pathname: '/clientes/operacion/verona' }), null, 'no se ofrece volver a donde ya se está');
    assert.equal(readOrigin({ from: { ...from, path: '/gestion' } }, { pathname: '/gestion', search: '?taskId=t1' }), null, 'abrir una tarea dentro de Gestión no es viajar');
    assert.equal(readOrigin({ from: { ...from, path: 'https://otro.sitio' } }, { pathname: '/parrillas' }), null);
    assert.equal(readOrigin({ from: { ...from, path: '//otro.sitio' } }, { pathname: '/parrillas' }), null);
    assert.equal(readOrigin(null, { pathname: '/parrillas' }), null);
    assert.equal(readOrigin({ from: { path: '/gestion', label: '' } }, { pathname: '/parrillas' }).label, 'Gestión', 'sin nombre, se toma el de la pantalla');
    assert.equal(readOrigin({ from: { path: '/gestion', label: 'x'.repeat(200) } }, { pathname: '/parrillas' }).label.length, 60);
});
