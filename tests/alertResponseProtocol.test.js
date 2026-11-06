import test from 'node:test';
import assert from 'node:assert/strict';
import { followUpNotice, queueImportantNotice, closeReviewNotice, currentImportantNotice, snoozeNotice } from '../src/services/importantNoticeService.js';
import { operationalNoticeMemory } from './helpers/operationalNoticeMemory.js';
import {NOTICE_RESPONSE_POLICIES,noticeAllows} from '../src/lib/alertResponsePolicy.js';

const now = new Date('2026-11-06T15:00:00Z');
const actor = { userId: 'actor', role: 'ADMIN', modulePermissions: { crm: true } };
const fixture = (kind = 'CRM_REVIEW', lead = { stage: 'GANADO', archivedAt: null, activities: [] }) => {
  const row = { id: 'notice', kind, userId: actor.userId, subjectId: 'source', createdAt: new Date('2026-11-01'), resolvedAt: null };
  const calls = [];
  const db = { importantNotice: { findFirst: async () => row, update: async ({ data }) => Object.assign(row, data),
    updateMany: async () => ({ count: 0 }), create: async ({ data }) => { calls.push('created'); return data; } },
    crmLead: { findUnique: async () => lead },
    $transaction: async work => work(db) };
  return { db, row, calls };
};

test('una parrilla y un tipo nuevo no pueden registrar por descarte una gestión comercial', async () => {
  for (const kind of ['PARRILLA_SIN_PUBLICAR', 'PAUTA_REVISION', 'PAUTA_CAMPANA', 'PAUTA_RESUMEN', 'NUEVA_ALERTA']) {
    const { db, calls, row } = fixture(kind);
    await assert.rejects(followUpNotice(db, 'notice', { channel: 'WHATSAPP' }, actor, {
      now, crm: { addActivity: async () => calls.push('crm') },
    }), error => error.statusCode === 400);
    assert.deepEqual(calls, []); assert.equal(row.resolvedAt, null);
  }
});

test('un productor no puede activar un aviso persistente sin declarar su protocolo de respuesta', async () => {
  const { db, calls } = fixture();
  await assert.rejects(queueImportantNotice(db, { kind: 'NUEVA_ALERTA', userId: 'actor', subjectId: 'source' }, now), /protocolo/i);
  assert.deepEqual(calls, []);
});

test('una alerta comercial antigua no puede cambiar una oportunidad ya ganada', async () => {
  const { db, row, calls } = fixture();
  await assert.rejects(closeReviewNotice(db, 'notice', { outcome: 'PERDIDO', confirmed: true, reason: 'Ya no sigue', expectedUpdatedAt: now.toISOString() }, actor, {
    now, crm: { changeStage: async () => calls.push('stage') },
  }), error => error.statusCode === 409);
  assert.deepEqual(calls, []); assert.equal(row.resolvedAt, null);
});

test('el resumen de parrillas se retira en la lectura cuando no quedan pendientes propios', async () => {
  const {db,data,actor}=operationalNoticeMemory();
  data.importantNotice.push({id:'digest',kind:'PARRILLA_RESUMEN',subjectId:'RESUMEN:2026-11',userId:actor.id,level:'IMPORTANTE',createdAt:new Date('2026-11-01'),resolvedAt:null});
  const result=await currentImportantNotice(db,actor.id,now,{overduePlans:async()=>[]});
  assert.equal(result.notice,null);
  assert.equal(data.importantNotice[0].resolution,'YA_ATENDIDO');
});

test('el resumen solo incluye las cuentas que siguen asignadas y lleva a Parrillas', async () => {
  const {db,data,actor}=operationalNoticeMemory();
  data.importantNotice.push({id:'digest',kind:'PARRILLA_RESUMEN',subjectId:'RESUMEN:2026-11',userId:actor.id,level:'IMPORTANTE',createdAt:new Date('2026-11-01'),resolvedAt:null});
  const row=(id,userId)=>({clientId:id,clientName:id,slug:id,cycle:{year:2026,month:11,label:'Noviembre',end:'2026-11-30'},overdue:2,communityManager:{userId}});
  const result=await currentImportantNotice(db,actor.id,now,{overduePlans:async()=>[row('propio',actor.id),row('ajeno','otra')]});
  assert.match(result.notice.message,/1 período/);
  assert.equal(result.notice.url,'/parrillas');
});

test('una alerta de publicaciones abierta no permite posponer una cuenta reasignada', async()=>{
  const {db,data,actor}=operationalNoticeMemory();
  data.importantNotice.push({id:'plan',kind:'PARRILLA_SIN_PUBLICAR',subjectId:'c:2026-11',userId:actor.id,resolvedAt:null});
  await assert.rejects(snoozeNotice(db,'plan',{option:'1h'},actor,{now,overduePlans:async()=>[{clientId:'c',cycle:{year:2026,month:11},communityManager:{userId:'otro'}}]}),{statusCode:409});
  assert.equal(data.importantNotice[0].snoozedUntil,undefined);
});

test('una fuente de publicaciones que falla no acredita resolución ni entrega un aviso desactualizado',async()=>{
  const {db,data,actor}=operationalNoticeMemory();
  data.importantNotice.push({id:'digest',kind:'PARRILLA_RESUMEN',subjectId:'RESUMEN:2026-11',userId:actor.id,level:'IMPORTANTE',createdAt:new Date('2026-11-01'),resolvedAt:null});
  const result=await currentImportantNotice(db,actor.id,now,{overduePlans:async()=>{throw new Error('fuente caída');}});
  assert.equal(result.notice,null);assert.equal(data.importantNotice[0].resolvedAt,null);
});

test('el catálogo vigente declara origen y efecto; solo CRM/cartera admiten registrar gestión',()=>{
  assert.equal(Object.keys(NOTICE_RESPONSE_POLICIES).length,16);
  for(const [kind,policy] of Object.entries(NOTICE_RESPONSE_POLICIES)){
    assert.ok(policy.source && policy.explanation && policy.openLabel);
    assert.ok(noticeAllows({kind},'open'));
    assert.equal(noticeAllows({kind},'follow-up'),['CRM','COLLECTION'].includes(policy.family));
    assert.equal(noticeAllows({kind},'close'),policy.family==='CRM');
    assert.equal(noticeAllows({kind},'acknowledge'),['OPERACION_SUSPENSION','OPERACION_REACTIVACION'].includes(kind));
  }
});
