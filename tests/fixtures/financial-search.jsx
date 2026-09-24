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
// Auth probes get the demo user. A blob: fetch fails on purpose, exactly like the production
// Content-Security-Policy (connect-src 'self' https: wss:), so the viewer must work without it.
window.fetch = async (input) => {
    if (String(input?.url || input).startsWith('blob:')) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
};
const account = { id: 'demo-account', name: 'Cuenta de muestra', type: 'BANK', balance: 250000 };
const records = Array.from({ length: 32 }, (_, i) => ({ id: `rodny-${i}`, year: 2026, month: 9, date: '2026-09-01T12:00:00Z', scenario: 'ACTUAL', status: 'POSTED', type: i===31 ? 'EXPENSE' : 'INCOME', amount: i===31 ? 50750 : 100250, category: 'SERVICIO', origin: 'MANUAL', description: i===31 ? 'Honorarios Rodny' : `Servicio Rodny ${i+1}`, counterparty: 'Rodny Chirinos', accountId: account.id, account }));
records.push({ ...records[0], id:'brain', description:'Suscripción Brain Studio', counterparty:'Brain Studio', type:'EXPENSE', amount:400000 });
records.push({ ...records[0], id:'august', description:'Servicio Rodny agosto', month:8, date:'2026-08-01T12:00:00Z', amount:1000000 });
records.push({ ...records[0], id:'ia-platform', description:'Inversión en IA de la plataforma, Claude Code, Eleven Labs.', counterparty:'Rodny', category:'OPERATIVO', type:'EXPENSE', amount:600000, date:'2026-09-18T12:00:00Z', allocations: [], documents: [] });
// A movement with many evidences, like a loan documented with WhatsApp captures.
records.push({ ...records[0], id:'loan-francisco', description:'Préstamo a Francisco', counterparty:'Francisco', category:'PRESTAMO', type:'EXPENSE', amount:18008150, date:'2026-09-01T12:00:00Z', allocations: [], documents: Array.from({ length: 9 }, (_, i) => ({ id: `loan-doc-${i + 1}`, recordId: 'loan-francisco', name: i === 4 ? 'Pagaré firmado.pdf' : `WhatsApp Image 2026-09-24 at 9.${30 - i}.png`, mimeType: i === 4 ? 'application/pdf' : 'image/png', size: 48000 + i * 1000, uploadedAt: '2026-09-24T14:00:00Z', voidedAt: null, voidReason: null })) });
// Minimal but valid files (correct xref offsets, ASCII only) so the platform viewer really renders them.
const demoPdf = () => {
    const text = 'BT /F1 18 Tf 40 130 Td (Factura de muestra - sin datos reales) Tj ET';
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 240] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let body = '%PDF-1.4\n';
    const offsets = objects.map((object, index) => { const offset = body.length; body += `${index + 1} 0 obj\n${object}\nendobj\n`; return offset; });
    const xref = body.length;
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Blob([body], { type: 'application/pdf' });
};
// Images of very different shapes, so the viewer can be checked to keep its own size and contain them.
const demoPng = (seed = 0) => new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = seed % 3 === 0 ? [1600, 500] : seed % 3 === 1 ? [400, 1400] : [120, 90];
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ['#31AA8A', '#009BBF', '#FF6A68'][seed % 3];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(16, Math.round(canvas.width / 16))}px sans-serif`;
    ctx.fillText(`${canvas.width}×${canvas.height} · muestra`, 20, Math.round(canvas.height / 2));
    canvas.toBlob(resolve, 'image/png');
});
const categoryExample = new URLSearchParams(location.search).get('categories') === '1';
if (categoryExample) records.splice(0, records.length, { ...records[0], id:'donation-demo', description:'Donación de muestra', counterparty:'', category:'OPERATIVO', origin:'IMPORT', accountId:null, account:null, type:'EXPENSE', month:8, date:'2026-08-01T05:00:00Z', amount:150000 });
axios.defaults.adapter = async config => {
    const url = new URL(config.url, location.origin), path = url.pathname, q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (q === 'fallo') throw Object.assign(new Error('Error simulado'), { response: { data: { message:'Lectura financiera no disponible (simulada)' } } });
    const filtered = records.filter(r => (!q || `${r.description} ${r.counterparty}`.toLowerCase().includes(q)) && (!url.searchParams.get('month') || r.month===Number(url.searchParams.get('month'))) && (!url.searchParams.get('type') || r.type===url.searchParams.get('type')) && (!url.searchParams.get('scenario') || r.scenario===url.searchParams.get('scenario')));
    const income = filtered.filter(r=>r.type==='INCOME').reduce((n,r)=>n+r.amount,0), expense = filtered.filter(r=>r.type==='EXPENSE').reduce((n,r)=>n+r.amount,0);
    let data;
    if (categoryExample && config.method === 'patch' && path.endsWith('/records/donation-demo')) {
        const patch = JSON.parse(config.data);
        if (patch.accountId !== null || patch.amount !== 150000 || patch.date !== '2026-08-01') throw new Error('La muestra debe conservar importe, fecha y cuenta');
        records[0].category = patch.category;
        data = records[0];
    }
    else if (config.method === 'post' && /\/records\/[^/]+\/documents$/.test(path)) {
        const target = records.find(r => path.endsWith(`/records/${r.id}/documents`));
        const file = config.data.get('file');
        if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) throw Object.assign(new Error('Tipo inválido'), { response: { status: 415, data: { message: 'Solo se admiten documentos PDF, JPG o PNG.' } } });
        const doc = { id: `${target.id}-doc-${(target.documents ||= []).length + 1}`, recordId: target.id, name: file.name, mimeType: file.type || 'application/pdf', size: file.size, uploadedAt: new Date().toISOString(), voidedAt: null, voidReason: null };
        target.documents.push(doc);
        data = { document: doc };
    }
    else if (config.method === 'post' && /\/documents\/[^/]+\/void$/.test(path)) {
        const target = records.find(r => path.includes(`/records/${r.id}/documents/`));
        const doc = target.documents.find(d => path.endsWith(`/documents/${d.id}/void`));
        Object.assign(doc, { voidedAt: new Date().toISOString(), voidReason: JSON.parse(config.data).reason });
        data = { document: doc };
    }
    else if (config.method === 'get' && /\/documents\/[^/]+\/file$/.test(path)) {
        const docs = records.flatMap(r => r.documents || []);
        const doc = docs.find(d => path.endsWith(`/documents/${d.id}/file`));
        data = doc?.mimeType?.startsWith('image/') ? await demoPng(docs.indexOf(doc)) : demoPdf();
    }
    else if (config.method === 'post' && path.endsWith('/records')) {
        const body = JSON.parse(config.data);
        const created = { ...records[0], ...body, id: `new-${records.length}`, month: Number(body.date.slice(5, 7)), account: body.accountId ? account : null, client: null, allocations: [], documents: [] };
        records.unshift(created);
        data = { record: created };
    }
    else if (config.method === 'patch' && /\/records\/[^/]+$/.test(path)) {
        const target = records.find(r => path.endsWith(`/records/${r.id}`));
        Object.assign(target, JSON.parse(config.data));
        data = { record: target };
    }
    else if (config.method === 'put' && /\/records\/[^/]+\/allocations$/.test(path)) {
        const target = records.find(r => path.endsWith(`/records/${r.id}/allocations`));
        const lines = JSON.parse(config.data).allocations;
        const sum = lines.reduce((n, line) => n + Math.round(Number(line.amount) * 100), 0);
        if (lines.length === 1 || (lines.length && sum !== Math.round(target.amount * 100))) throw Object.assign(new Error('Desglose inválido'), { response: { data: { message: 'Las partidas no suman el valor del movimiento (simulado)' } } });
        target.allocations = lines.map((line, i) => ({ id: `${target.id}-line-${i}`, sortOrder: i, ...line }));
        data = { record: target };
    }
    else if(path.endsWith('/dashboard')) data={cashFlow:[{year:2026,month:9,income,expense,netFlow:income-expense}],categoriesDistribution:{INCOME:{SERVICIO:income},EXPENSE:{SERVICIO:expense}},accountsReceivable:[],payroll:{collaborators:[]},sourceSummary:{totals:{income,expense,netFlow:income-expense,receivable:0}}};
    else if(path.endsWith('/records')) { const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||25); data={items:filtered.slice((page-1)*size,page*size).map(r => ({ ...r, allocations: [...(r.allocations || [])], documents: [...(r.documents || [])] })),total:filtered.length,page,pageSize:size}; }
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
