import test from 'node:test';
import assert from 'node:assert/strict';
import {
    asOperationPiece, changeLine, changesNoticeText, columnLetter, commentsForMonth, diffExternalPlan, formatFromText, matchCommentToPiece, monthTab, replyContent, validationOptions,
    normalizeSheetComments, parsePlanRows, parseSheetTabs, pieceDate, pieceLabel, platformStatusFromSheet, sheetCellUrl, sheetIdFromUrl,
    stageFromStatus, summarizeExternalPieces
} from '../src/lib/externalPlan.js';
import { pieceStage } from '../src/lib/clientOperations.js';
import { normalizeOperationProfile } from '../src/lib/clientOperations.js';
import {
    ExternalPlanError, monthsToRead, readExternalPlan, refreshClientExternalPlan, replyToExternalComment, updateExternalPieceStatus
} from '../src/services/externalPlanService.js';

test('se leen los tres meses anteriores, el mes en curso y el siguiente: el semáforo juzga el mes que acaba de cerrar', () => {
    assert.deepEqual(monthsToRead(new Date('2026-10-29T15:00:00Z')).map(({ year, month }) => `${year}-${month}`), ['2026-7', '2026-8', '2026-9', '2026-10', '2026-11']);
    assert.deepEqual(monthsToRead(new Date('2027-01-10T15:00:00Z')).map(({ year, month }) => `${year}-${month}`), ['2026-10', '2026-11', '2026-12', '2027-1', '2027-2']);
});

// Lectura de las parrillas de MIO (Rodny, 29 de octubre de 2026): cada cliente de MIO tiene su parrilla en una hoja de
// Google, una pestaña por mes. La plataforma la lee para el avance y el semáforo; nunca escribe en ella.

const SHEET = 'https://docs.google.com/spreadsheets/d/1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY/edit?gid=0#gid=0';

test('solo se aceptan hojas de Google, y del enlace se saca el identificador', () => {
    assert.equal(sheetIdFromUrl(SHEET), '1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY');
    assert.equal(sheetIdFromUrl('https://evil.example/spreadsheets/d/1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY'), null);
    assert.equal(sheetIdFromUrl('http://docs.google.com/spreadsheets/d/1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY'), null);
    assert.equal(sheetIdFromUrl('https://docs.google.com/document/d/1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY'), null);
    assert.match(normalizeOperationProfile({ externalPlanUrl: 'https://drive.google.com/x' }).errors.externalPlanUrl, /hoja de Google/);
    assert.equal(normalizeOperationProfile({ externalPlanUrl: SHEET }).value.externalPlanUrl, SHEET);
});

const HTML = `items.push({name: "ABRIL", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/x\\/htmlview\\/sheet?headers\\x3dtrue&gid=0", gid: "0"});
items.push({name: " OCTUBRE ", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/x\\/htmlview\\/sheet?headers\\x3dtrue&gid=664319259", gid: "664319259"});
items.push({name: "NOVIEMBRE", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/x\\/htmlview\\/sheet?headers\\x3dtrue&gid=32390049", gid: "32390049"});
items.push({name: "Copia de  OCTUBRE ", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/x\\/htmlview\\/sheet?headers\\x3dtrue&gid=1293823831", gid: "1293823831"});`;

test('las pestañas se leen de la vista pública y el mes es la que se llama como él; las copias no cuentan', () => {
    const tabs = parseSheetTabs(HTML);
    assert.deepEqual(tabs.map((tab) => tab.gid), ['0', '664319259', '32390049', '1293823831']);
    assert.equal(monthTab(tabs, 2026, 10).gid, '664319259');
    assert.equal(monthTab(tabs, 2026, 11).gid, '32390049');
    assert.equal(monthTab(tabs, 2026, 12), null);
    assert.equal(monthTab([{ name: 'Octubre 2026', gid: '9' }], 2026, 10).gid, '9');
    assert.equal(monthTab([{ name: 'JULIO 2026.', gid: '7' }], 2026, 7).gid, '7', 'un punto suelto no cambia el mes');
    assert.equal(monthTab([{ name: 'MAYO-JUNIO 2026', gid: '5' }], 2026, 5), null, 'una pestaña de dos meses no es ninguno');
});

