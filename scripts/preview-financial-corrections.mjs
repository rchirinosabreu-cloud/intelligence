import express from 'express';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { financialCorrectionDatabase } from '../tests/support/financialCorrectionDatabase.js';
import { readPaymentCorrection, correctExpensePayment } from '../src/services/financialPaymentCorrectionService.js';
import { listAccountStatement } from '../src/services/financialAccountStatementService.js';
import { listFinancialAccounts } from '../src/services/financialAccountService.js';

// Synthetic records in a new schema. The application database is never used.
process.env.TEST_DATABASE_URL ||= 'postgresql://recognition_test@127.0.0.1:55448/recognition_test';
const fixture = await financialCorrectionDatabase();
const { db, actor, first, createPayment } = fixture;
await createPayment('payroll', 'payroll'); await createPayment('payable', 'payable');
await db.financialRecord.createMany({ data: [
  { amount: 1800000, type: 'INCOME', category: 'SERVICIO', date: new Date('2026-09-01T12:00:00Z'), year: 2026, month: 9, accountId: first.id, description: 'Servicio cobrado · cliente ficticio' },
  { amount: 150000, type: 'EXPENSE', category: 'OPERATIVO', date: new Date('2026-09-20T12:00:00Z'), year: 2026, month: 9, accountId: first.id, description: 'Gasto operativo · muestra local' },
] });
const app = express(); app.use(express.json());
app.get('/', (_req, res) => res.redirect('/tests/fixtures/financial-corrections.html?year=2026&month=9'));
app.use('/preview-api', async (req, res) => {
  try {
    const pathname = req.path;
    const correction = pathname.match(/^\/payment-corrections\/(payroll|payable)\/([^/]+)$/);
    if (correction) return res.json(await (req.method === 'POST' ? correctExpensePayment(db, correction[1], correction[2], req.body, actor) : readPaymentCorrection(db, correction[1], correction[2], actor)));
    if (req.method !== 'GET') return res.status(400).json({ message: 'Esta muestra permite guardar únicamente las correcciones del bloque 2.' });
    const statement = pathname.match(/^\/accounts\/([^/]+)\/statement$/);
    if (statement) return res.json(await listAccountStatement(db, statement[1], req.query));
    if (pathname === '/accounts') return res.json({ accounts: await listFinancialAccounts(db) });
    if (pathname === '/periods') return res.json({ periods: [] });
    if (pathname === '/receivables-ledger') return res.json({ year: 2026, items: [], totals: { outstandingTotal: 0, total: 0, reviewCount: 0 } });
    if (pathname === '/third-parties') return res.json({ items: await db.thirdParty.findMany() });
    const payments = async rows => Promise.all(rows.map(async row => ({ ...row, amount: Number(row.amount), accountName: (await db.financialAccount.findUnique({ where: { id: row.accountId } }))?.name, canSplit: !row.reversedAt, documents: await db.financialRecordDocument.findMany({ where: { recordId: row.financialRecordId } }) })));
    if (pathname === '/payroll-ledger') {
      const transactions = await db.payrollTransaction.findMany({ include: { payments: true, contract: { include: { collaborator: true } } } });
      return res.json({ year: 2026, items: await Promise.all(transactions.map(async row => { const paid = row.payments.filter(p => !p.reversedAt).reduce((sum, p) => sum + Number(p.amount), 0); return { id: row.contractId, name: row.contract.collaborator.displayName, position: 'Muestra local', baseSalary: Number(row.baseSalary), socialSecurity: 0, monthlyTotal: Number(row.netAmount), transactions: [{ ...row, netAmount: Number(row.netAmount), paidAmount: paid, outstanding: Number(row.netAmount) - paid, payments: await payments(row.payments) }] }; })) });
    }
    if (pathname === '/payables-ledger') {
      const rows = await db.accountsPayable.findMany({ include: { thirdParty: true, payments: true } });
      const items = await Promise.all(rows.map(async row => { const paid = row.payments.filter(p => !p.reversedAt).reduce((sum, p) => sum + Number(p.amount), 0), outstanding = Number(row.amount) - paid; return { thirdParty: row.thirdParty, outstanding, overdue: 0, payables: [{ ...row, amount: Number(row.amount), paidAmount: paid, outstanding, dueState: { key: 'SIN_VENCIMIENTO', label: 'Sin vencimiento' }, documents: [], payments: await payments(row.payments) }] }; }));
      return res.json({ items, totals: { outstanding: items.reduce((sum, item) => sum + item.outstanding, 0), overdue: 0, paidInPeriod: rows.flatMap(row => row.payments).reduce((sum, p) => sum + Number(p.amount), 0), openCount: items.length, overdueCount: 0 } });
    }
    if (['/records', '/dashboard'].includes(pathname)) {
      const rows = await db.financialRecord.findMany({ where: { status: 'POSTED', scenario: req.query.scenario || 'ACTUAL', ...(req.query.year ? { year: Number(req.query.year) } : {}), ...(req.query.month ? { month: Number(req.query.month) } : {}), ...(req.query.type ? { type: req.query.type } : {}), ...(req.query.category ? { category: req.query.category } : {}), ...(req.query.accountId ? { accountId: req.query.accountId } : {}), ...(req.query.q ? { description: { contains: req.query.q, mode: 'insensitive' } } : {}) }, include: { account: true, payrollPayment: true, payablePayment: true, documents: true }, orderBy: { date: 'desc' } });
      const income = rows.filter(row => row.type === 'INCOME').reduce((sum, row) => sum + Number(row.amount), 0), expense = rows.filter(row => row.type === 'EXPENSE').reduce((sum, row) => sum + Number(row.amount), 0);
      if (pathname === '/dashboard') return res.json({ cashFlow: [{ year: 2026, month: 9, income, expense, netFlow: income - expense }], categoriesDistribution: { INCOME: { SERVICIO: income }, EXPENSE: { OPERATIVO: expense } }, accountsReceivable: [], payroll: { collaborators: [] }, sourceSummary: { totals: { income, expense, netFlow: income - expense, receivable: 0 } } });
      const page = Number(req.query.page || 1), pageSize = Number(req.query.pageSize || 50);
      return res.json({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, totals: { income, expense, net: income - expense } });
    }
    return res.status(404).json({ message: 'Ruta fuera de esta muestra.' });
  } catch (error) { console.error(error); return res.status(error.statusCode || 500).json({ message: error.message, code: error.code }); }
});
const vite = await createServer({ configFile: false, optimizeDeps: { entries: ['tests/fixtures/financial-corrections.html'] }, envDir: path.resolve('output/financial-preview-empty-env'), plugins: [react()], resolve: { alias: { '@': path.resolve('src') } }, define: { __BUILD_SHA__: JSON.stringify('financiero-local') }, server: { middlewareMode: true, host: '127.0.0.1', hmr: false }, appType: 'spa' });
app.use(vite.middlewares);
const port = Number(process.env.FINANCIAL_PREVIEW_PORT || 3847);
const server = app.listen(port, '127.0.0.1', () => console.log(`Muestra local: http://127.0.0.1:${port} · datos ficticios en PostgreSQL aislado`));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await vite.close(); server.close(); await fixture.close(); process.exit(0); });
