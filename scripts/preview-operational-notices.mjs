import express from 'express';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import config from '../tailwind.config.js';
import { operationalNoticeMemory } from '../tests/helpers/operationalNoticeMemory.js';
import { createImportantNoticeRouter } from '../src/routes/api/importantNotices.js';
import { setContractContinuity } from '../src/services/contractContinuityService.js';

export async function createOperationalNoticePreview({port=3846}={}) {
  const root=path.resolve(import.meta.dirname,'..');const out=path.join(root,'output/avisos-operativos-local');await mkdir(out,{recursive:true});
  await build({entryPoints:[path.join(root,'tests/fixtures/operational-notices.jsx')],outfile:path.join(out,'preview.js'),bundle:true,format:'esm',jsx:'automatic',minify:false,
    alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"','import.meta.env.VITE_API_URL':'window.location.origin'},loader:{'.css':'empty'},logLevel:'silent'});
  const css=await postcss([tailwind({...config,content:[...config.content,'./tests/fixtures/operational-notices.jsx']}),autoprefixer]).process(await readFile(path.join(root,'src/index.css'),'utf8'),{from:path.join(root,'src/index.css')});
  await writeFile(path.join(out,'preview.css'),css.css);
  const {db,data,actor}=operationalNoticeMemory();let now=new Date('2026-11-06T15:00:00Z');
  const scene=(name='cierre')=>{
    data.importantNotice.length=0;data.notification.length=0;data.projectFormalization.length=0;data.collectionSetting.length=0;
    const client={id:'faro',slug:'faro',name:'Fundación Horizonte',isArchived:false,projectManager:{userId:actor.id,isActive:true},contracts:[{id:'contrato-local',status:'ACTIVO',startDate:'2026-10-15',endDate:'2027-02-14',cutDay:15,monthlyReport:true}],monthlyReports:[],monthlyCloses:[],suspensions:[],accountsReceivables:[]};
    now=new Date(name==='mitad'?'2026-10-30T15:00:00Z':'2026-11-12T15:00:00Z');
    if(name==='inicio'){client.monthlyCloses=[{year:2026,month:10}];data.projectFormalization.push({id:'proyecto-local',clientId:client.id,status:'HABILITADO',operation:{reviewStatus:'PENDIENTE'}});}
    if(name==='renovacion'){client.monthlyCloses=[{year:2026,month:10}];client.contracts[0].endDate='2026-11-25';}
    if(name==='suspension'){client.monthlyCloses=[{year:2026,month:10}];client.suspensions=[{id:'s-local',fromCycle:'2026-12',liftedAt:null}];}
    if(name==='reactivacion'){client.monthlyCloses=[{year:2026,month:10}];client.suspensions=[{id:'s-local',fromCycle:'2026-11',liftedAt:new Date('2026-11-11T15:00:00Z')}];}
    if(name==='continuidad'){data.collectionSetting.push({id:'global',enabled:true,paymentTermDays:15,monthlyAlertCount:2,oneOffFirstAlertDays:15,repeatDays:7});client.monthlyCloses=[{year:2026,month:10}];client.accountsReceivables=[{id:'r-local',kind:'CLIENTE',status:'PENDIENTE',amount:100,period:'2026-09-01',dueDate:'2026-09-05',payments:[]}];}
    Object.assign(client.contracts[0], { updatedAt: new Date('2026-11-06T15:00:00Z'), renewalDecision: 'PENDIENTE' });
    data.clientContract.splice(0,data.clientContract.length,...client.contracts);
    data.client.splice(0,data.client.length,client);
    data.importantNotice.push({id:'cartera-invisible',userId:actor.id,kind:'CARTERA_UNICO',subjectId:'r',label:'Cartera privada de prueba',message:'Este texto financiero NO debe mostrarse a Kamila',resolvedAt:null,createdAt:new Date('2026-01-01'),level:'IMPORTANTE'});
  };scene();
  const api=express();api.use(express.json());api.use((req,res,next)=>{res.set('Cache-Control','no-store');req.user=actor;next();});
  api.get('/api/preview/state',(_req,res)=>res.json({now,client:data.client[0]}));
  api.post('/api/preview/scene/:name',(req,res)=>{scene(req.params.name);res.json({ok:true});});
  api.post('/api/preview/advance',(_req,res)=>{now=new Date(now.getTime()+5*60000);res.json({ok:true});});
  api.post('/api/preview/close',(_req,res)=>{data.client[0].monthlyCloses.push({year:2026,month:10});res.json({ok:true});});
  api.post('/api/preview/review',(_req,res)=>{data.projectFormalization.forEach(p=>p.operation.reviewStatus='REVISADO');res.json({ok:true});});
  api.use('/api/important-notices',createImportantNoticeRouter({db,clock:()=>now}));
  api.post('/api/client-operations/:id/continuity',async(req,res)=>{
    try { res.json(await setContractContinuity(db,req.params.id,req.body,actor.id,{now})); }
    catch(error){res.status(error.status||500).json({error:error.message});}
  });
  api.use('/api',(_req,res)=>res.status(404).json({error:'Solo operaciones de prueba local.'}));
  api.use(express.static(out));api.get('*',(_req,res)=>res.type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Avisos operativos · Local</title><link rel="stylesheet" href="/preview.css"><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>'));
  const server=await new Promise(resolve=>{const s=api.listen(port,'127.0.0.1',()=>resolve(s));});
  return {origin:`http://127.0.0.1:${server.address().port}`,db,data,close:()=>new Promise(resolve=>server.close(resolve))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const preview=await createOperationalNoticePreview();console.log(`Vista local: ${preview.origin}`);}
