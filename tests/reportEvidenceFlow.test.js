import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceExtractionHandler, createEvidenceWorkflowHandlers } from '../src/routes/api/reportEvidenceRoutes.js';
import { assertEvidenceReady, composeEvidenceNarrative } from '../src/services/reportWorkflowService.js';
import { buildMetricReportHtml, renderMetricReportPdf } from '../src/services/metricReportPdf.js';

// In-memory persistence/transport doubles exercise route orchestration and CAS
// predicates. They do not certify PostgreSQL locking or a deployed environment.
const copy=value=>structuredClone(value);
const response=()=>({code:200,payload:null,headers:{},status(code){this.code=code;return this;},json(payload){this.payload=payload;return this;},send(payload){this.payload=payload;return this;},set(name,value){if(typeof name==='object')Object.assign(this.headers,name);else this.headers[name]=value;return this;}});
const period={start:'2026-08-01',end:'2026-08-31'};
const observation=(extra={})=>({id:'views',key:'views',label:'Visualizaciones',value:8418,rawValue:'8.418',platform:'INSTAGRAM',scope:'TOTAL',unit:'count',precision:'EXACT',period,contextKey:'instagram-overview',evidence:'8.418 visualizaciones en la tarjeta',...extra});

async function fixture(extraction={metrics:[observation()],panels:[]}){
 let saved=null,renderedHtml=null;
 const metricReport={
  async create({data}){saved={...copy(data),id:'flow-report',client:{id:'flow-client',name:'Cliente de prueba'},createdAt:new Date('2026-09-15T12:00:00Z'),updatedAt:new Date('2026-09-15T12:00:00Z'),sources:data.sources.create.map((source,index)=>({...copy(source),id:`db-source-${index}`}))};return copy(saved);},
  async findUnique(){return saved?copy(saved):null;},
  async findMany(){return saved?[copy(saved)]:[];},
  async updateMany({where,data}){if(!saved||saved.id!==where.id||saved.normalizedMetrics.version!==where.normalizedMetrics.equals)return {count:0};saved={...saved,...copy(data),updatedAt:new Date('2026-09-15T12:01:00Z')};return {count:1};}
 };
 const prisma={client:{findUnique:async()=>({id:'flow-client',name:'Cliente de prueba'})},metricReport,$transaction:async action=>action({metricReport})};
 const create=createEvidenceExtractionHandler({prisma,uploadClientFile:async()=>({gcsPath:'clients/fixture/metrics.png'}),extractMetrics:async()=>copy(extraction),cleanExtraction:value=>value});
 const input={body:{clientId:'flow-client',periodKind:'MONTHLY',startDate:period.start,endDate:period.end},files:[{fieldname:'files',originalname:'metrics.png',mimetype:'image/png',buffer:Buffer.from('synthetic-fixture-only')}],user:{id:'reviewer'}};
 const res=response();await create(input,res);assert.equal(res.code,201);assert.equal(saved.status,'DRAFT');
 const analysis=report=>composeEvidenceNarrative(report,{claims:[{factId:report.normalizedMetrics.facts[0].factId,interpretation:'Conviene comparar la respuesta de los formatos.',action:'Revisar las piezas publicadas.',kpi:'Visualizaciones por pieza'}]});
 const handlers=createEvidenceWorkflowHandlers({prisma,generateNarrative:async report=>analysis(report),buildHtml:buildMetricReportHtml,renderPdf:async report=>renderMetricReportPdf(report,{renderPdf:async html=>{renderedHtml=html;return Buffer.from('%PDF-1.7\ntransport-fixture');}})});
 const request=(body={})=>({params:{reportId:'flow-report'},body,user:{id:'reviewer'},query:{}});
 return {handlers,prisma,request,analysis,get report(){return copy(saved);},get renderedHtml(){return renderedHtml;}};
}

