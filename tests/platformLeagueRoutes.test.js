import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPlatformLeagueRouter } from '../src/routes/api/platformLeague.js';

test('the collection route requires authentication and only uses the signed-in recipient', async () => {
  const calls = [];
  const app = express();
  app.use((req, res, next) => { if (req.headers.authorization === 'test-session') req.user = { userId: 'current-user' }; next(); });
  app.use('/api/league', createPlatformLeagueRouter({ service: { recognitionsFor: async args => { calls.push(args); return { month: '2026-11', total: 0, counts: {}, recent: [], hasMore: false }; } } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/league/recognitions?userId=other-user`;
    const denied = await fetch(url);
    assert.equal(denied.status, 401);
    assert.equal(calls.length, 0);
    const allowed = await fetch(url, { headers: { authorization: 'test-session' } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    assert.deepEqual(calls, [{ userId: 'current-user' }]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});


test('meeting route uses the signed-in admin identity and ignores client-supplied points or actor', async()=>{
 const calls=[];const app=express();app.use(express.json());
 app.use((req,res,next)=>{req.user={userId:'signed-in'};next();});
 app.use('/api/league',createPlatformLeagueRouter({service:{awardMeeting:async args=>{calls.push(args);return {points:10};}}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try {const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/league/meetings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberId:'person',day:'2026-11-03',userId:'forged',points:100})});
 assert.equal(response.status,200);assert.deepEqual(calls,[{userId:'signed-in',memberId:'person',day:'2026-11-03'}]);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
