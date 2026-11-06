import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation} from 'react-router-dom';
import {QueryClient,QueryClientProvider,useQueryClient} from '@tanstack/react-query';
import {Toaster} from 'react-hot-toast';
import ImportantNoticeBand from '@/components/notifications/ImportantNoticeBand';
import {Bell,ChevronRight,Plus,LayoutDashboard,Users,Calendar,CheckCircle,FileText} from '@/components/ui/icons';

const query=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Preview(){
 const qc=useQueryClient();const location=useLocation();
 const [design,setDesign]=useState(new URLSearchParams(window.location.search).get('design')||'halo');
 const [dark,setDark]=useState(new URLSearchParams(window.location.search).has('dark'));
 const [noticeHeight,setNoticeHeight]=useState(0);
 document.documentElement.classList.toggle('dark',dark);
 const act=async(path)=>{await fetch(`/api/preview/${path}`,{method:'POST'});await qc.invalidateQueries();};
 return <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
  <aside className="fixed bottom-0 left-0 top-0 hidden w-60 border-r border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 lg:block">
   <div className="mb-8 text-xl font-bold">brain<span className="text-primary">studio</span></div>
   <div className="mb-7 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-green-soft text-brand-green-deep">KT</div><div><b>Kamila</b><p className="text-xs text-zinc-500 dark:text-zinc-400">Project Manager · Local</p></div></div>
   {[['Inicio',LayoutDashboard],['Clientes',Users],['Gestión',CheckCircle],['Parrillas',Calendar],['Informes',FileText]].map(([label,Icon])=><div key={label} className={`mb-2 flex items-center gap-3 rounded-xl p-3 text-sm ${label==='Clientes'?'bg-primary/10 font-semibold text-primary':'text-zinc-600 dark:text-zinc-400'}`}><Icon className="h-4 w-4"/>{label}</div>)}
  </aside>
  <main data-notice-height={noticeHeight} style={{paddingBottom:noticeHeight+32}} className="px-6 pb-80 pt-5 lg:ml-60 lg:px-10">
   <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
    <span className="font-semibold">Revisión local · datos de ejemplo</span>
    <div className="flex flex-wrap items-center gap-2"><select aria-label="Diseño" value={design} onChange={e=>setDesign(e.target.value)} className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"><option value="compact">A · Tarjeta sobria</option><option value="accent">B · Cabecera con color</option><option value="halo">C · Halo suave</option></select>
    <select aria-label="Caso" onChange={e=>act(`scene/${e.target.value}`)} className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"><option value="cierre">Precierre</option><option value="mitad">Mitad de ciclo</option><option value="inicio">Proyecto habilitado</option><option value="renovacion">Renovación</option><option value="continuidad">Continuidad por confirmar</option><option value="suspension">Suspensión confirmada</option><option value="reactivacion">Reactivación</option></select>
    <button className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700" onClick={()=>setDark(!dark)}>{dark?'Tema claro':'Tema oscuro'}</button></div>
   </div>
   <div className="mb-4 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">Clientes <ChevronRight className="h-3 w-3"/> Operación <ChevronRight className="h-3 w-3"/> Fundación Horizonte</div>
   <div className="mb-9 flex items-center justify-between gap-5"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-bold text-white">FH</div><div><h1 className="text-2xl font-bold">Fundación Horizonte</h1><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Brain Studio · Parrilla mensual</p></div></div><button className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4"/>Nueva tarea</button></div>
   <div className="grid gap-6 xl:grid-cols-3"><section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 xl:col-span-2"><div className="flex justify-between"><h2 className="font-semibold">Operación del período</h2><span className="text-xs text-zinc-500 dark:text-zinc-400">15 oct — 14 nov</span></div><p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">El avance viene de las piezas y publicaciones de la parrilla.</p>
    <div className="my-6 grid grid-cols-3 gap-3">{[['12','Contratadas'],['10','Publicadas'],['2','Por publicar']].map(([count,label])=><div key={label} className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800"><b className="text-2xl">{count}</b><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{label}</p></div>)}</div>
    <div className="mb-5 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800"><div className="h-2 w-5/6 rounded-full bg-brand-green"/></div>
    {['Parrilla del período','Informe mensual','Jornada de producción'].map((label,i)=><div key={label} className="flex items-center justify-between border-t border-zinc-100 py-4 text-sm dark:border-zinc-800"><span>{label}</span><span className="text-zinc-500 dark:text-zinc-400">{['10 publicaciones','En revisión','Consultar planificación'][i]}</span></div>)}
    {location.pathname.includes('/clientes/operacion/')&&<div className="mt-4 flex flex-wrap gap-2"><button className="rounded-xl bg-primary px-4 py-3 text-sm text-white" onClick={()=>act('close')}>Simular cierre en su registro</button><button className="rounded-xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-700" onClick={()=>act('review')}>Simular revisión de proyecto</button></div>}
   </section><div className="space-y-6"><section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="mb-4 font-semibold">Ficha operativa</h2><p className="text-sm">PM · Kamila</p><p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Community · Equipo de ejemplo</p><div className="my-4 border-t border-zinc-100 dark:border-zinc-800"/><p className="text-xs text-zinc-500 dark:text-zinc-400">Piezas al mes</p><p className="mt-2 text-sm">4 videos · 4 carruseles · 4 posts</p></section><section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="mb-4 font-semibold">Tareas abiertas</h2><p className="text-sm">Publicar contenidos de cierre</p><p className="mt-3 text-sm">Revisar informe mensual</p></section></div></div>
   <p className="mt-6 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400"><Bell className="h-4 w-4"/>La tarjeta permanece al navegar. El ejemplo financiero está excluido del perfil de Kamila.</p>
  </main><ImportantNoticeBand appearance={design} onHeightChange={setNoticeHeight}/><Toaster position="top-right"/>
 </div>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><BrowserRouter><Preview/></BrowserRouter></QueryClientProvider>);
