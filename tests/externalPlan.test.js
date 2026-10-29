import test from 'node:test';
import assert from 'node:assert/strict';
import {
    asOperationPiece, formatFromText, monthTab, parsePlanRows, parseSheetTabs, pieceDate, platformStatusFromSheet, sheetIdFromUrl, stageFromStatus, summarizeExternalPieces
} from '../src/lib/externalPlan.js';
import { pieceStage } from '../src/lib/clientOperations.js';
import { normalizeOperationProfile } from '../src/lib/clientOperations.js';
import { ExternalPlanError, readExternalPlan, refreshClientExternalPlan } from '../src/services/externalPlanService.js';

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

test('un fallo de Google no borra lo leído antes: guarda el problema y conserva las piezas', async () => {
    const rows = new Map();
    const db = { externalPlanSnapshot: { upsert: async ({ where, create, update }) => {
        const key = `${where.clientId_year_month.year}-${where.clientId_year_month.month}`;
        rows.set(key, rows.has(key) ? { ...rows.get(key), ...update } : create);
    } } };
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