test('el estado de la hoja se traduce a las etapas de la plataforma', () => {
    assert.equal(stageFromStatus('PUBLICADO PROGRAMADO'), 'publicada', 'con dos, cuenta la más avanzada');
    assert.equal(stageFromStatus('APROBADO'), 'aprobada');
    assert.equal(stageFromStatus('EN REVISIÓN'), 'disenada');
    assert.equal(stageFromStatus('SOLICITUD NUEVA DEL CLIENTE'), 'redactada');
    assert.equal(stageFromStatus(''), 'creada');
    assert.equal(formatFromText('REEL 1 Mostrar el proceso'), 'Reel');
    assert.equal(formatFromText('CARRUSEL. Halloween'), 'Carrusel');
    assert.equal(formatFromText('POST beneficios'), 'Post');
    assert.equal(pieceDate('19/10/2026', 2026, 10), '2026-10-19');
    assert.equal(pieceDate('19/10/26', 2026, 10), '2026-10-19');
    assert.equal(pieceDate('9/8/2026', 2026, 10), null, 'una fecha de otro mes es un error de digitación: no cuenta');
});

const OCTOBER = [
    ['Parrilla de contenidos', '', '', '', '', '', '', '', ''],
    ['Objetivos', 'Formato', 'Copy', 'Caption', 'Redes', 'Contenido', 'Fechas', 'N°', 'ESTADO'],
    ['POSICIONAMIENTO', 'POST', 'texto', 'caption', 'Facebook', '', '9/8/2026', '1', 'APROBADO'],
    ['POSICIONAMIENTO', 'CARRUSEL.', 'texto', 'caption', 'Facebook', 'drive', '14/10/2026', '2', 'PUBLICADO'],
    ['POSICIONAMIENTO', 'REEL 1', 'texto', 'caption', 'Facebook', 'drive', '16/10/2026', '3', 'EN REVISIÓN'],
    ['', '', '', '', '', '', '', '', '']
];

test('las piezas se toman bajo la fila de encabezados, sin importar el orden de las columnas', () => {
    const { pieces, problem } = parsePlanRows(OCTOBER, { year: 2026, month: 10 });
    assert.equal(problem, null);
    assert.deepEqual(pieces.map((piece) => [piece.number, piece.format, piece.date, piece.stage]), [
        ['1', 'Post', null, 'aprobada'], ['2', 'Carrusel', '2026-10-14', 'publicada'], ['3', 'Reel', '2026-10-16', 'disenada']
    ]);
    assert.deepEqual(summarizeExternalPieces(pieces), { created: 3, reached: { redactada: 3, disenada: 3, aprobada: 2, programada: 1, publicada: 1 } });
    assert.match(parsePlanRows([['Hola']], { year: 2026, month: 10 }).problem, /Formato y Estado/);
    // Lo que va debajo de dos filas vacías es otra tabla, aunque traiga números en la columna del formato.
    const empty = ['', '', '', '', '', '', '', '', ''];
    const withPriorities = parsePlanRows([...OCTOBER.slice(0, 5), empty, empty, ['', 'PRIORIDADES DEL CLIENTE', '', '', 'PRIORIDAD', '', '', '', ''], ['', '1', 'Sabanera', 'Se aceptó una oferta', 'PROMOCIONAR', '', '', '', '']], { year: 2026, month: 10 });
    assert.equal(withPriorities.pieces.length, 3);
    // Una fila de plantilla, con el formato, el número, el objetivo y las redes ya puestos, todavía no es una pieza.
    const template = parsePlanRows([OCTOBER[1], ['POSICIONAMIENTO', 'REEL', '', '', 'Facebook', '', '', '4', '']], { year: 2026, month: 10 });
    assert.equal(template.pieces.length, 0);
    assert.equal(stageFromStatus('REALIZADO'), 'disenada');
    // El nombre que se muestra es el de la plataforma, sea de MIO o no.
    assert.deepEqual(['REALIZADO', 'EN REVISIÓN', 'REVISIÓN DE CLIENTE', 'EN DISEÑO', 'APROBADO', ''].map(platformStatusFromSheet),
        ['REALIZADO', 'EN_REVISION', 'EN_REVISION', 'EN_PRODUCCION', 'APROBADO', 'BORRADOR']);
    assert.equal(asOperationPiece({ format: 'Reel', number: '1', status: 'REALIZADO', stage: 'disenada' }, 0).status, 'REALIZADO');
    // Los estados de la hoja de Mari Colón.
    assert.deepEqual(['ENVIADO AL CLIENTE', 'EN PRODUCCIÓN', 'SIN REALIZAR'].map(stageFromStatus), ['disenada', 'redactada', 'creada']);
    assert.deepEqual(['ENVIADO AL CLIENTE', 'EN PRODUCCIÓN', 'SIN REALIZAR'].map(platformStatusFromSheet), ['EN_REVISION', 'EN_PRODUCCION', 'BORRADOR']);
    // Con la forma que leen las reglas de Operación, cada pieza cuenta en la misma etapa.
    assert.deepEqual(pieces.map(asOperationPiece).map(pieceStage), [3, 5, 2]);
});

