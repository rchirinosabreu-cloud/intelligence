import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createOperationalNoticePreview } from '../../scripts/preview-operational-notices.mjs';

test('avisos: contraste blanco, teclado, errores recuperables, movimiento reducido y reflujo',async()=>{
  const preview=await createOperationalNoticePreview({port:0});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await page.goto(preview.origin);const card=page.locator('[data-important-notice]');await card.waitFor();
    const primary=card.locator('.brain-notice-primary');
    // La cúpula (13 de noviembre de 2026): el botón principal es blanco con el texto en la variante profunda de la
    // paleta —ni blanco ni negro—, con contraste AA en claro, oscuro y al pasar el ratón (el fondo blanco se atenúa).
    for(const dark of [false,true]){
      await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
      await page.mouse.move(0,0);
      for(const hover of [false,true]){
        if(hover)await primary.hover();
        const colors=await primary.evaluate(e=>{
          const s=getComputedStyle(e),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
          const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
          const lum=c=>c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
          const fg=rgb(s.color),bg=rgb(s.backgroundColor);return {fg,bg,ratio:(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05)};
        });
        assert.deepEqual(colors.bg,[255,255,255],'el botón principal va blanco sobre la cúpula');
        assert.notDeepEqual(colors.fg,[255,255,255]);assert.notDeepEqual(colors.fg,[0,0,0]);
        assert.ok(colors.ratio>=4.5,`contraste ${colors.ratio} oscuro=${dark} hover=${hover}`);
      }
    }
    // El título es blanco, sin sombra, y la cúpula no tiene caja: va de borde a borde.
    assert.equal(await card.locator('.brain-notice-title').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
    assert.equal(await card.locator('.brain-notice-title').evaluate(e=>getComputedStyle(e).textShadow),'none');
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
    assert.equal(await card.evaluate(e=>getComputedStyle(e).animationName),'none');
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
