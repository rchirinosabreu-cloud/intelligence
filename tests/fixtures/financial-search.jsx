import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import { AuthProvider } from '../../src/context/AuthContext';
import FinancialDashboard from '../../src/components/modules/FinancialDashboard';
import '../../src/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// Isolated browser fixture. Every request is handled in memory; no production access.
const user = { id: 'demo-admin', role: 'ADMIN', name: 'Demo', modulePermissions: { financiero: true } };
localStorage.setItem('authToken', `demo.${btoa(JSON.stringify({ exp: 4102444800 }))}.demo`);
localStorage.setItem('currentUser', JSON.stringify(user));
window.fetch = async () => new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
const account = { id: 'demo-account', name: 'Cuenta de muestra', type: 'BANK', balance: 250000 };
const records = Array.from({ length: 32 }, (_, i) => ({ id: `rodny-${i}`, year: 2026, month: 9, date: '2026-09-01T12:00:00Z', scenario: 'ACTUAL', status: 'POSTED', type: i===31 ? 'EXPENSE' : 'INCOME', amount: i===31 ? 50750 : 100250, category: 'SERVICIO', origin: 'MANUAL', description: i===31 ? 'Honorarios Rodny' : `Servicio Rodny ${i+1}`, counterparty: 'Rodny Chirinos', accountId: account.id, account }));
records.push({ ...records[0], id:'brain', description:'Suscripción Brain Studio', counterparty:'Brain Studio', type:'EXPENSE', amount:400000 });
records.push({ ...records[0], id:'august', description:'Servicio Rodny agosto', month:8, date:'2026-08-01T12:00:00Z', amount:1000000 });
axios.defaults.adapter = async config => {
    const url = new URL(config.url, location.origin), path = url.pathname, q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (q === 'fallo') throw Object.assign(new Error('Error simulado'), { response: { data: { message:'Lectura financiera no disponible (simulada)' } } });
    const filtered = records.filter(r => (!q || `${r.description} ${r.counterparty}`.toLowerCase().includes(q)) && (!url.searchParams.get('month') || r.month===Number(url.searchParams.get('month'))) && (!url.searchParams.get('type') || r.type===url.searchParams.get('type')) && (!url.searchParams.get('scenario') || r.scenario===url.searchParams.get('scenario')));
    const income = filtered.filter(r=>r.type==='INCOME').reduce((n,r)=>n+r.amount,0), expense = filtered.filter(r=>r.type==='EXPENSE').reduce((n,r)=>n+r.amount,0);
    let data;
    if(path.endsWith('/dashboard')) data={cashFlow:[{year:2026,month:9,income,expense,netFlow:income-expense}],categoriesDistribution:{INCOME:{SERVICIO:income},EXPENSE:{SERVICIO:expense}},accountsReceivable:[],payroll:{collaborators:[]},sourceSummary:{totals:{income,expense,netFlow:income-expense,receivable:0}}};
    else if(path.endsWith('/records')) { const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||25); data={items:filtered.slice((page-1)*size,page*size),total:filtered.length,page,pageSize:size}; }
    else if(path.endsWith('/accounts')) data={accounts:[account]};
    else if(path==='/api/clients') data=[];
    else if(path.endsWith('/periods')) data={periods:[]};
    else if(path.endsWith('/receivables-ledger')) data={items:[],totals:{total:0}};
    else if(path.endsWith('/payroll-ledger')) data={items:[]};
    else if(path.endsWith('/client-reconciliation')) data={clients:[],targets:[]};
    else if(path.endsWith('/bank-reconciliation')) data={transactions:[],statements:[],continuityGaps:[]};
    else if(path.endsWith('/integrity')) data={findings:[],summary:{}};
    else throw new Error(`Ruta no simulada: ${config.method} ${path}`);
    return {data,status:200,statusText:'OK',headers:{},config};
};
const queryClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><AuthProvider><MemoryRouter><div className="min-h-screen bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-8"><div className="mb-6 flex items-center justify-between gap-4 text-sm"><p>Muestra local · importes ficticios</p><button onClick={()=>document.documentElement.classList.toggle('dark')} className="min-h-11 rounded-lg border border-zinc-300 px-4 dark:border-zinc-700">Cambiar tema</button></div><FinancialDashboard/></div></MemoryRouter></AuthProvider></QueryClientProvider>);
