import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required. Never load .env.');
const target = new URL(url);
if (target.hostname !== '127.0.0.1' || target.port !== '55448' || target.pathname !== '/recognition_test' || target.username !== 'recognition_test') throw new Error('Refusing a non-isolated database.');
process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-roster-integration-secret-not-production';
const db = new PrismaClient({datasources:{db:{url}}});
globalThis.prisma = db;
const sql = new pg.Client({connectionString:url});
const {activeTeamUserWhere, readParticipationRoster, setLinkedAccountStatus, assertActiveTeamMembers} = await import('../src/services/teamRosterService.js');
const {authenticateToken} = await import('../src/middlewares/authMiddleware.js');
const {default:router} = await import('../src/routes/api/team.js');
const {createNotification} = await import('../src/services/notificationService.js');
const {getOperationalTrace} = await import('../src/services/operationalTraceService.js');
const {createTask} = await import('../src/services/nativeTaskService.js');
const ids={users:[],members:[],tasks:[]}; let active, former, orphan, noLogin, task, comment, client;
const res=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
const handler=method=>router.stack.find(layer=>layer.route?.path==='/:id'&&layer.route.methods[method]).route.stack[0].handle;
const change=async(method,member,isActive)=>{
  const response=res();
  await handler(method)({params:{id:member.id},user:{role:'ADMIN',userId:active.userId},body:{isActive}},response);
  assert.equal(response.statusCode,200,JSON.stringify(response.body));
};

test.before(async()=>{
  await sql.connect();
  const ddl=await readFile('output/recognition-test-schema.sql','utf8');
  const needed=['User','TeamMember','Client','Task','TaskComment','OperationalTraceEvent','PushSubscription','Notification'];
  for(const [statement,name] of ddl.matchAll(/CREATE TYPE "([^"]+)" AS ENUM \([\s\S]*?\);/g)) if(!(await sql.query('SELECT 1 FROM pg_type WHERE typname=$1',[name])).rowCount) await sql.query(statement);
  for(const [statement,name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g)) if(needed.includes(name)&&!(await sql.query('SELECT to_regclass($1) AS r',[`"${name}"`])).rows[0].r) await sql.query(statement);
  const user=async name=>{
    const row=await db.user.create({data:{name,email:`${randomUUID()}@example.invalid`,password:'not-a-password',isActive:true,role:'EDITOR',modulePermissions:{gestion:true}}});
    ids.users.push(row.id); return row;
  };
  const member=async(name,isActive=true)=>{
    const u=await user(name);
    const row=await db.teamMember.create({data:{name:`Equipo ${name}`,role:'Prueba',userId:u.id,isActive}});
    ids.members.push(row.id); return row;
  };
  active=await member('Actual'); former=await member('Anterior',false); orphan=await user('Sin pertenencia');
  noLogin=await db.teamMember.create({data:{name:'Equipo sin cuenta',role:'Prueba'}});ids.members.push(noLogin.id);
  client=await db.client.create({data:{name:'Roster isolated',slug:randomUUID()}});
  task=await db.task.create({data:{title:'Historia conservada',clientId:client.id,creatorId:former.userId,assigneeId:former.id,status:'REALIZADA',completedAt:new Date('2026-09-10T15:00:00Z')}});ids.tasks.push(task.id);
  comment=await db.taskComment.create({data:{taskId:task.id,authorId:former.userId,content:'Comentario histórico'}});
  await db.operationalTraceEvent.create({data:{eventType:'TASK_CREATED',actorId:former.userId,subjectUserId:former.userId,taskId:task.id,metadata:{}}});
});
test.after(async()=>{
  // Only rows created by this suite, on the exact validated local database.
  await db.operationalTraceEvent.deleteMany({where:{OR:[{actorId:{in:ids.users}},{subjectUserId:{in:ids.users}}]}});
  await db.notification.deleteMany({where:{userId:{in:ids.users}}});
  await db.pushSubscription.deleteMany({where:{userId:{in:ids.users}}});
  await db.taskComment.deleteMany({where:{taskId:{in:ids.tasks}}});
  await db.task.deleteMany({where:{id:{in:ids.tasks}}});
  await db.teamMember.deleteMany({where:{id:{in:ids.members}}});
  await db.user.deleteMany({where:{id:{in:ids.users}}});
  if(client) await db.client.delete({where:{id:client.id}});
  await db.$disconnect();await sql.end();
});

