import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import { AuthProvider } from '../../src/context/AuthContext';
import FinancialDashboard from '../../src/components/modules/FinancialDashboard';
import '../../src/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// This fixture is never imported by the application. All API calls stay in memory.
const viewer = new URLSearchParams(location.search).get('viewer') === 'reader';
const user = { id: 'demo-admin', role: viewer ? 'MEMBER' : 'ADMIN', financialRole: viewer ? 'VIEWER' : 'ADMIN', hasFinancialAccess: true, modulePermissions: { financiero: true }, name: 'Demo' };
localStorage.setItem('authToken', `demo.${btoa(JSON.stringify({ exp: 4102444800 }))}.demo`);
localStorage.setItem('currentUser', JSON.stringify(user));
window.fetch = async () => new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
const client = { id: 'demo-client', name: 'Cliente de muestra', slug: 'cliente-muestra' };
const account = { id: 'demo-account', name: 'Banco de muestra', type: 'BANK', currency: 'COP', balance: 4000000 };
let debt = { id: 'demo-debt', clientId: client.id, clientName: client.name, clientSlug: client.slug, sourceLabel: client.name, amount: 1200000, outstanding: 800000, paidAmount: 400000, status: 'PROMESADO', year: 2026, month: 9, period: '2026-09-01T00:00:00Z', dueDate: null, payments: [], comments: 'Promesa de pago acordada. Datos ficticios.' };
if (new URLSearchParams(location.search).has('legacyPaid')) debt = { ...debt, outstanding: null, paidAmount: 0, status: 'PAGADO', balanceReviewRequired: true };
let records = Array.from({ length: 62 }, (_, i) => ({ id: `demo-record-${i}`, clientId: client.id, client, date: '2026-09-07T05:00:00Z', year: 2026, month: 9, amount: i ? 10000 : 200000, type: 'INCOME', category: 'SERVICIO', status: 'POSTED', scenario: 'ACTUAL', origin: 'MANUAL', description: i ? `Ingreso de muestra ${i + 1}` : 'Adicional ya registrado', accountId: account.id, account, reference: `DEMO-${i}` }));
const income = () => records.reduce((sum, record) => sum + Number(record.amount), 0);
records[1] = { ...records[1], amount: 400000, attachmentUrl: 'https://example.invalid/soporte.pdf', receivablePayment: { id: 'historical-payment', receivableId: debt.id } };
records[2] = { ...records[2], attachmentUrl: 'javascript:alert(1)' };
if (!debt.balanceReviewRequired) debt.payments = [{ id: 'historical-payment', amount: 400000, paidAt: '2026-09-01T05:00:00Z', reference: 'ABONO-01', account, financialRecord: records[1] }];
axios.defaults.adapter = async config => {
  const url = new URL(config.url, location.origin), path = url.pathname;
  for (const [key, value] of Object.entries(config.params || {})) url.searchParams.set(key, value);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  let data;
  if (path.endsWith('/dashboard')) data = { cashFlow: [{ year: 2026, month: 9, income: income(), expense: 250000, netFlow: income() - 250000 }], categoriesDistribution: { INCOME: { SERVICIO: income() }, EXPENSE: { OPERATIVO: 250000 } }, accountsReceivable: debt.outstanding > 0 ? [{ client, clientId: client.id, totalOutstanding: debt.outstanding }] : [], payroll: { collaborators: [] }, sourceSummary: { totals: { income: income(), expense: 250000, netFlow: income() - 250000, receivable: debt.outstanding } } };
  else if (path.endsWith('/accounts')) data = { accounts: [account] };
  else if (path === '/api/clients') data = [client];
  else if (path.endsWith('/receivables-ledger')) {
    if (new URLSearchParams(location.search).has('carteraError')) throw Object.assign(new Error('Error simulado de lectura'), { response: { data: { message: 'Error simulado de lectura' } } });
    data = { year: 2026, items: [{ ...debt }], totals: { outstandingTotal: debt.outstanding, total: debt.outstanding, reviewCount: debt.balanceReviewRequired ? 1 : 0 } };
  } else if (path.endsWith('/client-reconciliation')) data = { year: 2026, clients: [{ client, clientId: client.id, sourceId: client.id, income: income(), receivable: debt.outstanding, recordCount: records.length, receivableCount: 1 }], targets: [client] };
  else if (path.endsWith('/statement')) {
    if (new URLSearchParams(location.search).has('statementError')) throw Object.assign(new Error('Estado de cuenta no disponible (simulado)'), { response: { status: 500, data: { message: 'Estado de cuenta no disponible (simulado)' } } });
    const section = url.searchParams.get('section'), offset = Number(url.searchParams.get('cursor') || 0);
    const items = section === 'income' ? records : [{ ...debt, currency: 'COP' }];
    data = { client, scope: { year: 2026, section }, items: items.slice(offset, offset + 25), nextCursor: offset + 25 < items.length ? String(offset + 25) : null };
  } else if (path.endsWith('/records')) {
    const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 50);
    data = { items: records.slice((page - 1) * pageSize, page * pageSize), total: records.length, page, pageSize };
  } else if (path.endsWith('/payments')) {
    if (new URLSearchParams(location.search).has('paymentError')) throw Object.assign(new Error('Pago no guardado (simulado)'), { response: { data: { message: 'Pago no guardado (simulado)' } } });
    debt = { ...debt, outstanding: debt.outstanding - Number(body.amount), paidAmount: debt.paidAmount + Number(body.amount), status: debt.outstanding === Number(body.amount) ? 'PAGADO' : debt.status };
    if (!body.financialRecordId) records = [{ ...records[0], id: 'demo-new', amount: body.amount, category: body.category }, ...records];
    data = { outstanding: debt.outstanding, payment: { id: 'demo-payment' } };
  } else if (path.endsWith('/bank-reconciliation')) data = { transactions: Array.from({ length: 90 }, (_, i) => ({ id: `bank-${i}`, description: `Movimiento bancario ${i + 1}`, postedAt: '2026-09-07', amount: 10000, account, status: i === 0 ? 'MATCHED' : 'UNMATCHED', matches: i === 0 ? [{ id: 'match', status: 'APPROVED' }] : [] })), continuityGaps: [], statements: [] };
  else if (path.endsWith('/periods')) data = { periods: [] };
  else if (path.includes('/receivables/') && config.method === 'patch') { debt = { ...debt, ...body }; data = { receivable: debt }; }
  else throw new Error(`Ruta no simulada: ${config.method} ${path}`);
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><AuthProvider><MemoryRouter><div className="bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-700"><p>Muestra local · datos ficticios en memoria · nada se guarda en producción</p><button className="min-h-11 rounded-lg border border-zinc-300 px-4 dark:border-zinc-700" onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button></div><FinancialDashboard /></div></MemoryRouter></AuthProvider></QueryClientProvider>);
