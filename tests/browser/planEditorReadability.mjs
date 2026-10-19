import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const out=process.env.SHOT_DIR || 'output/parrilla-lectura';
await mkdir(out,{recursive:true});
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:0,open:false}});
await server.listen();
const browser=await chromium.launch({channel:'chrome'});
const problems=[];
try {
  for(const [name,width,dark] of [['desktop',1440,false],['dark',1440,true],['mobile',390,false]]){
    const page=await browser.newPage({viewport:{width,height:1100},colorScheme:dark?'dark':'light'});
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/plan-editor-preview.html?textoLargo=1`,{waitUntil:'networkidle'});
    if(dark)await page.evaluate(()=>document.documentElement.classList.add('dark'));
    await page.evaluate(()=>document.fonts.ready);
    const checkTab=async(label)=>{
      const button=page.getByRole('button',{name:label,exact:true});
      await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()===text&&node.getAttribute('aria-pressed')==='true'),label);
      await page.waitForTimeout(250);
      const bg=await button.evaluate(node=>getComputedStyle(node).backgroundColor);
      if(!/^rgba?\(0,\s*155,\s*191(?:,|\))/.test(bg))problems.push(`${name}: pestaña ${label} sin el acento cian (${bg})`);
    };
    await checkTab('Editor');
    for(const editing of [false,true]){
      if(editing)await page.getByRole('button',{name:'Editar',exact:true}).click();
      const fields=await page.locator('#item-i1').evaluate(card=>['guion-','texto-'].map(prefix=>{
        const label=card.querySelector(`label[for^="${prefix}"]`);
        const field=label.parentElement.parentElement.lastElementChild;
        return {field:prefix,width:field.clientWidth,scroll:field.scrollWidth,text:field.value || field.textContent};
      }));
      for(const field of fields){
        assert.ok(field.text.includes('archivo'.repeat(35)),`${field.field}: no se pierde el enlace largo`);
        if(field.scroll>field.width+1)problems.push(`${name}, ${editing?'edición':'lectura'}: ${field.field} tiene desplazamiento horizontal (${field.scroll}/${field.width})`);
      }
      console.log(JSON.stringify({name,editing,fields:fields.map(({text,...rest})=>rest)}));
      await page.locator('#item-i1').screenshot({path:`${out}/${name}-${editing?'edicion':'lectura'}.png`});
    }
    await page.getByRole('button',{name:'Calendario',exact:true}).click();
    await checkTab('Calendario');
    await page.close();
  }
} finally {await browser.close();await server.close();}
assert.deepEqual(problems,[]);
console.log('Pestañas con acento de marca y textos sin desplazamiento horizontal: verificados.');
