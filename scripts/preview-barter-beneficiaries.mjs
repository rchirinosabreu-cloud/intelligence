import express from 'express';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { financialCorrectionDatabase } from '../tests/support/financialCorrectionDatabase.js';
import { offsetOptions, createOffset, readOffset, reverseOffset } from '../src/services/financialOffsetService.js';
import * as barter from '../src/services/financialBarterService.js';
import { createReceivablePayment, reverseReceivablePayment } from '../src/services/receivablePaymentService.js';
import { getFinancialDashboard, getFinancialReceivablesLedger } from '../src/controllers/financialController.js';
import { listFinancialAccounts } from '../src/services/financialAccountService.js';

process.env.TEST_DATABASE_URL ||= 'postgresql://recognition_test@127.0.0.1:55448/recognition_test';
const fixture = await financialCorrectionDatabase({ additionalTables: ['Client', 'AccountsReceivable', 'ReceivablePayment', 'ReceivableItem', 'ReceivablePaymentDocument', 'PayrollAdjustment'] });
const { db, actor } = fixture;
const client = await db.client.create({ data: { id: 'demo-nuva', name: 'Nuva · ejemplo ficticio', slug: 'nuva-ficticio' } });
await db.thirdParty.create({ data: { id: 'demo-beneficiary', name: 'Francisco · ejemplo ficticio', kind: 'SOCIO', documentNumber: 'DEMO-001' } });
await db.accountsReceivable.create({ data: { id: 'barter-ar', clientId: client.id, amount: 1500000, period: new Date('2026-11-01'), year: 2026, month: 11, sourceLabel: 'Cuenta de muestra · bienes en canje' } });
const old = await db.accountsReceivable.create({ data: { id: 'legacy-ar', clientId: client.id, amount: 300000, status: 'SALDADO', period: new Date('2026-11-01'), year: 2026, month: 11, sourceLabel: 'Canje anterior · ejemplo ficticio' } });
await db.receivablePayment.create({ data: { id: 'legacy-barter', receivableId: old.id, amount: 300000, paidAt: new Date('2026-11-02T12:00:00Z'), kind: 'CANJE', notes: 'Registro anterior de muestra', detail: { goods: 'Silla de muestra', destination: 'Por confirmar', authorizedBy: 'Dirección ficticia' } } });
const app = express(); app.use(express.json());
app.get('/', (_req, res) => res.redirect('/tests/fixtures/barter-beneficiaries.html?year=2026&month=11&tab=cartera'));
app.use('/preview-api', async (req, res) => {
  try {
    const route = req.path, method = req.method;
    let match = route.match(/^\/receivables\/([^/]+)\/(barter-options|offset-options|settlements|payments)$/);
    if (match) return res.status(method === 'GET' ? 200 : 201).json(await (match[2] === 'offset-options' && method === 'GET' ? offsetOptions(db, match[1], actor) : match[2] === 'barter-options' && method === 'GET' ? barter.barterContext(db, { receivableId: match[1] }, actor) : match[2] === 'payments' && method === 'POST' ? createReceivablePayment(db, match[1], req.body, actor) : match[2] === 'settlements' && method === 'POST' ? (req.body.kind === 'COMPENSACION' ? createOffset : barter.createBarter)(db, match[1], req.body, actor) : Promise.reject(new Error('Acción fuera de muestra'))));
    match = route.match(/^\/offsets\/([^/]+)(?:\/(reverse))?$/);
    if (match) return res.json(await (match[2] && method === 'POST' ? reverseOffset(db, match[1], req.body, actor) : readOffset(db, match[1], actor)));
    match = route.match(/^\/barters\/([^/]+)(?:\/(destination|reverse))?$/);
    if (match) return res.json(await (!match[2] && method === 'GET' ? barter.barterContext(db, { paymentId: match[1] }, actor) : match[2] === 'reverse' && method === 'POST' ? barter.reverseBarter(db, match[1], req.body, actor) : match[2] === 'destination' && method === 'POST' ? barter.assignBarterDestination(db, match[1], req.body, actor) : Promise.reject(new Error('Acción fuera de muestra'))));
    match = route.match(/^\/receivable-payments\/([^/]+)\/reverse$/);
    if (match && method === 'POST') return res.json(await reverseReceivablePayment(db, match[1], req.body, actor));
    if (method !== 'GET') return res.status(400).json({ message: 'Acción fuera de la muestra local.' });
    if (route === '/receivables-ledger') return getFinancialReceivablesLedger(req, res, { prismaClient: db });
    if (route === '/accounts') return res.json({ accounts: await listFinancialAccounts(db) });
    if (route === '/records') return res.json({ items: await db.financialRecord.findMany(), total: await db.financialRecord.count(), page: 1, pageSize: 50 });
    if (route === '/dashboard') return getFinancialDashboard(req, res, { prismaClient: db });
    return res.status(404).json({ message: 'Ruta fuera de la muestra local.' });
  } catch (error) { console.error('[Local barter]', error.message); return res.status(error.statusCode || 500).json({ message: error.message, error: error.code }); }
});
const port = Number(process.env.BARTER_PREVIEW_PORT || 3850);
const vite = await createServer({ configFile: false, cacheDir: 'output/vite-barter-cache', envDir: path.resolve('output/financial-preview-empty-env'), optimizeDeps: { entries: ['tests/fixtures/barter-beneficiaries.html'] }, plugins: [react()], resolve: { alias: { '@': path.resolve('src') } }, define: { __BUILD_SHA__: JSON.stringify('canjes-local') }, server: { middlewareMode: true, host: '127.0.0.1', hmr: { port: port + 21000 } }, appType: 'spa' });
app.use(vite.middlewares);
const server = app.listen(port, '127.0.0.1', () => console.log(`Canjes y beneficiarios: http://127.0.0.1:${port} · datos ficticios · PostgreSQL aislado`));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await vite.close(); server.close(); await fixture.close(); process.exit(0); });
