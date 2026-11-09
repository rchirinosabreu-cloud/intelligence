import test from 'node:test';
import assert from 'node:assert/strict';
import * as suggestions from '../src/lib/crmActivitySuggestions.js';
import * as crm from '../src/services/crmService.js';

test('predicción reutiliza texto propio, prioriza frecuencia e ignora mayúsculas/acentos sin inventar frases',()=>{
  const rows=[{note:'Se contactó al cliente, pendiente de respuesta'},{note:'Se contactó al cliente, pendiente de respuesta'},
    {note:'Se contactó por teléfono.\nSe acordó revisar el viernes.'},{note:'Otra frase'},{note:' '}];
  const values=suggestions.frequentActivityNotes(rows);
  assert.equal(values.length,3);
  assert.equal(values[0],'Se contactó al cliente, pendiente de respuesta');
  assert.deepEqual(suggestions.matchActivityNotes(values,'se contacto'),values.slice(0,2));
  assert.deepEqual(suggestions.matchActivityNotes(values,'se'),[]);
  assert.deepEqual(suggestions.matchActivityNotes(values,values[0]),[]);
  assert.deepEqual(suggestions.matchActivityNotes(values,'Texto nuevo'),[]);
});
test('el servidor relee el permiso y solo consulta gestiones del autor autenticado',async()=>{
  let query;const db={user:{findUnique:async()=>({isActive:true,role:'EDITOR',modulePermissions:{crm:true}})},crmActivity:{findMany:async args=>{query=args;return[{note:'Se contactó al cliente, pendiente de respuesta'}];}}};
  assert.deepEqual(await crm.activityNoteSuggestions(db,{userId:'francys'}),{suggestions:['Se contactó al cliente, pendiente de respuesta']});
  assert.equal(query.where.authorId,'francys');assert.ok(query.take<=500);assert.deepEqual(query.select,{note:true});
  assert.deepEqual(query.where.lead,{archivedAt:null});
  db.user.findUnique=async()=>({isActive:true,role:'EDITOR',modulePermissions:{crm:false}});
  await assert.rejects(crm.activityNoteSuggestions(db,{userId:'francys'}),{statusCode:403});
  await assert.rejects(crm.activityNoteSuggestions(db,{}),{statusCode:401});
});
