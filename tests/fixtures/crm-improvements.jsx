import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider,useQuery,useQueryClient} from '@tanstack/react-query';
import {Toaster} from 'react-hot-toast';
import ImportantNoticeBand from '@/components/notifications/ImportantNoticeBand';
import CrmActivityForm from '@/components/modules/Crm/CrmActivityForm';

const query=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Preview(){
  const qc=useQueryClient();const [dark,setDark]=useState(false);const [height,setHeight]=useState(0);
  const {data:state}=useQuery({queryKey:['crm','preview'],queryFn:async()=>(await fetch('/api/preview/state')).json()});
  const act=async(path)=>{await fetch(`/api/preview/${path}`,{method:'POST'});await qc.invalidateQueries();};
  document.documentElement.classList.toggle('dark',dark);
  return <main className="min-h-screen bg-zinc-50 p-5 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-10" style={{paddingBottom:height+48}}>
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Brain Studio · CRM</p><h1 className="mt-2 text-2xl font-bold">Seguimiento comercial</h1><p className="mt-2 text-sm text-zinc-500">Prueba local · oportunidades y gestiones ficticias</p></div>
        <div className="flex flex-wrap gap-2">{[['Reiniciar prueba',()=>act('scene/revision')],['Avanzar al seguimiento',()=>act('follow-up-day')],[dark?'Tema claro':'Tema oscuro',()=>setDark(!dark)]].map(([label,run])=><button key={label} onClick={run} className="min-h-11 rounded-xl border border-zinc-200 px-4 text-sm dark:border-zinc-700">{label}</button>)}</div>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="mb-1 text-lg font-semibold">Registrar gestión</h2><p className="mb-6 text-sm text-zinc-500">Escribe «Se contacto» en «Qué se hizo» para probar tus frases frecuentes.</p>
          {state?.lead&&<CrmActivityForm key={state.lead.id} leadId={state.lead.id} compact onSaved={()=>qc.invalidateQueries()}/>}
        </section>
        <section data-native-record className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase text-primary">Oportunidad del CRM</p><h2 className="mt-2 text-xl font-semibold">{state?.lead?.company}</h2>
          <p className="mt-3 text-sm">Estado: <b>{state?.lead?.stage}</b></p>
          <p className="mt-4 text-sm">Próxima acción: <b>{state?.lead?.nextAction||'Sin programar'}</b></p>
          <p className="mt-2 text-sm">Próximo seguimiento: <b>{state?.lead?.nextFollowUpAt?.slice(0,10)||'Sin fecha'}</b></p>
          <h3 className="mt-6 border-t border-zinc-100 pt-4 text-sm font-semibold dark:border-zinc-800">Historial conservado</h3>
          {state?.activities?.map(activity=><div key={activity.id} className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800"><p className="font-semibold">{activity.type}</p><p className="mt-1 whitespace-pre-wrap">{activity.note}</p><p className="mt-2 text-xs text-zinc-500">{state.actor} · {new Date(activity.occurredAt).toLocaleDateString('es-CO',{timeZone:'America/Bogota'})}</p></div>)}
        </section>
      </div>
    </div><ImportantNoticeBand onHeightChange={setHeight}/><Toaster position="top-right"/>
  </main>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><BrowserRouter><Preview/></BrowserRouter></QueryClientProvider>);
