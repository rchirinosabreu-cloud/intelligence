// La pestaña «Reuniones» de Manager (Rodny, 13 de noviembre de 2026). Contrato de lo que no se negocia: campos
// compartidos de la plataforma, la misma regla que el servidor antes de enviar, éxito solo tras la respuesta,
// descartar con motivo de un toque, papeles de texto y nada que ejecute solo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HANDMADE_TYPE } from '../scripts/typography-baseline.mjs';

const view = readFileSync('src/components/modules/ManagerMeetingTasks.jsx', 'utf8');
const manager = readFileSync('src/components/modules/ManagerTaskAnalytics.jsx', 'utf8');
const routes = readFileSync('src/routes/index.js', 'utf8');
const catalog = readFileSync('src/lib/platformCatalog.js', 'utf8');

test('Manager tiene la pestaña Reuniones, con su etiqueta de regreso y su componente', () => {
  assert.match(manager, /const TABS = \['decisiones', 'reuniones', 'ritmo', 'memory', 'observer'\]/);
  assert.match(manager, /data-bria-tab="reuniones"/);
  assert.match(manager, /Manager · Reuniones/);
  assert.match(manager, /activeTab === 'reuniones' \? <ManagerMeetingTasks \/>/);
});

test('la pantalla usa los campos compartidos y la misma regla que el servidor', () => {
  assert.match(view, /import Select from '@\/components\/ui\/Select'/);
  assert.match(view, /import \{ BrainDatePicker \} from '@\/components\/ui\/BrainDatePicker'/);
  assert.match(view, /TaskCollaboratorsPicker/);
  assert.doesNotMatch(view, /<select|type="date"/);
  assert.match(view, /approvalProblem\(body, \{ members: team, clients \}\)/, 'frena antes de enviar con la regla compartida');
  assert.match(view, /discardProblem\(body\)/);
  assert.match(view, /INBOX_DISCARD_REASONS/);
  assert.match(view, /INBOX_PRIORITIES/);
  assert.match(view, /normalizeCollaboratorIds/);
  assert.match(view, /\/api\/manager\/meeting-tasks\/approve/);
  assert.match(view, /\/api\/manager\/meeting-tasks\/discard/);
});

test('aprobar y descartar dicen el éxito después del servidor; el error queda junto a la tarjeta; descartar guarda de un toque', () => {
  const approve = view.slice(view.indexOf('const approve = useCallback'), view.indexOf('}, [request, absorb]);', view.indexOf('const approve = useCallback')));
  assert.ok(approve.indexOf('await request(') < approve.indexOf('toast.success'), 'toast después del await');
  assert.match(approve, /console\.error\([^)]*requestError\.response\?\.data/);
  const discard = view.slice(view.indexOf('const discard = useCallback'), view.indexOf('}, [request, absorb]);', view.indexOf('const discard = useCallback')));
  assert.ok(discard.indexOf('await request(') < discard.indexOf('toast.success'));
  assert.match(view, /role="alert"/);
  assert.match(view, /reason\.value === 'OTRO' \? setMode\('other'\) : discard\(reason\.value\)/, 'elegir el motivo ya descarta; solo «Otro motivo» pide escribir');
  assert.match(view, /Pedir a Bria que lo ajuste/);
  assert.match(view, /askBria\(/);
  assert.match(view, /markSeen\(/, 'lo visto apaga el punto del menú');
  assert.match(view, /included: Boolean\(item\.assigneeId\)/, 'solo lo que tiene responsable viene marcado');
});

test('papeles de texto, español latino y sin tipografía a mano', () => {
  assert.match(view, /brain-type-section/);
  assert.match(view, /brain-type-label/);
  assert.match(view, /brain-type-help/);
  assert.equal((view.match(HANDMADE_TYPE) || []).length, 0);
  assert.doesNotMatch(view, /vosotros|tenéis|podéis/);
  assert.match(view, /dark:bg-zinc-950/);
});

test('las rutas exigen Manager y rol de dirección, y el mapa de Bria las describe', () => {
  for (const route of ['/manager/meeting-tasks', '/manager/meeting-tasks/approve', '/manager/meeting-tasks/discard']) {
    const at = routes.indexOf(`'${route}'`);
    assert.ok(at > 0, route);
    const block = routes.slice(at, at + 200);
    assert.match(block, /requireModulePermission\('manager'\)/);
    assert.match(block, /requireManagerRole/);
  }
  assert.match(catalog, /'GET \/manager\/meeting-tasks'/);
  assert.match(catalog, /'POST \/manager\/meeting-tasks\/approve'/);
  assert.match(catalog, /'POST \/manager\/meeting-tasks\/discard'/);
});
