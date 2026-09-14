import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createRecognitionPreview } from '../../scripts/preview-recognitions.js';
import { buildOperationalHealthSnapshot } from '../../src/services/operationalHealthService.js';

const names=['Brayan Torres','Elisa Mestra','Francisco Villa','Helen Hernández','Jarlan Espinosa','Kamila del Toro','Keila Daza','Melissa Castaño','Rodny Chirinos','Sara Herrera'];
let preview,browser;
test.before(async()=>{
  preview=await createRecognitionPreview({port:0});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  await mkdir('output/team-roster',{recursive:true});
});
test.after(async()=>{await browser?.close();await preview?.close();});
for (const variant of [{name:'desktop-light',width:1440,height:1100},{name:'mobile-dark',width:390,height:844,dark:true}]) {
  test(`${variant.name}: all ten official members remain visible without phantom accounts or overflow`,async()=>{
    const page=await browser.newPage({viewport:{width:variant.width,height:variant.height},isMobile:!!variant.dark,hasTouch:!!variant.dark});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const users=names.map((name,index)=>({id:`u${index}`,name,isActive:true,role:index===8?'ADMIN':'EDITOR',teamMember:{id:`m${index}`,isActive:true}}));
    const data=buildOperationalHealthSnapshot({now:new Date('2026-09-14T14:00:00Z'),users:[...users,{id:'ghost',name:'Claudia Muñoz',isActive:true,teamMember:null}],tasks:[{id:'t1',title:'Ejemplo',creatorId:'u5',createdAt:new Date('2026-09-14T13:00:00Z'),status:'REALIZADA'}]});
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/auth/me') return route.fulfill({json:{id:'preview-admin',role:'ADMIN'}});
      if(path==='/api/dashboard/operational-health') return route.fulfill({json:data});
      if(path==='/api/dashboard/operational-trace') return route.fulfill({json:{users,summary:{},timeline:[]}});
      return route.fulfill({status:404,json:{error:'Blocked local preview'}});
    });
    try {
      await page.goto(`${preview.origin}/tests/fixtures/team-roster-preview.html${variant.dark?'?dark':''}`);
      const section=page.locator('section').filter({has:page.getByRole('heading',{name:'Participación del equipo'})});
      await section.getByText('Sara Herrera',{exact:true}).waitFor();
      for(const name of names) assert.equal(await section.getByText(name,{exact:true}).count(),1);
      assert.doesNotMatch(await section.innerText(),/Claudia|Test User|VIEWER/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await section.screenshot({path:`output/team-roster/${variant.name}.png`});
      assert.deepEqual(errors,[]);
    } finally { await page.close(); }
  });
}