test('saved report flows through review, grounded analysis, explicit publication and the same PDF document',async()=>{
 const run=await fixture();
 const observationId=run.report.normalizedMetrics.observations[0].observationId;
 const review=response();await run.handlers.review(run.request({expectedVersion:1,updates:[{observationId,value:8500,reason:'La captura ampliada confirma la cifra.'}]}),review);
 assert.equal(review.code,200);assert.equal(run.report.normalizedMetrics.version,2);assert.equal(run.report.normalizedMetrics.dataVersion,2);assert.equal(run.report.normalizedMetrics.facts[0].value,8500);assert.equal(run.report.narrative.needsRegeneration,true);
 const analyze=response();await run.handlers.analyze(run.request({expectedVersion:2}),analyze);assert.equal(analyze.code,200);assert.equal(run.report.status,'REVIEW');assert.equal(run.report.normalizedMetrics.version,3);assert.equal(run.report.narrative.dataVersion,2);
 const publish=response();await run.handlers.publish(run.request({expectedVersion:3}),publish);assert.equal(publish.code,200);assert.equal(run.report.status,'PUBLISHED');assert.equal(run.report.normalizedMetrics.version,4);assert.equal(run.report.normalizedMetrics.publication.actorId,'reviewer');
 const preview=response();await run.handlers.preview({...run.request(),query:{version:'4'}},preview);assert.equal(preview.code,200);assert.match(preview.payload.html,/8\.500/);assert.doesNotMatch(preview.payload.html,/8\.418/);
 const pdf=response();await run.handlers.pdf({...run.request(),query:{version:'4'}},pdf);assert.equal(pdf.code,200);assert.equal(pdf.headers['Content-Type'],'application/pdf');assert.equal(pdf.payload.subarray(0,5).toString(),'%PDF-');assert.equal(run.renderedHtml,preview.payload.html);
 const reopen=response();await run.handlers.reopen(run.request({expectedVersion:4}),reopen);assert.equal(reopen.code,200);assert.equal(run.report.status,'REVIEW');
 const blocked=response();await run.handlers.pdf({...run.request(),query:{version:'5'}},blocked);assert.equal(blocked.code,409);
});

test('an analysis finishing after a correction cannot overwrite the newer saved evidence',async()=>{
 const run=await fixture();let resolve;const deferred=new Promise(done=>{resolve=done;});
 const handlers=createEvidenceWorkflowHandlers({prisma:run.prisma,generateNarrative:async report=>{await deferred;return run.analysis(report);}});
 const stale=response();const pending=handlers.analyze(run.request({expectedVersion:1}),stale);
 const observationId=run.report.normalizedMetrics.observations[0].observationId;
 const corrected=response();await run.handlers.review(run.request({expectedVersion:1,updates:[{observationId,value:8600,reason:'Revisión posterior de la captura.'}]}),corrected);assert.equal(corrected.code,200);
 resolve();await pending;
 assert.equal(stale.code,409);assert.equal(run.report.normalizedMetrics.facts[0].value,8600);assert.equal(run.report.normalizedMetrics.version,2);assert.equal(run.report.narrative.needsRegeneration,true);
});

const linkedFormat=()=>({screenType:'CONTENT_FORMATS',metrics:[observation({id:'reel-views',label:'Reels',value:933,rawValue:'933',platform:'FACEBOOK',contextKey:'facebook-formats',entityLevel:'FORMAT',entityName:'Reels'})],panels:[{id:'formats',title:'Visualizaciones por formato',metricKey:'views',platform:'FACEBOOK',scope:'TOTAL',unit:'count',contextKey:'facebook-formats',period,observationIds:['reel-views'],dataset:[{label:'Reels',value:933}]}]});

test('a corrected linked fact cannot leave its visible panel stale and publishable',async()=>{
 const run=await fixture(linkedFormat());const observationId=run.report.normalizedMetrics.observations[0].observationId;
 const res=response();await run.handlers.review(run.request({expectedVersion:1,updates:[{observationId,value:1000,reason:'El recorte ampliado muestra otro total de Reels.'}]}),res);
 assert.equal(res.code,200);
 const factValue=run.report.normalizedMetrics.facts[0].value,panelValue=run.report.normalizedMetrics.panels[0].dataset[0].value;
 if(factValue!==panelValue)assert.throws(()=>assertEvidenceReady(run.report),/conflicto|panel|coincid/i,'divergent fact and panel must block publication');
 else assert.equal(panelValue,1000);
});

test('a corrected linked panel cannot leave its supporting fact stale and publishable',async()=>{
 const run=await fixture(linkedFormat());const panelId=run.report.normalizedMetrics.panels[0].panelId;
 const res=response();await run.handlers.review(run.request({expectedVersion:1,panelUpdates:[{panelId,rowIndex:0,rowLabel:'Reels',field:'value',value:1000,reason:'Corrección del valor por formato.'}]}),res);
 assert.equal(res.code,200);
 const factValue=run.report.normalizedMetrics.facts[0].value,panelValue=run.report.normalizedMetrics.panels[0].dataset[0].value;
 if(factValue!==panelValue)assert.throws(()=>assertEvidenceReady(run.report),/conflicto|panel|coincid/i,'divergent panel and fact must block publication');
 else assert.equal(factValue,1000);
});
