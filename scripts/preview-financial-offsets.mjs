import express from 'express';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { financialCorrectionDatabase } from '../tests/support/financialCorrectionDatabase.js';
import { offsetOptions, readOffset, reverseOffset } from '../src/services/financialOffsetService.js';
import { settleReceivable } from '../src/services/receivableSettlementService.js';
import { listReceivableAdjustments } from '../src/services/receivableSettlementService.js';
import { listPayablesLedger } from '../src/services/accountsPayableService.js';
import { getFinancialReceivablesLedger } from '../src/controllers/financialController.js';
import { listFinancialAccounts } from '../src/services/financialAccountService.js';

process.env.TEST_DATABASE_URL ||= 'postgresql://recognition_test@127.0.0.1:55448/recognition_test';
const fixture = await financialCorrectionDatabase({ additionalTables: ['Client', 'AccountsReceivable', 'ReceivablePayment', 'ReceivableItem', 'ReceivablePaymentDocument', 'AccountsPayableDocument'] });
const { db, actor } = fixture;
const client = await db.client.create({ data: { id: 'offset-client', name: 'Cliente de muestra · cruce', slug: 'cliente-cruce' } });
const party = await db.thirdParty.create({ data: { id: 'offset-party', name: client.name, kind: 'PROVEEDOR', clientId: client.id } });
await db.accountsReceivable.create({ data: { id: 'offset-ar', clientId: client.id, concept: 'Servicio de agencia · septiembre', amount: 960000, period: new Date('2026-09-01'), year: 2026, month: 9 } });
await db.accountsPayable.create({ data: { id: 'offset-ap', thirdPartyId: party.id, concept: 'Servicio del proveedor · septiembre', documentNumber: 'MUESTRA-018', amount: 1000000, category: 'OPERATIVO', receivedAt: new Date('2026-09-01'), year: 2026, month: 9 } });
const app = express(); app.use(express.json());
app.get('/', (_req, res) => res.redirect('/tests/fixtures/financial-offsets.html?year=2026&month=9'));
app.use('/preview-api', async (req, res) => {
  try {
    const pathname = req.path;
    const options = pathname.match(/^\/receivables\/([^/]+)\/offset-options$/);
    if (options && req.method === 'GET') return res.json(await offsetOptions(db, options[1], actor));
    const offset = pathname.match(/^\/offsets\/([^/]+)(\/reverse)?$/);
    if (offset && req.method === (offset[2] ? 'POST' : 'GET')) return res.json(await (offset[2] ? reverseOffset(db, offset[1], req.body, actor) : readOffset(db, offset[1], actor)));
    const settlement = pathname.match(/^\/receivables\/([^/]+)\/settlements$/);
    if (settlement && req.method === 'POST') return res.status(201).json(await settleReceivable(db, settlement[1], req.body, actor));
    if (req.method !== 'GET') return res.status(400).json({ message: 'Esta muestra permite registrar y revertir cruces ficticios. No modifica otros datos.' });
    if (pathname === '/receivables-ledger') return getFinancialReceivablesLedger({ ...req, query: req.query }, res, { prismaClient: db });
    if (pathname === '/payables-ledger') return res.json(await listPayablesLedger(db, req.query));
    if (pathname === '/accounts') return res.json({ accounts: await listFinancialAccounts(db) });
    if (pathname === '/third-parties') return res.json({ thirdParties: await db.thirdParty.findMany() });
    if (pathname === '/receivable-adjustments') return res.json(await listReceivableAdjustments(db, req.query));
    if (pathname === '/periods') return res.json({ periods: [] });
    if (pathname === '/records') return res.json({ items: [], total: 0, page: 1, pageSize: 50, totals: { income: 0, expense: 0, net: 0 } });
    if (pathname === '/dashboard') {
      const obligation = await db.accountsReceivable.findUnique({ where: { id: 'offset-ar' }, include: { payments: { where: { reversedAt: null } } } });
      const receivable = Number(obligation.amount) - obligation.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return res.json({ cashFlow: [], categoriesDistribution: { INCOME: {}, EXPENSE: {} }, accountsReceivable: receivable > 0 ? [{ clientId: client.id, totalOutstanding: receivable }] : [], payroll: { collaborators: [] }, sourceSummary: { totals: { income: 0, expense: 0, netFlow: 0, receivable } } });
    }
    return res.status(404).json({ message: 'Ruta fuera de esta muestra.' });
  } catch (error) { console.error(error.message); return res.status(error.statusCode || 500).json({ message: error.message, error: error.code }); }
});
const vite = await createServer({ configFile: false, cacheDir: 'output/vite-offset-cache', optimizeDeps: { entries: ['tests/fixtures/financial-offsets.html'] }, envDir: path.resolve('output/financial-preview-empty-env'), plugins: [react()], resolve: { alias: { '@': path.resolve('src') } }, define: { __BUILD_SHA__: JSON.stringify('cruce-local') }, server: { middlewareMode: true, host: '127.0.0.1', hmr: { port: Number(process.env.FINANCIAL_OFFSET_PORT || 3848) + 21000 } }, appType: 'spa' });
app.use(vite.middlewares);
const port = Number(process.env.FINANCIAL_OFFSET_PORT || 3848);
const server = app.listen(port, '127.0.0.1', () => console.log(`Cruces locales: http://127.0.0.1:${port} · obligaciones ficticias, base aislada`));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await vite.close(); server.close(); await fixture.close(); process.exit(0); });
