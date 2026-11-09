import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
import axios from 'axios';
import '@/index.css';
import PartyMergeDialog from '@/components/modules/financial/PartyMergeDialog';
import LegacyOffsetDialog from '@/components/modules/financial/LegacyOffsetDialog';
import FinancialOffsetDialog from '@/components/modules/financial/FinancialOffsetDialog';
import FinancialBarterDialog from '@/components/modules/financial/FinancialBarterDialog';
import {PayrollPeriodsDialog} from '@/components/modules/financial/PayrollPeriods';
import {ThirdPartyDialog} from '@/components/modules/financial/ThirdParties';
const request=axios.getAdapter('xhr');axios.defaults.adapter=config=>{const url=new URL(config.url,location.origin);return request({...config,url:`${location.origin}/preview-api${url.pathname.replace('/api/financials','')}${url.search}`});};
localStorage.setItem('authToken','fixture-only');
localStorage.setItem('currentUser',JSON.stringify({id:'financial-recovery-preview'}));
function RolesDemo({onClose}) {
 const [saving,setSaving]=useState(false),[error,setError]=useState('');
 const q=useQuery({queryKey:['preview-role-example'],queryFn:async()=>(await axios.get('/api/financials/third-parties')).data.thirdParties.find(p=>p.id==='roles-example')});
 if(!q.data)return <p>Cargando ficha de muestra…</p>;
 return <ThirdPartyDialog open thirdParty={q.data} saving={saving} error={error} onClose={onClose} onSubmit={async(form,clear)=>{setSaving(true);try{await axios.patch('/api/financials/third-parties/roles-example',form);clear();await q.refetch();onClose();}catch(e){setError(e.response?.data?.message||'No se pudo guardar.');}finally{setSaving(false);}}}/>;
}
function App(){const[open,setOpen]=useState(null);return <main className="min-h-screen bg-zinc-50 p-10 text-zinc-900 dark:bg-zinc-950 dark:text-white"><div className="mx-auto max-w-5xl"><p className="text-sm text-brand-cyan-deep dark:text-brand-cyan">FINANCIERO · MUESTRA LOCAL</p><h1 className="mt-2 text-3xl font-bold">Terceros, cruces y períodos</h1><p className="mt-3 text-zinc-500">Datos ficticios. Las decisiones de esta muestra no cambian registros reales.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{[['roles','Varias clasificaciones'],['merge','Revisar fichas duplicadas'],['barter','Canje con persona del equipo'],['legacy','Completar cruce anterior'],['payroll','Revisar períodos de Jesu']].map(([id,label])=><button key={id} className="min-h-24 rounded-2xl border border-zinc-200 bg-white p-6 text-left text-lg font-semibold dark:border-white/10 dark:bg-zinc-900" onClick={()=>setOpen(id)}>{label}</button>)}</div><button className="mt-6 min-h-11 underline" onClick={()=>document.documentElement.classList.toggle('dark')}>Cambiar tema</button></div>
{open==='roles'&&<RolesDemo onClose={()=>setOpen(null)}/>}
{open==='merge'&&<PartyMergeDialog onClose={()=>setOpen(null)}/>}
{open==='legacy'&&<LegacyOffsetDialog paymentId="old-offset" onClose={()=>setOpen(null)} onLinked={()=>setOpen('offset')}/>}
{open==='offset'&&<FinancialOffsetDialog paymentId="old-offset" onClose={()=>setOpen(null)}/>}
{open==='barter'&&<FinancialBarterDialog receivableId="barter-ar" onClose={()=>setOpen(null)}/>}
{open==='payroll'&&<PayrollPeriodsDialog collaborator={{id:'jesu-contract',name:'Jesu · muestra'}} year={2026} month={10} canWrite canApprove onClose={()=>setOpen(null)} onSaved={async()=>{}}/>}
</main>;}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><App/></QueryClientProvider>);
