import test from 'node:test';
import assert from 'node:assert/strict';
import {
    NOTIFICATION_MAX_PAGE_SIZE,
    NOTIFICATION_PAGE_SIZE,
    notificationPage,
    notificationPageArgs,
    notificationPageSize
} from '../src/lib/notificationFeed.js';

// El límite real del panel eran los `take: 20` de la consulta, no el scroll: el aviso
// número 21 no existía para el navegador (Rodny, 26 de octubre de 2026).

const filas = (cantidad, desde = 0) =>
    Array.from({ length: cantidad }, (_, index) => ({ id: `n${desde + index}` }));

test('el tamaño de página es el de siempre y nunca se dispara', () => {
    assert.equal(NOTIFICATION_PAGE_SIZE, 20);
    assert.equal(notificationPageSize(undefined), 20);
    assert.equal(notificationPageSize('30'), 30);
    assert.equal(notificationPageSize(500), NOTIFICATION_MAX_PAGE_SIZE);
    for (const valor of [0, -5, 'pronto', null]) {
        assert.equal(notificationPageSize(valor), 20, `«${valor}»`);
    }
});

test('la consulta pide uno de más para saber si queda algo', () => {
    const args = notificationPageArgs({ userId: 'pm' });
    assert.equal(args.take, 21);
    assert.deepEqual(args.where, { userId: 'pm' });
    assert.equal(args.cursor, undefined, 'la primera página no lleva cursor');
    assert.equal(args.skip, undefined);
});

// Dos avisos pueden nacer en el mismo milisegundo; sin desempate el cursor se salta uno.
test('el orden desempata por id', () => {
    assert.deepEqual(notificationPageArgs({ userId: 'pm' }).orderBy, [
        { createdAt: 'desc' },
        { id: 'desc' }
    ]);
});

test('«Ver más» continúa después del último que ya se vio', () => {
    const args = notificationPageArgs({ userId: 'pm', cursor: 'n19' });
    assert.deepEqual(args.cursor, { id: 'n19' });
    assert.equal(args.skip, 1, 'el cursor no se repite');
});

test('el filtro de sin leer va en la consulta, no en la pantalla', () => {
    assert.deepEqual(notificationPageArgs({ userId: 'pm', unreadOnly: true }).where, {
        userId: 'pm',
        isRead: false
    });
});

test('con más de una página se entrega el cursor de la siguiente', () => {
    const { items, nextCursor } = notificationPage(filas(21), 20);
    assert.equal(items.length, 20);
    assert.equal(nextCursor, 'n19', 'el último entregado, no el que se pidió de más');
});

test('en la última página no hay cursor', () => {
    const { items, nextCursor } = notificationPage(filas(7), 20);
    assert.equal(items.length, 7);
    assert.equal(nextCursor, null);
});

test('sin avisos no se inventa un cursor', () => {
    assert.deepEqual(notificationPage([], 20), { items: [], nextCursor: null });
});
