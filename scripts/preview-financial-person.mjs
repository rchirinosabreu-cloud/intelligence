import { listReceivableAdjustments } from '../src/services/receivableSettlementService.js';
import express from 'express';
import { createPayrollContract, updatePayrollContract } from '../src/services/financialPayrollContractService.js';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { financialPersonSnapshot } from '../tests/support/financialPersonSnapshot.js';
import * as people from '../src/services/financialPersonService.js';
import * as parties from '../src/services/thirdPartyService.js';
import * as periods from '../src/services/payrollPeriodService.js';
import { payPayrollTransaction, approvePayrollTransaction, generatePayrollPeriod } from '../src/services/financialPayrollService.js';
import { getFinancialDashboard, getFinancialPayrollLedger, getFinancialReceivablesLedger } from '../src/controllers/financialController.js';
import { listFinancialAccounts } from '../src/services/financialAccountService.js';

process.env.TEST_DATABASE_URL ||= 'postgresql://recognition_test@127.0.0.1:55448/recognition_test';
const fixture = await financialPersonSnapshot();
const { db, actor } = fixture;
const app = express(); app.use(express.json());
app.get('/', (_req, res) => res.redirect('/financiero?year=2026&month=11&tab=nomina'));
app.use('/preview-api', async (req, res) => {
  try {
    const route = req.path, method = req.method;
    const person=route.match(/^\/third-parties\/([^/]+)\/person$/);
    if(person)return res.json(await(method==='GET'?people.reviewPersonLinks(db,person[1],actor):people.savePersonLinks(db,person[1],req.body,actor)));
    const undo=route.match(/^\/person-links\/([^/]+)\/reverse$/);
    if(undo)return res.json(await people.reversePersonLinks(db,undo[1],req.body,actor));
    if(route==='/parties/profile')return res.json(await people.createPersonProfile(db,req.body.selection,actor));
    if(route==='/third-parties')return res.json(method==='GET'?await parties.listThirdParties(db,req.query):{thirdParty:await parties.createThirdParty(db,req.body,actor)});
    const partyEdit=route.match(/^\/third-parties\/([^/]+)$/);
    if(partyEdit&&method==='PATCH')return res.json({thirdParty:await parties.updateThirdParty(db,partyEdit[1],req.body,actor)});
    if(route==='/parties/team')return res.json(await parties.listPartyTeam(db));
    if(route==='/parties/commercial')return res.json({prospects:[],quotationsByClient:{}});
    if(route==='/receivable-adjustments')return res.json(await listReceivableAdjustments(db,req.query));
    if(route==='/collection-activities')return res.json({activities:[]});
    if(route==='/clients')return res.json({clients:await db.client.findMany()});
    if(route==='/client-reconciliation')return res.json({clients:[]});
    if(route==='/formalization-access')return res.json({canFormalize:false});
    if(route==='/proof')return res.json({paymentsUnchanged:fixture.before===await fixture.fingerprint(),payrollPayments:await db.payrollPayment.count(),documents:await db.financialRecordDocument.count(),capturedAt:fixture.snapshot.capturedAt});
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
const port = Number(process.env.PERSON_PREVIEW_PORT || 3866);
const vite = await createServer({ configFile: false, cacheDir: 'output/vite-financial-person-cache', envDir: path.resolve('output/financial-preview-empty-env'), optimizeDeps: { entries: ['tests/fixtures/financial-person.html'] }, plugins: [react()], resolve: { alias: { '@': path.resolve('src') } }, define: { __BUILD_SHA__: JSON.stringify('personas-local') }, server: { middlewareMode: true, host: '127.0.0.1', hmr: { port: port + 21000 } }, appType: 'spa' });
app.use(async(req,res,next)=>{if(req.path==='/financiero'){const fs=await import('node:fs/promises');return res.type('html').send(await vite.transformIndexHtml(req.originalUrl,await fs.readFile('tests/fixtures/financial-person.html','utf8')));}next();});
app.use(vite.middlewares);
const server = app.listen(port, '127.0.0.1', () => console.log(`Financiero local: http://127.0.0.1:${port} · copia privada de consulta · PostgreSQL aislado`));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await vite.close(); server.close(); await fixture.close(); process.exit(0); });
