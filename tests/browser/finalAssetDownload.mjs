import {spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import express from 'express';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import config from '../../tailwind.config.js';
import {chromium} from 'playwright-core';

test('el visor descarga el nombre original, ofrece nombre legible al legado y conserva autorización y errores', {timeout:90000},async()=>{
  const bundled=await build({entryPoints:['tests/fixtures/final-asset-download.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':path.resolve('src')},define:{'process.env.NODE_ENV':'"development"','import.meta.env.VITE_API_URL':'""'},loader:{'.css':'empty'},logLevel:'silent'});
  const css=await postcss([tailwind({...config,content:[...config.content,'./tests/fixtures/final-asset-download.jsx']})]).process(await readFile('src/index.css','utf8'),{from:path.resolve('src/index.css')});
  const app=express();app.get('/preview.js',(_,res)=>res.type('js').send(bundled.outputFiles[0].text));app.get('/preview.css',(_,res)=>res.type('css').send(css.css));
  app.get('/',(_,res)=>res.send('<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/preview.css"><div id="root"></div><script type="module" src="/preview.js"></script></html>'));
  const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  let browser;
  try{
    browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page=await browser.newPage({viewport:{width:1000,height:1050}});page.setDefaultTimeout(7000);
    const video=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x007e97:s=400x400:d=0.4','-c:v','libvpx','-f','webm','pipe:1']);
    assert.equal(video.status,0,video.stderr?.toString());const bytes=video.stdout;
    let reject=false;const requests=[];
    await page.route('**/api/**',route=>{
      requests.push(route.request().headers());
      return route.fulfill(reject?{status:403,json:{error:'Sin acceso'}}:{status:200,contentType:route.request().url().includes('/task/')?'application/pdf':'video/webm',body:bytes});
    });
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
    const original=page.getByRole('button',{name:'Descargar Vacante – edición final.webm',exact:true});await original.waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=2));
    await page.locator('video').evaluateAll(async videos=>{for(const video of videos){video.muted=true;await video.play();video.pause();}});
    assert.ok(await page.locator('video').first().evaluate(v=>v.controlsList.contains('nodownload')),'la descarga nativa del blob no debe ofrecer el nombre UUID');
    for(const name of ['Vacante – edición final.webm','Vacante creativa - 2.webm','Propuesta revisada.pdf']){
      const pending=page.waitForEvent('download');await page.getByRole('button',{name:`Descargar ${name}`,exact:true}).click();const download=await pending;
      assert.equal(download.suggestedFilename(),name);assert.deepEqual(await readFile(await download.path()),bytes);
    }
    reject=true;let downloads=0;page.on('download',()=>downloads++);await original.click();await page.getByText('No pudimos descargar el archivo. Revisa tu acceso e intenta otra vez.',{exact:true}).waitFor();
    assert.equal(downloads,0);assert.equal(await original.isEnabled(),true);
    reject=false;const retry=page.waitForEvent('download');await original.click();assert.equal((await retry).suggestedFilename(),'Vacante – edición final.webm');
    assert.ok(requests.every(h=>h.authorization==='Bearer local-download-test'));assert.deepEqual(errors,[]);
    await mkdir('output/final-asset-download',{recursive:true});
    await page.screenshot({path:'output/final-asset-download/desktop.png',fullPage:true});
    await page.evaluate(()=>{document.documentElement.classList.add('dark');document.body.style.background='#09090b';});await page.screenshot({path:'output/final-asset-download/dark.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/final-asset-download/mobile.png',fullPage:true});
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
