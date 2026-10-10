// Lo fijo primero y lo que cambia al final (9 de octubre de 2026): dos personas con los mismos permisos, en días
// distintos, comparten el principio de las instrucciones y OpenAI lo reutiliza.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstructions } from '../src/lib/briaAssistant.js';

const tools = [{ name: 'mis_tareas', description: 'Tus tareas' }, { name: 'buscar_cliente', description: 'Busca clientes' }];

test('the date and the name go at the end, so the start is the same for everyone with the same tools', () => {
  const rodny = buildInstructions({ person: { name: 'Rodny', jobTitle: 'Director' }, today: '2026-10-09', tools });
  const helen = buildInstructions({ person: { name: 'Helen' }, today: '2026-10-10', tools });
  const shared = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i += 1; return i; };
  assert.ok(shared(rodny, helen) / rodny.length > 0.9, 'more than 90 % of the instructions is a shared prefix');
  assert.match(rodny.split('\n').at(-1), /^Hoy es 9 de octubre de 2026 \(hora de Bogotá\)\. Hablas con Rodny, Director\.$/);
});
