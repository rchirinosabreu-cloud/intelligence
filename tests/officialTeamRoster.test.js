import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-roster-tests-not-a-real-secret-2026';
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/never_connect';
// Never initialize a real database connection in this unit suite.
const db = {};
globalThis.prisma = db;
const { buildOperationalHealthSnapshot, getOperationalHealth } = await import('../src/services/operationalHealthService.js');
const { getOperationalTrace } = await import('../src/services/operationalTraceService.js');
const { login } = await import('../src/controllers/authController.js');
const { authenticateToken } = await import('../src/middlewares/authMiddleware.js');
const { createNotification } = await import('../src/services/notificationService.js');
const { sendPushForNotification } = await import('../src/services/pushNotificationService.js');
const { createDashboardAnnouncement } = await import('../src/services/personalDashboardService.js');
const { default: teamRouter } = await import('../src/routes/api/team.js');
const { requestPasswordReset, completePasswordReset } = await import('../src/services/passwordResetService.js');
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const official = { id: 'u1', name: 'Nombre anterior', isActive: true, role: 'ADMIN', sessionVersion: 2, teamMember: { id: 'm1', name: 'Nombre en Equipo', isActive: true } };
const route = method => teamRouter.stack.find(layer => layer.route?.path === '/:id' && layer.route.methods[method]).route.stack[0].handle;

test('participation excludes unlinked accounts and inactive members even if their accounts remain active', () => {
  const snapshot = buildOperationalHealthSnapshot({ users: [official,
    { id: 'ghost', name: 'Fuera de Equipo', isActive: true, teamMember: null },
    { ...official, id: 'former', teamMember: { id: 'm2', isActive: false } },
  ] });
  assert.equal(snapshot.adoption.totalUsers, 1);
  assert.deepEqual(snapshot.users.map(user => user.id), ['u1']);
});

test('participation reads the official roster including members without a login account', async () => {
  const deps = Object.fromEntries(['task','taskComment','operationalEvent','contentPlan','contentItem','quotation','globalAnnouncement','notification','flowMessage','client'].map(key => [key, { findMany: async () => [] }]));
  deps.user = { findMany: async () => [official, { id:'ghost', name:'Ghost', isActive:true }] };
  deps.teamMember = { findMany: async () => [
    { id:'m1', name:'Nombre en Equipo', isActive:true, userId:'u1', user:official },
    { id:'m3', name:'Sin cuenta aún', isActive:true, userId:null, user:null },
  ] };
  const snapshot = await getOperationalHealth({ requester:{ role:'ADMIN' }, db:deps });
  assert.deepEqual(snapshot.users.map(user => user.name).sort(), ['Nombre en Equipo', 'Sin cuenta aún']);
  assert.equal(snapshot.adoption.totalUsers, 2);
});

test('history member selector requires active membership without filtering historical actors', async () => {
  let query;
  const historical = { id:'event', eventType:'TASK_CREATED', actorId:'old', subjectUserId:'old', actor:{ id:'old', name:'Persona anterior' }, occurredAt:new Date(), metadata:{} };
  const result = await getOperationalTrace({ requester:{role:'ADMIN'}, db:{
    user:{ findMany:async args => { query=args; return []; } },
    operationalTraceEvent:{ findMany:async () => [historical] },
    task:{findMany:async()=>[]},
  } });
  assert.deepEqual(query.where.teamMember, { is:{ isActive:true } });
  assert.match(JSON.stringify(result), /Persona anterior/);
});

for (const member of [null, {id:'m1',isActive:false}]) {
  test(`login rejects an active account with ${member ? 'inactive' : 'no'} membership`, async () => {
    const password = 'safe-test-password';
    db.user = { findUnique:async () => ({...official, password:await bcrypt.hash(password, 4), teamMember:member}) };
    db.operationalTraceEvent = { create:async () => { throw new Error('Rejected login must not record success'); } };
    const res = response();
    await login({body:{email:'person@example.invalid',password}},res);
    assert.equal(res.statusCode,401);
    assert.equal(res.body.token,undefined);
  });
  test(`an existing session cannot bypass ${member ? 'inactive' : 'missing'} membership`, async () => {
    db.user = { findUnique:async () => ({...official,teamMember:member}) };
    const token=jwt.sign({userId:'u1',sessionVersion:2},process.env.JWT_SECRET);
    const res=response(); let next=false;
    await authenticateToken({method:'GET',originalUrl:'/api/team',headers:{authorization:`Bearer ${token}`}},res,()=>{next=true;});
    assert.equal(res.statusCode,401); assert.equal(next,false);
  });
}

