import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require=createRequire(import.meta.url);
const result=await build({entryPoints:['src/components/reports/ReportHistory.jsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':path.resolve('src')},external:['react','react-dom','axios'],logLevel:'silent'});
const compiled={exports:{}};
new Function('require','module','exports',result.outputFiles[0].text)(require,compiled,compiled.exports);
const {default:ReportHistory,createReportHistoryLoader,formatReportHistoryLabel}=compiled.exports;
const row=(id,extra={})=>({id,status:'REVIEW',startDate:'2026-08-01T00:00:00Z',endDate:'2026-08-31T00:00:00Z',createdAt:'2026-09-01T12:00:00Z',...extra});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('labels report month and saved status without claiming a legacy report is newly published',()=>{
 assert.match(formatReportHistoryLabel(row('a')),/agosto.*2026.*En revisión/i);
 assert.match(formatReportHistoryLabel(row('a',{status:'PUBLISHED'})),/Publicado/);
 assert.match(formatReportHistoryLabel(row('a',{startDate:null,endDate:null})),/Período sin fecha/);
});

test('loads authorized pages and keeps prior identity/order while exposing a next cursor',async()=>{
 const calls=[],states=[];
 const loader=createReportHistoryLoader({getToken:()=> 'token-test',onChange:state=>states.push(state),request:async(url,config)=>{calls.push({url,config});return {status:200,data:calls.length===1?{reports:[row('a')],nextCursor:'next-page'}:{reports:[row('a',{status:'PUBLISHED'}),row('b')],nextCursor:null}};}});
 await loader.setContext({clientId:'client A',apiBaseUrl:'https://api.test/'});
 await loader.loadMore();
 assert.ok(states.length>0,'loading and result state must be emitted');
 assert.deepEqual(states.at(-1).reports.map(item=>item.id),['a','b']);
 assert.equal(states.at(-1).reports[0].status,'PUBLISHED');
 assert.equal(states.at(-1).nextCursor,null);
 assert.equal(calls[0].url,'https://api.test/api/reports');
 assert.deepEqual(calls[0].config.params,{clientId:'client A'});
 assert.equal(calls[1].config.params.cursor,'next-page');
 assert.equal(calls[0].config.headers.Authorization,'Bearer token-test');
});

test('ignores stale client page responses even when transport does not honor abort',async()=>{
 const first=deferred(),states=[];
 const loader=createReportHistoryLoader({onChange:state=>states.push(state),request:async(url,{params})=>params.clientId==='first'?first.promise:{status:200,data:{reports:[row('second')],nextCursor:null}}});
 const old=loader.setContext({clientId:'first',apiBaseUrl:''});
 await loader.setContext({clientId:'second',apiBaseUrl:''});
 first.resolve({status:200,data:{reports:[row('old')],nextCursor:null}});await old;
 assert.ok(states.length>0,'current client state must be emitted');
 assert.equal(states.at(-1).clientId,'second');
 assert.deepEqual(states.at(-1).reports.map(item=>item.id),['second']);
});

test('opens only a successful current response with the selected report identity',async()=>{
 const opened=[],logs=[];
 let openResponse={status:200,data:{report:{id:'a',clientId:'c',normalizedMetrics:{schemaVersion:1}}}};
 const loader=createReportHistoryLoader({onOpen:report=>opened.push(report),logError:(...args)=>logs.push(args),request:async(url)=>url.endsWith('/a')?openResponse:{status:200,data:{reports:[row('a')],nextCursor:null}}});
 await loader.setContext({clientId:'c',apiBaseUrl:''});
 await loader.open('a');assert.equal(opened.length,1);assert.equal(opened[0].normalizedMetrics.schemaVersion,1);
 openResponse={status:200,data:{report:{id:'other',clientId:'c'}}};await loader.open('a');assert.equal(opened.length,1);
 openResponse={status:500,data:{message:'No se pudo consultar'}};await loader.open('a');assert.equal(opened.length,1);
 assert.equal(logs.length,2);
});

test('never opens an old client response after switching clients or disposing',async()=>{
 const pending=deferred(),opened=[],calls=[];
 const loader=createReportHistoryLoader({onOpen:item=>opened.push(item),request:async(url)=>{calls.push(url);return url.endsWith('/a')?pending.promise:{status:200,data:{reports:[row('a')],nextCursor:null}};}});
 await loader.setContext({clientId:'first',apiBaseUrl:''});const old=loader.open('a');
 await loader.setContext({clientId:'second',apiBaseUrl:''});loader.dispose();
 pending.resolve({status:200,data:{report:{id:'a',clientId:'first'}}});await old;
 assert.ok(calls.some(url=>url.endsWith('/a')),'opening was requested before switching context');
 assert.equal(opened.length,0);
});

test('shows list failures instead of an empty-success state and logs the actual server payload',async()=>{
 const logs=[],states=[];const payload={message:'Consulta no disponible'};
 const loader=createReportHistoryLoader({onChange:state=>states.push(state),logError:(...args)=>logs.push(args),request:async()=>{throw {response:{data:payload}};}});
 await loader.setContext({clientId:'c',apiBaseUrl:''});
 assert.ok(states.length>0,'failed loading must emit its error state');
 assert.match(states.at(-1).error,/Consulta no disponible/);
 assert.equal(states.at(-1).loaded,false);
 assert.equal(logs[0][1],payload);
});

test('server-renders an accessible shared Select and disabled open control',()=>{
 const html=renderToStaticMarkup(React.createElement(ReportHistory,{clientId:'',apiBaseUrl:'',onOpen(){},disabled:false}));
 assert.match(html,/Reportes guardados/);
 assert.match(html,/data-brain-select/);
 assert.match(html,/Selecciona un cliente/);
 assert.match(html,/<label[^>]*for="report-history/);
 assert.match(html,/<button[^>]*disabled[^>]*>Abrir reporte/);
});

test('refresh adds a new report while preserving loaded selections from later pages', async () => {
 const states = []; let count = 0;
 const responses = [
  { reports: [row('a')], nextCursor: 'page-two' },
  { reports: [row('b')], nextCursor: null },
  { reports: [row('new'), row('a', { status: 'PUBLISHED' })], nextCursor: 'page-two' },
 ];
 const loader = createReportHistoryLoader({ onChange: state => states.push(state), request: async () => ({ status: 200, data: responses[count++] }) });
 await loader.setContext({ clientId: 'client', apiBaseUrl: '' });
 await loader.loadMore();
 await loader.reload();
 assert.deepEqual(states.at(-1).reports.map(item => item.id), ['new', 'a', 'b']);
 assert.equal(states.at(-1).reports.find(item => item.id === 'a').status, 'PUBLISHED');
});

test('a refresh requested during loading runs after the pending page completes', async () => {
 const pending = deferred(), states = []; let count = 0;
 const loader = createReportHistoryLoader({ onChange: state => states.push(state), request: async () => ++count === 1 ? pending.promise : { status: 200, data: { reports: [row('new'), row('old')], nextCursor: null } } });
 const initial = loader.setContext({ clientId: 'client', apiBaseUrl: '' });
 await loader.reload();
 pending.resolve({ status: 200, data: { reports: [row('old')], nextCursor: null } });
 await initial;
 assert.equal(count, 2);
 assert.deepEqual(states.at(-1).reports.map(item => item.id), ['new', 'old']);
});
