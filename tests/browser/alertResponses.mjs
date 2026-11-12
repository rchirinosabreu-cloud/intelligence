import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createOperationalNoticePreview} from '../../scripts/preview-operational-notices.mjs';

test('los 13 avisos tienen respuestas propias; confirmar persiste en su origen sin simular cumplimiento', {timeout:120000},async()=>{
  const preview=await createOperationalNoticePreview({port:0});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const out='output/alertas-globales-local';await mkdir(out,{recursive:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${preview.origin}/clientes/operacion/faro`);const card=page.locator('[data-important-notice]');await card.waitFor();
    const scenes={cierre:'OPERACION_CICLO',inicio:'OPERACION_INICIO',renovacion:'OPERACION_RENOVACION',continuidad:'OPERACION_CONTINUIDAD',suspension:'OPERACION_SUSPENSION',reactivacion:'OPERACION_REACTIVACION',crm:'CRM_FOLLOW_UP',revision:'CRM_REVIEW',cartera:'CARTERA_MENSUAL',puntual:'CARTERA_UNICO',riesgo:'CARTERA_SUSPENSION',parrilla:'PARRILLA_SIN_PUBLICAR',resumen:'PARRILLA_RESUMEN'};
    const select=async scene=>{
      await page.getByLabel('Caso',{exact:true}).selectOption(scene);
      await page.waitForFunction(async kind=>(await (await fetch('/api/important-notices/current')).json()).notice?.kind===kind,scenes[scene]);
      await card.waitFor();
      await page.waitForFunction(()=>document.querySelector('[data-notice-effect]'));
    };
    for(const [scene,kind]of Object.entries(scenes)){
      await select(scene);
      assert.equal(await card.getByRole('button',{name:'Recordarme',exact:true}).count(),1);
      assert.equal(await card.getByRole('button',{name:'Resolver oportunidad',exact:true}).count(),kind.startsWith('CRM_')?1:0);
      assert.equal(await card.getByRole('button',{name:'Recibido',exact:true}).count(),['suspension','reactivacion'].includes(scene)?1:0);
      assert.equal(await card.getByRole('button',{name:'Ya hice seguimiento',exact:true}).count(),kind.startsWith('CRM_')?1:0);
      assert.equal(await card.getByRole('button',{name:'Ya le escribí',exact:true}).count(),kind.startsWith('CARTERA_')?1:0);
      await page.screenshot({path:`${out}/${scene}.png`,animations:'disabled'});
    }
    // Pautas llegó a main durante la integración: conserva su acción nativa, nunca cae en CRM.
    for(const [kind,label] of [['PAUTA_REVISION','Revisar pauta'],['PAUTA_CAMPANA','Revisar campaña'],['PAUTA_RESUMEN','Revisar pautas'],['PAUTA_META','Revisar presupuesto en Meta']]){
      await page.route('**/api/important-notices/current',route=>route.fulfill({json:{notice:{id:kind,kind,level:'IMPORTANTE',label:'Pauta · muestra',message:'Revisa el gasto o la campaña en su registro.',url:'/pautas?pauta=local'},nextAt:null}}));
      await page.route(`**/api/important-notices/${kind}/shown`,route=>route.fulfill({json:{ok:true}}));
      await page.reload();await card.getByRole('button',{name:label,exact:true}).waitFor();
      assert.equal(await card.locator('[data-notice-action="follow-up"]').count(),0);
      assert.equal(await card.locator('[data-notice-action="close"]').count(),0);
      await card.getByRole('button',{name:label,exact:true}).click();await page.waitForURL(/\/pautas\?pauta=local/);
      assert.ok(await card.isVisible(),'abrir la pauta no resuelve el aviso');
      await page.unroute('**/api/important-notices/current');
    }
    await select('crm');
    await card.getByRole('button',{name:'Resolver oportunidad',exact:true}).click();
    await card.getByRole('button',{name:'Cliente no aprobó',exact:true}).click();
    assert.ok(await card.getByRole('button',{name:'Confirmar decisión',exact:true}).isDisabled());
    await card.getByLabel('Motivo de la decisión',{exact:true}).fill('El cliente confirmó que no continuará con la propuesta.');
    await page.screenshot({path:`${out}/confirmar-resultado-crm.png`,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await card.locator('.brain-notice-content').evaluate(e=>e.scrollWidth<=e.clientWidth));
    await page.screenshot({path:`${out}/confirmar-resultado-movil.png`,animations:'disabled'});
    await page.setViewportSize({width:1440,height:1000});
    await card.getByRole('button',{name:'Confirmar decisión',exact:true}).click();await card.waitFor({state:'detached'});
    await page.locator('[data-native-record]').getByText('PERDIDO',{exact:true}).waitFor();
    await page.reload();await page.locator('[data-native-record]').getByText('PERDIDO',{exact:true}).waitFor();
    assert.equal(await card.count(),0);let state=await(await page.request.get(`${preview.origin}/api/preview/state`)).json();
    assert.equal(state.activities.length,1);assert.equal(state.activities[0].type,'CAMBIO_ETAPA');
    await page.screenshot({path:`${out}/resultado-en-crm.png`,animations:'disabled'});
    await select('cartera');await card.getByRole('button',{name:'Ya le escribí',exact:true}).click();await card.getByRole('button',{name:'WhatsApp',exact:true}).click();await card.waitFor({state:'detached'});
    state=await(await page.request.get(`${preview.origin}/api/preview/state`)).json();
    assert.equal(state.collectionActivities.length,2);assert.equal(state.client.accountsReceivables[0].payments.length,0);assert.equal(state.activities.length,0);
    await page.locator('[data-native-record]').getByText(/WHATSAPP/).first().waitFor();await page.screenshot({path:`${out}/gestion-en-cartera.png`,animations:'disabled'});
    await select('resumen');await page.getByRole('button',{name:'Simular publicación en Parrillas',exact:true}).click();await card.waitFor({state:'detached'});
    await select('suspension');await card.getByRole('button',{name:'Recibido',exact:true}).click();await card.waitFor({state:'detached'});
    state=await(await page.request.get(`${preview.origin}/api/preview/state`)).json();assert.equal(state.client.suspensions[0].liftedAt,null);
    await select('renovacion');await card.getByRole('button',{name:'Registrar renovación',exact:true}).click();await page.waitForURL(/action=renew-contract/);assert.ok(await card.isVisible());
    await page.getByRole('button',{name:'Tema oscuro',exact:true}).click();await page.screenshot({path:`${out}/renovacion-oscuro.png`,animations:'disabled'});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await preview.close();}
});
