import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import QuotationForm from '../../src/components/modules/Quotations/QuotationForm';
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
window.fetch = async (input, config = {}) => {
  const path = new URL(String(input), location.origin).pathname;
  let data = saved, status = 200;
  try {
    if (path.endsWith('/catalog')) data = [];
    else if (path.endsWith('/accept')) { saved.status = 'APROBADA'; saved.accepted_at = new Date().toISOString(); data = serializePublicQuotation(saved); }
    else if (['POST', 'PUT'].includes(config.method)) {
      if (new URLSearchParams(location.search).has('saveError')) throw new Error('Error de guardado simulado');
      if (saved.status === 'APROBADA') throw new Error('La propuesta aprobada no se puede modificar');
      const body = JSON.parse(config.body), items = prepareQuotationItems(body.items);
      const options = { durationMonths: body.duration_months, discountType: body.discount_type, discountValue: body.discount_value };
      const details = normalizeProposalDetails(body.proposal_details, { issue: body.status === 'ACTIVA', totalsByScenario: quotationProposalTotals(items, body.is_tax_exempt, options) });
      const totals = calculateQuotationTotals(items, body.is_tax_exempt, options);
      saved = { ...saved, ...body, items, proposal_details: details, terms_and_conditions: termsWithProposalPayments(body.terms_and_conditions, Boolean(details?.paymentPlans?.length)), subtotal: totals.subtotal, tax_amount: totals.taxAmount, total_amount: totals.totalAmount };
      sessionStorage.setItem('quotation-proposal-demo', JSON.stringify(saved)); data = saved;
    } else if (path.includes('/public/')) data = { ...serializePublicQuotation({ ...saved, status: saved.status === 'APROBADA' ? 'APROBADA' : 'ACTIVA' }), consecutive_formatted: saved.consecutive_formatted, emisor_data: { razonSocial: 'Brainstudio · muestra', nit: 'DEMO' } };
    else if (!path.includes('/quotations/')) throw new Error('Conexión externa bloqueada en esta muestra');
  } catch (error) { status = 400; data = { error: error.message }; }
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
};
const query = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><ConfirmDialogProvider><MemoryRouter initialEntries={[new URLSearchParams(location.search).get('view') === 'public' ? '/p/local-sunpartners' : '/cotizaciones/local-sunpartners']}>
  <div className="border-b border-zinc-200 bg-white px-6 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
    <p className="font-semibold">Laboratorio local · datos de muestra, sin conexión productiva</p>
    <nav className="mt-2 flex flex-wrap items-center gap-5"><Link to="/cotizaciones/local-sunpartners">Editar propuesta</Link><Link to="/p/local-sunpartners" onClick={() => query.invalidateQueries()}>Vista del cliente</Link><button onClick={downloadPdf}>PDF guardado</button><button onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button><button onClick={() => { sessionStorage.removeItem('quotation-proposal-demo'); location.reload(); }}>Restablecer ejemplo</button></nav>
    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Guarda el borrador para actualizar la vista del cliente y el PDF. Los cambios duran solo en esta pestaña.</p>
  </div>
  <Routes><Route path="/cotizaciones/:id" element={<div className="mx-auto max-w-7xl px-5 py-8"><QuotationForm /></div>} /><Route path="/p/:slug" element={<PublicQuotation />} /><Route path="*" element={<Link to="/cotizaciones/local-sunpartners">Volver al ejemplo</Link>} /></Routes>
  <Toaster />
</MemoryRouter></ConfirmDialogProvider></QueryClientProvider>);
