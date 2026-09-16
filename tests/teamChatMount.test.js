import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
test('a restored open panel mounts before channel data arrives without a render loop',{timeout:15000},async()=>{
 const dir=await mkdtemp(path.resolve('output/chat-mount-'));
 try{
  const bundle=path.join(dir,'component.mjs');
  await build({entryPoints:['src/components/chat/TeamChat.jsx'],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':path.resolve('src')},loader:{'.css':'empty'}});
  const runner=path.join(dir,'run.mjs');
  await writeFile(runner,`
import {JSDOM} from 'jsdom';import assert from 'node:assert/strict';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver','DOMParser','getComputedStyle','sessionStorage','localStorage','navigator'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);globalThis.cancelAnimationFrame=clearTimeout;
globalThis.IntersectionObserver=class{observe(){}disconnect(){}};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.innerWidth=1440;
HTMLElement.prototype.setPointerCapture=()=>{};
sessionStorage.setItem('brain.chat.drafts.test:ui',JSON.stringify({open:true,mode:'docked',channelId:'general'}));
const React=(await import('react')).default;const {createRoot}=await import('react-dom/client');const {default:TeamChat}=await import('./component.mjs');
const client={request:async path=>path.includes('/messages')?{messages:[],before:null}:[],stream:({signal,onEvent})=>new Promise(resolve=>{const timer=setTimeout(()=>onEvent({type:'ready',cursor:'0',channels:[{id:'general',name:'General',unread:0}]}),100);signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});})};
const root=createRoot(document.getElementById('root'));root.render(React.createElement(TeamChat,{currentUser:{id:'test',role:'ADMIN'},client}));
await new Promise(resolve=>setTimeout(resolve,600));assert.equal(document.querySelectorAll('.team-chat').length,1);assert.ok(document.body.textContent.includes('General'));
const settle=()=>new Promise(r=>setTimeout(r,25));
document.querySelector('[aria-label="Cerrar chat"]').click();await settle();
const bubble=document.querySelector('[aria-label^="Abrir chat"]');
for(const [type,x] of [['pointerdown',1300],['pointermove',1430],['pointerup',1430]]){const e=new dom.window.MouseEvent(type,{bubbles:true,clientX:x,clientY:300,button:0});Object.defineProperty(e,'pointerId',{value:1});bubble.dispatchEvent(e);await settle();}
assert.equal(document.querySelectorAll('.team-chat').length,1,'Dragging to the edge opens the dock');
document.querySelector('[aria-label="Cerrar chat"]').click();await settle();
document.querySelector('[aria-label^="Abrir chat"]').click();await settle();
assert.equal(document.querySelectorAll('.team-chat').length,1,'The first click reopens chat after drag-docking');
root.unmount();dom.window.close();console.log('Restored panel mounted');
`);
  const result=await promisify(execFile)(process.execPath,[runner],{timeout:8000,maxBuffer:200000});assert.match(result.stdout,/Restored panel mounted/);assert.doesNotMatch(result.stderr,/Maximum update depth|uncaught/i);
 }finally{
  const target=path.resolve(dir);
  assert.equal(path.dirname(target),path.resolve('output'));
  assert.ok(path.basename(target).startsWith('chat-mount-'));
  await rm(target,{recursive:true,force:true});
 }
});
