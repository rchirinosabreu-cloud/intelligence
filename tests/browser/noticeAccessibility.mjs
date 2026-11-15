import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { createOperationalNoticePreview } from '../../scripts/preview-operational-notices.mjs';

test('avisos: contraste blanco, teclado, errores recuperables, movimiento reducido y reflujo',async()=>{
  const preview=await createOperationalNoticePreview({port:0});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await page.goto(preview.origin);const card=page.locator('[data-important-notice]');await card.waitFor();
    const primary=card.locator('.brain-notice-primary');
    const title=card.locator('.brain-notice-title');
    // Los botones llevan `transition-colors`: se miden los colores finales, no uno a medio camino tras cambiar de tema.
    await page.addStyleTag({content:'.brain-notice-content * { transition: none !important; }'});
    const lum=c=>c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
    const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    // La cúpula de vidrio (Rodny, 14 de noviembre de 2026, opción B): en claro el texto es oscuro y el botón principal
    // lleva el color profundo de la paleta con texto blanco; en oscuro el texto es blanco y el botón principal, blanco con
    // el texto en la variante profunda —ni blanco ni negro—. Contraste AA en los dos temas y al pasar el ratón.
    for(const dark of [false,true]){
      await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
      await page.mouse.move(0,0);
      for(const hover of [false,true]){
        if(hover)await primary.hover();
        const colors=await primary.evaluate(e=>{
          const s=getComputedStyle(e),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
          const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
          return {fg:rgb(s.color),bg:rgb(s.backgroundColor)};
        });
        if(dark){
          assert.deepEqual(colors.bg,[255,255,255],'en oscuro el botón principal va blanco sobre la cúpula');
          assert.notDeepEqual(colors.fg,[255,255,255]);assert.notDeepEqual(colors.fg,[0,0,0]);
        } else {
          assert.deepEqual(colors.fg,[255,255,255],'en claro el botón principal lleva texto blanco sobre el color');
          assert.notDeepEqual(colors.bg,[255,255,255]);assert.notDeepEqual(colors.bg,[0,0,0]);
        }
        const ratio=contrast(colors.fg,colors.bg);
        assert.ok(ratio>=4.5,`contraste del botón ${ratio} oscuro=${dark} hover=${hover}`);
      }
      // El título, sin sombra, se lee sobre el vidrio de verdad: se mide el píxel más desfavorable del fondo que queda
      // justo debajo del texto (con el bloque oculto), no un color teórico. Es lo que descartó el texto blanco en claro.
      assert.equal(await title.evaluate(e=>getComputedStyle(e).color),dark?'rgb(255, 255, 255)':'rgb(24, 24, 27)');
      assert.equal(await title.evaluate(e=>getComputedStyle(e).textShadow),'none');
      const ink=await title.evaluate(e=>getComputedStyle(e).color.match(/\d+/g).slice(0,3).map(Number));
      const box=await title.boundingBox();
      await card.locator('.brain-notice-content').evaluate(e=>{e.style.visibility='hidden';});
      const shot=await page.screenshot({clip:{x:box.x,y:box.y,width:box.width,height:box.height}});
      await card.locator('.brain-notice-content').evaluate(e=>{e.style.visibility='';});
      const pixels=await sharp(shot).removeAlpha().raw().toBuffer();
      let worst=Infinity;for(let i=0;i<pixels.length;i+=3)worst=Math.min(worst,contrast(ink,[pixels[i],pixels[i+1],pixels[i+2]]));
      assert.ok(worst>=4.5,`contraste real del título ${worst.toFixed(2)} oscuro=${dark}`);
    }
    await page.evaluate(()=>document.documentElement.classList.remove('dark'));
    // La cúpula no tiene caja: va de borde a borde.
    assert.equal((await card.boundingBox()).width,1440);
    await page.mouse.move(0,0);
    await card.locator('[data-notice-title-link]').focus();await page.keyboard.press('Tab');
    assert.equal(await primary.evaluate(e=>e===document.activeElement),true);
    assert.equal(await primary.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
    await page.keyboard.press('Tab');await page.keyboard.press('Enter');
    assert.equal(await card.locator('[data-notice-snooze="10m"]').evaluate(e=>e===document.activeElement),true,'abrir opciones conserva el foco');
    await page.waitForFunction(()=>Number(document.querySelector('main').dataset.noticeHeight)>0);
    const reserved=await page.locator('main').evaluate(e=>parseFloat(getComputedStyle(e).paddingBottom));
    // Lo que tapa es el bloque de texto y botones; la parte alta de la cúpula es casi transparente.
    assert.ok(reserved>=(await card.locator('.brain-notice-content').boundingBox()).height+24,'se reserva espacio según la altura real del bloque');
    await page.keyboard.press('Escape');
    assert.equal(await card.locator('[data-notice-action="snooze"]').evaluate(e=>e===document.activeElement),true,'Esc vuelve al botón que abrió las opciones');
    await page.route('**/api/important-notices/*/snooze',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'No se pudo guardar. Inténtalo otra vez.'})}));
    await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    await page.getByText('No se pudo guardar. Inténtalo otra vez.',{exact:true}).waitFor();
    assert.ok(await card.isVisible());assert.equal(await card.locator('button:disabled').count(),0,'el fallo permite reintentar');
    await page.keyboard.press('Escape');
    // Con «menos movimiento» la banda no se desplaza, pero el vidrio y el texto se funden (Rodny, 14 de noviembre de 2026).
    assert.equal(await card.evaluate(e=>getComputedStyle(e).animationName),'none');
    assert.equal(await card.locator('.brain-notice-wash').evaluate(e=>getComputedStyle(e).animationName),'brain-notice-fade-in');
    assert.equal(await card.locator('.brain-notice-content').evaluate(e=>getComputedStyle(e).animationName),'brain-notice-fade-in');
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});
      const bounds=await card.boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width);
      assert.ok(await card.locator('.brain-notice-content').evaluate(e=>e.scrollWidth<=e.clientWidth),'sin desplazamiento horizontal dentro de la tarjeta');
      for(const button of await card.getByRole('button').all())assert.ok((await button.boundingBox()).height>=44);
    }
    await page.setViewportSize({width:320,height:900});
    await page.addStyleTag({content:'.brain-notice-band { font-size: 200%; } .brain-notice-title { font-size:32px; } .brain-notice-label { font-size:24px; } .brain-notice-band button { font-size:28px; }'});
    assert.ok(await card.locator('.brain-notice-content').evaluate(e=>e.scrollWidth<=e.clientWidth),'texto ampliado al 200% no se corta horizontalmente');
  } finally {await browser.close();await preview.close();}
});
