import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createFinalMediaPreview} from '../../scripts/preview-final-media.mjs';

test('visor de entregables: ojo, proporción original, carga lenta, cancelación y reintento', {timeout:120000},async()=>{
  const preview=await createFinalMediaPreview({port:0});let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    preview.state.mode='slow';await page.goto(preview.origin,{waitUntil:'domcontentloaded'});
    const tile=page.locator('[data-final-asset-tile="vertical"]');
    await tile.getByText('Cargando vídeo…',{exact:true}).waitFor();
    for(let i=0;i<10;i++)await page.getByRole('button',{name:'Actualizar pantalla',exact:true}).click();assert.equal(preview.state.requests.length,2);
    const eye=tile.getByRole('button',{name:'Ver Vídeo vertical.webm',exact:true});await eye.click();
    const viewer=page.locator('[data-final-media-viewer]');await viewer.waitFor();await viewer.getByText('Cargando vídeo…',{exact:true}).waitFor();assert.equal(preview.state.requests.length,2,'abrir el ojo comparte la carga');
    await mkdir('output/final-media-preview',{recursive:true});await page.screenshot({path:'output/final-media-preview/loading.png'});
    preview.release();await page.waitForFunction(()=>document.querySelector('[data-final-media-viewer] video')?.readyState>=2);
    const vertical=await viewer.locator('video').evaluate(v=>{const r=v.getBoundingClientRect();return {width:r.width,height:r.height,sourceWidth:v.videoWidth,sourceHeight:v.videoHeight,fit:getComputedStyle(v).objectFit};});
    assert.equal(vertical.sourceWidth/vertical.sourceHeight,9/16);assert.ok(Math.abs(vertical.width/vertical.height-9/16)<0.02);assert.equal(vertical.fit,'contain');
    await page.screenshot({path:'output/final-media-preview/vertical-desktop.png'});
    await page.keyboard.press('Escape');await viewer.waitFor({state:'detached'});assert.ok(await page.locator('[data-preview-task]').isVisible());assert.equal(await eye.evaluate(e=>e===document.activeElement),true);
    const inline=tile.locator('video');await inline.evaluate(async v=>{v.muted=true;await v.play();});await eye.click();assert.equal(await inline.evaluate(v=>v.paused),true);await page.keyboard.press('Escape');assert.equal(preview.state.requests.length,2);
    await page.locator('[data-final-asset-tile="horizontal"]').getByRole('button',{name:'Ver Vídeo horizontal.webm'}).click();
    await page.waitForFunction(()=>document.querySelector('[data-final-media-viewer] video')?.readyState>=2);
    const horizontal=await viewer.locator('video').boundingBox();assert.ok(Math.abs(horizontal.width/horizontal.height-16/9)<0.02);await page.screenshot({path:'output/final-media-preview/horizontal.png'});await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Cambiar tema'}).click();await eye.click();await page.waitForFunction(()=>{const v=document.querySelector('[data-final-media-viewer] video');return v?.readyState>=2&&!v.seeking;});await page.screenshot({path:'output/final-media-preview/vertical-dark.png',animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await viewer.locator('video').evaluate(async v=>{v.muted=true;await v.play();});
    await page.waitForFunction(()=>document.querySelector('[data-final-media-viewer] video')?.currentTime>0.25);
    await viewer.locator('video').evaluate(v=>v.pause());await page.screenshot({path:'output/final-media-preview/vertical-mobile.png',animations:'disabled'});
    const mobile=await viewer.boundingBox();assert.ok(mobile.x>=8&&mobile.y>=8&&mobile.x+mobile.width<=382&&mobile.y+mobile.height<=836,'el visor entero debe caber en la pantalla móvil');
    assert.ok(await viewer.evaluate(e=>e.scrollWidth<=e.clientWidth));await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});
    preview.state.mode='slow';await page.getByRole('button',{name:'Cambiar entrega'}).click();await tile.getByText('Cargando vídeo…',{exact:true}).waitFor();assert.equal(await tile.locator('video[src^="blob:"]').count(),0,'no mostrar bytes anteriores al cambiar la fuente');
    await page.getByRole('button',{name:'Mostrar u ocultar'}).click();await new Promise(r=>setTimeout(r,250));assert.equal(preview.state.aborted,2);
    preview.state.mode='error';await page.getByRole('button',{name:'Mostrar u ocultar'}).click();await tile.getByRole('alert').waitFor();
    preview.state.mode='normal';await tile.getByRole('button',{name:'Reintentar vista previa'}).click();await page.waitForFunction(()=>document.querySelector('[data-final-asset-tile="vertical"] video')?.readyState>=2);
    const download=page.waitForEvent('download');await tile.getByRole('button',{name:'Descargar Vídeo vertical.webm',exact:true}).click();assert.equal((await download).suggestedFilename(),'Vídeo vertical.webm');
    preview.state.mode='invalid';await page.getByRole('button',{name:'Cambiar entrega'}).click();await tile.getByText(/El navegador no pudo reproducir/).waitFor();await page.screenshot({path:'output/final-media-preview/error.png'});
    assert.ok(preview.state.requests.every(r=>r.authorization==='Bearer local-preview'));assert.deepEqual(errors,[]);
  }finally{await browser?.close();await preview.close();}
});
