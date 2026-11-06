import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';

// Pantallas reales, API local de solo lectura y datos ficticios. No carga .env ni conecta bases o producción.
const rootDir = path.resolve(import.meta.dirname, '..');
const user = { id: 'navigation-user', userId: 'navigation-user', name: 'Lucía Faro', role: 'ADMIN', modulePermissions: {} };
const member = { id: 'navigation-member', userId: user.id, name: user.name, isActive: true };
const client = { id: 'navigation-client', name: 'Cliente de prueba', slug: 'cliente-de-prueba', socialAccounts: [], responsible: member, projectManager: member };
const piece = id => ({ id, planId: 'navigation-plan', objective: `Contenido ${id}`, format: 'Post',
  copyText: 'Guion de prueba', captionText: 'Texto de prueba', status: 'EN_PRODUCCION', publishDate: '2026-11-05T00:00:00Z',
  finalAssets: [], mediaUrl: [], assetsLinks: [], publications: [], tasks: [{ id: 'navigation-task', status: 'PENDIENTE' }] });
const items = [piece('uno'), piece('dos')];
const plan = { id: 'navigation-plan', clientId: client.id, client, month: 11, year: 2026, status: 'ACTIVO', items, shareToken: 'navigation-share', updatedAt: '2026-11-05T15:00:00Z' };
const task = { id: 'navigation-task', title: 'Diseñar contenido', status: 'PENDIENTE', clientId: client.id, client,
  assigneeId: member.id, assignee: member, creatorId: user.id, creator: user, collaborators: [], sortOrder: 0,
  contentItemId: 'uno', contentItem: items[0], plan: { id: plan.id }, taskComments: [], taskAttachments: [],
  dueDate: new Date().toISOString(), createdAt: new Date().toISOString(), accumulatedWorkMs: 0 };

