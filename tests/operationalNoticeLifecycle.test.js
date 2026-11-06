import test from 'node:test';
import assert from 'node:assert/strict';
import { operationalNoticeMemory } from './helpers/operationalNoticeMemory.js';
import { currentImportantNotice, acknowledgeOperationalNotice } from '../src/services/importantNoticeService.js';
import { activeAreaUserIds } from '../src/services/teamAreaService.js';

const now=new Date('2026-11-12T15:00:00Z');
function fixture() {
  const f=operationalNoticeMemory();
  f.data.client.push({id:'c',name:'Faro',slug:'faro',isArchived:false,projectManager:{userId:f.actor.id,isActive:true},
    contracts:[{id:'k',status:'ACTIVO',startDate:'2026-10-15',endDate:'2027-02-14',cutDay:15,monthlyReport:true}],monthlyReports:[],monthlyCloses:[],suspensions:[],accountsReceivables:[]});
  return f;
}
test('áreas Administrativa y Dirección no conceden avisos financieros sin permiso',async()=>{
  const {db}=fixture();
  assert.deepEqual(await activeAreaUserIds(db,'ADMINISTRATIVA',{module:'financiero'}),[]);
  assert.deepEqual(await activeAreaUserIds(db,'DIRECCION',{module:'financiero'}),[]);
  assert.deepEqual(await activeAreaUserIds(db,'PROJECT_MANAGEMENT'),['pm-local']);
});
test('acuse de suspensión no modifica cumplimiento y no vuelve a aparecer en cada lectura',async()=>{
  const {db,data,actor}=fixture();
  data.client[0].monthlyCloses=[{year:2026,month:10}];
  data.client[0].suspensions=[{id:'s',fromCycle:'2026-12',liftedAt:null}];
  const before=JSON.stringify(data.client);
  const {notice}=await currentImportantNotice(db,actor.id,now);
  assert.equal(notice.kind,'OPERACION_SUSPENSION');
  await acknowledgeOperationalNotice(db,notice.id,actor,{now});
  const later=new Date(now.getTime()+6*60000);
  assert.equal((await currentImportantNotice(db,actor.id,later)).notice,null);
  assert.equal(JSON.stringify(data.client),before);
  assert.equal(data.notification.length,0);
});
test('cambiar el PM retira la proyección anterior; no se alteran asignaciones ni tareas',async()=>{
  const {db,data,actor}=fixture();
  assert.ok((await currentImportantNotice(db,actor.id,now)).notice);
  data.client[0].projectManager.userId='otro';
  assert.equal((await currentImportantNotice(db,actor.id,now)).notice,null);
  assert.equal(data.client[0].projectManager.userId,'otro');
});
test('el ciclo reúne la parrilla cubierta sin cerrar ni ocultar pendientes de otra cuenta',async()=>{
  const {db,data,actor}=fixture();
  data.importantNotice.push({id:'plan',userId:actor.id,kind:'PARRILLA_SIN_PUBLICAR',subjectId:'c:2026-10',resolvedAt:null,level:'IMPORTANTE',createdAt:new Date('2026-01-01'),message:'Piezas pendientes'});
  const result=await currentImportantNotice(db,actor.id,now);
  assert.equal(result.notice.kind,'OPERACION_CICLO');
  assert.equal(data.importantNotice.find(n=>n.id==='plan').resolvedAt,null);
  data.client[0].monthlyCloses=[{year:2026,month:10}];
  const plan=await currentImportantNotice(db,actor.id,now,{overduePlans:async()=>[{clientId:'c',cycle:{year:2026,month:10}}]});
  assert.equal(plan.notice.id,'plan','el cierre no convierte automáticamente piezas pendientes en publicadas');
});
test('el resumen de parrillas conserva otras cuentas con un rótulo actualizado',async()=>{
  const {db,data,actor}=fixture();
  data.importantNotice.push({id:'digest',userId:actor.id,kind:'PARRILLA_RESUMEN',subjectId:'RESUMEN:2026-11',resolvedAt:null,level:'IMPORTANTE',createdAt:new Date('2026-01-01'),label:'Parrillas · 4 cuentas',message:'4 cuentas pendientes'});
  const row=id=>({clientId:id,cycle:{year:2026,month:10},projectManager:{userId:actor.id}});
  const result=await currentImportantNotice(db,actor.id,now,{overduePlans:async()=>[row('c'),row('otro')]});
  assert.equal(result.notice.id,'digest');
  assert.doesNotMatch(result.notice.label,/4 cuentas/);
  assert.match(result.notice.message,/1 período adicional tiene/);
});
