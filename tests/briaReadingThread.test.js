// Las lecturas de la mañana viven en un solo chat (Rodny, 20 de noviembre de 2026: «la lectura de la mañana siempre
// es un chat nuevo, y no, yo quiero que sea un solo chat siempre»). La primera abre el chat; las siguientes entran
// como un mensaje más de Bria en ese mismo chat, y lo que la persona conteste cae debajo como siempre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBriaConversationRepository } from '../src/services/briaConversationRepository.js';
import { MORNING_BRIEF_THREAD_TITLE } from '../src/services/dailyReadingService.js';

const actor = { ref: 'u-rodny', role: 'ADMIN', permissions: { bria: true } };
const fakePool = ({ existing = null } = {}) => {
  const queries = [];
  const client = { query: async (sql, params) => { queries.push([sql, params]); return { rows: /FOR UPDATE OF c/.test(sql) && existing ? [existing] : [] }; }, release() {} };
  const pool = { connect: async () => client, query: async (sql, params) => {
    if (/FROM bria_memory\.conversations/.test(sql)) return { rows: [{ id: params[2], title: MORNING_BRIEF_THREAD_TITLE, revision: existing ? existing.revision + 1 : 1, updated_at: new Date('2026-11-23T12:30:00Z') }] };
    return { rows: [] };
  } };
  return { pool, queries };
};
const note = { title: MORNING_BRIEF_THREAD_TITLE, text: 'Buenos días, Rodny.', metadata: { note: 'LECTURA_MANANA', dayKey: '2026-11-23', sources: [] } };

test('the first morning reading opens the thread at revision 1, like any note Bria leaves', async () => {
  const { pool, queries } = fakePool();
  const chat = await createBriaConversationRepository({ pool, workspace: 'application' }).postThreadNote(actor, note);
  assert.deepEqual(queries.map(([sql]) => sql.split(' ')[0]), ['BEGIN', 'SELECT', 'INSERT', 'INSERT', 'COMMIT']);
  assert.deepEqual(queries[1][1], ['application', 'u-rodny', 'LECTURA_MANANA'], 'the thread is looked up by owner and by the kind of note, never by title');
  assert.match(queries[1][0], /t\.metadata->>'note'=\$3/);
  assert.deepEqual(queries[2][1].slice(1), ['application', 'u-rodny', 'Lectura de la mañana']);
  assert.match(queries[3][0], /VALUES\(\$1,1,'assistant',\$2,\$3\)/);
  assert.equal(chat.revision, 1);
});

test('the next readings go into the same chat: one more turn of Bria after the last revision, the chat moves up and no new chat is created', async () => {
  const { pool, queries } = fakePool({ existing: { id: 'chat-lecturas', revision: 4 } });
  const chat = await createBriaConversationRepository({ pool, workspace: 'application' }).postThreadNote(actor, note);
  assert.deepEqual(queries.map(([sql]) => sql.split(' ')[0]), ['BEGIN', 'SELECT', 'INSERT', 'UPDATE', 'COMMIT']);
  assert.match(queries[2][0], /INSERT INTO bria_memory\.conversation_turns/);
  assert.deepEqual(queries[2][1].slice(0, 3), ['chat-lecturas', 9, 'Buenos días, Rodny.'], 'position 2·revision+1: the even slot stays free because nobody asked');
  assert.deepEqual([queries[2][1][3].note, queries[2][1][3].dayKey, typeof queries[2][1][3].accessFingerprint], ['LECTURA_MANANA', '2026-11-23', 'string']);
  assert.match(queries[3][0], /SET revision=revision\+1,title=\$4,updated_at=now\(\)/);
  assert.deepEqual(queries[3][1], ['application', 'u-rodny', 'chat-lecturas', 'Lectura de la mañana']);
  assert.equal(queries.some(([sql]) => /INSERT INTO bria_memory\.conversations\(/.test(sql)), false);
  assert.equal(chat.id, 'chat-lecturas');
  assert.equal(chat.revision, 5);
});

test('a failure rolls the transaction back, and a note without a kind falls back to its own chat', async () => {
  const queries = [];
  const client = { query: async (sql) => { queries.push(sql.split(' ')[0]); if (/^SELECT/.test(sql)) throw new Error('base caída'); return { rows: [] }; }, release() {} };
  await assert.rejects(() => createBriaConversationRepository({ pool: { connect: async () => client }, workspace: 'application' }).postThreadNote(actor, note), /base caída/);
  assert.deepEqual(queries, ['BEGIN', 'SELECT', 'ROLLBACK']);
  const { pool, queries: plain } = fakePool();
  await createBriaConversationRepository({ pool, workspace: 'application' }).postThreadNote(actor, { title: 'Suelta', text: 'x' });
  assert.deepEqual(plain.map(([sql]) => sql.split(' ')[0]), ['BEGIN', 'INSERT', 'INSERT', 'COMMIT']);
});

test('the daily reading delivers into the thread and the conversation talks about the latest reading in it', () => {
  const service = readFileSync('src/services/dailyReadingService.js', 'utf8');
  assert.match(service, /store\.postThreadNote \|\| store\.postAssistantNote/);
  assert.match(readFileSync('src/services/briaConversationService.js', 'utf8'), /chat\.turns\.findLast\(turn => turn\.role === 'assistant' && turn\.note === 'LECTURA_MANANA'\)/);
});
