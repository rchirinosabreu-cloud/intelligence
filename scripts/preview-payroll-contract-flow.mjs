import express from 'express';
import { createPayrollContract, updatePayrollContract } from '../src/services/financialPayrollContractService.js';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { financialCorrectionDatabase } from '../tests/support/financialCorrectionDatabase.js';
import * as periods from '../src/services/payrollPeriodService.js';
import { payPayrollTransaction, approvePayrollTransaction, generatePayrollPeriod } from '../src/services/financialPayrollService.js';
import { getFinancialDashboard, getFinancialPayrollLedger, getFinancialReceivablesLedger } from '../src/controllers/financialController.js';
import { listFinancialAccounts } from '../src/services/financialAccountService.js';

process.env.TEST_DATABASE_URL ||= 'postgresql://recognition_test@127.0.0.1:55448/recognition_test';
const fixture = await financialCorrectionDatabase({ additionalTables: ['PayrollPosition', 'PayrollAdjustment', 'Client', 'AccountsReceivable', 'ReceivablePayment', 'ReceivableItem', 'ReceivablePaymentDocument'] });
const { db, actor, first } = fixture;
// The same services, controller and FinancialDashboard used by the application.
// An isolated PostgreSQL schema reproduces the reported cases without production data.
for (const [name, baseSalary, socialSecurity] of [['Rodny · muestra local',4300000,508300],['Melisa · muestra local',2800000,508300],['Helen · muestra local',1300000,0]]) {
  const contract = await createPayrollContract(db, { name, startDate:'2026-03-01', endDate:'2026-12-31', baseSalary, socialSecurity }, actor);
  for (const month of [9,10,11]) {
    const result = await generatePayrollPeriod(db, {year:2026,month},actor);
    for (const row of result.transactions) if(row.contractId === contract.id) await db.payrollTransaction.update({where:{id:row.id},data:{serviceStart:null,serviceEnd:null}});
  }
}
const jesu = await createPayrollContract(db, {name:'Jesu · muestra local',startDate:'2026-10-16',endDate:'2026-10-31',baseSalary:750000},actor);
const old = await db.payrollTransaction.create({data:{contractId:jesu.id,month:11,year:2026,periodKey:'october-service',serviceStart:new Date('2026-10-16'),serviceEnd:new Date('2026-10-31'),baseSalary:750000,grossAmount:750000,netAmount:750000,status:'APPROVED'}});
await payPayrollTransaction(db,old.id,{amount:750000,paidAt:'2026-11-09',accountId:first.id},actor);
await updatePayrollContract(db,jesu.id,{startDate:'2026-11-01',endDate:'2026-12-31',baseSalary:1500000,monthlyTotal:1500000},actor);
const app = express(); app.use(express.json());
app.get('/', (_req, res) => res.redirect('/tests/fixtures/payroll-periods.html?year=2026&month=11&tab=nomina&contractFlow=1'));
app.use('/preview-api', async (req, res) => {
  try {
    const route = req.path, method = req.method;
    let match = route.match(/^\/payroll-contracts\/([^/]+)\/periods$/);
    if (match) return res.status(method === 'POST' ? 201 : 200).json(await (method === 'POST' ? periods.createPayrollPeriod(db, match[1], req.body, actor) : periods.readPayrollPeriods(db, match[1], actor)));
    match = route.match(/^\/payroll-contracts\/([^/]+)$/);
    if (match && method === 'PATCH') return res.json({contract:await updatePayrollContract(db, match[1], req.body, actor)});
    if (route === '/payroll-contracts' && method === 'POST') return res.json({contract:await createPayrollContract(db,req.body,actor)});
    match = route.match(/^\/payroll-transactions\/([^/]+)\/(service-period|sync-contract|reverse-period|loan-deductions|approve|pay)$/);
    if (match) {
      const [_, id, action] = match;
      const result = action === 'loan-deductions' ? await (method === 'GET' ? periods.readPayrollDeductions(db, id, actor) : periods.createPayrollDeduction(db, id, req.body, actor))
        : action === 'sync-contract' ? await periods.syncPayrollPeriod(db,id,req.body,actor)
        : action === 'service-period' ? await periods.identifyPayrollPeriod(db, id, req.body, actor)
          : action === 'reverse-period' ? await periods.reversePayrollPeriod(db, id, req.body, actor)
            : action === 'approve' ? await approvePayrollTransaction(db, id, actor) : await payPayrollTransaction(db, id, req.body, actor);
      return res.status(method === 'GET' ? 200 : 201).json(result);
    }
    match = route.match(/^\/payroll-adjustments\/([^/]+)\/reverse$/);
    if (match && method === 'POST') return res.status(201).json(await periods.reversePayrollDeduction(db, match[1], req.body, actor));
    if (route === '/payroll/periods' && method === 'POST') return res.json(await generatePayrollPeriod(db, req.body, actor));
    if (method !== 'GET') return res.status(400).json({ message: 'Acción fuera de la muestra local.' });
    if (route === '/payroll-ledger') return getFinancialPayrollLedger(req, res, { prismaClient: db });
    if (route === '/receivables-ledger') return getFinancialReceivablesLedger(req, res, { prismaClient: db });
    if (route === '/accounts') return res.json({ accounts: await listFinancialAccounts(db) });
    if (route === '/records') return res.json({ items: await db.financialRecord.findMany(), total: await db.financialRecord.count(), page: 1, pageSize: 50 });
    if (route === '/dashboard') return getFinancialDashboard(req, res, { prismaClient: db });
    return res.status(404).json({ message: 'Ruta fuera de la muestra local.' });
  } catch (error) { console.error('[Local payroll]', error.message); return res.status(error.statusCode || 500).json({ message: error.message, error: error.code }); }
});
const port = Number(process.env.PAYROLL_PREVIEW_PORT || 3864);
const vite = await createServer({ configFile: false, cacheDir: 'output/vite-payroll-contract-flow-cache', envDir: path.resolve('output/financial-preview-empty-env'), optimizeDeps: { entries: ['tests/fixtures/payroll-periods.html'] }, plugins: [react()], resolve: { alias: { '@': path.resolve('src') } }, define: { __BUILD_SHA__: JSON.stringify('nomina-local') }, server: { middlewareMode: true, host: '127.0.0.1', hmr: { port: port + 21000 } }, appType: 'spa' });
app.use(vite.middlewares);
const server = app.listen(port, '127.0.0.1', () => console.log(`Nómina local: http://127.0.0.1:${port} · datos ficticios · PostgreSQL aislado`));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await vite.close(); server.close(); await fixture.close(); process.exit(0); });
