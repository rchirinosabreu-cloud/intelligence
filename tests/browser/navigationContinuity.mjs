import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../../tailwind.config.js';
import { chromium } from 'playwright-core';

// Prueba del mecanismo común, sin APIs. Las pruebas de los módulos prueban sus propios datos/controles.
let server, browser, origin;
test.before(async () => {
  const source = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {BrowserRouter,Routes,Route,Link,useLocation,useNavigate} from 'react-router-dom';
    import BackToOrigin,{useNavigateFrom,useOriginState,usePageLabel,useScrollMemory,useBackToOrigin} from '@/components/layout/BackToOrigin';
    import Activity from '@/components/modules/Activity';
    function List(){const state=useOriginState('Clientes · Equipo');return <>
      <h1 className="text-2xl font-bold">Clientes</h1><p>Equipo · cuenta seleccionada</p>
      <div style={{height:800}}/><Link state={state()} to="/clientes/operacion/faro" className="inline-flex min-h-11 items-center text-brand-cyan-deep dark:text-brand-cyan" data-open>Ver operación de Agencia Faro</Link><div style={{height:900}}/></>}
    function Operation(){usePageLabel('Operación · Agencia Faro');const go=useNavigateFrom();const {goBack}=useBackToOrigin('/clientes');return <>
      <h1 className="text-2xl font-bold">Operación · Agencia Faro</h1><button className="mt-6 min-h-11" onClick={()=>go('/parrillas/p1?item=uno')}>Abrir parrilla</button><button className="ml-6 min-h-11" onClick={()=>go('/actividad')}>Abrir actividad</button><button className="ml-6 min-h-11" onClick={goBack}>Regresar con flecha propia</button></>}
    function Plan(){usePageLabel('Parrilla · Noviembre');const go=useNavigateFrom();const location=useLocation();const navigate=useNavigate();return <>
      <h1 className="text-2xl font-bold">Parrilla · Noviembre</h1><p data-selection>{location.search}</p>
      <button className="mt-6 min-h-11" onClick={()=>navigate('/parrillas/p1?item=dos',{replace:true,state:{...location.state,desdeElCarril:true}})}>Elegir otra pieza</button>
      <button className="ml-6 min-h-11" onClick={()=>go('/gestion?taskId=t1')}>Abrir tarea</button></>}
    function Task(){const navigate=useNavigate();const location=useLocation();React.useEffect(()=>{
      if(location.search)navigate('/gestion',{replace:true,state:location.state});
    },[location.search]);return <h1 className="text-2xl font-bold">Tarea compartida</h1>}
    function Shell(){useScrollMemory();const location=useLocation();window.__location=location;return <main className="mx-auto min-h-screen max-w-5xl space-y-8 p-6 text-foreground"><BackToOrigin/><Routes>
      <Route path="/clientes" element={<List/>}/><Route path="/clientes/operacion/faro" element={<Operation/>}/>
      <Route path="/parrillas/p1" element={<Plan/>}/><Route path="/gestion" element={<Task/>}/><Route path="/actividad" element={<Activity/>}/></Routes></main>}
    createRoot(document.getElementById('root')).render(<BrowserRouter><Shell/></BrowserRouter>);
  `;
  const result = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, write: false, format: 'esm', jsx: 'automatic', minify: true,
    alias: { '@': path.resolve('src') }, define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'activity-readonly-body', setup(build) {
      // Se verifica el contenedor y las pestañas reales de Actividad; el mapa y su calendario tienen pruebas propias.
      build.onResolve({ filter: /^\.\/(ActivityMap|OperationalCalendar)$/ }, ({ path }) => ({ path, namespace: 'activity-body' }));
      build.onLoad({ filter: /.*/, namespace: 'activity-body' }, () => ({ contents: "import React from 'react'; export default function Body(){return <p className='text-muted-foreground'>Contenido de muestra para comprobar la navegación.</p>}", loader: 'jsx', resolveDir: process.cwd() }));
    } }],
  });
  const css = (await postcss([tailwindcss({ ...tailwindConfig, safelist: ['dark'], content: ['./src/components/layout/BackToOrigin.jsx', './src/components/modules/Activity/index.jsx', './src/components/ui/tabs.jsx', { raw: source, extension: 'jsx' }] })])
    .process(await readFile('src/index.css', 'utf8'), { from: path.resolve('src/index.css') })).css;
  server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].text); }
    else if (pathname === '/test.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet"><link rel="stylesheet" href="/test.css"></head><body><div id="root"></div><script type="module" src="/test.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  await mkdir('output/navigation-continuity', { recursive: true });
});
test.after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

test('el regreso encadenado sobrevive selección, recarga y consumo de parámetros; restaura el scroll del enlace', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${origin}/clientes?tab=equipo#personas`);
    await page.locator('[data-open]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => scrollY);
    assert.ok(before > 300);
    await page.locator('[data-open]').click();
    await page.getByRole('button', { name: 'Abrir parrilla', exact: true }).click();
    await page.getByRole('button', { name: 'Elegir otra pieza', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir tarea', exact: true }).click();
    await page.getByRole('heading', { name: 'Tarea compartida' }).waitFor();
    await page.reload();
    const back = page.locator('[data-back-to-origin] button');
    assert.equal(await back.innerText(), 'Volver a Parrilla · Noviembre');
    await back.click();
    await page.getByRole('heading', { name: 'Parrilla · Noviembre', exact: true }).waitFor();
    assert.match(await page.locator('[data-selection]').innerText(), /item=dos/);
    assert.equal(await back.innerText(), 'Volver a Operación · Agencia Faro');
    await page.screenshot({ path: 'output/navigation-continuity/cadena-claro.png' });
    await back.click();
    await page.getByRole('heading', { name: 'Operación · Agencia Faro', exact: true }).waitFor();
    assert.equal(await back.innerText(), 'Volver a Clientes · Equipo');
    await back.click();
    await page.waitForTimeout(750);
    assert.equal(new URL(page.url()).search, '?tab=equipo');
    assert.equal(new URL(page.url()).hash, '#personas');
    const after = await page.evaluate(() => scrollY);
    assert.ok(Math.abs(after - before) < 8, `enlace vuelve a su altura real: ${before} -> ${after}`);
    assert.equal(await back.count(), 0);
    // La misma pantalla de origen puede recuperarse otra vez desde una entrada antigua del historial.
    await page.goBack();
    await page.getByRole('heading', { name: 'Operación · Agencia Faro' }).waitFor();
    await page.locator('[data-back-to-origin] button').click();
    await page.waitForTimeout(750);
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) < 8, 'cada nueva vuelta restaura aunque el origen ya se haya visitado');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('volver conserva foco, área táctil y legibilidad en oscuro y móvil', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${origin}/clientes`);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.locator('[data-open]').click();
    await page.getByRole('button', { name: 'Abrir parrilla', exact: true }).click();
    const back = page.locator('[data-back-to-origin] button');
    await back.focus();
    assert.equal(await back.evaluate(node => document.activeElement === node), true);
    const box = await back.boundingBox();
    assert.ok(box.height >= 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(9, 9, 11)', 'se comprueba el tema real, además de la clase dark');
    await page.screenshot({ path: 'output/navigation-continuity/cadena-oscuro-movil.png' });
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Operación · Agencia Faro' }).waitFor();
  } finally { await page.close(); }
});

test('un regreso repetido desde la misma entrada del navegador restaura la posición cada vez', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  try {
    await page.goto(`${origin}/clientes`);
    await page.locator('[data-open]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => scrollY);
    await page.locator('[data-open]').click();
    await page.locator('[data-back-to-origin] button').click();
    await page.waitForTimeout(750);
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) < 8);
    await page.goBack();
    await page.getByRole('heading', { name: 'Operación · Agencia Faro' }).waitFor();
    await page.locator('[data-back-to-origin] button').click();
    await page.waitForTimeout(750);
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) < 8, 'un nuevo regreso no es una selección local ya restaurada');
  } finally { await page.close(); }
});

test('las pestañas reales de Actividad conservan el regreso y usan el tema vigente', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  try {
    await page.goto(`${origin}/clientes/operacion/faro`);
    await page.getByRole('button', { name: 'Abrir actividad', exact: true }).click();
    await page.getByRole('tab', { name: 'Calendario Operativo' }).click();
    await page.waitForURL('**/actividad?vista=calendario');
    assert.equal(await page.locator('[data-back-to-origin] button').innerText(), 'Volver a Operación · Agencia Faro');
    assert.equal(await page.getByRole('tab', { name: 'Calendario Operativo' }).getAttribute('aria-selected'), 'true');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'output/navigation-continuity/actividad-claro.png' });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'output/navigation-continuity/actividad-oscuro.png' });
    await page.locator('[data-back-to-origin] button').click();
    await page.getByRole('heading', { name: 'Operación · Agencia Faro', exact: true }).waitFor();
  } finally { await page.close(); }
});

test('la flecha propia de una pantalla desmontada restaura cada nuevo regreso', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  try {
    await page.goto(`${origin}/clientes`);
    await page.locator('[data-open]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => scrollY);
    await page.locator('[data-open]').click();
    await page.getByRole('button', { name: 'Regresar con flecha propia' }).click();
    await page.waitForTimeout(750);
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) < 8);
    await page.goBack();
    await page.getByRole('heading', { name: 'Operación · Agencia Faro' }).waitFor();
    await page.getByRole('button', { name: 'Regresar con flecha propia' }).click();
    await page.waitForTimeout(750);
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) < 8, 'remontar la pantalla no repite la identidad del primer regreso');
  } finally { await page.close(); }
});
