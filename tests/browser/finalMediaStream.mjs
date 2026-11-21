import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createFinalMediaPreview} from '../../scripts/preview-final-media.mjs';

// Rodny, 21 de noviembre de 2026: el video de una pieza final arranca sin bajarse entero, se guarda en el
// dispositivo al reproducirlo y al volver a abrir la página ya no se pide a la red.
const SIZES=[[1280,620],[1366,768],[1920,1080],[390,844],[360,640]];
const OUT='output/final-media-stream';

test('pieza final: por pedazos, copia en el dispositivo y camino de siempre si algo falla',{timeout:180000},async()=>{
  const preview=await createFinalMediaPreview({port:0});let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await mkdir(OUT,{recursive:true});
    const url=`${preview.origin}/?stream=1`;const requests=preview.state.streamRequests;
    const tile=page.locator('[data-final-asset-tile="vertical"]');const frame=()=>page.waitForFunction(()=>[...document.querySelectorAll('[data-final-asset-tile] video')].every(v=>v.readyState>=1)&&document.querySelectorAll('[data-final-asset-tile] video').length===2);

    // 1. Primera visita: la tarjeta pinta el primer cuadro pidiendo pedazos con el pase, sin bajar el archivo con la sesión.
    await page.goto(url,{waitUntil:'domcontentloaded'});await frame();
    assert.match(await tile.locator('video').getAttribute('src'),/access_token=pase-local/);
    assert.ok(requests.length>0&&requests.every(r=>r.via==='ticket'&&r.range),'todo llegó por pedazos y con pase');
    assert.equal(await tile.getByText('Cargando vídeo…',{exact:true}).count(),0);
    await page.screenshot({path:`${OUT}/primer-cuadro.png`});

    // 2. Al reproducir se guarda en el dispositivo (una sola bajada completa, con la sesión).
    await tile.locator('video').evaluate(async v=>{v.muted=true;await v.play();});
    await page.waitForFunction(async()=>Boolean(await (await caches.open('intelligence-private-media-v1')).match('/api/content/items/demo/final-assets/vertical?v=entrega-0')));
    assert.equal(requests.filter(r=>r.via==='session').length,1);
    assert.equal(requests.filter(r=>r.via==='session'&&r.name==='horizontal').length,0,'el que no se reprodujo no se bajó');

    // 3. Al volver a abrir la página, el video reproducido sale del dispositivo: ni un pedido a la red.
    const before=requests.length;await page.reload({waitUntil:'domcontentloaded'});await frame();
    assert.match(await tile.locator('video').getAttribute('src'),/^blob:/);
    assert.equal(requests.slice(before).filter(r=>r.name==='vertical').length,0,'el guardado no vuelve a pedirse');
    assert.ok(requests.slice(before).filter(r=>r.name==='horizontal').every(r=>r.via==='ticket'&&r.range));

    // 4. El visor grande, en claro y oscuro y en cada tamaño de pantalla: nada recortado.
    const eye=tile.getByRole('button',{name:'Ver Vídeo vertical.webm',exact:true});
    for(const dark of [false,true]){
      if(dark)await page.getByRole('button',{name:'Cambiar tema'}).click();
      for(const [width,height] of SIZES){
        await page.setViewportSize({width,height});await frame();
        await page.screenshot({path:`${OUT}/tarjetas-${width}x${height}${dark?'-oscuro':''}.png`});
        await eye.click();const viewer=page.locator('[data-final-media-viewer]');await viewer.waitFor();
        await page.waitForFunction(()=>document.querySelector('[data-final-media-viewer] video')?.readyState>=1);
        const box=await viewer.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,`el visor cabe en ${width}x${height}`);
        const video=await viewer.locator('video').boundingBox();assert.ok(video.width>40&&video.height>40&&video.y+video.height<=height,`el video cabe en ${width}x${height}`);
        await page.screenshot({path:`${OUT}/visor-${width}x${height}${dark?'-oscuro':''}.png`,animations:'disabled'});
        await page.keyboard.press('Escape');await viewer.waitFor({state:'detached'});
      }
    }
    await page.setViewportSize({width:1440,height:1000});

    // 5. Una entrega nueva es otra dirección: se pide de nuevo y nunca se muestran los bytes anteriores.
    await page.getByRole('button',{name:'Cambiar entrega'}).click();
    await page.waitForFunction(()=>document.querySelector('[data-final-asset-tile="vertical"] video')?.src.includes('entrega-1'));
    assert.match(await tile.locator('video').getAttribute('src'),/access_token=pase-local/);

    // 6. Sin pase, o si la reproducción por pedazos falla, vuelve el camino de siempre: bajarlo con la sesión.
    for(const broken of ['ticket','stream']){
      const fresh=await browser.newContext({viewport:{width:1280,height:720}});const other=await fresh.newPage();other.setDefaultTimeout(10000);
      preview.state.ticket=broken==='ticket'?'off':'on';preview.state.stream=broken==='stream'?'off':'on';
      await other.goto(url,{waitUntil:'domcontentloaded'});
      await other.waitForFunction(()=>{const v=document.querySelector('[data-final-asset-tile="vertical"] video');return v?.src.startsWith('blob:')&&v.readyState>=2;});
      assert.equal(await other.locator('[data-final-asset-tile] [role="alert"]').count(),0,`sin ${broken} no se muestra error`);
      await fresh.close();
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await preview.close();}
});
