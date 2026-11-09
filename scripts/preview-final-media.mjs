import express from 'express';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import config from '../tailwind.config.js';

export async function createFinalMediaPreview({port=3855}={}) {
  const root=path.resolve(import.meta.dirname,'..');
  const bundle=await build({entryPoints:[path.join(root,'tests/fixtures/final-media-preview.jsx')],bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"','import.meta.env.VITE_API_URL':'""'},loader:{'.css':'empty'},logLevel:'silent'});
  const css=await postcss([tailwind({...config,content:[...config.content,'./tests/fixtures/final-media-preview.jsx']})]).process(await readFile(path.join(root,'src/index.css'),'utf8'),{from:path.join(root,'src/index.css')});
  const files={};
  const mediaRoot=path.join(root,'output/final-media-preview');await mkdir(mediaRoot,{recursive:true});
  for(const [name,size] of [['vertical','360x640'],['horizontal','640x360']]){
    const mediaPath=path.join(mediaRoot,`${name}.webm`);
    const result=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',`testsrc2=s=${size}:r=10:d=3`,'-c:v','libvpx',mediaPath]);
    if(result.status!==0)throw new Error(result.stderr?.toString()||'FFmpeg no está disponible');files[name]=await readFile(mediaPath);
  }
  const state={mode:'normal',requests:[],aborted:0,pending:[]};const app=express();
  app.get('/preview.js',(_,res)=>res.type('js').send(bundle.outputFiles[0].text));app.get('/preview.css',(_,res)=>res.type('css').send(css.css));
  app.get('/api/media/:name',(req,res)=>{
    state.requests.push({name:req.params.name,revision:req.query.revision,download:Boolean(req.query.download),authorization:req.headers.authorization});
    if(req.headers.authorization!=='Bearer local-preview')return res.sendStatus(401);
    if(state.mode==='error')return res.status(503).json({error:'Fallo de prueba'});
    const bytes=state.mode==='invalid'?Buffer.from('invalid video'):files[req.params.name];
    if(!bytes)return res.sendStatus(404);
    res.set({'Content-Type':'video/webm','Content-Length':bytes.length,'Cache-Control':'no-store'});
    if(state.mode!=='slow')return res.end(bytes);
    res.write(bytes.subarray(0,16));res.once('close',()=>{if(!res.writableEnded)state.aborted++;});state.pending.push(()=>{if(!res.destroyed)res.end(bytes.subarray(16));});
  });
  app.get('/',(_,res)=>res.send('<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vídeos · prueba local</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>'));
  const server=await new Promise(resolve=>{const listener=app.listen(port,'127.0.0.1',()=>resolve(listener));});
  return {origin:`http://127.0.0.1:${server.address().port}`,state,release:()=>state.pending.splice(0).forEach(end=>end()),close:()=>new Promise(resolve=>{state.pending.splice(0).forEach(end=>end());server.close(resolve);})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const preview=await createFinalMediaPreview();console.log(preview.origin);}
