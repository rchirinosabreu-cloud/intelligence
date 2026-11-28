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
  const plan=await currentImportantNotice(db,actor.id,now,{overduePlans:async()=>[{clientId:'c',projectManager:{userId:actor.id},cycle:{year:2026,month:10}}]});
  assert.equal(plan.notice.id,'plan','el cierre no convierte automáticamente piezas pendientes en publicadas');
});
test('el resumen de parrillas conserva otras cuentas con un rótulo actualizado',async()=>{
  const {db,data,actor}=fixture();
  data.importantNotice.push({id:'digest',userId:actor.id,kind:'PARRILLA_RESUMEN',subjectId:'RESUMEN:2026-11',resolvedAt:null,level:'IMPORTANTE',createdAt:new Date('2026-01-01'),label:'Parrillas · 4 cuentas',message:'4 cuentas pendientes'});
  const row=id=>({clientId:id,cycle:{year:2026,month:10},projectManager:{userId:actor.id}});
  const result=await currentImportantNotice(db,actor.id,now,{overduePlans:async()=>[row('c'),row('otro')]});
  assert.equal(result.notice.id,'digest');
  assert.doesNotMatch(result.notice.label,/4 cuentas/);
  assert.match(result.notice.message,/1 período tiene/);
});

test('abrir la revisión de mitad de ciclo la anota como vista y no vuelve en ese ciclo; el cierre también se acusa y vuelve el día del corte',async()=>{
  const {db,data,actor}=fixture();
  const mid=new Date('2026-11-02T15:00:00Z'); // ciclo 15 oct–14 nov: mitad desde el 30 de octubre
  const {notice}=await currentImportantNotice(db,actor.id,mid);
  assert.equal(notice.kind,'OPERACION_CICLO');
  assert.equal(notice.acknowledge,true);
  const before=JSON.stringify(data.client);
  await acknowledgeOperationalNotice(db,notice.id,actor,{now:mid});
  assert.equal(data.importantNotice.find(n=>n.id===notice.id).resolution,'REVISADO');
  assert.equal((await currentImportantNotice(db,actor.id,new Date('2026-11-05T15:00:00Z'))).notice,null,'no vuelve en la misma fase');
  assert.equal(JSON.stringify(data.client),before,'acusar no registra cierre ni informe');
  const closing=(await currentImportantNotice(db,actor.id,new Date('2026-11-11T15:00:00Z'))).notice;
  assert.match(closing?.label || '',/^Cierre del/,'el cierre llega como aviso nuevo');
  // Revisar el aviso del cierre también lo cierra (Rodny, 28 de noviembre de 2026); el día del corte vuelve y ya no se acusa.
  assert.equal(closing.acknowledge,true);
  await acknowledgeOperationalNotice(db,closing.id,actor,{now:new Date('2026-11-11T15:00:00Z')});
  assert.equal((await currentImportantNotice(db,actor.id,new Date('2026-11-13T15:00:00Z'))).notice,null,'revisado, no vuelve antes del corte');
  const cut=(await currentImportantNotice(db,actor.id,new Date('2026-11-14T15:00:00Z'))).notice;
  assert.match(cut?.label || '',/^Cierre del/,'el día del corte vuelve si el cierre sigue sin confirmar');
  assert.equal(cut.acknowledge,false);
  await assert.rejects(acknowledgeOperationalNotice(db,cut.id,actor,{now:new Date('2026-11-14T15:00:00Z')}),/registro de origen/);
});
