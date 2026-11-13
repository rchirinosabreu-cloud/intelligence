// La pestaña «Reuniones» de Manager (Rodny, 13 de noviembre de 2026: «pueden ser cards pequeñas y al abrirlas es el
// mismo card del pendiente cuando uno lo crea solo que con los datos ya montados y el botón de "guardar" en este caso,
// sería "Despachar a Kanban"»). Contrato de lo que no se negocia: tarjetas pequeñas, el único creador de pendientes
// de la plataforma con los datos montados, éxito solo tras la respuesta, descartar con motivo de un toque, papeles de
// texto y nada que ejecute solo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HANDMADE_TYPE } from '../scripts/typography-baseline.mjs';

const view = readFileSync('src/components/modules/ManagerMeetingTasks.jsx', 'utf8');
const panel = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
const manager = readFileSync('src/components/modules/ManagerTaskAnalytics.jsx', 'utf8');
const routes = readFileSync('src/routes/index.js', 'utf8');
const catalog = readFileSync('src/lib/platformCatalog.js', 'utf8');
const controller = readFileSync('src/controllers/taskController.js', 'utf8');

test('Manager tiene la pestaña Reuniones, con su etiqueta de regreso y su componente', () => {
  assert.match(manager, /const TABS = \['decisiones', 'reuniones', 'ritmo', 'memory', 'observer'\]/);
  assert.match(manager, /data-bria-tab="reuniones"/);
  assert.match(manager, /Manager · Reuniones/);
  assert.match(manager, /activeTab === 'reuniones' \? <ManagerMeetingTasks \/>/);
});

test('las tarjetas son pequeñas y abren el único creador de pendientes con los datos ya montados y «Despachar a Kanban»', () => {
  assert.match(view, /import TaskSidePanel from '@\/components\/modules\/TaskSidePanel'/);
  assert.match(view, /<TaskSidePanel[\s\S]*?prefill=\{prefill\}[\s\S]*?submitLabel="Despachar a Kanban"/);
  assert.match(view, /const prefill = useMemo\(\(\) => \(open \? taskPrefillOf\(open\.minute, open\.item\) : null\), \[open\]\)/, 'el prefill se memoriza: un objeto nuevo por render reiniciaría el formulario');
  assert.match(view, /data-meeting-task-open/);
  assert.match(view, /grid gap-3 sm:grid-cols-2 xl:grid-cols-3/, 'rejilla de tarjetas pequeñas');
  assert.doesNotMatch(view, /<select|type="date"|<textarea|TaskCollaboratorsPicker|BrainDatePicker/, 'la tarjeta no edita: eso lo hace el panel');
  assert.doesNotMatch(view, /meeting-tasks\/approve/, 'ya no hay aprobación en bloque');
});

test('el panel acepta los datos montados sin tocar el borrador de sesión, manda la marca de origen y entrega lo creado', () => {
  assert.match(panel, /prefill = null, submitLabel = 'Crear tarea'/);
  assert.match(panel, /\{submitLabel\}/);
  assert.match(panel, /if \(isOpen && !isEdition && !prefill\) \{/, 'con prefill no se escribe task_focus_draft');
  assert.match(panel, /else if \(!isEdition && prefill\) \{/, 'con prefill no se lee task_focus_draft');
  assert.match(panel, /source: !isEdition && prefill\?\.source \? prefill\.source : undefined/);
  assert.match(panel, /const saved = await res\.json\(\)\.catch\(\(\) => null\);[\s\S]*?onSuccess\(saved\);/, 'el éxito y el enlace se leen de la respuesta');
});

test('el servidor crea por el mismo camino y enlaza el compromiso; solo Manager con rol de dirección despacha', () => {
  assert.match(controller, /const \{ followOnCreate, initial_references, initial_inputs, initial_insumos, initial_comments, source, \.\.\.rest \} = req\.body/, 'la marca no entra en la tarea');
  assert.match(controller, /hasModulePermission\(req\.user, 'manager'\) \|\| !isManagerRole\(req\.user\?\.role\)/);
  assert.match(controller, /dispatch\(req\.user, source, create\)/);
  assert.match(controller, /meeting \? \{ \.\.\.task, meeting \} : task/);
});

test('descartar dice el éxito después del servidor; el error queda junto a la tarjeta; descartar guarda de un toque', () => {
  const discard = view.slice(view.indexOf('const discard = useCallback'), view.indexOf('}, [request]);', view.indexOf('const discard = useCallback')));
  assert.ok(discard.indexOf('await request(') < discard.indexOf('toast.success'), 'toast después del await');
  assert.match(discard, /console\.error\([^)]*requestError\.response\?\.data/);
  assert.match(view, /role="alert"/);
  assert.match(view, /reason\.value === 'OTRO' \? setMode\('other'\) : discard\(reason\.value\)/, 'elegir el motivo ya descarta; solo «Otro motivo» pide escribir');
  assert.match(view, /discardProblem\(body\)/);
  assert.match(view, /INBOX_DISCARD_REASONS/);
  assert.match(view, /\/api\/manager\/meeting-tasks\/discard/);
  assert.match(view, /saved\?\.meeting\?\.linked === false/, 'un enlace que falló se dice');
  assert.match(view, /markSeen\(/, 'lo visto apaga el punto del menú');
});

test('papeles de texto, español latino y sin tipografía a mano', () => {
  assert.match(view, /brain-type-section/);
  assert.match(view, /brain-type-value/);
  assert.match(view, /brain-type-help/);
  assert.equal((view.match(HANDMADE_TYPE) || []).length, 0);
  assert.doesNotMatch(view, /vosotros|tenéis|podéis/);
  assert.match(view, /dark:bg-zinc-950/);
});

test('las rutas exigen Manager y rol de dirección, y el mapa de Bria las describe junto con la marca de origen', () => {
  for (const route of ['/manager/meeting-tasks', '/manager/meeting-tasks/discard']) {
    const at = routes.indexOf(`'${route}'`);
    assert.ok(at > 0, route);
    const block = routes.slice(at, at + 200);
    assert.match(block, /requireModulePermission\('manager'\)/);
    assert.match(block, /requireManagerRole/);
  }
  assert.doesNotMatch(routes, /meeting-tasks\/approve/);
  assert.match(catalog, /'GET \/manager\/meeting-tasks'/);
  assert.match(catalog, /'POST \/manager\/meeting-tasks\/discard'/);
  assert.match(catalog, /source \{kind: MINUTE, minuteId, n\}/, 'POST /tasks describe la marca');
});
