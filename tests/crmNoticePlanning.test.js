import test from 'node:test';
import assert from 'node:assert/strict';
import { operationalNoticeMemory } from './helpers/operationalNoticeMemory.js';
import * as notices from '../src/services/importantNoticeService.js';
import { noticeAllows } from '../src/lib/alertResponsePolicy.js';

const now = new Date('2026-11-12T15:00:00Z');
function fixture() {
  const { db, data, actor } = operationalNoticeMemory();
  actor.modulePermissions.crm = true;
  actor.teamMember.areas = ['COMERCIAL']; data.teamMember[0].areas = ['COMERCIAL'];
  data.crmLead.push({ id: 'lead', company: 'Empresa local', stage: 'PROPUESTA_ENVIADA', archivedAt: null,
    updatedAt: new Date('2026-11-01T15:00:00Z'), lastActivityAt: new Date('2026-10-01T15:00:00Z') });
  for (const [id,userId] of [['notice',actor.id],['other','other-user']]) data.importantNotice.push({ id, userId, kind: 'CRM_REVIEW', subjectId: 'lead',
    level: 'IMPORTANTE', label: 'Revisión', message: '¿Sigue?', createdAt: new Date('2026-11-02T15:00:00Z'), resolvedAt: null });
  const body = { nextAction: 'Llamar para revisar la propuesta', nextFollowUpAt: '2026-11-16', expectedUpdatedAt: data.crmLead[0].updatedAt.toISOString(), confirmed: true, requestId: 'test-request-123' };
  return { db, data, actor, body };
}
test('CRM declara planificación sin concederla a las otras familias', () => {
  assert.equal(noticeAllows({kind:'CRM_REVIEW'},'schedule-follow-up'),true);
  assert.equal(noticeAllows({kind:'CRM_NEXT_FOLLOW_UP'},'schedule-follow-up'),true);
  assert.equal(noticeAllows({kind:'CARTERA_MENSUAL'},'schedule-follow-up'),false);
});
test('programar conserva contacto, etapa e historial; retoma el mismo aviso desde el origen', async () => {
  const { db,data,actor,body } = fixture();
  await notices.scheduleFollowUpNotice(db,'notice',body,actor,{now,log:()=>{}});
  assert.equal(data.crmLead[0].nextAction,body.nextAction);
  assert.equal(data.crmLead[0].lastActivityAt.toISOString(),'2026-10-01T15:00:00.000Z');
  assert.equal(data.crmLead[0].stage,'PROPUESTA_ENVIADA');
  assert.equal(data.crmActivity.length,1); assert.equal(data.crmActivity[0].type,'NOTA');
  assert.equal(data.crmActivity[0].authorId,actor.id);
  assert.ok(data.importantNotice.every(n=>n.kind==='CRM_NEXT_FOLLOW_UP' && !n.resolvedAt));
  const current = at => notices.currentImportantNotice(db,actor.id,new Date(at),{operationalSource:async()=>[],log:()=>{}});
  const pending = await current('2026-11-13T15:00:00Z');
  assert.equal(pending.notice,null); assert.equal(new Date(pending.nextAt).toISOString(),'2026-11-16T13:00:00.000Z');
  const due = await current('2026-11-16T13:01:00Z');
  assert.equal(due.notice.id,'notice'); assert.match(due.notice.message,/Llamar para revisar/);
  data.crmLead[0].nextFollowUpAt=new Date('2026-11-14T00:00:00Z');
  assert.equal((await current('2026-11-14T13:01:00Z')).notice.id,'notice','cambio desde ficha adelanta el aviso');
  data.crmActivity.push({id:'backdated',leadId:'lead',type:'LLAMADA',occurredAt:new Date('2026-11-05T15:00:00Z')});
  assert.equal((await current('2026-11-14T13:01:00Z')).notice?.id,'notice','registrar una llamada anterior al plan no lo cumple');
});
test('rechaza fecha imposible/pasada, acción vacía, revisión antigua y permiso revocado', async () => {
  for(const changes of [{nextFollowUpAt:'2026-02-30'},{nextFollowUpAt:'2026-11-12'},{nextAction:' '},{confirmed:false},{expectedUpdatedAt:'2020-01-01'}]) {
    const {db,data,actor,body}=fixture();
    await assert.rejects(notices.scheduleFollowUpNotice(db,'notice',{...body,...changes},actor,{now}),error=>[400,409].includes(error.statusCode));
    assert.equal(data.crmActivity.length,0);
  }
  const {db,data,actor,body}=fixture(); actor.modulePermissions.crm=false;
  await assert.rejects(notices.scheduleFollowUpNotice(db,'notice',body,actor,{now}),{statusCode:403});
  assert.equal(data.crmActivity.length,0);
});