const CSV = 'Objetivos,Formato,Fechas,N°,ESTADO\nPOSICIONAMIENTO,"POST\n",2/11/2026,1,EN REVISIÓN\nPOSICIONAMIENTO,REEL,4/11/2026,2,APROBADO\n';
const fakeFetch = (pages) => async (url) => {
    const body = pages.find(([match]) => url.includes(match))?.[1];
    if (body === undefined) return { ok: false, status: 404, url, text: async () => '' };
    if (body === 'LOGIN') return { ok: true, status: 200, url: 'https://accounts.google.com/ServiceLogin', text: async () => '' };
    return { ok: true, status: 200, url, text: async () => body };
};

test('leer una hoja: busca la pestaña del mes y descarga solo esa', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => { calls.push(url); return fakeFetch([['htmlview', HTML], ['gid=32390049', CSV]])(url, options); };
    const read = await readExternalPlan(SHEET, { year: 2026, month: 11 }, { fetchImpl });
    assert.equal(read.tabName, 'NOVIEMBRE');
    assert.deepEqual(read.pieces.map((piece) => piece.stage), ['disenada', 'aprobada']);
    assert.deepEqual(calls, [
        'https://docs.google.com/spreadsheets/d/1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY/htmlview',
        'https://docs.google.com/spreadsheets/d/1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY/export?format=csv&gid=32390049'
    ], 'las direcciones las arma la plataforma, siempre en docs.google.com');

    const missing = await readExternalPlan(SHEET, { year: 2026, month: 12 }, { fetchImpl });
    assert.match(missing.problem, /pestaña de diciembre/);
    await assert.rejects(readExternalPlan(SHEET, { year: 2026, month: 11 }, { fetchImpl: fakeFetch([['htmlview', 'LOGIN']]) }), (error) => error instanceof ExternalPlanError && error.code === 'NOT_SHARED');
    await assert.rejects(readExternalPlan('https://evil.example/x', { year: 2026, month: 11 }, { fetchImpl }), { code: 'INVALID_URL' });
});

const memoryDb = (rows = new Map(), clientInfo = null) => ({
    rows,
    externalPlanSnapshot: {
        upsert: async ({ where, create, update }) => {
            const key = `${where.clientId_year_month.year}-${where.clientId_year_month.month}`;
            rows.set(key, rows.has(key) ? { ...rows.get(key), ...update } : create);
        },
        findUnique: async ({ where }) => rows.get(`${where.clientId_year_month.year}-${where.clientId_year_month.month}`) || null
    },
    client: { findUnique: async () => clientInfo }
});

