import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {useSearchParams,Link} from 'react-router-dom';
import axios from 'axios';
import {getApiBaseUrl} from '@/lib/apiBaseUrl';
import {groupFinancialReceivables} from '@/utils/financialReceivables';
const money=value=>Number(value||0).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});
const day=value=>value?new Date(value).toLocaleDateString('es-CO',{timeZone:'UTC'}):'Sin terminación';
export default function FinancialPersonSummary({party}){
 const [params]=useSearchParams(),year=Number(params.get('year'))||new Date().getFullYear();
 const {data,error}=useQuery({queryKey:['financial-person-summary',party.id,year],queryFn:async()=>{
  const config={headers:{Authorization:`Bearer ${localStorage.getItem('authToken')}`}};
  const [debts,payroll]=await Promise.all(['receivables-ledger','payroll-ledger'].map(path=>axios.get(`${getApiBaseUrl()}/api/financials/${path}?year=${year}`,config)));
  return {debts:groupFinancialReceivables(debts.data.items.filter(r=>r.partyId===party.id))[0],contracts:payroll.data.items.filter(r=>r.partyId===party.id)};
 }});
 if(error)return <p role="alert" className="text-sm text-destructive brain-destructive-text">No se pudieron consultar las obligaciones de esta ficha.</p>;
 if(!data)return <p className="text-sm text-zinc-500">Consultando cartera y nómina…</p>;
 return <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900 lg:col-span-2" data-person-summary>
  <h3 className="text-sm font-semibold">Cartera y nómina · {year}</h3><div className="grid gap-5 md:grid-cols-2"><div><p className="text-xs text-zinc-500">Saldo por cobrar</p><p className="mt-1 text-lg font-semibold">{money(data.debts?.totalOutstanding)}</p>{data.debts?.reviewCount>0&&<p className="text-sm text-amber-700">{data.debts.reviewCount} saldo(s) por verificar</p>}<ul className="mt-2 space-y-1 text-sm">{data.debts?.kinds.map(kind=><li key={kind}>{kind==='PRESTAMO'?'Préstamos':kind==='BENEFICIARIO'?'Canjes':'Servicios'} · {data.debts.debts.filter(d=>(d.kind||'CLIENTE')===kind).length} obligaciones · {money(data.debts.debts.filter(d=>(d.kind||'CLIENTE')===kind&&!d.balanceReviewRequired).reduce((sum,d)=>sum+Number(d.outstanding),0))}</li>)}</ul><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary" to={`/financiero?tab=cartera&year=${year}&q=${encodeURIComponent(party.name)}`}>Consultar obligaciones y abonos</Link></div><div><p className="text-xs text-zinc-500">Contratos y períodos</p>{data.contracts.length?data.contracts.map(c=><div className="mt-2 border-b pb-2 text-sm dark:border-white/10" key={c.id}><p>{day(c.startDate)} – {day(c.endDate)}</p><p className="text-xs text-zinc-500">{money(Number(c.baseSalary)+Number(c.socialSecurity))} mensual · {c.transactions.length} liquidaciones conservadas</p></div>):<p className="mt-2 text-sm text-zinc-500">Sin contratos de nómina.</p>}<Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary" to={`/financiero?tab=nomina&year=${year}&q=${encodeURIComponent(party.name)}`}>Consultar períodos y pagos</Link></div></div>
 </section>;
}
