import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

test(
  "chat keyboard, compact formats and attachment actions work in the actual components",
  { timeout: 20000 },
  async () => {
    const dir = await mkdtemp(path.resolve("output/chat-interactions-"));
    try {
      await build({
        stdin: {
          contents: `export {default as Composer} from './src/components/chat/ChatComposer.jsx'; export {default as Message} from './src/components/chat/ChatMessage.jsx'; export {default as Editor} from './src/components/ui/RichTextEditor.jsx';`,
          resolveDir: process.cwd(),
        },
        outfile: path.join(dir, "components.mjs"),
        bundle: true,
        platform: "node",
        format: "esm",
        packages: "external",
        alias: { "@": path.resolve("src") },
        loader: { ".css": "empty" },
      });
      await writeFile(
        path.join(dir, "run.mjs"),
        `
import {JSDOM} from 'jsdom'; import assert from 'node:assert/strict';
const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver','DOMParser','getComputedStyle','navigator','Event','KeyboardEvent','MouseEvent','CustomEvent','NodeFilter','HTMLInputElement']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0); globalThis.cancelAnimationFrame=clearTimeout;
globalThis.ResizeObserver=class{observe(){}disconnect(){}}; globalThis.IntersectionObserver=class{observe(){}disconnect(){}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.Range.prototype.getClientRects=()=>[]; dom.window.Range.prototype.getBoundingClientRect=()=>({top:0,left:0,right:0,bottom:0,width:0,height:0});
const React=await import('react'); const {createRoot}=await import('react-dom/client'); const {Composer,Message,Editor}=await import('./components.mjs');
let root=createRoot(document.getElementById('root')); let sends=0, content=''; const h=React.createElement;
const render=async component=>{await React.act(async()=>{root.render(component); await new Promise(r=>setTimeout(r,50));});};
const key=async (node,options)=>{await React.act(async()=>{node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true,...options}));});};
await render(h(Composer,{draft:{content:'<p>Hola</p>',files:[]},onChange:d=>content=d.content,onSend:()=>sends++,files:new Map(),roster:[],voice:{status:'inactive'}}));
let input=document.querySelector('[contenteditable=true]');
await key(input,{}); assert.equal(sends,1,'Enter sends the message');
await key(input,{shiftKey:true}); assert.equal(sends,1,'Shift+Enter does not send'); assert.match(content,/<br/,'Shift+Enter inserts a line break');
await key(input,{isComposing:true}); assert.equal(sends,1,'IME confirmation must not send');
const labels=[...document.querySelectorAll('[data-task-format-toolbar] button')].map(x=>x.getAttribute('aria-label'));
assert.deepEqual(labels,['Negrita','Cursiva','Subrayado','Resaltado','Lista con bullets']);
assert.equal(document.querySelector('[data-task-format-toolbar]').closest('[aria-hidden]').getAttribute('aria-hidden'),'false','Chat formatting is visible from the first render');
assert.equal(document.querySelector('[aria-label="Opciones de formato"]'),null,'The chat has no formatting toggle');
await render(h(Composer,{draft:{content:'',files:[]},onChange:()=>{},onSend:()=>sends++,files:new Map(),roster:[],voice:{status:'inactive'}}));
await key(document.querySelector('[contenteditable=true]'),{}); assert.equal(sends,1,'Empty drafts must not send via Enter');
document.activeElement?.blur();
await render(h(Composer,{draft:{content:'',files:[],reply:{id:'quoted',author:{name:'Ana'},text:'Mensaje citado'}},onChange:()=>{},onSend:()=>sends++,files:new Map(),roster:[],voice:{status:'inactive'}}));
await React.act(async()=>{await new Promise(r=>setTimeout(r,30));});
assert.ok(document.activeElement === document.querySelector('[contenteditable=true]'),'Reply focuses the composer');
assert.ok(document.body.textContent.includes('Mensaje citado'),'Reply shows the quoted text');
await render(h(Editor,{value:'<p>Otro módulo</p>',onChange:()=>{},onSend:()=>sends++,showToolbar:true}));
input=document.querySelector('[contenteditable=true]'); await key(input,{}); assert.equal(sends,1,'Other editors retain their native Enter');
assert.ok(document.querySelector('[aria-label="Lista numerada"]'),'Other editors keep full formatting');
assert.ok(document.querySelector('[aria-label="Opciones de formato"]'),'Other editors retain their formatting toggle');
const calls=[]; const client={media:async (messageId,id)=>{calls.push([messageId,id]);return {url:'http://localhost/file?token=ok'};}};
const downloads=[]; dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push(this.href);};
let replies=0;
const gestureMessage={id:'gesture',author:{id:'ana',name:'Ana'},createdAt:'2026-09-16T15:00:00Z',content:'<p>Mensaje para responder <a href="https://example.com">Enlace</a></p>',attachments:[],reactions:[]};
await render(h(Message,{message:gestureMessage,userId:'ana',client,onReply:m=>{assert.equal(m.id,'gesture');replies++;}}));
await React.act(async()=>document.querySelector('article p').dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));
assert.equal(replies,1,'Double click quotes this message');
await React.act(async()=>document.querySelector('article a').dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));
assert.equal(replies,1,'Links do not activate reply');
const pointer=async(type,x,y,extra={})=>{await React.act(async()=>{const e=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y});Object.defineProperties(e,{pointerType:{value:'touch'},pointerId:{value:1},isPrimary:{value:true},...extra});document.querySelector('article p').dispatchEvent(e);});};
await pointer('pointerdown',100,100);await pointer('pointermove',174,103);await pointer('pointerup',174,103);assert.equal(replies,2,'Right swipe quotes the message');
await pointer('pointerdown',100,100);await pointer('pointermove',108,170);await pointer('pointerup',180,170);assert.equal(replies,2,'Vertical scrolling does not reply');
await pointer('pointerdown',100,100);await pointer('pointerup',120,102);assert.equal(replies,2,'A short tap or drag does not reply');
await pointer('pointerdown',100,100);await pointer('pointermove',20,100);await pointer('pointerup',20,100);assert.equal(replies,2,'Left swipe does not reply');
await pointer('pointerdown',100,100);await pointer('pointermove',174,100);await pointer('pointercancel',174,100);await pointer('pointerup',174,100);assert.equal(replies,2,'Cancelled gestures never reply');
await render(h(Message,{message:gestureMessage,userId:'ana',client,onReply:()=>replies++,selectionMode:true,onSelect:()=>{}}));
await React.act(async()=>document.querySelector('article p').dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));assert.equal(replies,2,'Selection mode does not reply');
await render(h(Message,{message:{id:'message-1',author:{id:'ana',name:'Ana'},createdAt:'2026-09-16T15:00:00Z',content:'',attachments:[{id:'pdf-1',name:'Documento.pdf',size:100,mimeType:'application/pdf'}],reactions:[]},userId:'ana',client}));
const view=document.querySelector('[aria-label="Ver Documento.pdf"]'); assert.ok(view,'Files offer an explicit View action');
const download=document.querySelector('[aria-label="Descargar Documento.pdf"]'); assert.ok(download,'Files also offer Download');
await React.act(async()=>{download.click();}); assert.deepEqual(calls,[['message-1','pdf-1']]); assert.match(downloads[0],/download=1/);
globalThis.fetch=async()=>new Response('<script>no ejecutar</script> Nota de prueba',{status:200});
await render(h(Message,{message:{id:'message-2',author:{id:'ana',name:'Ana'},createdAt:'2026-09-16T15:00:00Z',content:'',attachments:[{id:'text-2',name:'Nota.txt',size:50,mimeType:'application/octet-stream'}],reactions:[]},userId:'ana',client}));
await React.act(async()=>{document.querySelector('[aria-label="Ver Nota.txt"]').click(); await new Promise(r=>setTimeout(r,50));});
assert.deepEqual(calls.at(-1),['message-2','text-2']); assert.equal(downloads.length,1,'Viewing does not download');
assert.ok(document.querySelector('[role="dialog"]'),'View opens the file preview');
assert.ok(document.body.textContent.includes('<script>no ejecutar</script> Nota de prueba'),'Text preview renders literal text safely');
assert.equal(document.querySelectorAll('script').length,0);
await React.act(async()=>root.unmount()); dom.window.close(); console.log('Chat interactions verified');
`,
      );
      const result = await promisify(execFile)(
        process.execPath,
        [path.join(dir, "run.mjs")],
        { timeout: 15000, maxBuffer: 200000 },
      );
      assert.match(result.stdout, /Chat interactions verified/);
    } finally {
      const target = path.resolve(dir);
      assert.equal(path.dirname(target), path.resolve("output"));
      assert.ok(path.basename(target).startsWith("chat-interactions-"));
      await rm(target, { recursive: true, force: true });
    }
  },
);