test('a current official member keeps access, but an old session version remains revoked', async () => {
  db.user={findUnique:async()=>official};
  for(const version of [2,1]) {
    const res=response(); let next=false;
    await authenticateToken({method:'GET',originalUrl:'/api/team',headers:{authorization:`Bearer ${jwt.sign({userId:'u1',sessionVersion:version},process.env.JWT_SECRET)}`}},res,()=>{next=true;});
    assert.equal(next,version===2);
    assert.equal(res.statusCode,version===2?200:401);
  }
});

for(const method of ['put','delete']) {
  test(`${method} deactivation revokes the linked account and sessions in the same transaction`,async()=>{
    const calls=[];
    const state={...official, teamMember:undefined};
    db.teamMember={findUnique:async()=>({id:'m1',isActive:true,userId:'u1',user:state}), update:async({data})=>({id:'m1',userId:'u1',...data})};
    db.user={update:async args=>{calls.push(args);return state;}};
    db.pushSubscription={updateMany:async()=>({count:0})};
    db.$transaction=async fn=>fn(db);
    const res=response();
    await route(method)({params:{id:'m1'},user:{role:'ADMIN',userId:'actor'},body:{isActive:false}},res);
    assert.equal(res.statusCode,200);
    assert.ok(calls.some(call=>call.where.id==='u1' && call.data.isActive===false && call.data.sessionVersion?.increment===1));
  });
}

test('reactivation is explicit and increments session version without reviving push devices',async()=>{
  const calls=[];
  db.teamMember={findUnique:async()=>({id:'m1',isActive:false,userId:'u1',user:{...official,isActive:false}}),update:async({data})=>({id:'m1',userId:'u1',...data})};
  db.user={update:async args=>{calls.push(args);return official;}};
  db.pushSubscription={updateMany:async()=>{throw new Error('Do not revive old subscriptions');}};
  db.$transaction=async fn=>fn(db);
  const res=response();
  await route('put')({params:{id:'m1'},user:{role:'ADMIN',userId:'actor'},body:{isActive:true}},res);
  assert.equal(res.statusCode,200);
  assert.ok(calls.some(call=>call.data.isActive===true && call.data.sessionVersion?.increment===1));
});

test('invalid membership status is rejected instead of coerced to true',async()=>{
  const res=response();
  await route('put')({params:{id:'m1'},user:{role:'ADMIN'},body:{isActive:'false'}},res);
  assert.equal(res.statusCode,400);
});

test('notifications skip accounts outside the active roster without persisting or pushing',async()=>{
  let writes=0;
  const result=await createNotification({userId:'ghost',message:'Private team message'}, {db:{
    user:{findFirst:async()=>null},notification:{create:async()=>{writes++;return{};}},
  },pushSender:async()=>{writes++;}});
  assert.equal(result,null); assert.equal(writes,0);
});

test('queued push delivery rechecks membership before reading subscriptions',async()=>{
  let deliveries=0;
  const result=await sendPushForNotification({userId:'ghost'}, {configured:true,db:{
    user:{findFirst:async()=>null},
    pushSubscription:{findMany:async()=>{deliveries++;return[];}},
  }});
  assert.equal(deliveries,0); assert.equal(result.delivered,0);
});

test('global announcement recipient query includes only official active members',async()=>{
  let query;
  await createDashboardAnnouncement({requester:{role:'ADMIN',userId:'u1'},scope:'GLOBAL',content:'Aviso'}, {db:{
    globalAnnouncement:{create:async()=>({id:'a1'})},
    user:{findMany:async args=>{query=args;return[];}},
  },notificationCreator:async()=>{}});
  assert.deepEqual(query.where.teamMember,{is:{isActive:true}});
});

