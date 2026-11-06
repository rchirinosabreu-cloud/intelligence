import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createOperationalNoticePreview } from '../../scripts/preview-operational-notices.mjs';

test('el aviso es compacto, permanece tras Esc y clic exterior y conserva la decisión Recordarme', async () => {
  const preview=await createOperationalNoticePreview({port:0});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(`${preview.origin}/crm`);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const card=page.locator('[data-important-notice]'); await card.waitFor();
    const bounds=await card.boundingBox();
    assert.ok(bounds.width>=660 && bounds.width<=700,`ancho ${bounds.width}`);
    assert.equal(await card.getAttribute('data-appearance'),'halo');
    assert.ok(bounds.height<300,`alto ${bounds.height}`);
    const style=await card.locator('.brain-notice-content').evaluate(e=>({background:getComputedStyle(e).backgroundColor,padding:getComputedStyle(e).paddingLeft}));
    assert.equal(style.background,'rgb(255, 255, 255)');
    for(const selector of ['.brain-notice-dot']) {
      assert.equal(await card.locator(selector).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 106, 104)');
    }
    assert.equal(await card.locator('.brain-notice-primary').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
    const halo=await card.locator('.brain-notice-wash').boundingBox();
    assert.ok(halo.width>=bounds.width+100,'halo más extendido alrededor');
    assert.equal(style.padding,'32px');
    assert.match(await card.locator('.brain-notice-title').textContent(),/\nEl informe/);
    assert.equal(await card.locator('.brain-notice-title').evaluate(e=>getComputedStyle(e).whiteSpace),'pre-line');
    await page.screenshot({path:'output/avisos-operativos-local/halo-ancho-claro.png',animations:'disabled'});
    await page.getByRole('button',{name:'Tema oscuro',exact:true}).click();
    await page.screenshot({path:'output/avisos-operativos-local/halo-ancho-oscuro.png',animations:'disabled'});
    assert.equal(await card.locator('.brain-notice-title a').evaluate(e=>getComputedStyle(e).color),'rgb(244, 244, 245)');
    await page.getByRole('button',{name:'Tema claro',exact:true}).click();
    await card.getByRole('button',{name:'Revisar operación',exact:true}).click();
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
    assert.ok(mobile.height<400);
    await page.screenshot({path:'output/avisos-operativos-local/halo-ancho-movil.png',animations:'disabled'});
    for(const button of await card.getByRole('button').all())assert.ok((await button.boundingBox()).height>=44);
    await card.getByRole('button',{name:'Entendido',exact:true}).click();await card.waitFor({state:'detached'});
    await page.setViewportSize({width:1440,height:1000});
    for(const [scene,kind] of [['inicio','INICIO'],['mitad','CICLO'],['renovacion','RENOVACION'],['continuidad','CONTINUIDAD'],['reactivacion','REACTIVACION']]) {
      await page.getByLabel('Caso',{exact:true}).selectOption(scene);await card.waitFor();
      const result=await page.evaluate(async()=> (await fetch('/api/important-notices/current')).json());
      assert.equal(result.notice.kind,`OPERACION_${kind}`);
      assert.doesNotMatch(await card.innerText(),/NO debe mostrarse|cartera privada|\$|saldo/i);
      await page.screenshot({path:`output/avisos-operativos-local/halo-${scene}.png`,animations:'disabled'});
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await preview.close();}
});
