import { mkdirSync, writeFileSync } from 'node:fs';
import { generateQuotationPdfBuffer } from '../src/services/quotationPdfService.js';
import { proposalDemo } from '../tests/fixtures/quotation-proposal-data.js';
mkdirSync('output/pdf', { recursive: true });
writeFileSync('output/pdf/SunPartners-muestra-local.pdf', generateQuotationPdfBuffer(proposalDemo, { razonSocial: 'Brainstudio · muestra local', nit: 'DEMO', email: 'demo@example.invalid', whatsapp: '0000000000' }));
console.log('output/pdf/SunPartners-muestra-local.pdf');
