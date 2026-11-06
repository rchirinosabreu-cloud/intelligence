import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {PrismaClient} from '@prisma/client';
import {briaTestDatabaseUrl} from './support/briaTestDatabase.js';
import {closeReviewNotice,followUpNotice,currentImportantNotice} from '../src/services/importantNoticeService.js';

const testUrl=briaTestDatabaseUrl();
test('respuesta comercial nativa: atomicidad, concurrencia, autor, reintentos y acceso vigente', {skip:!testUrl,timeout:90000},async t=>{
  const schema=`alert_response_${randomUUID().replaceAll('-','')}`;
  const connection=new pg.Client({connectionString:testUrl});await connection.connect();
  await connection.query(`CREATE SCHEMA "${schema}"`);await connection.query(`SET search_path TO "${schema}"`);
  const url=new URL(testUrl);url.searchParams.set('schema',schema);
  const db=new PrismaClient({datasources:{db:{url:url.href}}});
  t.after(async()=>{await db.$disconnect();await connection.query(`DROP SCHEMA "${schema}" CASCADE`);await connection.end();});
  const ddl=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8',env:{...process.env,DATABASE_URL:url.href},stdio:['ignore','pipe','pipe']});
  const tables=new Set(['User','TeamMember','CrmLead','CrmActivity','CrmRequest','Quotation','ImportantNotice','Notification','OperationalTraceEvent']);
  for(const [sql] of ddl.matchAll(/CREATE TYPE "[^"]+" AS ENUM \([\s\S]*?\);/g))await connection.query(sql);
  for(const [sql,name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g))if(tables.has(name))await connection.query(sql);
  for(const [sql,name] of ddl.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"[^;]+;/g))if(tables.has(name))await connection.query(sql);
  for(const [sql,name,target] of ddl.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT [^;]+?REFERENCES "([^"]+)"[^;]+;/g))if(tables.has(name)&&tables.has(target))await connection.query(sql);
  const now=new Date('2026-11-06T15:00:00Z');
  const people=[];
  for(const name of ['A','B']){
    const user=await db.user.create({data:{name,email:`${name}@example.invalid`,password:'fixture',role:'EDITOR',modulePermissions:{crm:true}}});
    await db.teamMember.create({data:{userId:user.id,name,role:'Comercial',areas:['COMERCIAL']}});people.push({...user,userId:user.id});
  }
  const fresh=async()=>{
    const lead=await db.crmLead.create({data:{company:'Empresa ficticia',stage:'PROPUESTA_ENVIADA',updatedAt:new Date('2026-11-01')}});
    const notices=[];
    for(const actor of people){
      const bell=await db.notification.create({data:{userId:actor.id,type:'CRM_FOLLOW_UP',message:'Prueba'}});
      notices.push(await db.importantNotice.create({data:{userId:actor.id,kind:'CRM_FOLLOW_UP',subjectId:lead.id,label:'CRM',message:'Revisar',level:'IMPORTANTE',notificationId:bell.id,createdAt:new Date('2026-11-02')}}));
    }
    return {lead,notices,body:{outcome:'PERDIDO',confirmed:true,reason:'Eligió otra propuesta',expectedUpdatedAt:lead.updatedAt.toISOString()}};
  };
  await t.test('si falla el cierre del aviso, no queda una decisión comercial parcial',async()=>{
    const {lead,notices,body}=await fresh();
    const failing={$transaction:work=>db.$transaction(tx=>work(new Proxy(tx,{get(target,key){return key==='notification'?{updateMany:async()=>{throw new Error('fallo inducido');}}:target[key];}})),{isolationLevel:'Serializable'})};
    await assert.rejects(closeReviewNotice(failing,notices[0].id,body,people[0],{now,log:()=>{}}),/fallo inducido/);
    assert.equal((await db.crmLead.findUnique({where:{id:lead.id}})).stage,'PROPUESTA_ENVIADA');
    assert.equal(await db.crmActivity.count({where:{leadId:lead.id}}),0);
    assert.equal((await db.importantNotice.findUnique({where:{id:notices[0].id}})).resolvedAt,null);
  });
  await t.test('dos personas no registran decisiones contradictorias ni duplican el historial',async()=>{
    const {lead,notices,body}=await fresh();
    const results=await Promise.allSettled(notices.map((notice,index)=>closeReviewNotice(db,notice.id,{...body,outcome:index?'GANADO':'PERDIDO'},people[index],{now,log:()=>{}})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.statusCode,409);
    const events=await db.crmActivity.findMany({where:{leadId:lead.id}});assert.equal(events.length,1);assert.ok(people.some(p=>p.id===events[0].authorId));
    for(const person of people)await currentImportantNotice(db,person.id,new Date(now.getTime()+6*60000),{operationalSource:async()=>[]});
    assert.equal(await db.importantNotice.count({where:{subjectId:lead.id,resolvedAt:null}}),0);
  });
  await t.test('una gestión es un único evento nativo, no un cierre ganado ni otro seguimiento',async()=>{
    const {lead,notices}=await fresh();
    await followUpNotice(db,notices[0].id,{channel:'WHATSAPP'},people[0],{now,log:()=>{}});
    await assert.rejects(followUpNotice(db,notices[0].id,{channel:'WHATSAPP'},people[0],{now}),{statusCode:409});
    assert.equal(await db.crmActivity.count({where:{leadId:lead.id}}),1);
    assert.equal((await db.crmLead.findUnique({where:{id:lead.id}})).stage,'PROPUESTA_ENVIADA');
    assert.equal((await db.notification.findUnique({where:{id:notices[0].notificationId}})).isRead,true);
    await assert.rejects(followUpNotice(db,notices[1].id,{channel:'LLAMADA'},people[1],{now}),{statusCode:409});
  });
  await t.test('el permiso revocado después de abrir la alerta se respeta sin borrar el historial',async()=>{
    const {notices,body}=await fresh();
    await db.user.update({where:{id:people[0].id},data:{modulePermissions:{crm:false}}});
    await assert.rejects(closeReviewNotice(db,notices[0].id,body,people[0],{now}),{statusCode:403});
    assert.equal((await db.importantNotice.findUnique({where:{id:notices[0].id}})).resolvedAt,null);
  });
});