export async function createNavigationPreview({ port = 3711 } = {}) {
  const source = `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {BrowserRouter,Routes,Route,useLocation} from 'react-router-dom';
    import NativeTasks from '@/components/modules/NativeTasks';
    import ContentPlanDetail from '@/components/modules/ContentPlanDetail';
    import ExternalPlanView from '@/components/modules/ContentGrids/ExternalPlanView';
    import SharedContentPlan from '@/components/public/SharedContentPlan';
    import ContentGrids from '@/components/modules/ContentGrids';
    import Clients from '@/components/modules/Clients';
    import ClientDetailWrapper from '@/components/modules/ClientDetailWrapper';
    import ClientTasksWidget from '@/components/modules/ClientTasksWidget';
    import CompletedTasksHistoryModal from '@/components/modules/CompletedTasksHistoryModal';
    import Dashboard from '@/components/modules/Dashboard';
    import BackToOrigin,{useNavigateFrom,useScrollMemory,usePageLabel} from '@/components/layout/BackToOrigin';
    import BrainToaster from '@/components/ui/BrainToaster';
    import {AuthProvider,useAuth} from '@/context/AuthContext';
    import {ConfirmDialogProvider} from '@/components/ui/ConfirmDialog';
    import {markTaskTimingTutorialSeen,markTaskTimingTutorialAfternoonSeen} from '@/lib/taskTiming';
    const user=${JSON.stringify(user)};
    const previousToken=localStorage.getItem('authToken');
    if(previousToken && !previousToken.endsWith('.navigation-local')) throw new Error('Este origen ya tiene otra sesión. Usa otro puerto para la muestra local.');
    document.documentElement.classList.toggle('dark',new URLSearchParams(window.location.search).has('dark'));
    localStorage.setItem('authToken','e30.'+btoa(JSON.stringify({exp:4102444800}))+'.navigation-local');
    localStorage.setItem('currentUser',JSON.stringify(user));
    markTaskTimingTutorialSeen(localStorage,user.id); markTaskTimingTutorialAfternoonSeen(localStorage,user.id);
    const queryClient=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    function PreviewDashboard(){const {currentUser}=useAuth();return currentUser?.id?<Dashboard/>:null;}
    function Start(){const go=useNavigateFrom();usePageLabel('Muestra local');return <section className="mx-auto max-w-2xl space-y-5 py-12"><h1 className="text-2xl font-semibold">Muestra local de navegación</h1><p className="text-muted-foreground">Consulta una tarea, abre su parrilla y regresa al punto donde estabas. Los datos son ficticios y los cambios de información no se guardan.</p><div className="flex flex-wrap gap-3"><button className="min-h-11 rounded-xl bg-primary px-4 text-primary-foreground" onClick={()=>go('/gestion?taskId=navigation-task')}>Consultar tarea</button><button className="min-h-11 rounded-xl border px-4" onClick={()=>go('/parrillas')}>Explorar parrillas</button><button className="min-h-11 rounded-xl border px-4" onClick={()=>go('/clientes?tab=directorio')}>Consultar clientes</button></div></section>}
    function Shell(){useScrollMemory();const location=useLocation();window.__navigationLocation=location;
      return <main className="min-h-screen bg-background p-6 text-foreground"><BackToOrigin/><Routes>
        <Route path="/inicio" element={<Start/>}/><Route path="/gestion" element={<NativeTasks/>}/>
        <Route path="/parrillas" element={<ContentGrids/>}/>
        <Route path="/parrillas/hoja/:clientSlug/:period" element={<ExternalPlanView/>}/>
        <Route path="/shared/:token" element={<SharedContentPlan/>}/>
        <Route path="/parrillas/:planId" element={<ContentPlanDetail/>}/>
        <Route path="/parrillas/:clientSlug/:period" element={<ContentPlanDetail/>}/>
        <Route path="/clientes" element={<Clients/>}/><Route path="/cliente/:clientId" element={<ClientDetailWrapper/>}/>
        <Route path="/muestra-pendientes" element={<ClientTasksWidget clientId="navigation-client"/>}/>
        <Route path="/muestra-logros" element={<CompletedTasksHistoryModal isOpen onClose={()=>{}}/>}/>
        <Route path="/muestra-dashboard" element={<PreviewDashboard/>}/>
      </Routes></main>}
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><AuthProvider><ConfirmDialogProvider><BrowserRouter><Shell/><BrainToaster/></BrowserRouter></ConfirmDialogProvider></AuthProvider></QueryClientProvider>);
  `;
  const bundle = await build({ stdin: { contents: source, resolveDir: rootDir, loader: 'jsx' }, write: false, bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', minify: true,
    alias: { '@': path.join(rootDir, 'src') }, loader: { '.css': 'empty', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' } });
  const css = (await postcss([tailwindcss({ ...tailwindConfig, content: [path.join(rootDir, 'src/**/*.{js,jsx}'), { raw: source, extension: 'jsx' }] }), autoprefixer()])
    .process(await readFile(path.join(rootDir, 'src/index.css'), 'utf8'), { from: path.join(rootDir, 'src/index.css') })).css;
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Navegación · muestra local</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet"><link rel="stylesheet" href="/navigation-test.css"></head><body><div id="root"></div><script type="module" src="/navigation-test.js"></script></body></html>';
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'");
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if(req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'});res.end(JSON.stringify({error:'Muestra local de solo lectura: no se guardan cambios.'}));return; }
    if (pathname === '/navigation-test.js' || pathname === '/navigation-test.css') {
      res.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : 'text/css' });
      res.end(pathname.endsWith('.js') ? bundle.outputFiles[0].text : css); return;
    }
    if (pathname === '/') { res.writeHead(302, {Location:'/inicio'});res.end();return; }
    if (!pathname.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
    const data = {
      '/api/auth/me': user, '/api/team': [member], '/api/db/clients': [client], '/api/tasks': [task],
      '/api/clients': [client], '/api/client-operations': [], '/api/db/clients/cliente-de-prueba': client,
      '/api/clients/navigation-client/announcements': [], '/api/clients/navigation-client/files': [],
      '/api/clients/navigation-client/flow': [], '/api/social/accounts': [], '/api/db/clients/navigation-client/links': [],
      '/api/tasks/navigation-task': task, '/api/tasks/returned-alerts': { tasks: [] }, '/api/tasks/work-alerts': { tasks: [] },
      '/api/metrics/quality-streak': { currentStreak: 0, maxStreak: 0, currentStreakDays: 0, currentReturnedTasksCount: 0 },
      '/api/content/plans': [plan], '/api/content/plans/navigation-plan': plan,
      '/api/content/plans/cliente-de-prueba/11-2026': plan, '/api/content/external-plans': [],
    };
    res.writeHead(req.method === 'GET' && Object.hasOwn(data, pathname) ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data[pathname] || { error: 'Solo hay datos ficticios locales.' }));
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };

}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const portArg = process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1];
  const preview = await createNavigationPreview({ port: Number(portArg || 3711) });
  console.log(`Navegación (muestra local): ${preview.origin}/inicio\nDatos ficticios. Sin conexión a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
