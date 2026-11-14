import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createOperationalNoticePreview } from '../../scripts/preview-operational-notices.mjs';

// La cúpula (Rodny, 13 de noviembre de 2026): de borde a borde, sin caja, texto blanco centrado; verde para el
// seguimiento y coral solo para lo importante; el botón principal blanco con el texto en la variante profunda.
test('la cúpula va de borde a borde, permanece tras Esc y clic exterior y conserva la decisión Recordarme', async () => {
  const preview=await createOperationalNoticePreview({port:0});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(`${preview.origin}/crm`);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const card=page.locator('[data-important-notice]'); await card.waitFor();
    const bounds=await card.boundingBox();
    assert.equal(bounds.width,1440,'sin caja: ocupa el ancho de la ventana');
    assert.equal(bounds.x,0);
    assert.ok(bounds.height>=300 && bounds.height<400,`alto ${bounds.height}`);
    const content=card.locator('.brain-notice-content');
    const style=await content.evaluate(e=>({background:getComputedStyle(e).backgroundColor,width:e.getBoundingClientRect().width,align:getComputedStyle(e).textAlign}));
    assert.equal(style.background,'rgba(0, 0, 0, 0)','el bloque no tiene fondo propio');
    assert.ok(style.width<=620);assert.equal(style.align,'center');
    assert.equal(await card.locator('.brain-notice-dot').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
    assert.equal(await card.locator('.brain-notice-title').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
    const primary=await card.locator('.brain-notice-primary').evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor}));
    assert.equal(primary.background,'rgb(255, 255, 255)');
    assert.notEqual(primary.color,'rgb(255, 255, 255)');
    // El tono lo da el nivel: coral en lo importante, verde en el seguimiento.
    assert.equal(await card.getAttribute('data-level'),'IMPORTANTE');
    assert.equal(await card.evaluate(e=>getComputedStyle(e).getPropertyValue('--notice-hue').trim()),'255 106 104');
    assert.equal(await card.evaluate(e=>{e.dataset.level='SEGUIMIENTO';const v=getComputedStyle(e).getPropertyValue('--notice-hue').trim();e.dataset.level='IMPORTANTE';return v;}),'49 170 138');
    assert.match(await card.locator('.brain-notice-title').textContent(),/\nEl informe/);
    assert.equal(await card.locator('.brain-notice-title').evaluate(e=>getComputedStyle(e).whiteSpace),'pre-line');
    await page.screenshot({path:'output/avisos-operativos-local/cupula-claro.png',animations:'disabled'});
    await page.getByRole('button',{name:'Tema oscuro',exact:true}).click();
    await page.screenshot({path:'output/avisos-operativos-local/cupula-oscuro.png',animations:'disabled'});
    assert.equal(await card.locator('.brain-notice-title a').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
    await page.getByRole('button',{name:'Tema claro',exact:true}).click();
    await card.getByRole('button',{name:'Revisar cierre y avance',exact:true}).click();
    await page.waitForURL(/clientes\/operacion\/faro/);
    assert.ok(await card.isVisible(),'abrir no resuelve');
    await page.reload();await card.waitFor();
    await page.keyboard.press('Escape'); await page.mouse.click(1000,130);
    assert.ok(await card.isVisible());
    assert.equal(await card.getByRole('button',{name:'Cerrar',exact:true}).count(),0);
    await card.getByRole('button',{name:'Recordarme',exact:true}).click();
    await page.keyboard.press('Escape'); assert.ok(await card.isVisible());
    await card.getByRole('button',{name:'Recordarme',exact:true}).click();
    await card.getByRole('button',{name:'En 1 hora',exact:true}).click();
    await card.waitFor({state:'detached'});
    await page.reload();assert.equal(await card.count(),0,'la pausa sobrevive la recarga');
    await page.getByLabel('Caso',{exact:true}).selectOption('suspension');await card.waitFor();
    await page.setViewportSize({width:390,height:844});
    const mobile=await card.boundingBox();assert.ok(mobile.x>=0 && mobile.x+mobile.width<=390);
    assert.ok(mobile.height<480);
    await page.screenshot({path:'output/avisos-operativos-local/cupula-movil.png',animations:'disabled'});
    for(const button of await card.getByRole('button').all())assert.ok((await button.boundingBox()).height>=44);
    await card.getByRole('button',{name:'Recibido',exact:true}).click();await card.waitFor({state:'detached'});
    await page.setViewportSize({width:1440,height:1000});
    for(const [scene,kind] of [['inicio','INICIO'],['mitad','CICLO'],['renovacion','RENOVACION'],['continuidad','CONTINUIDAD'],['reactivacion','REACTIVACION']]) {
      await page.getByLabel('Caso',{exact:true}).selectOption(scene);await card.waitFor();
      const result=await page.evaluate(async()=> (await fetch('/api/important-notices/current')).json());
      assert.equal(result.notice.kind,`OPERACION_${kind}`);
      assert.doesNotMatch(await card.innerText(),/NO debe mostrarse|cartera privada|\$|saldo/i);
      await page.screenshot({path:`output/avisos-operativos-local/cupula-${scene}.png`,animations:'disabled'});
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await preview.close();}
});
