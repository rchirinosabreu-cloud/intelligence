import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const setup = `
import {JSDOM} from 'jsdom'; import assert from 'node:assert/strict';
const dom = new JSDOM('<div id="root"></div><input id="search" />', {url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver','DOMParser','getComputedStyle','navigator','Event','KeyboardEvent','MouseEvent','CustomEvent','NodeFilter','HTMLInputElement']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0); globalThis.cancelAnimationFrame=clearTimeout;
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
const observers=[]; globalThis.IntersectionObserver=class{constructor(cb){this.cb=cb;observers.push(this);}observe(node){this.node=node;}disconnect(){}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.Range.prototype.getClientRects=()=>[]; dom.window.Range.prototype.getBoundingClientRect=()=>({top:0,left:0,right:0,bottom:0,width:0,height:0});
const React=await import('react'); const {createRoot}=await import('react-dom/client'); const {Composer,Message}=await import('./components.mjs');
const root=createRoot(document.getElementById('root')); const h=React.createElement;
const settle=async()=>{await React.act(async()=>{await new Promise(r=>setTimeout(r,40));});};
const render=async component=>{await React.act(async()=>root.render(component));await settle();};
const composer={draft:{content:'<p>Hola</p>',files:[]},onChange:()=>{},onSend:()=>{},files:new Map(),roster:[],voice:{status:'inactive'}};
const message={id:'message',author:{id:'ana',name:'Ana'},createdAt:'2026-09-16T15:00:00Z',content:'<p>Mensaje</p>',attachments:[],reactions:[]};
`;
const scenarios = [
  ['touch hold opens reactions, with a neutral icon and no accidental reply', `
let replies=0;let reactions=0;
await render(h(Message,{message,userId:'ana',client:{},onReply:()=>replies++,onReact:()=>reactions++}));
const trigger=document.querySelector('[aria-label="Añadir reacción"]');
assert.ok(trigger.querySelector('svg'),'The add reaction action is a standard icon');
assert.equal(trigger.textContent,'');assert.match(trigger.className,/text-muted-foreground/);
const touch=async(type,x,y)=>{await React.act(async()=>{const e=new Event(type,{bubbles:true,cancelable:true});const point={identifier:1,clientX:x,clientY:y};Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[point]},changedTouches:{value:[point]}});document.querySelector('article p').dispatchEvent(e);});};
await touch('touchstart',100,100);await React.act(async()=>{await new Promise(r=>setTimeout(r,550));});
await settle(); // Radix mounts its portalled content after the controlled open update.
const reactionButton=()=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Reaccionar 👍');
assert.ok(reactionButton(),'Holding the message opens reactions');
await touch('touchend',100,100);
await React.act(async()=>reactionButton().click());
assert.equal(reactions,1);assert.equal(replies,0);
await touch('touchstart',100,100);await touch('touchmove',103,130);
await React.act(async()=>{await new Promise(r=>setTimeout(r,550));});
assert.equal(reactionButton(),undefined,'Scrolling cancels the hold');
await touch('touchend',103,130);
`],
  ['native touch swipes reply once and preserve vertical scrolling', `
let replies=0;await render(h(Message,{message,userId:'ana',client:{},onReply:()=>replies++}));
const touch=async(type,x,y)=>{let prevented;await React.act(async()=>{const e=new Event(type,{bubbles:true,cancelable:true});const point={identifier:1,clientX:x,clientY:y};Object.defineProperties(e,{touches:{value:type==='touchend'||type==='touchcancel'?[]:[point]},changedTouches:{value:[point]}});document.querySelector('article p').dispatchEvent(e);prevented=e.defaultPrevented;});return prevented;};
await touch('touchstart',100,100);assert.equal(await touch('touchmove',164,105),true,'Horizontal gestures reserve the swipe');await touch('touchend',164,105);
assert.equal(replies,1,'Native touch swipe replies without requiring Pointer Events');
await touch('touchstart',100,100);assert.equal(await touch('touchmove',106,160),false,'Vertical scroll is left to the browser');await touch('touchend',180,160);assert.equal(replies,1);
await touch('touchstart',100,100);await touch('touchmove',163,103);await touch('touchcancel',163,103);await touch('touchend',163,103);assert.equal(replies,1);
`],
  ['audio messages expose their player directly and can refresh failed playback', `
let calls=0;const client={media:async()=>({url:'http://localhost/audio?ticket='+ ++calls})};
await render(h(Message,{message:{...message,content:'',attachments:[{id:'audio',name:'nota-de-voz-123.m4a',size:40000,mimeType:'audio/mp4'}]},userId:'ana',client}));
await React.act(async()=>{for(const o of observers)o.cb([{isIntersecting:true}]);});await settle();
const audio=document.querySelector('audio');assert.ok(audio,'Voice notes have a player without pressing View');
assert.equal(audio.controls,true);assert.equal(audio.autoplay,false,'Receiving a voice note does not play it automatically');
assert.equal(document.querySelector('[aria-label="Ver nota-de-voz-123.m4a"]'),null);
assert.ok(document.querySelector('[aria-label="Descargar nota-de-voz-123.m4a"]'));
await React.act(async()=>audio.dispatchEvent(new Event('error')));
const retry=document.querySelector('[aria-label="Reintentar audio nota-de-voz-123.m4a"]');assert.ok(retry);
await React.act(async()=>retry.click());assert.equal(calls,2);assert.match(document.querySelector('audio').getAttribute('src'),/ticket=2/);
`],
  ['voice recording actions use accessible icons and send finalizes the note', `
let pauses=0,sends=0,discards=0;
await render(h(Composer,{...composer,voice:{status:'recording',seconds:8},onPause:()=>pauses++,onSendVoice:()=>sends++,onDiscard:()=>discards++}));
for(const label of ['Pausar grabación','Enviar nota de voz','Descartar grabación']){
 const button=document.querySelector('[aria-label="'+label+'"]');assert.ok(button,label);assert.ok(button.querySelector('svg'));assert.equal(button.textContent,'');await React.act(async()=>button.click());
}
assert.equal(pauses,1);assert.equal(sends,1);assert.equal(discards,1);assert.ok(!document.body.textContent.includes('Escuchar'));
await render(h(Composer,{...composer,voice:{status:'paused',seconds:8},onResume:()=>{}}));
assert.ok(document.querySelector('[aria-label="Continuar grabación"]'));
`],
  ['sending restores the editor focus without stealing a new focus target', `
await render(h(Composer,composer));
const input=document.querySelector('[contenteditable=true]'); input.focus();
await render(h(Composer,{...composer,busy:true})); input.blur(); // Browsers blur an inert subtree.
await render(h(Composer,{...composer,busy:false,draft:{content:'',files:[]}}));
assert.ok(document.activeElement===input,'The editor regains focus after the server confirms sending');
await render(h(Composer,{...composer,busy:true})); input.blur(); document.getElementById('search').focus();
await render(h(Composer,{...composer,busy:false,draft:{content:'',files:[]}}));
assert.ok(document.activeElement===document.getElementById('search'),'Sending must not steal focus from another field');
input.focus(); await render(h(Composer,{...composer,busy:true})); input.blur();
await render(h(Composer,{...composer,busy:false,disabled:true}));
assert.ok(document.activeElement!==input,'An unconfirmed or disabled draft stays locked');
`],
  ['visible images preview automatically and keep exact attachment identity', `
const calls=[];const client={media:async (...args)=>{calls.push(args);return {url:'http://localhost/file?ticket=one'};}};
const image={id:'image-1',name:'Foto.png',size:51200,mimeType:'image/png'};
const props={message:{...message,attachments:[image]},userId:'ana',client};
await render(h(Message,props));
await React.act(async()=>{for(const o of observers)o.cb([{isIntersecting:true}]);});await settle();
const preview=document.querySelector('img[alt="Foto.png"]');
assert.ok(preview,'Images show a preview without pressing View');
assert.equal(preview.getAttribute('src'),'http://localhost/file?ticket=one');
assert.deepEqual(calls,[['message','image-1']]);
assert.equal(document.querySelector('[aria-label="Ver Foto.png"]'),null,'The thumbnail replaces View for images');
assert.ok(document.querySelector('[aria-label="Descargar Foto.png"]'));
await render(h(Message,{...props,message:{...props.message,reactions:[{emoji:'👍',userIds:['ana']}]}}));
assert.equal(calls.length,1,'Realtime updates do not reload the same image');
const downloads=[];dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.href);};
await React.act(async()=>document.querySelector('[aria-label="Descargar Foto.png"]').click());
assert.deepEqual(calls.at(-1),['message','image-1']);assert.match(downloads[0],/download=1/);
`],
  ['enlarging an image stays inside the platform and reuses the same ticket', `
const calls=[];const client={media:async (...args)=>{calls.push(args);return {url:'http://localhost/file?ticket=one'};}};
const image={id:'image-1',name:'Foto.png',size:51200,mimeType:'image/png'};
await render(h(Message,{message:{...message,attachments:[image]},userId:'ana',client}));
await React.act(async()=>{for(const o of observers)o.cb([{isIntersecting:true}]);});await settle();
assert.equal(document.querySelector('a[target="_blank"]'),null,'Enlarging never leaves the platform');
const enlarge=document.querySelector('[aria-label="Ampliar Foto.png"]');
assert.ok(enlarge,'The thumbnail offers an in-app viewer');
assert.equal(enlarge.tagName,'BUTTON','Enlarging is an action, not a navigation');
await React.act(async()=>enlarge.click());await settle();
const dialog=document.querySelector('[role="dialog"]');
assert.ok(dialog,'The viewer opens in the same window');
const full=dialog.querySelector('img[alt="Foto.png"]');
assert.ok(full,'The viewer shows the image itself');
assert.equal(full.getAttribute('src'),'http://localhost/file?ticket=one');
assert.equal(calls.length,1,'Opening the viewer reuses the resolved ticket');
assert.ok(dialog.querySelector('[aria-label="Descargar Foto.png desde el visor"]'),'The viewer can download the original');
await React.act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await settle();
assert.equal(document.querySelector('[role="dialog"]'),null,'Escape closes the viewer');
assert.ok(document.querySelector('img[alt="Foto.png"]'),'Closing the viewer keeps the thumbnail');
`],
  ['small attachments display KB in messages and pending uploads', `
const client={media:async()=>({url:'http://localhost/file?ticket=one'})};
const file={id:'doc',name:'Documento.pdf',size:51200,mimeType:'application/pdf'};
await render(h(Message,{message:{...message,attachments:[file]},userId:'ana',client}));
assert.match(document.body.textContent,/50 KB/);assert.doesNotMatch(document.body.textContent,/0[.,]0 MB/);
await render(h(Composer,{...composer,draft:{content:'',files:[{...file,localId:'one'}]}}));
assert.match(document.body.textContent,/50 KB/);
await render(h(Message,{message:{...message,attachments:[{...file,size:1572864}]},userId:'ana',client}));
assert.match(document.body.textContent,/1[.,]5 MB/);
await render(h(Message,{message:{...message,attachments:[{...file,size:1}]},userId:'ana',client}));
assert.match(document.body.textContent,/0[.,]1 KB/,'Tiny nonempty files must never appear empty');
`],
  ['admins can delete other messages but editing remains author-only', `
let removed=null;
const props={message,userId:'admin',userRole:'ADMIN',client:{},onDelete:m=>removed=m.id};
const openMenu=async()=>{await React.act(async()=>document.querySelector('[aria-label="Acciones del mensaje de Ana"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));await settle();};
await render(h(Message,props));await openMenu();
let items=[...document.querySelectorAll('[role="menuitem"]')];
const remove=items.find(n=>n.textContent==='Eliminar');assert.ok(remove,'Admin sees Delete for another author');
assert.equal(items.find(n=>n.textContent==='Editar'),undefined);
await React.act(async()=>remove.click());assert.equal(removed,'message');await settle();
await render(h(Message,{...props,userRole:'EDITOR'}));await openMenu();
items=[...document.querySelectorAll('[role="menuitem"]')];
assert.equal(items.find(n=>n.textContent==='Eliminar'),undefined,'Regular users cannot delete another author');
`],
];

test('chat send, thumbnails, sizes and moderation UI', {timeout:30000}, async t => {
  const dir = await mkdtemp(path.resolve('output/chat-refinements-'));
  try {
    await build({stdin:{contents:"export {default as Composer} from './src/components/chat/ChatComposer.jsx'; export {default as Message} from './src/components/chat/ChatMessage.jsx';",resolveDir:process.cwd()},outfile:path.join(dir,'components.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':path.resolve('src')},loader:{'.css':'empty'}});
    for (const [name, scenario] of scenarios) await t.test(name, async () => {
      const script=path.join(dir,'run.mjs');
      await writeFile(script,setup+scenario+`\nawait React.act(async()=>root.unmount());dom.window.close();console.log('Verified');`);
      const result=await promisify(execFile)(process.execPath,[script],{timeout:10000,maxBuffer:200000});
      assert.match(result.stdout,/Verified/);
    });
  } finally {
    assert.equal(path.dirname(path.resolve(dir)),path.resolve('output'));
    assert.ok(path.basename(dir).startsWith('chat-refinements-'));
    await rm(dir,{recursive:true,force:true});
  }
});