test('un fallo de Google no borra lo leído antes: guarda el problema y conserva las piezas', async () => {
    const rows = new Map();
    const db = memoryDb(rows);
    const client = { id: 'c-lettu', externalPlanUrl: SHEET };
    const now = new Date('2026-10-29T15:00:00Z');
    const good = fakeFetch([['htmlview', HTML], ['gid=664319259', CSV.replaceAll('/11/', '/10/')], ['gid=32390049', CSV]]);
    await refreshClientExternalPlan(db, client, { now, fetchImpl: good });
    assert.equal(rows.get('2026-10').pieces.length, 2);
    assert.equal(rows.get('2026-11').tabName, 'NOVIEMBRE');

    await refreshClientExternalPlan(db, client, { now: new Date('2026-10-29T17:00:00Z'), fetchImpl: fakeFetch([['htmlview', 'LOGIN']]), log: () => {} });
    assert.equal(rows.get('2026-10').pieces.length, 2, 'las piezas de la última lectura buena se quedan');
    assert.match(rows.get('2026-10').problem, /no está compartida/);
});

// El espejo en Parrillas (29 de octubre de 2026): cada pieza con su fila y sus textos, los comentarios de Google atados a
// su pieza y lo que cambió entre una lectura y la siguiente.

const MIRROR = [
    ['Parrilla de contenidos', '', '', '', '', '', '', '', '', ''],
    ['Objetivos', 'Formato', 'Copy', 'Caption', 'Redes', 'Contenido', 'Fechas', 'N°', 'ESTADO', 'COMENTARIOS'],
    ['INTERACCIÓN', 'POST', '¡Aquí falta una hoja!', 'A ver, a ver… ¡Hay un intruso!', 'Facebook', '', '2/11/2026', '1', 'EN REVISIÓN', ''],
    ['EDUCACIÓN', 'REEL', 'HACER CON IA\nREEL: Chopped', '¿Quién dijo que las ensaladas aburren?', 'Facebook', 'https://drive.google.com/x', '6/11/2026', '3', 'EN REVISIÓN', 'Cambiar la música']
];

test('cada pieza guarda su fila de la hoja y sus textos', () => {
    const { pieces } = parsePlanRows(MIRROR, { year: 2026, month: 11 });
    assert.deepEqual(pieces.map((piece) => piece.row), [3, 4], 'la fila de la hoja, para abrirla en su sitio');
    assert.equal(pieces[1].copy, 'HACER CON IA\nREEL: Chopped');
    assert.equal(pieces[1].caption, '¿Quién dijo que las ensaladas aburren?');
    assert.equal(pieces[1].content, 'https://drive.google.com/x');
    assert.equal(pieces[1].comment, 'Cambiar la música');
    assert.equal(pieces[0].objective, 'INTERACCIÓN');
    assert.equal(sheetCellUrl(SHEET, '32390049', 4), 'https://docs.google.com/spreadsheets/d/1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY/edit#gid=32390049&range=A4');
    assert.equal(pieceLabel(pieces[1]), 'Reel 3');
});

test('un comentario de Google se ata a la pieza cuyo texto cita, y si no hay una sola, queda suelto', () => {
    const { pieces } = parsePlanRows(MIRROR, { year: 2026, month: 11 });
    const comments = normalizeSheetComments([
        { id: 'c1', author: { displayName: 'Villa Montaña', me: false }, content: 'Aprobado', quotedFileContent: { value: '&#191;Qui&#233;n dijo que las ensaladas' }, createdTime: '2026-10-28T10:00:00Z', resolved: false, replies: [] },
        { id: 'c2', author: { displayName: 'Ana' }, content: 'Revisen el logo', quotedFileContent: { value: '' }, createdTime: '2026-10-28T11:00:00Z', resolved: false },
        { id: 'c3', author: { displayName: 'Ana' }, content: 'Viejo', createdTime: '2026-06-01T11:00:00Z', resolved: false },
        { id: 'c4', deleted: true, content: 'borrado' }
    ]);
    assert.equal(comments.length, 3, 'un comentario borrado no se guarda');
    assert.equal(comments[0].quoted, '¿Quién dijo que las ensaladas', 'las entidades de Google se traducen');
    assert.equal(matchCommentToPiece(comments[0].quoted, pieces), 4);
    assert.equal(matchCommentToPiece('Facebook', pieces), null, 'un texto que está en todas no elige ninguna');
    const month = commentsForMonth(comments, pieces, { looseSince: '2026-09-15T00:00:00Z' });
    assert.deepEqual(month.map((comment) => [comment.id, comment.row]), [['c2', null], ['c1', 4]], 'los sueltos recientes y abiertos van con el mes en curso; el viejo no');
    assert.deepEqual(commentsForMonth(comments, pieces).map((comment) => comment.id), ['c1'], 'en otro mes, solo los que tienen pieza');
});

