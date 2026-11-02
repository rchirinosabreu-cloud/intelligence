import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import QuotationForm from '../../src/components/modules/Quotations/QuotationForm';
import QuotationList from '../../src/components/modules/Quotations/QuotationList';
import PublicQuotation from '../../src/components/public/Quotations/PublicQuotation';
import { prepareQuotationItems, calculateQuotationTotals, serializePublicQuotation, quotationProposalTotals } from '../../src/services/quotationDomainService';
import { normalizeProposalDetails } from '../../src/services/quotationProposalDetails';
import { proposalDemo } from './quotation-proposal-data';
import { termsWithProposalPayments } from '../../src/services/quotationContractTerms';
import '../../src/index.css';
// No real API or credentials: fixture state is confined to this tab's sessionStorage.
let saved = JSON.parse(sessionStorage.getItem('quotation-proposal-demo') || 'null') || structuredClone(proposalDemo);
const nativeFetch = window.fetch.bind(window);
async function downloadPdf() {
  try {
    const response = await nativeFetch('/__quotation_demo_pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saved) });
    if (!response.ok) throw new Error((await response.json()).error || 'No fue posible generar el PDF');
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
    link.href = url; link.download = 'SunPartners-muestra-local.pdf'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) { console.error('[Demo PDF]', error); const { toast } = await import('react-hot-toast'); toast.error(error.message); }
}
window.__quotationDemo = () => structuredClone(saved);
// Cada guardado queda anotado: «Nueva propuesta» debe crear una vez y después actualizar la misma.
const saveCalls = [];
const listRow = (over) => ({ emisor_type: 'BRAIN_STUDIO', currency: 'COP', status: 'ACTIVA', isExpired: false, created_at: '2026-10-20T15:00:00Z', updated_at: '2026-10-20T15:00:00Z', items: [{ name: 'Servicio' }], ...over });
const listRows = [
  listRow({ id: 'q-42', uuid_slug: 'cafe-42', consecutive_formatted: 'COT-0042', client_name: 'Laura Gómez', client_company: 'Café Altura', total_amount: 4000000 }),
  listRow({ id: 'q-43', uuid_slug: 'norte-43', consecutive_formatted: 'COT-0043', client_name: 'Andrés Pardo', client_company: 'Estudio Norte', total_amount: 0,
    items: [{ name: 'Landing', scenarioId: 's-a', scenarioName: 'Landing básica' }, { name: 'Landing + blog', scenarioId: 's-b', scenarioName: 'Landing con blog' }] }),
  listRow({ id: 'q-35', uuid_slug: 'bahia-35', consecutive_formatted: 'COT-0035', client_name: 'Marta Ruiz', client_company: 'Hotel Bahía', total_amount: 6000000, status: 'APROBADA', accepted_at: '2026-10-24T15:00:00Z' })
];
window.__quotationDemoCalls = () => saveCalls.slice();
window.fetch = async (input, config = {}) => {
  const path = new URL(String(input), location.origin).pathname;
  if (['POST', 'PUT'].includes(config.method) && path.includes('/quotations')) saveCalls.push(`${config.method} ${path.replace(/^.*\/api/, '/api')}`);
  let data = saved, status = 200;
  try {
    if (path.endsWith('/catalog')) data = [];
    // `?view=list` (29 de octubre de 2026): el historial con «Registrar aprobación».
    else if (path.endsWith('/api/quotations') && !config.method) data = listRows;
    else if (/\/api\/quotations\/q-\d+\/accept$/.test(path)) {
      const row = listRows.find((item) => path.includes(`/${item.id}/`));
      const body = JSON.parse(config.body || '{}');
      if (row.items.some((item) => item.scenarioId) && !body.scenarioId) throw new Error('Debes seleccionar uno de los escenarios disponibles');
      Object.assign(row, { status: 'APROBADA', accepted_at: '2026-10-29T15:00:00Z', items: row.items.map((item) => ({ ...item, selectedScenario: item.scenarioId === body.scenarioId })) });
      window.__acceptCalls = [...(window.__acceptCalls || []), { id: row.id, ...body }];
      data = { id: row.id, status: row.status };
    }
    else if (path.endsWith('/accept')) { saved.status = 'APROBADA'; saved.accepted_at = new Date().toISOString(); data = serializePublicQuotation(saved); }
    else if (['POST', 'PUT'].includes(config.method)) {
      if (new URLSearchParams(location.search).has('saveError')) throw new Error('Error de guardado simulado');
      if (saved.status === 'APROBADA') throw new Error('La propuesta aprobada no se puede modificar');
      const body = JSON.parse(config.body), items = prepareQuotationItems(body.items);
      const options = { durationMonths: body.duration_months, discountType: body.discount_type, discountValue: body.discount_value };
      const details = normalizeProposalDetails(body.proposal_details, { issue: body.status === 'ACTIVA', totalsByScenario: quotationProposalTotals(items, body.is_tax_exempt, options) });
      const totals = calculateQuotationTotals(items, body.is_tax_exempt, options);
      saved = { ...saved, ...body, items, proposal_details: details, terms_and_conditions: termsWithProposalPayments(body.terms_and_conditions, Boolean(details?.paymentPlans?.length)), subtotal: totals.subtotal, tax_amount: totals.taxAmount, total_amount: totals.totalAmount };
      // Como el servidor (23 de octubre de 2026): al guardar, la cotización queda ligada a su tercero; aquí, un cliente potencial nuevo.
      const partyName = body.client_type === 'EMPRESA' ? body.client_company || body.client_name : body.client_name;
      if (!saved.party && partyName) saved.party = { kind: 'CLIENTE_POTENCIAL', label: 'Cliente potencial', name: partyName, clientId: null, leadId: 'lead-local', leadCode: 'CRM-0187' };
      sessionStorage.setItem('quotation-proposal-demo', JSON.stringify(saved)); data = saved;
    } else if (path.includes('/public/')) data = { ...serializePublicQuotation({ ...saved, status: saved.status === 'APROBADA' ? 'APROBADA' : 'ACTIVA' }), consecutive_formatted: saved.consecutive_formatted, emisor_data: { razonSocial: 'Brainstudio · muestra', nit: 'DEMO' } };
    else if (!path.includes('/quotations/')) throw new Error('Conexión externa bloqueada en esta muestra');
  } catch (error) { status = 400; data = { error: error.message }; }
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
};
const query = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><ConfirmDialogProvider><MemoryRouter initialEntries={[{ public: '/p/local-sunpartners', new: '/cotizaciones/nueva', list: '/cotizaciones' }[new URLSearchParams(location.search).get('view')] || '/cotizaciones/local-sunpartners']}>
  <div className="border-b border-zinc-200 bg-white px-6 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
    <p className="font-semibold">Laboratorio local · datos de muestra, sin conexión productiva</p>
    <nav className="mt-2 flex flex-wrap items-center gap-5"><Link to="/cotizaciones/local-sunpartners">Editar propuesta</Link><Link to="/p/local-sunpartners" onClick={() => query.invalidateQueries()}>Vista del cliente</Link><button onClick={downloadPdf}>PDF guardado</button><button onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button><button onClick={() => { sessionStorage.removeItem('quotation-proposal-demo'); location.reload(); }}>Restablecer ejemplo</button></nav>
    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Guarda el borrador para actualizar la vista del cliente y el PDF. Los cambios duran solo en esta pestaña.</p>
  </div>
  <Routes><Route path="/cotizaciones" element={<div className="mx-auto max-w-7xl px-5 py-8"><QuotationList /></div>} /><Route path="/cotizaciones/nueva" element={<div className="mx-auto max-w-7xl px-5 py-8"><QuotationForm /></div>} /><Route path="/cotizaciones/:id" element={<div className="mx-auto max-w-7xl px-5 py-8"><QuotationForm /></div>} /><Route path="/p/:slug" element={<PublicQuotation />} /><Route path="*" element={<Link to="/cotizaciones/local-sunpartners">Volver al ejemplo</Link>} /></Routes>
  <Toaster />
</MemoryRouter></ConfirmDialogProvider></QueryClientProvider>);
