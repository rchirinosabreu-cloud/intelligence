import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  APPROVAL_STATES,
  approvalState,
  isSettled,
  itemsNeedingRevisionRequest,
  needsClientReview,
  shouldRequestRevisionOnNewAsset
} from '../src/lib/contentApproval.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 5 de octubre de 2026: «el cliente aprobó cuando solo eran los copies, no cuando la vio».
// La parrilla se manda escrita, el cliente aprueba el texto, y el material llega después. La pieza
// se quedaba en verde y, al reenviar el enlace, el portal decía «Pieza aprobada, ya pasó a
// producción»: ni botón para aprobar lo nuevo ni forma de pedir un cambio.

test('una aprobación es de lo que el cliente vio, no de la pieza para siempre', () => {
  const sinAprobar = { status: 'EN_REVISION' };
  const aprobada = { status: 'APROBADO', revisionRequestedAt: null };
  const conMaterialNuevo = { status: 'APROBADO', revisionRequestedAt: '2026-10-05T12:00:00.000Z' };

  assert.equal(approvalState(sinAprobar), APPROVAL_STATES.POR_REVISAR);
  assert.equal(approvalState(aprobada), APPROVAL_STATES.APROBADA);
  assert.equal(approvalState(conMaterialNuevo), APPROVAL_STATES.MATERIAL_NUEVO);

  // Lo que cuenta como cerrado es solo lo tercero: una pieza con material nuevo le debe una
  // respuesta al cliente, así que el avance del portal no puede contarla como aprobada.
  assert.equal(isSettled(aprobada), true);
  assert.equal(isSettled(conMaterialNuevo), false);
  assert.equal(needsClientReview(conMaterialNuevo), true);
  assert.equal(needsClientReview(aprobada), false);

  // REALIZADO y PUBLICADO siguen contando como aprobadas: el cliente ya dio el visto bueno.
  assert.equal(approvalState({ status: 'PUBLICADO' }), APPROVAL_STATES.APROBADA);
  assert.equal(approvalState({ status: 'REALIZADO', revisionRequestedAt: '2026-10-05' }), APPROVAL_STATES.MATERIAL_NUEVO);
});

test('solo se le pide otra vuelta a lo que ya había aprobado', () => {
  // Marcar una pieza que nunca aprobó no añadiría nada: ya está pendiente en su lado.
  assert.equal(shouldRequestRevisionOnNewAsset({ status: 'BORRADOR' }), false);
  assert.equal(shouldRequestRevisionOnNewAsset({ status: 'DEVUELTO' }), false);
  assert.equal(shouldRequestRevisionOnNewAsset({ status: 'APROBADO' }), true);

  const items = [
    { id: 'a', status: 'APROBADO', revisionRequestedAt: null },
    { id: 'b', status: 'APROBADO', revisionRequestedAt: '2026-10-05T12:00:00.000Z' },
    { id: 'c', status: 'EN_REVISION', revisionRequestedAt: null },
    { id: 'd', status: 'PUBLICADO', revisionRequestedAt: null }
  ];
  // Ni las que ya tienen la petición puesta ni las que el cliente todavía no ha aprobado.
  assert.deepEqual(itemsNeedingRevisionRequest(items).map(item => item.id), ['a', 'd']);
  assert.deepEqual(itemsNeedingRevisionRequest([]), []);
});

test('la marca la pone el servidor cuando llega material a una pieza aprobada', async () => {
  const service = await read('src/services/contentService.js');

  assert.match(service, /const requestRevisionIfApproved = async \(itemId\)/);
  // Los tres caminos que añaden material —formulario, subida directa y enlace de Drive— más el
  // adjunto único antiguo. Si uno se queda fuera, esa vía deja la pieza en verde con material nuevo.
  assert.equal(
    (service.match(/await requestRevisionIfApproved\(/g) || []).length,
    4,
    'los cuatro caminos que añaden material piden la revisión'
  );
  // Marcar la revisión no puede tumbar una subida que sí funcionó.
  assert.match(service, /catch \(error\) \{\s*console\.error\('\[Service\] No se pudo marcar la pieza para una revisión nueva/);

  // Cambiar el estado es una decisión nueva y cierra la ronda; editar el caption no.
  assert.match(service, /hasOwnProperty\.call\(normalizedData, 'status'\)\) \{\s*normalizedData\.revisionRequestedAt = null;/);
  // El cliente que pide un cambio también responde: la ronda queda cerrada.
  assert.match(service, /status: 'DEVUELTO',[\s\S]{0,120}revisionRequestedAt: null/);

  assert.match(service, /export const requestContentItemRevision/);
  assert.match(service, /export const requestContentPlanRevision/);
  // La columna tiene que viajar en las consultas, o la pantalla nunca se entera.
  assert.match(service, /revisionRequestedAt: true/);
});

test('el portal deja decidir otra vez y nunca deja al cliente sin salida', async () => {
  const portal = await read('src/components/public/SharedContentPlan.jsx');
  const controller = await read('src/controllers/publicController.js');

  assert.match(controller, /revisionRequestedAt: item\.revisionRequestedAt/, 'el estado viaja al portal');

  // «Aprobada» en el portal significa cerrada, no «el estado es APROBADO».
  assert.match(portal, /const isApproved = \(item\) => isSettled\(item\)/);
  assert.match(portal, /const hasNewMaterial = \(item\) => approvalState\(item\) === APPROVAL_STATES\.MATERIAL_NUEVO/);

  // Con material nuevo vuelven los dos botones y se dice por qué.
  assert.match(portal, /Ya está la pieza terminada/);
  assert.match(portal, /Habías aprobado el texto/);
  assert.match(portal, /Material nuevo/);

  // Y una pieza cerrada tampoco es un callejón sin salida.
  assert.match(portal, /¿Quieres pedir un cambio\?/);
  const cerrada = portal.indexOf('Ya pasó a producción');
  const salida = portal.indexOf('¿Quieres pedir un cambio?', cerrada);
  assert.ok(salida > cerrada, 'la salida está dentro del bloque de la pieza aprobada');
});

test('el editor avisa y deja pedir la vuelta, por pieza y por mes', async () => {
  const editor = await read('src/components/modules/ContentPlanDetail.jsx');
  const routes = await read('src/routes/api/content.js');

  assert.match(routes, /router\.post\('\/plans\/:id\/request-revision'/);
  assert.match(routes, /router\.post\('\/items\/:id\/request-revision'/);

  assert.match(editor, /const requestRevisionMutation = useMutation/, 'el mes entero de una vez');
  assert.match(editor, /const requestItemRevisionMutation = useMutation/, 'y una pieza suelta');
  assert.match(editor, /Pedir nueva revisión/);
  assert.match(editor, /El cliente la tiene por revisar/);
  // El botón del mes solo aparece si hay algo que pedir.
  assert.match(editor, /\{piecesToReview\.length > 0 && \(/);
  assert.match(editor, /const piecesToReview = itemsNeedingRevisionRequest\(plan\.items \|\| \[\]\)/);
});

test('la columna es aditiva y va encadenada en el arranque', async () => {
  const script = await read('scripts/ensure-content-revision-schema.js');
  const packageJson = JSON.parse(await read('package.json'));
  const schema = await read('prisma/schema.prisma');

  assert.match(script, /ADD COLUMN IF NOT EXISTS "revisionRequestedAt" TIMESTAMP\(3\)/);
  assert.doesNotMatch(script, /UPDATE |DELETE |DROP /, 'no toca ni un dato existente');
  assert.match(packageJson.scripts.start, /ensure-content-revision-schema\.js/);
  assert.match(schema, /revisionRequestedAt DateTime\?/);
});