test('entre dos lecturas se ven los estados, los comentarios de la hoja y los de Google que no hizo la plataforma', () => {
    const before = parsePlanRows(MIRROR, { year: 2026, month: 11 }).pieces;
    const changed = MIRROR.map((row) => [...row]);
    changed[2][8] = 'APROBADO';
    changed[3][9] = 'Cambiar la música por una más alegre';
    const after = parsePlanRows(changed, { year: 2026, month: 11 }).pieces;
    const comment = { id: 'g1', author: 'Villa Montaña', mine: false, content: 'Me encanta', resolved: false, row: 4, replies: [] };
    const events = diffExternalPlan(
        { pieces: before, comments: [{ ...comment, id: 'g0', replies: [] }] },
        { pieces: after, comments: [
            comment,
            { ...comment, id: 'g0', replies: [{ id: 'r1', author: 'Villa Montaña', mine: false, content: 'Y el texto también', createdAt: 'x' }, { id: 'r2', author: 'Plataforma', mine: true, content: 'Listo' }] },
            { ...comment, id: 'g2', mine: true, content: 'Lo escribió la plataforma' },
            { ...comment, id: 'g3', resolved: true, content: 'Ya resuelto' }
        ] }
    );
    assert.deepEqual(events.map((event) => event.kind), ['STATUS', 'SHEET_COMMENT', 'GOOGLE_COMMENT', 'GOOGLE_REPLY']);
    assert.equal(changeLine(events[0]), 'Post 1: EN REVISIÓN → APROBADO');
    assert.equal(changeLine(events[2]), 'Villa Montaña comentó en Reel 3: «Me encanta»');
    assert.equal(changesNoticeText('Villa Montaña', 'Noviembre', events), 'Villa Montaña · noviembre: Post 1: EN REVISIÓN → APROBADO (y 3 cambios más)');
    assert.deepEqual(diffExternalPlan(null, { pieces: after, comments: [] }), [], 'sin lectura anterior no hay con qué comparar');
});

test('la lectura avisa al CM y al PM de lo que cambió, una vez por cliente y mes, y la primera lectura no avisa', async () => {
    const tabs = [{ name: 'OCTUBRE', gid: '664319259' }, { name: 'NOVIEMBRE', gid: '32390049' }];
    let november = MIRROR.map((row) => [...row]);
    const october = MIRROR.map((row, index) => (index < 2 ? row : row.map((cell, column) => (column === 6 ? String(cell).replace('/11/', '/10/') : column === 2 || column === 3 ? `Octubre ${index}` : cell))));
    // La primera lectura fue por el enlace público: sin comentarios de Google.
    let comments = null;
    const source = {
        kind: 'google',
        tabs: async () => tabs,
        rows: async (_id, tab) => (tab.name === 'NOVIEMBRE' ? november : october),
        comments: async () => comments
    };
    const sent = [];
    const db = memoryDb(new Map(), { name: 'Villa Montaña', slug: 'villa-montana', responsible: { userId: 'u-cm' }, projectManager: { userId: 'u-pm' } });
    const now = new Date('2026-10-29T15:00:00Z');
    const notify = async (notice) => { sent.push(notice); };
    await refreshClientExternalPlan(db, { id: 'c-villa', externalPlanUrl: SHEET }, { now, source, notify });
    assert.equal(sent.length, 0, 'la primera lectura no tiene con qué comparar');
    assert.equal(db.rows.get('2026-11').gid, '32390049');

    november = november.map((row) => [...row]);
    november[2][8] = 'APROBADO';
    comments = normalizeSheetComments([{ id: 'g1', author: { displayName: 'Villa Montaña' }, content: 'Me encanta', quotedFileContent: { value: 'Quién dijo que las ensaladas' }, createdTime: '2026-10-29T16:00:00Z' }]);
    await refreshClientExternalPlan(db, { id: 'c-villa', externalPlanUrl: SHEET }, { now: new Date('2026-10-29T17:00:00Z'), source, notify });
    assert.deepEqual(sent.map((notice) => notice.userId), ['u-cm', 'u-pm']);
    assert.equal(sent[0].url, '/parrillas/hoja/villa-montana/noviembre-2026');
    assert.match(sent[0].message, /^Villa Montaña · noviembre: Post 1: EN REVISIÓN → APROBADO$/, 'el comentario de Google no se avisa: la lectura anterior no los había leído');
    assert.equal(db.rows.get('2026-11').changes.length, 1);

    sent.length = 0;
    comments = [...comments, ...normalizeSheetComments([{ id: 'g2', author: { displayName: 'Villa Montaña' }, content: 'Cambien la foto', quotedFileContent: { value: 'Aquí falta una hoja' }, createdTime: '2026-10-29T18:00:00Z' }])];
    await refreshClientExternalPlan(db, { id: 'c-villa', externalPlanUrl: SHEET }, { now: new Date('2026-10-29T19:00:00Z'), source, notify });
    assert.equal(sent.length, 2);
    assert.equal(sent[0].message, 'Villa Montaña · noviembre: Villa Montaña comentó en Post 1: «Cambien la foto»');
    assert.equal(db.rows.get('2026-10').changes, undefined, 'un mes sin cambios no reescribe sus cambios');
});

