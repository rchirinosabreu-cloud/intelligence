import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TEAM_AREAS, inferAreasFromCargo, memberAreas, memberHasArea, normalizeTeamAreas } from '../src/lib/teamAreas.js';
import { isCommercialRole } from '../src/lib/crmFollowUpAlerts.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('la lista de áreas es cerrada y cada una tiene clave y nombre', () => {
    const keys = TEAM_AREAS.map((area) => area.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const key of ['DIRECCION', 'ADMINISTRATIVA', 'COMERCIAL', 'PROJECT_MANAGEMENT', 'COMMUNITY']) assert.ok(keys.includes(key), key);
    for (const area of TEAM_AREAS) assert.ok(area.label.length > 2, area.key);
});

test('el área se deduce del cargo escrito cuando nadie la ha elegido', () => {
    assert.deepEqual(inferAreasFromCargo('Coordinadora Administrativa y Contable'), ['ADMINISTRATIVA']);
    assert.deepEqual(inferAreasFromCargo('Director general '), ['DIRECCION']);
    assert.deepEqual(inferAreasFromCargo('Comercial y Relaciones Públicas'), ['COMERCIAL']);
    assert.deepEqual(inferAreasFromCargo('Project Manager'), ['PROJECT_MANAGEMENT']);
    assert.deepEqual(inferAreasFromCargo('Community Manager'), ['COMMUNITY']);
    assert.deepEqual(inferAreasFromCargo('Gestor de contenidos'), ['COMMUNITY']);
    assert.deepEqual(inferAreasFromCargo('Diseñador gráfico'), ['DISENO']);
    assert.deepEqual(inferAreasFromCargo('Productor Audiovisual'), ['AUDIOVISUAL']);
    assert.deepEqual(inferAreasFromCargo('Estratega digital | Planeación de contenidos'), ['ESTRATEGIA']);
    assert.deepEqual(inferAreasFromCargo('Directora comercial'), ['DIRECCION', 'COMERCIAL']);
    assert.deepEqual(inferAreasFromCargo(''), []);
    assert.deepEqual(inferAreasFromCargo(null), []);
});

test('lo elegido en Equipo manda sobre el cargo', () => {
    assert.deepEqual(memberAreas({ role: 'Project Manager', areas: ['DIRECCION', 'PROJECT_MANAGEMENT'] }), ['DIRECCION', 'PROJECT_MANAGEMENT']);
    assert.deepEqual(memberAreas({ role: 'Project Manager', areas: [] }), ['PROJECT_MANAGEMENT']);
    assert.deepEqual(memberAreas({ role: 'Project Manager' }), ['PROJECT_MANAGEMENT']);
    assert.equal(memberHasArea({ role: 'Comercial', areas: ['ADMINISTRATIVA'] }, 'COMERCIAL'), false);
    assert.equal(memberHasArea({ role: 'Coordinadora Administrativa y Contable' }, 'ADMINISTRATIVA'), true);
    assert.equal(memberHasArea(null, 'ADMINISTRATIVA'), false);
});

test('solo se guardan áreas de la lista, sin repetir y en su orden', () => {
    assert.deepEqual(normalizeTeamAreas(['COMERCIAL', 'DIRECCION', 'COMERCIAL', 'INVENTADA', 7]), ['DIRECCION', 'COMERCIAL']);
    assert.deepEqual(normalizeTeamAreas(undefined), []);
    assert.deepEqual(normalizeTeamAreas('DIRECCION'), []);
});

test('las alertas comerciales siguen leyendo el área comercial', () => {
    assert.equal(isCommercialRole('Comercial y Relaciones Públicas'), true);
    assert.equal(isCommercialRole('Coordinadora Administrativa y Contable'), false);
});

test('Equipo guarda y muestra las áreas', () => {
    const route = read('src/routes/api/team.js');
    assert.match(route, /normalizeTeamAreas\(areas\)/);
    const ui = read('src/components/modules/Team.jsx');
    assert.match(ui, /TEAM_AREAS\.map/);
    assert.match(ui, /data-team-area=/);
    assert.match(read('prisma/schema.prisma'), /areas\s+String\[\]\s+@default\(\[\]\)/);
    assert.match(read('package.json'), /ensure-team-areas-schema\.js/);
});
