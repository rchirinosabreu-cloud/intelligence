import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const page = await read('src/components/modules/Clients/operations/ClientOperationPage.jsx');
const dialogs = await read('src/components/modules/Clients/operations/MonthlyCloseDialogs.jsx');
const planEditor = await read('src/components/modules/ContentPlanDetail.jsx');
const contentService = await read('src/services/contentService.js');

test('la suspensión la ve todo el equipo; las cifras y el botón, solo quien puede decidirla', () => {
    const block = page.slice(page.indexOf('function Suspension('), page.indexOf('function UnbackedWork('));
    // Sin suspensión y sin poder decidirla no se dibuja nada; con suspensión se dibuja para cualquiera.
    assert.match(block, /if \(!suspension && !\(canSuspend && candidate\)\) return null;/);
    // Los días vencidos solo salen en la rama de la propuesta, que ya exige `canSuspend`.
    assert.match(block, /candidate\.days/);
    assert.doesNotMatch(block, /balanceCents/, 'el dinero no va en la ficha: la ve también el project manager');
    assert.match(block, /canSuspend && onOpen/);
    assert.match(block, /Se levanta sola en cuanto se ponga al día/);
});

test('el diálogo pide quién lo autorizó al suspender y solo el motivo al levantar', () => {
    const dialog = dialogs.slice(dialogs.indexOf('export function SuspensionDialog('), dialogs.indexOf('export function CloseDialog('));
    assert.match(dialog, /const lifting = Boolean\(suspension\)/);
    assert.match(dialog, /lifting \? liftProblem\(form\) : suspensionProblem\(form\)/, 'la regla es la misma del servidor');
    assert.match(dialog, /\{!lifting && \(\s*<label[\s\S]*?data-suspension-authorized-by/);
    // El dinero sí se muestra a quien decide, y solo al suspender.
    assert.match(dialog, /!lifting && candidate/);
    assert.match(dialog, /data-suspension-candidate/);
    // El éxito nunca se dice antes de la respuesta del servidor: el diálogo lo cierra quien lo abrió, tras el await.
    assert.match(dialog, /await onSave\(/);
    assert.doesNotMatch(dialog, /toast\./);
});

test('la parrilla congelada lo dice arriba, antes de que nadie escriba', () => {
    assert.match(planEditor, /plan\.suspendedReason && \(/);
    assert.match(planEditor, /data-plan-suspended/);
    assert.match(planEditor, /Esta parrilla está congelada/);
    assert.match(contentService, /suspendedReason: \(await suspensionBlock\(/);
});

test('el portal del cliente nunca se entera: la suspensión frena nuestro trabajo, no su revisión', () => {
    const update = contentService.slice(contentService.indexOf('export const updateContentItem ='), contentService.indexOf('const normalizedData = { ...data };'));
    assert.match(update, /if \(!fromClientReview\) \{/);
    assert.match(update, /assertPlanNotSuspended\(plan\)/);
});

test('crear parrilla, crear pieza, despachar y programar pasan por la misma cerradura', () => {
    const publishing = contentService.indexOf('export const sendItemToKanban');
    assert.match(contentService, /await assertNotSuspended\(prisma, \{ clientId, year, month, clientName: owner\?\.name \}\)/);
    assert.match(contentService, /export const createContentItem = async \(data\) => \{\s*await assertPlanNotSuspended\(await planCycle\(data\?\.planId\)\)/);
    assert.ok(contentService.indexOf('await assertPlanNotSuspended(item.plan)', publishing) > publishing, 'despachar a Kanban también');
});