// Escribir en la hoja desde la plataforma (29 de octubre de 2026): solo el estado de una pieza y la respuesta a un
// comentario de Google, con la cuenta de servicio, comprobando antes que la fila siga siendo la misma pieza.

test('las opciones del desplegable se leen de la hoja y la columna se nombra con su letra', () => {
    assert.deepEqual(validationOptions([
        { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'APROBADO' }, { userEnteredValue: 'EN REVISIÓN' }] } },
        { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'aprobado' }, { userEnteredValue: 'PUBLICADO' }] } },
        { condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '3' }] } }
    ]), ['APROBADO', 'EN REVISIÓN', 'PUBLICADO']);
    assert.deepEqual([0, 8, 25, 26, 27].map(columnLetter), ['A', 'I', 'Z', 'AA', 'AB']);
    const { layout } = parsePlanRows(MIRROR, { year: 2026, month: 11 });
    assert.deepEqual(layout, { headerRow: 2, statusColumn: 8, numberColumn: 7, formatColumn: 1 });
    assert.equal(replyContent('Kamila Ortiz', ' Listo, lo cambiamos '), 'Kamila Ortiz (Brain Studio): Listo, lo cambiamos');
});

const writableSetup = (sheetRow) => {
    const { pieces, layout } = parsePlanRows(MIRROR, { year: 2026, month: 11 });
    const snapshot = {
        okAt: new Date('2026-10-29T15:00:00Z'), tabName: 'NOVIEMBRE', gid: '32390049', pieces, summary: {},
        layout: { ...layout, statusOptions: ['EN REVISIÓN', 'EN AJUSTE', 'APROBADO', 'PUBLICADO'] },
        comments: [{ id: 'g1', author: 'Villa Montaña', content: 'Me encanta', row: 4, resolved: false, replies: [] }], edits: []
    };
    const writes = [];
    const source = {
        kind: 'google',
        readRow: async () => sheetRow,
        writeCell: async (...args) => { writes.push(['cell', ...args]); },
        reply: async (...args) => { writes.push(['reply', ...args]); return { id: 'r9', createdTime: '2026-10-29T19:00:00Z' }; }
    };
    const db = {
        snapshot,
        client: { findFirst: async () => ({ id: 'c-villa', name: 'Villa Montaña', slug: 'villa-montana', externalPlanUrl: SHEET }) },
        user: { findUnique: async () => ({ name: 'Kamila Ortiz' }) },
        externalPlanSnapshot: {
            findUnique: async () => db.snapshot,
            update: async ({ data }) => { db.snapshot = { ...db.snapshot, ...data }; }
        }
    };
    return { db, source, writes };
};

