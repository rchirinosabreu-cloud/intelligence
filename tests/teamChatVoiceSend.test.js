import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

test('recording send waits for the final file, sends once, and preserves failed drafts', {timeout:30000}, async t => {
  const dir = await mkdtemp(path.resolve('output/chat-voice-'));
  try {
    await build({entryPoints:['src/components/chat/TeamChat.jsx'],outfile:path.join(dir,'component.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':path.resolve('src')},loader:{'.css':'empty'}});
    await writeFile(path.join(dir,'run.mjs'), `
import {JSDOM} from 'jsdom';import assert from 'node:assert/strict';
const scenario=process.argv[2];
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver','DOMParser','getComputedStyle','sessionStorage','localStorage','navigator','NodeFilter','HTMLInputElement'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.cancelAnimationFrame=clearTimeout;
globalThis.IntersectionObserver=class{observe(){}disconnect(){}};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
let draftSaved=false,stopped=0;
globalThis.indexedDB={open(){const req={};setTimeout(()=>{req.result={transaction(){const tx={objectStore:()=>({put(){setTimeout(()=>{draftSaved=true;tx.oncomplete?.();},40);},delete(){setTimeout(()=>tx.oncomplete?.(),0);}})};return tx;}};req.onsuccess();},0);return req;}};
Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}});
globalThis.MediaRecorder=class{static isTypeSupported(type){return type==='audio/mp4';}constructor(stream,options){this.mimeType=options.mimeType;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';setTimeout(()=>{this.ondataavailable({data:new Blob(['complete audio'],{type:this.mimeType})});this.onstop();},35);}};
sessionStorage.setItem('brain.chat.drafts.test:ui',JSON.stringify({open:true,mode:'floating',channelId:'general'}));
const React=(await import('react')).default;const {createRoot}=await import('react-dom/client');const {default:TeamChat}=await import('./component.mjs');
let uploads=0;const posts=[];let fail=scenario==='failure';
const client={
 stream:({signal,onEvent})=>new Promise(resolve=>{onEvent({type:'ready',cursor:'0',channels:[{id:'general',name:'General',unread:0},{id:'other',name:'Otro',unread:0}]});signal.addEventListener('abort',resolve,{once:true});}),
 upload:async(channel,file)=>{assert.ok(draftSaved,'The final audio is staged before uploading');assert.equal(await file.text(),'complete audio');assert.equal(file.type,'audio/mp4');uploads++;return {id:'audio'};},
 request:async(p,options)=>{if(options?.method==='POST'&&p.endsWith('/messages')){posts.push(options.body);if(fail)throw new Error('Simulated network failure');return {id:'sent',channelId:'general',author:{id:'test',name:'Ana'},content:'',attachments:[],reactions:[],createdAt:new Date().toISOString(),version:1};}return p.includes('/messages')?{messages:[],before:null}:[];}
};
const root=createRoot(document.getElementById('root'));root.render(React.createElement(TeamChat,{currentUser:{id:'test',role:'ADMIN'},client}));
const settle=()=>new Promise(r=>setTimeout(r,200));await settle();
document.querySelector('[aria-label="Grabar nota de voz"]').click();await settle();
if(scenario==='close'){document.querySelector('[aria-label="Cerrar chat"]').click();}
else if(scenario==='discard'){document.querySelector('[aria-label="Descartar grabación"]').click();}
else {const send=document.querySelector('[aria-label="Enviar nota de voz"]');send.click();send.click();assert.equal(posts.length,0,'No message before the final recorder chunk');}
if(scenario==='close-in-flight')document.querySelector('[aria-label="Cerrar chat"]').click();
if(scenario==='channel-change')window.dispatchEvent(new dom.window.CustomEvent('open-general-chat',{detail:{channelId:'other'}}));
await settle();await settle();
const draft=()=>JSON.parse(sessionStorage.getItem('brain.chat.drafts.test')||'{}').general;
if(['close','discard','close-in-flight','channel-change'].includes(scenario)){assert.equal(posts.length,0);assert.equal(uploads,0);assert.equal(draft()?.files?.length||0,scenario==='discard'?0:1);}
else {
 assert.equal(posts.length,1,'One click sends the completed recording exactly once');assert.equal(uploads,1);assert.deepEqual(posts[0].attachmentIds,['audio']);
 if(scenario==='failure'){assert.equal(draft().files.length,1);assert.ok(draft().pending);fail=false;[...document.querySelectorAll('button')].find(b=>b.textContent==='Reintentar').click();await settle();assert.equal(posts.length,2);assert.equal(posts[1].requestId,posts[0].requestId);assert.equal(uploads,1);}
 assert.equal(draft().files.length,0);
}
assert.equal(stopped,1);root.unmount();dom.window.close();console.log('Voice flow verified');
`);
    for(const scenario of ['success','failure','close','discard','close-in-flight','channel-change']) await t.test(scenario, async()=>{
      const result=await promisify(execFile)(process.execPath,[path.join(dir,'run.mjs'),scenario],{timeout:7000,maxBuffer:100000});
      assert.match(result.stdout,/Voice flow verified/);
    });
  } finally {
    assert.equal(path.dirname(path.resolve(dir)),path.resolve('output'));
    await rm(dir,{recursive:true,force:true});
  }
});
