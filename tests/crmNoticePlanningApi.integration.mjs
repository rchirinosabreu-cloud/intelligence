import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { SHARED_TEST_DATABASE_URL, assertSharedTaskDatabase } from './support/sharedTaskSandbox.js';
import { createImportantNoticeRouter } from '../src/routes/api/importantNotices.js';
import * as notices from '../src/services/importantNoticeService.js';
import { runFollowUpAlerts } from '../src/services/crmFollowUpAlertService.js';
import { createCrmRouter } from '../src/routes/api/crm.js';
import { ensureCrmSchema } from '../scripts/ensure-crm-schema.js';
import { CRM_STAGES } from '../src/lib/crmRules.js';

test('HTTP/PostgreSQL: próximo seguimiento nativo, permisos, reintentos, concurrencia y reversión atómica', {timeout:90000}, async t => {
  assertSharedTaskDatabase(SHARED_TEST_DATABASE_URL);
  const schema=`crm_plan_${randomUUID().replaceAll('-','')}`;
  const connection=new pg.Client({connectionString:SHARED_TEST_DATABASE_URL}); await connection.connect();
  await connection.query(`CREATE SCHEMA "${schema}"`); await connection.query(`SET search_path TO "${schema}"`);
  const url=new URL(SHARED_TEST_DATABASE_URL); url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasources:{db:{url:url.href}}}); let server;
  t.after(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await db.$disconnect();await connection.query(`DROP SCHEMA "${schema}" CASCADE`);await connection.end();});
  const ddl=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8',env:{...process.env,DATABASE_URL:url.href},stdio:['ignore','pipe','pipe']});
  const tables=new Set(['User','TeamMember','CrmLead','CrmActivity','CrmRequest','Quotation','ImportantNotice','Notification','OperationalTraceEvent','CrmSetting','CrmFollowUpAlert']);
  for(const [sql] of ddl.matchAll(/CREATE TYPE "[^"]+" AS ENUM \([\s\S]*?\);/g))await connection.query(sql);
  for(const [sql,name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g))if(tables.has(name))await connection.query(sql);
  for(const [sql,name] of ddl.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"[^;]+;/g))if(tables.has(name))await connection.query(sql);
  for(const [sql,name,target] of ddl.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT [^;]+?REFERENCES "([^"]+)"[^;]+;/g))if(tables.has(name)&&tables.has(target))await connection.query(sql);
  await connection.query(`ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_stage_check" CHECK (stage IN (${CRM_STAGES.map(stage=>`'${stage.value}'`).join(',')}))`);
  const oldLead=await db.crmLead.create({data:{company:'Legado sin cambios',stage:'PERDIDO',lostReason:'Motivo histórico'}});
  await ensureCrmSchema(connection); await ensureCrmSchema(connection);
  assert.deepEqual(await db.crmLead.findUnique({where:{id:oldLead.id}}),oldLead,'el cambio de nombre conserva todas las columnas legadas');
  await assert.rejects(db.crmLead.update({where:{id:oldLead.id},data:{stage:'ESTADO_INEXISTENTE'}}),'el CHECK sigue rechazando estados ajenos al catálogo');
  let now=new Date('2026-11-12T15:00:00Z'); const people=[];
  for(const name of ['Francys ficticia','Comercial ficticio']){
    const user=await db.user.create({data:{name,email:`${randomUUID()}@example.invalid`,password:'NO_LOGIN',role:'EDITOR',modulePermissions:{crm:true}}});
    await db.teamMember.create({data:{userId:user.id,name,role:'Comercial',areas:['COMERCIAL']}}); people.push({...user,userId:user.id});
  }
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user=people.find(p=>p.id===req.headers['x-user'])||people[0];next();});
  app.use('/api/important-notices',createImportantNoticeRouter({db,clock:()=>now,service:{...notices,currentImportantNotice:(db,id,at)=>notices.currentImportantNotice(db,id,at,{operationalSource:async()=>[],log:()=>{}})}}));
  app.use('/api/crm',createCrmRouter({db}));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const call=async(path,body,person=people[0])=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/important-notices/${path}`,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-user':person.id},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};};
  const fresh=async()=>{
    now=new Date('2026-11-12T15:00:00Z');
    await db.importantNotice.updateMany({where:{resolvedAt:null},data:{resolvedAt:now}});
    const lead=await db.crmLead.create({data:{company:'Empresa ficticia',stage:'PROPUESTA_ENVIADA',proposalSentAt:new Date('2026-10-01'),lastActivityAt:new Date('2026-10-01'),updatedAt:new Date('2026-11-01')}});
    const rows=[];for(const person of people)rows.push(await db.importantNotice.create({data:{userId:person.id,subjectId:lead.id,kind:'CRM_REVIEW',level:'IMPORTANTE',label:'Revisión',message:'Revisar empresa ficticia',createdAt:new Date('2026-11-02')}}));
    return{lead,rows,body:{nextAction:'Llamar para revisar propuesta',nextFollowUpAt:'2026-11-16',confirmed:true,expectedUpdatedAt:lead.updatedAt.toISOString(),requestId:randomUUID()}};
  };
  await t.test('guarda una sola vez, persiste al recargar y aparece a la hora acordada para ambos',async()=>{
    const {lead,rows,body}=await fresh(); const path=`${rows[0].id}/schedule-follow-up`;
    assert.equal((await call(path,body)).status,200); assert.equal((await call(path,body)).status,200);
    assert.equal((await call(path,{...body,nextAction:'Otro texto'})).status,409);
    const saved=await db.crmLead.findUnique({where:{id:lead.id}});
    assert.equal(saved.lastActivityAt.toISOString(),lead.lastActivityAt.toISOString());assert.equal(saved.stage,lead.stage);
    assert.equal(saved.nextAction,body.nextAction);assert.equal(saved.nextFollowUpAt.toISOString(),'2026-11-16T00:00:00.000Z');
    const activities=await db.crmActivity.findMany({where:{leadId:lead.id}});assert.equal(activities.length,1);assert.equal(activities[0].type,'NOTA');assert.equal(activities[0].authorId,people[0].id);
    await db.crmActivity.create({data:{leadId:lead.id,authorId:people[0].id,type:'CORREO',occurredAt:new Date('2026-11-05T15:00:00Z'),note:'Gestión anterior registrada después del plan'}});
    assert.equal(await db.operationalTraceEvent.count({where:{eventType:'IMPORTANT_NOTICE_SCHEDULED'}}),1);
    now=new Date('2026-11-13T15:00:00Z');
    for(const person of people){const read=await call('current',null,person);assert.equal(read.data.notice,null);assert.equal(new Date(read.data.nextAt).toISOString(),'2026-11-16T13:00:00.000Z');}
    // El reloj de silencio y su ruta de emisión respetan el plan, sin otra campana.
    const emitted=[];await runFollowUpAlerts(db,{now,notify:async data=>emitted.push(data),log:()=>{},info:()=>{}});assert.equal(emitted.length,0,'ni una gestión antigua ni el reloj de silencio sustituyen el plan');
    const existing=await notices.queueImportantNotice(db,{...rows[0],kind:'CRM_REVIEW'},now);assert.equal(existing.id,rows[0].id);assert.equal(existing.kind,'CRM_NEXT_FOLLOW_UP');
    await db.crmLead.update({where:{id:lead.id},data:{nextFollowUpAt:new Date('2026-11-14'),nextAction:'Enviar propuesta revisada'}});
    now=new Date('2026-11-14T13:01:00Z');const read=await call('current');assert.equal(read.data.notice.id,rows[0].id);assert.match(read.data.notice.message,/Enviar propuesta revisada/);
    assert.equal((await call(`${rows[0].id}/snooze`,{option:'1h'})).status,200);now=new Date('2026-11-14T13:10:00Z');assert.equal((await call('current')).data.notice,null);
    now=new Date('2026-11-14T14:02:00Z');assert.equal((await call(`${rows[0].id}/follow-up`,{channel:'LLAMADA'})).status,200);
    assert.equal(await db.importantNotice.count({where:{subjectId:lead.id,resolvedAt:null}}),0);
    assert.equal(await db.crmActivity.count({where:{leadId:lead.id,type:'LLAMADA'}}),1);
  });
  await t.test('descarte directo sin motivo retira el aviso compartido y conserva la decisión',async()=>{
    const{lead,rows,body}=await fresh();
    assert.equal((await call(`${rows[0].id}/close`,{outcome:'DESCARTADO',confirmed:true,expectedUpdatedAt:body.expectedUpdatedAt})).status,200);
    assert.equal((await db.crmLead.findUnique({where:{id:lead.id}})).stage,'DESCARTADO');
    assert.equal(await db.importantNotice.count({where:{subjectId:lead.id,resolvedAt:null}}),0);
    assert.equal(await db.crmActivity.count({where:{leadId:lead.id,type:'CAMBIO_ETAPA',toStage:'DESCARTADO',authorId:people[0].id}}),1);
  });
  await t.test('cliente no aprobó conserva PERDIDO y el historial existente, sin un estado adicional',async()=>{
    const{lead,rows,body}=await fresh();
    assert.equal((await call(`${rows[0].id}/close`,{outcome:'CLIENTE_NO_APROBO',confirmed:true,expectedUpdatedAt:body.expectedUpdatedAt})).status,400);
    assert.equal((await call(`${rows[0].id}/close`,{outcome:'PERDIDO',confirmed:true,expectedUpdatedAt:body.expectedUpdatedAt,reason:'El cliente confirmó que no aprueba.'})).status,200);
    assert.equal((await db.crmLead.findUnique({where:{id:lead.id}})).stage,'PERDIDO');
    assert.equal(await db.crmActivity.count({where:{leadId:lead.id,toStage:'PERDIDO'}}),1);
    assert.deepEqual(await db.crmLead.findUnique({where:{id:oldLead.id}}),oldLead);
    assert.equal(await db.importantNotice.count({where:{subjectId:lead.id,resolvedAt:null}}),0);
  });
  await t.test('propiedad, permiso vigente, fechas, fuente cambiada y simultaneidad',async()=>{
    const{lead,rows,body}=await fresh();const path=`${rows[0].id}/schedule-follow-up`;
    assert.equal((await call(path,body,people[1])).status,404);
    for(const change of [{nextAction:''},{nextFollowUpAt:'2026-02-30'},{nextFollowUpAt:'2026-11-12'},{confirmed:false}])assert.equal((await call(path,{...body,...change})).status,400);
    await db.user.update({where:{id:people[0].id},data:{modulePermissions:{crm:false}}});assert.equal((await call(path,body)).status,403);
    await db.user.update({where:{id:people[0].id},data:{modulePermissions:{crm:true}}});
    await db.crmLead.update({where:{id:lead.id},data:{updatedAt:new Date('2026-11-03')}});assert.equal((await call(path,body)).status,409);
    await db.crmLead.update({where:{id:lead.id},data:{updatedAt:lead.updatedAt}});
    const results=await Promise.all(rows.map((row,i)=>call(`${row.id}/schedule-follow-up`,{...body,requestId:randomUUID(),nextAction:`Acción ${i}`},people[i])));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(await db.crmActivity.count({where:{leadId:lead.id}}),1);
    await db.crmLead.update({where:{id:lead.id},data:{stage:'GANADO'}});assert.equal((await call(path,{...body,requestId:randomUUID()})).status,409);
  });
  await t.test('si falla la escritura del aviso se revierte también la oportunidad y su actividad',async()=>{
    const{lead,rows,body}=await fresh();
    await connection.query(`CREATE FUNCTION fail_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo simulado de guardado'; END $$`);
    await connection.query(`CREATE TRIGGER fail_notice BEFORE UPDATE ON "ImportantNotice" FOR EACH ROW EXECUTE FUNCTION fail_notice()`);
    assert.equal((await call(`${rows[0].id}/schedule-follow-up`,body)).status,500);
    await connection.query('DROP TRIGGER fail_notice ON "ImportantNotice"');
    assert.equal(await db.crmActivity.count({where:{leadId:lead.id}}),0);
    assert.equal((await db.crmLead.findUnique({where:{id:lead.id}})).nextAction,null);
    assert.equal((await call(`${rows[0].id}/schedule-follow-up`,body)).status,200);
  });
  await t.test('las frases son propias y persistentes; excluyen otros autores, archivo y textos automáticos',async()=>{
    const{lead}=await fresh();
    const archived=await db.crmLead.create({data:{company:'Archivada ficticia',archivedAt:now}});
    await db.crmActivity.createMany({data:[
      {leadId:lead.id,authorId:people[0].id,type:'WHATSAPP',note:'Se contactó al cliente, pendiente de respuesta.',occurredAt:now,requestId:randomUUID()},
      {leadId:lead.id,authorId:people[1].id,type:'WHATSAPP',note:'PRIVADO OTRO AUTOR',occurredAt:now},
      {leadId:archived.id,authorId:people[0].id,type:'WHATSAPP',note:'ARCHIVADO',occurredAt:now},
      {leadId:lead.id,authorId:people[0].id,type:'WHATSAPP',note:'AUTOMÁTICO',occurredAt:now,requestId:'aviso-auto'},
      {leadId:lead.id,authorId:people[0].id,type:'NOTA',note:'Programación interna',occurredAt:now}
    ]});
    const get=()=>fetch(`http://127.0.0.1:${server.address().port}/api/crm/activity-suggestions`);
    for(let i=0;i<2;i++){
      const r=await get();assert.equal(r.status,200);const body=await r.json();
      assert.ok(body.suggestions.includes('Se contactó al cliente, pendiente de respuesta.'));
      assert.doesNotMatch(JSON.stringify(body),/PRIVADO|ARCHIVADO|AUTOMÁTICO|Programación interna|authorId|leadId/);
    }
    await db.user.update({where:{id:people[0].id},data:{modulePermissions:{crm:false}}});assert.equal((await get()).status,403);
  });
});
