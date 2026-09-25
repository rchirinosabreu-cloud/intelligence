import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 24 de septiembre de 2026: la parrilla se editaba como una lista de tarjetas enormes, una
// debajo de otra. Un mes de doce piezas era un scroll interminable y no se veía el mes como mes.
// Ahora el mes vive en un carril fijo a la izquierda y a la derecha se edita **una** pieza.

test('el mes va en un carril y solo se edita la pieza elegida', async () => {
  const editor = await read('src/components/modules/ContentPlanDetail.jsx');

  assert.match(editor, /const PlanPieceRail/, 'el carril del mes es su propio componente');
  assert.match(editor, /selectedItemId/, 'hay una pieza elegida, no todas abiertas a la vez');
  assert.match(editor, /aria-current=\{isSelected \? 'true' : undefined\}/, 'el carril dice cuál está abierta');

  // Antes se pintaba un `ContentItemCard` por cada pieza del mes; ahora solo el de la elegida.
  assert.doesNotMatch(
    editor,
    /orderedPlanItems\.map\(\([\s\S]{0,60}\) => \(\s*<ContentItemCard/,
    'ya no se dibuja una tarjeta por pieza'
  );
  assert.match(editor, /selectedItem && \(/, 'la tarjeta se dibuja para la pieza elegida');
});

test('cada campo dice si lo ve el cliente o solo el equipo', async () => {
  const editor = await read('src/components/modules/ContentPlanDetail.jsx');

  // El origen del problema: nadie sabía qué salía del portal. Ahora lo dice el propio campo.
  assert.match(editor, /Solo el equipo/, 'el guion se marca como interno');
  // La etiqueta se acortó a «Lo ve el cliente» al rediseñar la tarjeta (25 de septiembre de 2026):
  // va pegada al rótulo del campo y una frase entera lo empujaba a dos líneas.
  assert.match(editor, /Lo ve el cliente/, 'el texto de la publicación se marca como visible');
  assert.match(editor, /Texto de la publicación/, 'deja de llamarse «Caption (Post)»');

  // Rodny, 24 de septiembre de 2026: «no me interesa ver la sección de vista del cliente». La mirilla
  // que la mostraba dentro del editor se quitó; las etiquetas de cada campo ya dicen qué sale y qué no.
  assert.doesNotMatch(editor, /const ClientGlance/);
  assert.doesNotMatch(editor, /Vista del cliente/);
});

test('el rediseño no se llevó por delante nada de lo que ya funcionaba', async () => {
  const editor = await read('src/components/modules/ContentPlanDetail.jsx');

  for (const [needle, why] of [
    [/handleFinalAssetUpload/, 'subir la pieza final'],
    [/const \{ problem, mode \} = planFinalAssetUpload\(files\);/, 'el reparto de caminos de subida'],
    [/const DriveLinkDialog/, 'el enlace de Drive'],
    [/Revisa los permisos en Drive\./, 'el aviso de permisos de Drive'],
    [/Despachar a Kanban/, 'despachar a producción'],
    [/brainDatePickerProps/, 'el calendario compartido'],
    [/parsePlanInternalNotes/, 'las notas internas del plan'],
    [/strategicObjectives/, 'los objetivos estratégicos'],
    [/handleDeleteItem/, 'eliminar una pieza'],
    [/BriaContentPlanReview/, 'la revisión de Bria'],
    [/newlyCreatedItemId/, 'la pieza recién creada se queda arriba hasta tener fecha']
  ]) {
    assert.match(editor, needle, `se conserva: ${why}`);
  }

  // El feedback del cliente se lee, nunca se edita desde aquí.
  assert.doesNotMatch(editor, /onUpdate\(\{ id: item\.id, comments: /, 'el feedback del cliente es de solo lectura');
});