test('personal announcements reject a target that left Equipo',async()=>{
  await assert.rejects(createDashboardAnnouncement({requester:{role:'ADMIN'},scope:'MEMBER',content:'Aviso',targetUserId:'ghost'}, {
    db:{user:{findFirst:async()=>null}},notificationCreator:async()=>{throw new Error('Must not send');},
  }),error=>error.statusCode===400);
});

test('participation does not silently hide official members after the eighth row',async()=>{
  const source=await readFile('src/components/modules/OperationalHealth.jsx','utf8');
  assert.doesNotMatch(source,/data\.users\.slice\(0,\s*8\)/);
});

test('password recovery does not send email or accept a code for a former member',async()=>{
  const dependencies={
    userRepository:{findByEmail:async()=>({...official,teamMember:null})},
    generateCode:()=>{throw new Error('Must not issue code');},
    now:()=>new Date(),compareValue:async()=>true,
    resetCodeRepository:{findLatestUsableByEmail:async()=>({id:'r1',codeHash:'hash'})},
  };
  await assert.doesNotReject(requestPasswordReset({email:'former@example.invalid'},dependencies));
  await assert.rejects(completePasswordReset({email:'former@example.invalid',code:'123456',newPassword:'new-password'},dependencies),/Codigo invalido/);
});

test('new task assignments reject members that are no longer active',async()=>{
  const {createTask}=await import('../src/services/nativeTaskService.js');
  db.teamMember={findMany:async()=>[]};
  db.$executeRaw=async()=>0;
  db.$transaction=async fn=>fn(db);
  db.task={create:async()=>{throw new Error('Must reject before task persistence');}};
  await assert.rejects(createTask({title:'Test',clientId:'c1',assigneeId:'former'}),error=>error.statusCode===400);
});

test('the direct notification endpoint reports an invalid recipient instead of false success',async()=>{
  const {addNotification}=await import('../src/controllers/notificationController.js');
  db.user={findFirst:async()=>null};
  const responseResult=response();
  await addNotification({body:{userId:'former',message:'Aviso'}},responseResult);
  assert.equal(responseResult.statusCode,400);
});

test('assigning a client owner rejects a former community manager',async()=>{
  const {assignClientOwner}=await import('../src/services/personalDashboardService.js');
  db.teamMember={findUnique:async()=>({id:'former',role:'Community Manager',isActive:false})};
  db.client={update:async()=>{throw new Error('Must not assign');}};
  await assert.rejects(assignClientOwner({requester:{role:'ADMIN'},clientId:'c1',memberId:'former'}),error=>error.statusCode===404);
});

test('changing a plan owner rejects an inactive member before persisting',async()=>{
  const {updateContentPlan}=await import('../src/services/contentService.js');
  db.$queryRaw=async()=>[{exists:true}];
  db.contentPlan={findUnique:async()=>({ownerId:'previous'}),update:async()=>{throw new Error('Must not assign plan');}};
  db.teamMember={findMany:async()=>[]};
  await assert.rejects(updateContentPlan('p1',{ownerId:'former'}),error=>error.statusCode===400);
});

test('explicitly adding a former account through Equipo activates it without reusing old sessions',async()=>{
  let update;
  db.user={findUnique:async()=>({...official,isActive:false}),update:async args=>{update=args;return {...official,...args.data};}};
  db.teamMember={create:async({data})=>({id:'new-member',...data})};
  db.$transaction=async fn=>fn(db);
  const create=teamRouter.stack.find(layer=>layer.route?.path==='/'&&layer.route.methods.post).route.stack[0].handle;
  const result=response();
  await create({user:{role:'ADMIN'},body:{name:'Reingreso',role:'Editor',email:'return@example.invalid'}},result);
  assert.equal(result.statusCode,201);
  assert.equal(update.data.isActive,true);
  assert.deepEqual(update.data.sessionVersion,{increment:1});
});
