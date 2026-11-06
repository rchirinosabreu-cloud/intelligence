import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { SHARED_TEST_DATABASE_URL, assertSharedTaskDatabase } from './support/sharedTaskSandbox.js';
import { createImportantNoticeRouter } from '../src/routes/api/importantNotices.js';
import { syncOperationalNotices } from '../src/services/operationalNoticeService.js';

// Exclusivamente la base local aislada ya preparada. No carga .env ni arranca relojes/push.
test('HTTP y PostgreSQL: permisos, concurrencia, pausa durable y cierre nativo sin otra notificación', async () => {
  assertSharedTaskDatabase(SHARED_TEST_DATABASE_URL);
  const db=new PrismaClient({datasources:{db:{url:SHARED_TEST_DATABASE_URL}}});
  let server, user, client; let now=new Date('2026-11-12T15:00:00Z');
  try {
    const [identity]=await db.$queryRaw`SELECT current_database() AS database, current_user AS username, inet_server_port() AS port`;
    assert.deepEqual(identity,{database:'shared_tasks_demo',username:'shared_tasks_test',port:55451});
    const uid=randomUUID();
    user=await db.user.create({data:{name:'PM avisos · prueba local',email:`avisos-${uid}@example.invalid`,password:'NO_LOGIN',role:'PROJECT_MANAGER',
      modulePermissions:{clientes:true,financiero:false},teamMember:{create:{name:'PM avisos · prueba local',role:'Project Manager',areas:['PROJECT_MANAGEMENT','ADMINISTRATIVA','DIRECCION']}}},include:{teamMember:true}});
    client=await db.client.create({data:{name:'Horizonte · prueba avisos',slug:`avisos-${uid}`,projectManagerId:user.teamMember.id,
      contracts:{create:{status:'ACTIVO',startDate:'2026-10-15',endDate:'2027-02-14',cutDay:15,monthlyReport:true}}}});
    await db.importantNotice.create({data:{userId:user.id,kind:'CARTERA_UNICO',subjectId:'privado',level:'IMPORTANTE',label:'Privado',message:'NO EXPONER',createdAt:new Date('2020-01-01')}});
    const bell=await db.notification.create({data:{userId:user.id,relatedId:client.id,type:'CIERRE_MENSUAL',message:'Aviso existente'}});
    const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={userId:req.headers['x-user']||user.id,name:user.name};next();});
    app.use('/api/important-notices',createImportantNoticeRouter({db,clock:()=>now}));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const base=`http://127.0.0.1:${server.address().port}/api/important-notices`;
    const call=async(path='',body,headers={})=>{const response=await fetch(`${base}/${path}`,{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
    const reads=await Promise.all(Array.from({length:6},()=>call('current')));
    assert.ok(reads.every(r=>r.status===200 && r.data.notice?.kind==='OPERACION_CICLO'));
    assert.equal(new Set(reads.map(r=>r.data.notice.id)).size,1);
    const id=reads[0].data.notice.id;
    assert.doesNotMatch(JSON.stringify(reads),/NO EXPONER|accountsReceivables|balanceCents/);
    assert.equal(await db.notification.count({where:{userId:user.id}}),1);
    assert.equal((await db.importantNotice.findUnique({where:{id}})).notificationId,bell.id);
    assert.equal((await call(`${id}/acknowledge`,{})).status,400,'recibir no equivale a cerrar el mes');
    assert.equal((await call(`${id}/snooze`,{option:'1h'},{'x-user':'otro'})).status,404);
    assert.equal((await call(`${id}/snooze`,{option:'1h'})).status,200);
    await db.clientMonthlyReport.create({data:{clientId:client.id,year:2026,month:10,status:'ENVIADO'}});
    now=new Date('2026-11-12T15:10:00Z');
    assert.equal((await call('current')).data.notice,null);
    const paused=await db.importantNotice.findUnique({where:{id}});
    assert.equal(paused.snoozedUntil.toISOString(),'2026-11-12T16:00:00.000Z');
    assert.doesNotMatch(paused.message,/informe sigue pendiente/);
    now=new Date('2026-11-12T16:01:00Z');
    assert.equal((await call('current')).data.notice.id,id);
    await db.clientMonthlyClose.create({data:{clientId:client.id,year:2026,month:10}});
    assert.equal((await call(`${id}/snooze`,{option:'1h'})).status,409,'una pantalla antigua revalida su origen');
    assert.equal((await call('current')).data.notice,null);
    assert.equal((await db.importantNotice.findUnique({where:{id}})).resolution,'YA_ATENDIDO');
    await db.clientMonthlyClose.deleteMany({where:{clientId:client.id}});
    assert.equal((await call('current')).data.notice.id,id,'reabrir el ciclo reutiliza el aviso');
    await db.user.update({where:{id:user.id},data:{modulePermissions:{clientes:false,financiero:false}}});
    assert.equal((await call('current')).data.notice,null);
    assert.equal((await call(`${id}/snooze`,{option:'1h'})).status,409);
    assert.equal(await db.notification.count({where:{userId:user.id}}),1,'no hay campanas nuevas');
    const before=await db.importantNotice.count({where:{userId:user.id}});
    await assert.rejects(syncOperationalNotices(db,user.id,now,async()=>{throw new Error('fuente caída');}),/fuente caída/);
    assert.equal(await db.importantNotice.count({where:{userId:user.id}}),before);
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(client)await db.client.delete({where:{id:client.id}});
    if(user){await db.teamMember.deleteMany({where:{userId:user.id}});await db.user.delete({where:{id:user.id}});}
    await db.$disconnect();
  }
});
