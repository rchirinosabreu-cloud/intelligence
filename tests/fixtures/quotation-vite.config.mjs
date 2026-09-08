import base from '../../vite.config.js';
import { generateQuotationPdfBuffer } from '../../src/services/quotationPdfService.js';
import { prepareQuotationItems, quotationProposalTotals } from '../../src/services/quotationDomainService.js';
import { normalizeProposalDetails } from '../../src/services/quotationProposalDetails.js';

// Explicitly local, no API proxy and no database. This middleware only renders supplied demo data.
export default {
  ...base,
  server: { host: '127.0.0.1', port: 3007, strictPort: true, proxy: {} },
  plugins: [...base.plugins, { name: 'quotation-demo-pdf', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = new URL(req.url, 'http://127.0.0.1:3007').pathname;
      if (path === '/' || path === '/p/local-sunpartners') { res.statusCode = 302; res.setHeader('Location', '/tests/fixtures/quotation-proposal.html' + (path.startsWith('/p/') ? '?view=public' : '')); res.end(); return; }
      next();
    });
    server.middlewares.use('/__quotation_demo_pdf', async (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
      try {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 200000) throw new Error('La muestra supera el límite de contenido'); }
        const data = JSON.parse(body);
        data.items = prepareQuotationItems(data.items);
        data.proposal_details = normalizeProposalDetails(data.proposal_details, { issue: true, totalsByScenario: quotationProposalTotals(data.items, data.currency === 'USD' || data.is_tax_exempt, { durationMonths: data.duration_months, discountType: data.discount_type, discountValue: data.discount_value }) });
        const buffer = generateQuotationPdfBuffer(data, { razonSocial: 'Brainstudio · muestra local', nit: 'DEMO', email: 'demo@example.invalid', whatsapp: '0000000000' });
        res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename="SunPartners-muestra-local.pdf"'); res.end(buffer);
      } catch (error) { console.error('[Quotation demo PDF]', error); res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: error.message })); }
    });
  } }]
};