test('real relation filters exclude orphans and inactive members; participation includes unlinked official members',async()=>{
  const users=await db.user.findMany({where:{...activeTeamUserWhere(),id:{in:ids.users}}});
  assert.deepEqual(users.map(u=>u.id),[active.userId]);
  const roster=(await readParticipationRoster(db)).filter(u=>ids.members.includes(u.teamMember.id));
  assert.equal(roster.length,2);assert.ok(roster.some(u=>u.id===noLogin.id));
  const history=await getOperationalTrace({requester:{role:'ADMIN'},filters:{userId:former.userId},db});
  assert.ok(!history.users.some(u=>u.id===former.userId||u.id===orphan.id));
  assert.ok(history.timeline.some(e=>e.taskId===task.id&&e.actor.name==='Anterior'));
});

test('new notifications are blocked for orphan/inactive accounts but persist for active teammates',async()=>{
  const options={db,traceRecorder:async()=>{},pushSender:async()=>{}};
  assert.equal(await createNotification({userId:orphan.id,message:'Must not send'},options),null);
  assert.equal(await createNotification({userId:former.userId,message:'Must not send'},options),null);
  const sent=await createNotification({userId:active.userId,message:'Welcome',type:'GENERAL'},options);
  assert.equal(sent.userId,active.userId);
  assert.equal(await db.notification.count({where:{userId:{in:[orphan.id,former.userId]}}}),0);
});

test('PUT/DELETE revoke sessions and devices; explicit reactivation never revives an old token',async()=>{
  await db.pushSubscription.create({data:{userId:former.userId,endpoint:`https://example.invalid/${randomUUID()}`,p256dh:'test-key',auth:'test-auth'}});
  await change('put',former,true);
  const prior=await db.user.findUnique({where:{id:former.userId}});
  const token=jwt.sign({userId:former.userId,sessionVersion:prior.sessionVersion},process.env.JWT_SECRET);
  await change('delete',former,false);
  assert.equal((await db.user.findUnique({where:{id:former.userId}})).isActive,false);
  assert.equal(await db.pushSubscription.count({where:{userId:former.userId,isActive:true}}),0);
  await change('put',former,true);
  const response=res();let next=false;
  await authenticateToken({method:'GET',originalUrl:'/api/team',headers:{authorization:`Bearer ${token}`}},response,()=>{next=true;});
  assert.equal(response.statusCode,401);assert.equal(next,false);
  assert.equal(await db.pushSubscription.count({where:{userId:former.userId,isActive:true}}),0);
  assert.equal((await db.task.findUnique({where:{id:task.id}})).completedAt.toISOString(),'2026-09-10T15:00:00.000Z');
  assert.equal((await db.taskComment.findUnique({where:{id:comment.id}})).content,'Comentario histórico');
});

test('account/device failure rolls back the member change and both directions remain consistent under concurrency',async()=>{
  await assert.rejects(db.$transaction(async tx=>{
    const member=await tx.teamMember.update({where:{id:former.id},data:{isActive:false}});
    await setLinkedAccountStatus(tx,member,false);
    throw new Error('Simulated persistence failure');
  }),/Simulated persistence/);
  assert.equal((await db.teamMember.findUnique({where:{id:former.id}})).isActive,true);
  assert.equal((await db.user.findUnique({where:{id:former.userId}})).isActive,true);
  await Promise.all([change('put',former,false),change('put',former,true)]);
  const member=await db.teamMember.findUnique({where:{id:former.id},include:{user:true}});
  assert.equal(member.isActive,member.user.isActive);
});

test('official assignment validation accepts current members, rejects new inactive assignments, preserves historical ones',async()=>{
  await change('put',former,false);
  await assert.doesNotReject(assertActiveTeamMembers(db,[active.id,noLogin.id]));
  await assert.rejects(assertActiveTeamMembers(db,[former.id]),{statusCode:400});
  await assert.doesNotReject(assertActiveTeamMembers(db,[former.id],[former.id]));
  await assert.rejects(createTask({title:'Invalid assignment',clientId:client.id,assigneeId:former.id}),{statusCode:400});
  // Existing author/assignee links remain unchanged. No lifecycle mutation is needed for this check.
  assert.equal((await db.task.findUnique({where:{id:task.id}})).assigneeId,former.id);
});