test('cambiar el estado escribe la celda de ESTADO de la fila, si la fila sigue siendo la pieza y nadie lo cambió antes', async () => {
    const { db, source, writes } = writableSetup(MIRROR[2]);
    const result = await updateExternalPieceStatus(db, { slug: 'villa-montana', year: 2026, month: 11, row: 3, status: 'aprobado', expected: 'EN REVISIÓN', userId: 'u-kami' }, { source });
    assert.deepEqual(writes, [['cell', '1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY', { name: 'NOVIEMBRE', gid: '32390049' }, 'I3', 'APROBADO']], 'la opción se escribe tal cual la tiene el desplegable');
    assert.equal(result.pieces[0].status, 'APROBADO', 'la lectura guardada cambia al instante: la próxima lectura no lo avisa');
    assert.equal(result.pieces[0].stage, 'aprobada');
    assert.equal(result.edits[0].by, 'Kamila Ortiz');
    assert.equal(result.editable, true);

    await assert.rejects(updateExternalPieceStatus(db, { slug: 'villa-montana', year: 2026, month: 11, row: 3, status: 'INVENTADO', expected: 'APROBADO' }, { source }), { status: 422 });
    await assert.rejects(updateExternalPieceStatus(db, { slug: 'villa-montana', year: 2026, month: 11, row: 99, status: 'APROBADO' }, { source }), { status: 404 });
});

test('si la hoja cambió desde la última lectura, no se escribe y se dice por qué', async () => {
    const moved = writableSetup(['EDUCACIÓN', 'REEL', '', '', '', '', '', '3', 'EN REVISIÓN']);
    await assert.rejects(updateExternalPieceStatus(moved.db, { slug: 'villa-montana', year: 2026, month: 11, row: 3, status: 'APROBADO', expected: 'EN REVISIÓN' }, { source: moved.source }), (error) => error.status === 409 && /ya no es Post 1/.test(error.message));
    const changed = writableSetup([...MIRROR[2].slice(0, 8), 'EN AJUSTE']);
    await assert.rejects(updateExternalPieceStatus(changed.db, { slug: 'villa-montana', year: 2026, month: 11, row: 3, status: 'APROBADO', expected: 'EN REVISIÓN' }, { source: changed.source }), (error) => error.status === 409 && /ya dice «EN AJUSTE»/.test(error.message));
    assert.equal(moved.writes.length + changed.writes.length, 0);
    const publicOnly = writableSetup(MIRROR[2]);
    await assert.rejects(updateExternalPieceStatus(publicOnly.db, { slug: 'villa-montana', year: 2026, month: 11, row: 3, status: 'APROBADO', expected: 'EN REVISIÓN' }, { source: { kind: 'public' } }), { status: 503, code: 'NO_SERVICE_ACCOUNT' });
});

test('responder un comentario de Google lo firma con el nombre de quien escribe y puede marcarlo resuelto', async () => {
    const { db, source, writes } = writableSetup(MIRROR[2]);
    const result = await replyToExternalComment(db, { slug: 'villa-montana', year: 2026, month: 11, commentId: 'g1', content: 'Cambiamos la música hoy', resolve: true, userId: 'u-kami' }, { source });
    assert.deepEqual(writes, [['reply', '1WfyHG3noiWBeMwwMRBCO4U_S6hwvjhtznUYOjPHfSZY', 'g1', 'Kamila Ortiz (Brain Studio): Cambiamos la música hoy', { resolve: true }]]);
    const comment = result.pieces.find((piece) => piece.row === 4).comments[0];
    assert.equal(comment.resolved, true);
    assert.equal(comment.replies.at(-1).mine, true, 'la respuesta propia no se avisa como cambio en la próxima lectura');
    await assert.rejects(replyToExternalComment(db, { slug: 'villa-montana', year: 2026, month: 11, commentId: 'g1', content: '   ' }, { source }), { status: 422 });
    await assert.rejects(replyToExternalComment(db, { slug: 'villa-montana', year: 2026, month: 11, commentId: 'nope', content: 'Hola' }, { source }), { status: 404 });
});
