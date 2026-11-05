import test from 'node:test';
import assert from 'node:assert/strict';
import {
    clearPageLabel, labelForPath, originState, readOrigin, setPageLabel
} from '../src/lib/navigationOrigin.js';
import * as navigation from '../src/lib/navigationOrigin.js';

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

test('tres pantallas conservan el regreso a cada origen sin copiar órdenes ni datos de formularios', () => {
    const clients = { pathname: '/clientes', search: '?tab=operacion', hash: '#cuentas', key: 'clients' };
    const operation = {
        pathname: '/clientes/operacion/faro', key: 'operation',
        state: { ...originState(clients, { scrollY: 420 }), createTask: { title: 'no trasladar' } },
    };
    const plan = { pathname: '/parrillas/p1', search: '?item=i2', state: originState(operation, { scrollY: 930 }) };
    const first = readOrigin(plan.state, plan);
    assert.equal(first.path, '/clientes/operacion/faro');
    assert.equal(typeof navigation.navigationReturnState, 'function', 'existe una devolución que conserva el origen anterior');
    const backToOperation = navigation.navigationReturnState(first);
    assert.equal(backToOperation.restoreScrollY, 930);
    assert.equal(backToOperation.restoreScrollKey, 'operation');
    assert.equal(backToOperation.createTask, undefined);
    const second = readOrigin(backToOperation, operation);
    assert.equal(second.path, '/clientes?tab=operacion#cuentas');
    assert.equal(second.scrollY, 420);
    assert.equal(navigation.navigationReturnState(second).from, undefined);
});

test('el salto desde una tarea conserva su enlace específico aunque Gestión haya consumido el parámetro', () => {
    const state = originState({ pathname: '/gestion', key: 'board' }, {
        originPath: '/gestion?taskId=t1', label: 'Gestión · Diseñar portada', scrollY: 200,
    });
    assert.equal(readOrigin(state, { pathname: '/parrillas/p1' }).path, '/gestion?taskId=t1');
    assert.equal(state.from.key, 'board');
});

test('cambiar una selección de la misma pantalla conserva su origen sin crear un regreso a sí misma', () => {
    const location = { pathname: '/parrillas/p1', search: '?item=i1', state: {
        ...originState({ pathname: '/gestion' }), desdeElCarril: false,
    } };
    assert.equal(typeof navigation.navigationState, 'function', 'la navegación distingue cambio de selección y salto');
    const state = navigation.navigationState(location, '/parrillas/p1?item=i2', { state: { desdeElCarril: true } });
    assert.equal(readOrigin(state, { pathname: '/parrillas/p1' }).path, '/gestion');
    assert.equal(state.desdeElCarril, true);
});

test('un salto nuevo conserva solo procedencia y estado explícito del destino', () => {
    const location = { pathname: '/crm', state: { draft: { amount: 100 }, openModal: true } };
    assert.equal(typeof navigation.navigationState, 'function');
    const state = navigation.navigationState(location, '/cotizaciones/c1/editar', { state: { fromLead: 'lead-1' } });
    assert.equal(state.from.path, '/crm');
    assert.equal(state.fromLead, 'lead-1');
    assert.equal(state.draft, undefined);
    assert.equal(state.openModal, undefined);
});

test('la cadena rechaza orígenes externos, barras invertidas y ciclos', () => {
    const current = { pathname: '/gestion' };
    for (const path of ['//evil.test', '/\\evil.test', '/\nevil', 'javascript:alert(1)']) {
        assert.equal(readOrigin({ from: { path } }, current), null, path);
    }
    const loop = { path: '/clientes', scrollY: 0 };
    loop.previous = loop;
    const from = readOrigin({ from: loop }, current);
    assert.equal(from.path, '/clientes');
    assert.equal(from.previous, undefined);
    const state = originState({ pathname: '/gestion', state: { from: { path: '/parrillas/p1', previous: { path: '/gestion' } } } });
    assert.equal(state.from.previous.path, '/parrillas/p1');
    assert.equal(state.from.previous.previous, undefined, 'no se regresa en círculo a la tarea actual');
});
