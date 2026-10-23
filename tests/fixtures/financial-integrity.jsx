import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { AuthProvider } from '../../src/context/AuthContext';
import FinancialDashboard from '../../src/components/modules/FinancialDashboard';
import { buildClientProfitability } from '../../src/lib/clientProfitability.js';
import '../../src/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// This fixture is never imported by the application. All API calls stay in memory.
const viewer = new URLSearchParams(location.search).get('viewer') === 'reader';
const user = { id: 'demo-admin', role: viewer ? 'MEMBER' : 'ADMIN', financialRole: viewer ? 'VIEWER' : 'ADMIN', hasFinancialAccess: true, modulePermissions: { financiero: true }, name: 'Demo' };
localStorage.setItem('authToken', `demo.${btoa(JSON.stringify({ exp: 4102444800 }))}.demo`);
localStorage.setItem('currentUser', JSON.stringify(user));
window.fetch = async () => new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
const client = { id: 'demo-client', name: 'Cliente de muestra', slug: 'cliente-muestra' };
// Un cliente archivado que sigue debiendo: tiene que poder elegirse, marcado.
const archivedClient = { id: 'demo-archived', name: 'Cliente archivado', slug: 'cliente-archivado', isArchived: true };
const account = { id: 'demo-account', name: 'Banco de muestra', type: 'BANK', currency: 'COP', balance: 4000000 };
let debt = { id: 'demo-debt', clientId: client.id, clientName: client.name, clientSlug: client.slug, sourceLabel: client.name, amount: 1200000, outstanding: 800000, paidAmount: 400000, status: 'PROMESADO', year: 2026, month: 9, period: '2026-09-01T00:00:00Z', dueDate: null, payments: [], comments: 'Promesa de pago acordada. Datos ficticios.' };
if (new URLSearchParams(location.search).has('legacyPaid')) debt = { ...debt, outstanding: null, paidAmount: 0, status: 'PAGADO', balanceReviewRequired: true };
// ?usd: la cuenta de Foobspain (19 de octubre de 2026): USD 300 a TRM 4.000 = 1.200.000 en cartera, sin abonos.
if (new URLSearchParams(location.search).has('usd')) debt = { ...debt, clientName: 'Foobspain', sourceLabel: 'Foobspain', currency: 'USD', foreignAmount: 300, documentTotal: 300, exchangeRate: 4000, exchangeRateSource: 'MANUAL', amount: 1200000, outstanding: 1200000, paidAmount: 0, status: 'DEBE', exchangeAdjustments: [] };
// ?usd&foobspain: tal como quedó en producción el 19 de octubre de 2026: USD 360, cartera subida con el
// lápiz a 1.205.856, abono registrado por el máximo permitido (1.136.000) y un saldo fantasma de 69.856.
const foobspainAsIs = new URLSearchParams(location.search).has('foobspain');
if (foobspainAsIs) debt = { ...debt, foreignAmount: 360, documentTotal: 360, exchangeRate: 3156.32, amount: 1205856, outstanding: 69856, paidAmount: 1136000, period: '2026-08-01T00:00:00Z', month: 8 };
// Unos cuantos egresos administrativos para que el filtro por categoría tenga dos bolsas que comparar.
const isAdminExpense = (i) => i >= 40 && i < 50;
let records = Array.from({ length: 62 }, (_, i) => ({ id: `demo-record-${i}`, clientId: client.id, client, date: '2026-09-07T05:00:00Z', year: 2026, month: 9, amount: i ? 10000 : 200000, type: isAdminExpense(i) ? 'EXPENSE' : 'INCOME', category: isAdminExpense(i) ? 'ADMINISTRATIVO' : 'SERVICIO', status: 'POSTED', scenario: 'ACTUAL', origin: 'MANUAL', description: isAdminExpense(i) ? `Gasto administrativo ${i + 1}` : (i ? `Ingreso de muestra ${i + 1}` : 'Adicional ya registrado'), accountId: account.id, account, reference: `DEMO-${i}` }));
const income = () => records.filter(record => record.type === 'INCOME').reduce((sum, record) => sum + Number(record.amount), 0);
// El ingreso que generó un abono: no se edita ni se anula desde Movimientos.
records[1] = { ...records[1], amount: 400000, origin: 'SYSTEM', description: 'Pago de cartera: Cliente de muestra', attachmentUrl: 'https://example.invalid/soporte.pdf', receivablePayment: { id: 'historical-payment', receivableId: debt.id } };
records[2] = { ...records[2], attachmentUrl: 'javascript:alert(1)' };
// Un préstamo que Elisa registró a mano como egreso y todavía no está en Cartera (20 de octubre de 2026).
records[3] = { ...records[3], amount: 300000, type: 'EXPENSE', category: 'PRESTAMO', description: 'Préstamo a Camila (registrado a mano)', date: '2026-10-05T05:00:00Z', year: 2026, month: 10 };
// ?payrollRecord: el egreso del pago de nómina de Rodny en el libro, para actuar sobre él
// desde Movimientos (1 de octubre de 2026). Fuera de esa URL el libro no cambia.
if (new URLSearchParams(location.search).has('payrollRecord')) {
  records.unshift({ id: 'rec-payroll-legacy', date: '2026-09-30T12:00:00Z', year: 2026, month: 9, amount: 4808300, type: 'EXPENSE', category: 'NOMINA', status: 'POSTED', scenario: 'ACTUAL', origin: 'SYSTEM', description: 'Pago de nomina: Rodny Chirinos', accountId: account.id, account, reference: null, documents: [], payrollPayment: { id: 'payroll-payment-legacy:tx-rodny' } });
}
if (!debt.balanceReviewRequired) debt.payments = foobspainAsIs
  ? [{ id: 'historical-payment', amount: 1136000, paidAt: '2026-09-29T05:00:00Z', reference: '0345', notes: 'Entró $ 1.205.856. La plataforma no me deja registrar el valor que realmente ingresó, dejé el valor que ella calcula.', account, financialRecord: records[1], financialRecordId: records[1].id, documents: [] }]
  : [{ id: 'historical-payment', amount: 400000, paidAt: '2026-09-01T05:00:00Z', reference: 'ABONO-01', notes: 'Pagó la mitad; el resto queda para el 15 de octubre.', account, financialRecord: records[1], financialRecordId: records[1].id, documents: [] }];
// Un PDF de una página, válido de verdad: el visor de la plataforma lo renderiza con
// pdf.js, así que unos bytes inventados no probarían nada.
const samplePdf = (text) => {
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    null
  ];
  const stream = `BT /F1 14 Tf 20 60 Td (${text}) Tj ET`;
  objects[4] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
};

// El directorio de clientes (30 de septiembre de 2026): las fichas completas, en memoria.
let directoryClients = [
  { ...client, isArchived: false, legalName: 'CLIENTE DE MUESTRA S.A.S.', documentType: 'NIT', documentNumber: '900123456', contactName: 'Ana Gómez', email: 'pagos@muestra.co', phone: '+57 300 000 0000', address: 'Calle 1 # 2-3', city: 'Cartagena', country: 'Colombia', formattedDocument: 'NIT: 900123456' },
  { ...archivedClient, legalName: null, documentType: null, documentNumber: null, contactName: null, email: null, phone: null, address: null, city: null, country: null, formattedDocument: null },
  { id: 'demo-quiet', name: 'Cliente sin movimientos', slug: 'cliente-sin-movimientos', isArchived: false, legalName: null, documentType: null, documentNumber: null, contactName: null, email: null, phone: null, address: null, city: null, country: null, formattedDocument: null }
];
// Nómina por partes (30 de septiembre de 2026): Rodny pagado de una sola vez, como quedó en
// producción, y Elisa aprobada, con un adelanto registrado a mano esperando a aplicarse.
const secondAccount = { id: 'demo-account-2', name: 'Nequi de muestra', type: 'BANK', currency: 'COP', balance: 900000 };
const payrollContracts = [
  { id: 'c-rodny', name: 'Rodny Chirinos', position: 'Project', baseSalary: 4300000, socialSecurity: 508300, monthlyTotal: 4808300 },
  { id: 'c-elisa', name: 'Elisa Mestra', position: 'Administrativo / Contable', baseSalary: 2000000, socialSecurity: 508300, monthlyTotal: 2508300 }
];
const payrollTransactions = [
  { id: 'tx-rodny', contractId: 'c-rodny', month: 9, year: 2026, status: 'PAID', netAmount: 4808300, baseSalary: 4300000, socialSecurity: 508300, paidAt: '2026-09-30T12:00:00Z' },
  { id: 'tx-elisa', contractId: 'c-elisa', month: 9, year: 2026, status: 'APPROVED', netAmount: 2508300, baseSalary: 2000000, socialSecurity: 508300, paidAt: null }
];
const payrollPayments = window.__payrollPayments = [
  { id: 'payroll-payment-legacy:tx-rodny', transactionId: 'tx-rodny', amount: 4808300, paidAt: '2026-09-30T12:00:00Z', accountId: 'demo-account', reference: null, notes: null, financialRecordId: 'rec-payroll-legacy', origin: 'SYSTEM', documents: [], reversedAt: null }
];
let payrollCounter = 0;
const accountName = (id) => [account, secondAccount].find((item) => item.id === id)?.name || null;
const serializePayrollTx = (tx) => {
  const payments = payrollPayments.filter((payment) => payment.transactionId === tx.id).map((payment) => ({ ...payment, accountName: accountName(payment.accountId), canSplit: !payment.reversedAt && payment.origin === 'SYSTEM' }));
  const paidAmount = payments.filter((payment) => !payment.reversedAt).reduce((sum, payment) => sum + payment.amount, 0);
  return { ...tx, payments, paidAmount, outstanding: tx.netAmount - paidAmount };
};
const settlePayrollTx = (tx) => {
  const { paidAmount } = serializePayrollTx(tx);
  tx.status = paidAmount >= tx.netAmount ? 'PAID' : 'APPROVED';
  tx.paidAt = tx.status === 'PAID' ? payrollPayments.filter((payment) => payment.transactionId === tx.id && !payment.reversedAt).map((payment) => payment.paidAt).sort().pop() : null;
};
// Préstamos a terceros (20 de octubre de 2026): viven en la cartera junto a lo de los clientes.
let loans = [];
// Terceros y cuentas por pagar (20 de octubre de 2026): un arrendador con el arriendo de octubre vencido.
let thirdParties = [{ id: 'tp-arrendador', kind: 'ARRENDADOR', name: 'Inmobiliaria Norte', legalName: null, documentType: 'NIT', documentNumber: '900123456', bankName: 'Bancolombia', bankAccountType: 'AHORROS', bankAccountNumber: '123-456', isActive: true }];
let payables = [{ id: 'payable-arriendo', thirdPartyId: 'tp-arrendador', concept: 'Arriendo de octubre', category: 'ADMINISTRATIVO', amount: 1500000, receivedAt: '2026-10-01T12:00:00Z', dueDate: '2026-10-05T12:00:00Z', documentNumber: 'F-2026-10', notes: null, status: 'POR_PAGAR', payments: [], documents: [] }];
const createdReceivables = window.__createdReceivables = [];
const deletedReceivables = window.__deletedReceivables = [];
axios.defaults.adapter = async config => {
  const url = new URL(config.url, location.origin), path = url.pathname;
  for (const [key, value] of Object.entries(config.params || {})) url.searchParams.set(key, value);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  let data;
  if (path.endsWith('/dashboard')) {
    // Como el servidor: la categoría de la barra de filtros acota los indicadores
    // y las gráficas, pero no la cartera, que no se clasifica por categoría.
    const category = url.searchParams.get('category');
    const scoped = records.filter(record => !category || record.category === category);
    const scopedIncome = scoped.filter(record => record.type === 'INCOME').reduce((sum, record) => sum + Number(record.amount), 0);
    const scopedExpense = category ? scoped.filter(record => record.type === 'EXPENSE').reduce((sum, record) => sum + Number(record.amount), 0) : 250000;
    // Como el servidor: los reintegros de préstamos van dentro de los ingresos, pero se dicen aparte.
    const loanRepayments = scoped.filter(record => record.type === 'INCOME' && record.category === 'PRESTAMO').reduce((sum, record) => sum + Number(record.amount), 0);
    const receivable = debt.outstanding + loans.reduce((sum, loan) => sum + loan.outstanding, 0);
    data = { cashFlow: [{ year: 2026, month: 9, income: scopedIncome, expense: scopedExpense, netFlow: scopedIncome - scopedExpense }], categoriesDistribution: { INCOME: { SERVICIO: scopedIncome }, EXPENSE: { OPERATIVO: scopedExpense } }, accountsReceivable: debt.outstanding > 0 ? [{ client, clientId: client.id, totalOutstanding: debt.outstanding }] : [], payroll: { collaborators: [] }, sourceSummary: { totals: { income: scopedIncome, expense: scopedExpense, netFlow: scopedIncome - scopedExpense, receivable, loanRepayments } } };
  }
  // Rentabilidad por cliente (22 de octubre de 2026): la cuenta real (`buildClientProfitability`) con un mes inventado.
  else if (path === '/api/client-profitability') {
    const month = Number(url.searchParams.get('month') || 9), year = Number(url.searchParams.get('year') || 2026);
    const work = (clientId, total) => Array.from({ length: total / 2 }, () => ({ clientId, ms: 2 * 3_600_000 }));
    data = buildClientProfitability({
      year, month,
      clients: [{ id: 'c-aristea', name: 'Aristea' }, { id: 'c-endova', name: 'Endova' }, { id: 'c-wine', name: 'Wine & Wonder' }, { id: 'c-nuva', name: 'Nuva' }, { id: 'c-pablo', name: 'Pablo Hoff' }, { id: 'c-brain', name: 'Brainstudio' }],
      receivables: [{ clientId: 'c-aristea', amount: 4_500_000 }, { clientId: 'c-endova', amount: 1_800_000 }, { clientId: 'c-wine', amount: 6_000_000 }],
      // Pablo Hoff pagó directo en Movimientos, sin cuenta por cobrar del mes (23 de octubre de 2026).
      incomes: [{ clientId: 'c-pablo', amount: 2_400_000 }, { clientId: 'c-aristea', amount: 4_500_000 }],
      unlinkedIncomeCents: 85_000_000,
      expenses: [{ amount: 14_000_000 }, { amount: 2_100_000 }, { amount: 600_000, clientId: 'c-endova' }],
      sessions: [...work('c-aristea', 36), ...work('c-endova', 34), ...work('c-wine', 40), ...work('c-nuva', 8), ...work('c-pablo', 14), ...work('c-brain', 20), ...work(null, 22)],
      closedTasks: [...Array(12).fill({ clientId: 'c-aristea', measuredMs: 3_600_000 }), ...Array(3).fill({ clientId: 'c-endova', measuredMs: 0 }), { clientId: 'c-endova', measuredMs: 3_600_000 }, ...Array(10).fill({ clientId: 'c-wine', measuredMs: 3_600_000 })]
    });
  }
  else if (path === '/api/financials/clients' && config.method === 'get') data = { clients: directoryClients };
  else if (path === '/api/financials/clients' && config.method === 'post') {
    // Como el servidor: solo el nombre es obligatorio.
    if (!String(body.name || '').trim()) throw Object.assign(new Error('Sin nombre'), { response: { data: { message: 'Escribe el nombre del cliente.' } } });
    const created = { id: `demo-new-${directoryClients.length}`, slug: body.name.toLowerCase().replace(/\s+/g, '-'), isArchived: false, legalName: null, documentType: null, documentNumber: null, contactName: null, email: null, phone: null, address: null, city: null, country: null, ...body };
    directoryClients = [...directoryClients, created];
    data = { message: `Cliente «${created.name}» creado.`, client: created };
  } else if (path.startsWith('/api/financials/clients/') && config.method === 'patch') {
    const id = path.split('/').at(-1);
    const clean = Object.fromEntries(Object.entries(body).map(([key, value]) => [key, value === '' ? null : value]));
    directoryClients = directoryClients.map((item) => (item.id === id ? { ...item, ...clean } : item));
    data = { message: 'Ficha del cliente actualizada.', client: directoryClients.find((item) => item.id === id) };
  }
  // Nómina por partes (30 de septiembre de 2026), con las reglas del servidor en memoria.
  else if (path.endsWith('/payroll-ledger')) data = { year: 2026, importBatchId: null, items: payrollContracts.map((contract) => ({ ...contract, transactions: payrollTransactions.filter((tx) => tx.contractId === contract.id).map(serializePayrollTx) })) };
  else if (path.endsWith('/payment-candidates')) {
    const used = new Set(payrollPayments.filter((payment) => !payment.reversedAt).map((payment) => payment.financialRecordId));
    data = { records: used.has('rec-adelanto') ? [] : [{ id: 'rec-adelanto', amount: 500000, date: '2026-09-05T12:00:00Z', description: 'Adelanto Elisa', reference: 'ADEL-01', accountId: account.id }] };
  }
  else if (path.includes('/payroll-transactions/') && path.endsWith('/pay')) {
    const tx = payrollTransactions.find((item) => path.includes(item.id));
    const outstanding = serializePayrollTx(tx).outstanding;
    const amount = body.financialRecordId ? 500000 : Number(body.amount || outstanding);
    if (amount > outstanding) throw Object.assign(new Error('De más'), { response: { data: { message: `El pago supera lo que falta por pagar: $ ${outstanding.toLocaleString('es-CO')}.` } } });
    const recordId = body.financialRecordId || `rec-payroll-${++payrollCounter}`;
    payrollPayments.push({ id: `pp-${++payrollCounter}`, transactionId: tx.id, amount, paidAt: body.financialRecordId ? '2026-09-05T12:00:00Z' : `${body.paidAt}T12:00:00Z`, accountId: body.accountId || account.id, reference: body.reference || null, notes: body.notes || null, financialRecordId: recordId, origin: body.financialRecordId ? 'MANUAL' : 'SYSTEM', documents: [], reversedAt: null });
    settlePayrollTx(tx);
    data = { message: tx.status === 'PAID' ? 'Pago de nómina registrado. La liquidación quedó pagada.' : 'Pago de nómina registrado.', transaction: tx, financialRecord: { id: recordId } };
  }
  else if (path.includes('/payroll-payments/') && path.endsWith('/split')) {
    const payment = payrollPayments.find((item) => path.includes(item.id));
    const sum = body.parts.reduce((total, part) => total + Number(part.amount), 0);
    if (sum !== payment.amount) throw Object.assign(new Error('No cuadra'), { response: { data: { message: 'Los ítems tienen que sumar lo mismo que el pago.' } } });
    Object.assign(payment, { reversedAt: new Date().toISOString(), reversalReason: `Desglosado en ${body.parts.length} pagos`, financialRecordId: null });
    // Como el servidor: devuelve los pagos creados en el orden de los ítems.
    const created = body.parts.map((part) => ({ id: `pp-${++payrollCounter}`, transactionId: payment.transactionId, amount: Number(part.amount), paidAt: `${part.paidAt}T12:00:00Z`, accountId: part.accountId, reference: part.reference || null, notes: null, financialRecordId: `rec-payroll-${++payrollCounter}`, origin: 'SYSTEM', documents: [], reversedAt: null }));
    payrollPayments.push(...created);
    settlePayrollTx(payrollTransactions.find((tx) => tx.id === payment.transactionId));
    data = { message: `Pago desglosado en ${body.parts.length} pagos.`, payments: created };
  }
  else if (path.includes('/payroll-payments/') && path.endsWith('/reverse')) {
    const payment = payrollPayments.find((item) => path.includes(item.id));
    Object.assign(payment, { reversedAt: new Date().toISOString(), reversalReason: body.reason, financialRecordId: null });
    settlePayrollTx(payrollTransactions.find((tx) => tx.id === payment.transactionId));
    data = { message: 'Pago revertido. La liquidación vuelve a mostrar lo que falta por pagar.' };
  }
  else if (path.includes('/payroll-payments/') && config.method === 'patch') {
    const payment = payrollPayments.find((item) => path.endsWith(item.id));
    Object.assign(payment, body);
    data = { message: 'Pago actualizado.', payment };
  }
  else if (path.includes('/records/') && path.endsWith('/documents') && config.method === 'post') {
    const payment = payrollPayments.find((item) => path.includes(`/records/${item.financialRecordId}/`));
    const file = body.get('file');
    // Como el servidor (documentPublicFields): el documento dice a qué movimiento pertenece.
    const recordIdOfPath = path.split('/records/')[1]?.split('/')[0] || null;
    const document = { id: `doc-${++payrollCounter}`, recordId: recordIdOfPath, name: file.name, mimeType: file.type || 'application/pdf', size: file.size };
    payment?.documents.push(document);
    // Comprobantes de un abono de cartera (5 de octubre de 2026): van al ingreso del abono.
    const receivablePayment = (debt.payments || []).find((item) => item.financialRecordId && path.includes(`/records/${item.financialRecordId}/`));
    if (receivablePayment) receivablePayment.documents = [...(receivablePayment.documents || []), document];
    const record = records.find((item) => path.includes(`/records/${item.id}/`));
    if (record) record.documents = [...(record.documents || []), document];
    window.__payrollUploads = [...(window.__payrollUploads || []), document];
    data = { message: 'Documento guardado correctamente.', document };
  }
  else if (path.includes('/records/') && path.includes('/documents/') && path.endsWith('/file')) {
    data = new Blob([samplePdf('Comprobante de pago (muestra)')], { type: 'application/pdf' });
  }
  else if (path.endsWith('/accounts')) data = { accounts: [account] };
  // TRM oficial ficticia, como la devuelve el servidor.
  else if (path.endsWith('/exchange-rate')) data = { rate: 3912.45, source: 'SUPERFINANCIERA_TRM', validFrom: '2026-09-30T00:00:00.000', validTo: '2026-09-30T00:00:00.000' };
  else if (path === '/api/clients') data = url.searchParams.get('isArchived') === 'all' ? [client, archivedClient] : [client];
  else if (path.endsWith('/receivables-ledger')) {
    if (new URLSearchParams(location.search).has('carteraError')) throw Object.assign(new Error('Error simulado de lectura'), { response: { data: { message: 'Error simulado de lectura' } } });
    const outstandingTotal = (debt.deleted ? 0 : debt.outstanding) + loans.reduce((sum, loan) => sum + loan.outstanding, 0);
    data = { year: 2026, items: [...(debt.deleted ? [] : [{ ...debt }]), ...loans.map(loan => ({ ...loan }))], totals: { outstandingTotal, total: outstandingTotal, reviewCount: debt.balanceReviewRequired ? 1 : 0 } };
  } else if (path.endsWith('/client-reconciliation')) {
    data = {
      year: 2026,
      clients: [
        { client, clientId: client.id, sourceId: client.id, income: income(), receivable: debt.outstanding, recordCount: records.length, receivableCount: 1 },
        // Una fila que solo existe en el Excel: sin ficha, y es la que pide conexión.
        { client: { id: null, name: 'PAGO ELVIRA U.', slug: null }, clientId: null, sourceId: 'label:PAGO ELVIRA U.', income: 500000, receivable: 0, recordCount: 1, receivableCount: 0 }
      ],
      targets: [client, archivedClient]
    };
  }
  else if (path.endsWith('/statement/document')) {
    // Como el servidor: el estado de cuenta en PDF llega por la API autenticada, como bytes.
    (window.__documentRequests ||= []).push(`${path}?cutoff=${url.searchParams.get('cutoff') || ''}`);
    data = new Blob([samplePdf(`Estado de cuenta ${client.name}`)], { type: 'application/pdf' });
    return { data, status: 200, statusText: 'OK', headers: { 'content-disposition': `inline; filename="Estado de cuenta - ${client.name} - corte.pdf"` }, config };
  }
  else if (path.endsWith('/statement')) {
    if (new URLSearchParams(location.search).has('statementError')) throw Object.assign(new Error('Estado de cuenta no disponible (simulado)'), { response: { status: 500, data: { message: 'Estado de cuenta no disponible (simulado)' } } });
    const section = url.searchParams.get('section'), offset = Number(url.searchParams.get('cursor') || 0);
    const items = section === 'income' ? records : [{ ...debt, currency: 'COP' }];
    data = { client, scope: { year: 2026, section }, items: items.slice(offset, offset + 25), nextCursor: offset + 25 < items.length ? String(offset + 25) : null };
  } else if (path.endsWith('/records') && config.method === 'post') {
    // Como el servidor: registrar un movimiento devuelve el movimiento creado (6 de octubre de 2026).
    const created = { ...body, id: `rec-new-${++payrollCounter}`, account, documents: [], status: 'POSTED', origin: 'MANUAL', year: 2026, month: 10 };
    records = [created, ...records];
    data = { message: 'Movimiento registrado correctamente.', record: created };
  } else if (path.endsWith('/records')) {
    const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 50);
    const category = url.searchParams.get('category'), accountId = url.searchParams.get('accountId');
    // Egresos de préstamo registrados a mano y todavía sin préstamo en Cartera.
    const forLoan = url.searchParams.get('availableForLoan') === 'true';
    const selection = records.filter(record => (!category || record.category === category) && (!accountId || record.accountId === accountId) && (!forLoan || (record.type === 'EXPENSE' && record.category === 'PRESTAMO' && record.origin !== 'SYSTEM' && !record.loanReceivable)));
    // Como el servidor: la bolsa describe toda la selección, no la página visible.
    const totals = selection.reduce((acc, record) => {
      if (record.type === 'INCOME') acc.income += Number(record.amount);
      if (record.type === 'EXPENSE') acc.expense += Number(record.amount);
      return acc;
    }, { income: 0, expense: 0 });
    data = { items: selection.slice((page - 1) * pageSize, page * pageSize), total: selection.length, page, pageSize, totals: { ...totals, net: totals.income - totals.expense } };
  } else if (path.includes('/receivables/') && path.endsWith('/issue')) {
    // Como el servidor: le pone número, congela conceptos y el total del documento
    // pasa a ser el de la obligación.
    const total = body.items.reduce((sum, item) => sum + Number(item.amount), 0);
    // Como el servidor: la identidad ya no es obligatoria para emitir (30 de septiembre de
    // 2026); la que se escribe aquí queda guardada en la ficha.
    if (body.client?.legalName) {
      debt = { ...debt, clientLegalName: body.client.legalName, clientDocumentType: body.client.documentType, clientDocumentNumber: body.client.documentNumber };
    }
    // Como el servidor: en dólares la cartera guarda el valor en pesos y el documento, dólares.
    const cartera = body.currency === 'USD' ? Number(body.amountCop) : total;
    debt = { ...debt, number: 393, formattedNumber: 'No. 0393', issuedAt: `${body.issuedAt}T00:00:00Z`, concept: body.concept, servicePeriod: body.servicePeriod, items: body.items, amount: cartera, outstanding: cartera - debt.paidAmount, documentTotal: total, currency: body.currency || 'COP', exchangeRate: body.currency === 'USD' ? body.exchangeRate : null, exchangeRateSource: body.exchangeRateSource || null, exchangeRateDate: body.exchangeRateDate || null };
    data = { message: 'Cuenta de cobro No. 0393 emitida.', receivable: debt, document: { number: 393, formattedNumber: 'No. 0393', total } };
  } else if (path.includes('/receivables/') && path.endsWith('/document') && config.method === 'put') {
    // Como el servidor: corregir conserva el número, ajusta conceptos y valor, y rehace el PDF.
    if (!debt.number) throw Object.assign(new Error('Sin emitir'), { response: { data: { message: 'Esta obligación todavía no tiene cuenta de cobro, así que no hay nada que corregir. Usa «Emitir cuenta de cobro».' } } });
    const total = body.items.reduce((sum, item) => sum + Number(item.amount), 0);
    (window.__corrections ||= []).push(body);
    const cartera = body.currency === 'USD' ? Number(body.amountCop) : total;
    debt = { ...debt, issuedAt: `${body.issuedAt}T12:00:00Z`, concept: body.concept, servicePeriod: body.servicePeriod, items: body.items, amount: cartera, outstanding: cartera - debt.paidAmount, documentTotal: total, currency: body.currency || 'COP', exchangeRate: body.currency === 'USD' ? body.exchangeRate : null, exchangeRateSource: body.exchangeRateSource || null, exchangeRateDate: body.exchangeRateDate || null };
    data = { message: `Cuenta de cobro ${debt.formattedNumber} corregida. El PDF ya tiene los datos nuevos.`, receivable: debt, document: { number: debt.number, formattedNumber: debt.formattedNumber, total } };
  } else if (path.includes('/receivables/') && path.endsWith('/document')) {
    // Como el servidor: el PDF llega por la API autenticada, como bytes.
    if (!debt.number) throw Object.assign(new Error('Sin emitir'), { response: { data: { message: 'Esta obligación todavía no tiene cuenta de cobro.' } } });
    (window.__documentRequests ||= []).push(path);
    data = new Blob([samplePdf(`Cuenta de cobro ${debt.formattedNumber}`)], { type: 'application/pdf' });
  } else if (path.includes('/receivable-payments/') && path.endsWith('/reverse')) {
    const paymentId = path.split('/').at(-2);
    const target = debt.payments.find(payment => payment.id === paymentId);
    if (!target || target.reversedAt) throw Object.assign(new Error('Abono no reversible'), { response: { data: { message: 'Este abono ya fue revertido.' } } });
    const cash = !target.kind || target.kind === 'PAGO';
    debt = {
      ...debt,
      outstanding: debt.outstanding + Number(target.amount),
      paidAmount: cash ? debt.paidAmount - Number(target.amount) : debt.paidAmount,
      settledAmount: cash ? debt.settledAmount : (debt.settledAmount || 0) - Number(target.amount),
      status: 'DEBE',
      payments: debt.payments.map(payment => payment.id === paymentId ? { ...payment, reversedAt: '2026-09-20T05:00:00Z', reversalReason: body.reason } : payment)
    };
    records = records.map(record => record.id === target.financialRecord?.id ? { ...record, status: 'VOIDED' } : record);
    data = { message: 'Abono revertido. El ingreso que había generado quedó anulado.', outstanding: debt.outstanding };
  }
  // Terceros y cuentas por pagar (20 de octubre de 2026), con las reglas del servidor en memoria.
  else if (path.endsWith('/third-parties') && config.method === 'get') data = { thirdParties };
  else if (path.endsWith('/third-parties') && config.method === 'post') {
    if (!String(body.name || '').trim()) throw Object.assign(new Error('Sin nombre'), { response: { data: { message: 'Escribe el nombre del tercero.' } } });
    const created = { id: `tp-${++payrollCounter}`, isActive: true, ...body };
    thirdParties = [...thirdParties, created];
    window.__thirdPartyBody = body;
    data = { message: `Tercero «${created.name}» guardado.`, thirdParty: created };
  } else if (path.includes('/third-parties/') && config.method === 'patch') {
    const id = path.split('/').at(-1);
    thirdParties = thirdParties.map(item => (item.id === id ? { ...item, ...body } : item));
    data = { message: 'Tercero actualizado.', thirdParty: thirdParties.find(item => item.id === id) };
  } else if (path.endsWith('/payables-ledger')) {
    const serialize = payable => {
      const paidAmount = payable.payments.filter(payment => !payment.reversedAt).reduce((sum, payment) => sum + payment.amount, 0);
      const outstanding = payable.status === 'ANULADA' ? 0 : payable.amount - paidAmount;
      const due = payable.dueDate ? Math.floor((Date.UTC(2026, 9, 20) - new Date(payable.dueDate).getTime()) / 86400000) : null;
      const dueState = ['PAGADA', 'ANULADA'].includes(payable.status) ? { key: 'CERRADA', label: payable.status === 'PAGADA' ? 'Pagada' : 'Anulada' } : due === null ? { key: 'SIN_VENCIMIENTO', label: 'Sin vencimiento' } : due > 0 ? { key: 'VENCIDA', label: `Vencida hace ${due} día${due === 1 ? '' : 's'}` } : due === 0 ? { key: 'VENCE_HOY', label: 'Vence hoy' } : { key: 'POR_VENCER', label: `Vence en ${-due} día${due === -1 ? '' : 's'}` };
      return { ...payable, paidAmount, outstanding, dueState };
    };
    const groups = new Map();
    for (const payable of payables.map(serialize)) {
      const tp = thirdParties.find(item => item.id === payable.thirdPartyId);
      if (!groups.has(tp.id)) groups.set(tp.id, { thirdParty: tp, payables: [], outstanding: 0, overdue: 0 });
      const group = groups.get(tp.id);
      group.payables.push(payable);
      if (!['PAGADA', 'ANULADA'].includes(payable.status)) { group.outstanding += payable.outstanding; if (payable.dueState.key === 'VENCIDA') group.overdue += payable.outstanding; }
    }
    const items = [...groups.values()];
    const open = payables.map(serialize).filter(payable => !['PAGADA', 'ANULADA'].includes(payable.status));
    data = { items, totals: { outstanding: open.reduce((sum, item) => sum + item.outstanding, 0), overdue: open.filter(item => item.dueState.key === 'VENCIDA').reduce((sum, item) => sum + item.outstanding, 0), paidInPeriod: payables.flatMap(payable => payable.payments).filter(payment => !payment.reversedAt).reduce((sum, payment) => sum + payment.amount, 0), openCount: open.length, overdueCount: open.filter(item => item.dueState.key === 'VENCIDA').length } };
  } else if (path.endsWith('/payables') && config.method === 'post') {
    if (!thirdParties.some(item => item.id === body.thirdPartyId)) throw Object.assign(new Error('Sin tercero'), { response: { data: { message: 'Elige el tercero al que se le debe.' } } });
    const created = { id: `payable-${++payrollCounter}`, status: 'POR_PAGAR', payments: [], documents: [], ...body, amount: Number(body.amount), receivedAt: `${body.receivedAt}T12:00:00Z`, dueDate: body.dueDate ? `${body.dueDate}T12:00:00Z` : null };
    payables = [...payables, created];
    window.__payableBody = body;
    data = { message: 'Cuenta por pagar registrada.', payable: created };
  } else if (path.includes('/payables/') && path.endsWith('/payments')) {
    const payable = payables.find(item => path.includes(item.id));
    const paid = payable.payments.filter(payment => !payment.reversedAt).reduce((sum, payment) => sum + payment.amount, 0);
    if (Number(body.amount) > payable.amount - paid + 0.005) throw Object.assign(new Error('De más'), { response: { data: { message: 'El pago supera el saldo pendiente de la cuenta.' } } });
    const recordId = `rec-payable-${++payrollCounter}`;
    payable.payments = [...payable.payments, { id: `payable-payment-${payrollCounter}`, amount: Number(body.amount), paidAt: `${body.paidAt}T12:00:00Z`, accountName: accountName(body.accountId), reference: body.reference || null, notes: body.notes || null, financialRecordId: recordId, reversedAt: null, documents: [] }];
    const outstanding = payable.amount - paid - Number(body.amount);
    payable.status = outstanding <= 0 ? 'PAGADA' : 'PARCIAL';
    records = [{ id: recordId, date: `${body.paidAt}T12:00:00Z`, year: 2026, month: 10, amount: Number(body.amount), type: 'EXPENSE', category: payable.category, status: 'POSTED', scenario: 'ACTUAL', origin: 'SYSTEM', description: `Pago a ${thirdParties.find(item => item.id === payable.thirdPartyId)?.name}: ${payable.concept}`, accountId: body.accountId, account, documents: [], payablePayment: { id: `payable-payment-${payrollCounter}`, payableId: payable.id } }, ...records];
    window.__payablePaymentBody = body;
    data = { message: outstanding <= 0 ? 'Pago registrado. La cuenta quedó pagada.' : 'Pago registrado. El egreso quedó en Movimientos.', outstanding, payment: payable.payments.at(-1), financialRecord: { id: recordId }, payable };
  } else if (path.includes('/payables/') && path.endsWith('/void')) {
    const payable = payables.find(item => path.includes(item.id));
    if (!body.reason) throw Object.assign(new Error('Sin motivo'), { response: { data: { message: 'Indica por qué se anula la cuenta.' } } });
    payable.status = 'ANULADA';
    data = { message: 'Cuenta por pagar anulada.', payable };
  } else if (path.includes('/payables/') && config.method === 'patch') {
    const payable = payables.find(item => path.includes(item.id));
    Object.assign(payable, body, { amount: body.amount !== undefined ? Number(body.amount) : payable.amount, dueDate: body.dueDate ? `${body.dueDate}T12:00:00Z` : null });
    data = { message: 'Cuenta por pagar actualizada.', payable };
  } else if (path.includes('/payables/') && path.endsWith('/documents')) {
    const payable = payables.find(item => path.includes(item.id));
    const file = config.data instanceof FormData ? config.data.get('file') : null;
    payable.documents = [...payable.documents, { id: `payable-doc-${++payrollCounter}`, name: file?.name || 'soporte.pdf', mimeType: 'application/pdf', size: file?.size || 1 }];
    data = { message: 'Soporte guardado.', document: payable.documents.at(-1) };
  } else if (path.includes('/payable-payments/') && path.endsWith('/reverse')) {
    const paymentId = path.split('/').at(-2);
    const payable = payables.find(item => item.payments.some(payment => payment.id === paymentId));
    const target = payable.payments.find(payment => payment.id === paymentId);
    target.reversedAt = '2026-10-20T05:00:00Z'; target.reversalReason = body.reason;
    const paid = payable.payments.filter(payment => !payment.reversedAt).reduce((sum, payment) => sum + payment.amount, 0);
    payable.status = paid <= 0 ? 'POR_PAGAR' : paid >= payable.amount ? 'PAGADA' : 'PARCIAL';
    records = records.map(record => record.id === target.financialRecordId ? { ...record, status: 'VOIDED' } : record);
    data = { message: 'Pago revertido. Su egreso quedó anulado.', payable };
  } else if (path.includes('/receivable-payments/') && path.endsWith('/documents')) {
    // Como el servidor: el certificado de una retención va a la propia fila del ajuste.
    const paymentId = decodeURIComponent(path.split('/').at(-2));
    const target = (debt.payments || []).find(payment => payment.id === paymentId);
    const file = config.data instanceof FormData ? config.data.get('file') : null;
    target.supportDocuments = [...(target.supportDocuments || []), { id: `cert-${++payrollCounter}`, name: file?.name || 'certificado.pdf', mimeType: 'application/pdf', size: file?.size || 1 }];
    window.__certificateUpload = paymentId;
    data = { message: 'Soporte guardado.', document: target.supportDocuments.at(-1) };
  } else if (path.endsWith('/loans')) {
    // Como el servidor: el egreso (o el ya registrado) y la cuenta por cobrar de clase PRESTAMO, de una vez.
    if (!body.counterpartyName && !body.clientId) throw Object.assign(new Error('Sin nombre'), { response: { data: { message: 'Escribe el nombre de la persona o empresa a la que se le presta.' } } });
    const name = body.clientId ? client.name : body.counterpartyName;
    let recordId = body.financialRecordId;
    if (!recordId) { recordId = `rec-loan-${++payrollCounter}`; records = [{ id: recordId, date: `${body.lentAt}T12:00:00Z`, year: 2026, month: 10, amount: Number(body.amount), type: 'EXPENSE', category: 'PRESTAMO', status: 'POSTED', scenario: 'ACTUAL', origin: 'SYSTEM', description: `Préstamo a ${name}`, accountId: body.accountId, account, documents: [], loanReceivable: { id: 'demo-loan' } }, ...records]; }
    loans = [{ id: `demo-loan-${payrollCounter}`, kind: 'PRESTAMO', counterpartyType: body.counterpartyType, counterpartyName: name, clientId: body.clientId || null, clientName: name, clientSlug: null, sourceLabel: name, loanRecordId: recordId, amount: Number(body.amount), outstanding: Number(body.amount), paidAmount: 0, settledAmount: 0, status: 'DEBE', year: 2026, month: 10, period: `${body.lentAt}T00:00:00Z`, dueDate: body.dueDate ? `${body.dueDate}T00:00:00Z` : null, notes: body.notes || null, payments: [] }, ...loans];
    window.__loanBody = body;
    data = { message: body.financialRecordId ? 'Préstamo registrado en Cartera, ligado al egreso que ya existía.' : 'Préstamo registrado: el egreso quedó en Movimientos y la cuenta por cobrar en Cartera.', receivable: loans[0], financialRecord: { id: recordId } };
  } else if (path.endsWith('/payments') && loans.some(loan => path.includes(loan.id))) {
    // La devolución de un préstamo: reintegro, categoría PRESTAMO, sin concepto.
    const loan = loans.find(item => path.includes(item.id));
    const outstanding = loan.outstanding - Number(body.amount);
    Object.assign(loan, { outstanding, paidAmount: loan.paidAmount + Number(body.amount), status: outstanding === 0 ? 'PAGADO' : loan.status, payments: [{ id: `loan-payment-${++payrollCounter}`, kind: 'PAGO', amount: Number(body.amount), paidAt: `${body.paidAt}T12:00:00Z`, reference: body.reference || null, notes: body.notes || null, account, financialRecordId: `rec-reintegro-${payrollCounter}`, documents: [] }, ...loan.payments] });
    records = [{ id: `rec-reintegro-${payrollCounter}`, date: `${body.paidAt}T12:00:00Z`, year: 2026, month: 11, amount: Number(body.amount), type: 'INCOME', category: 'PRESTAMO', status: 'POSTED', scenario: 'ACTUAL', origin: 'SYSTEM', description: `Reintegro de préstamo: ${loan.counterpartyName}`, accountId: account.id, account, documents: [], receivablePayment: { id: 'x' } }, ...records];
    window.__loanPaymentBody = body;
    data = { message: outstanding === 0 ? 'Reintegro registrado. El préstamo quedó devuelto por completo.' : 'Reintegro registrado. No cuenta como venta.', outstanding, payment: { id: 'p' }, financialRecord: { id: `rec-reintegro-${payrollCounter}` }, receivable: { kind: 'PRESTAMO', status: loan.status } };
  } else if (path.endsWith('/settlements')) {
    // Como el servidor: un acuerdo, canje, compensación o condonación baja el saldo sin crear ingreso.
    if (Number(body.amount) > debt.outstanding + 0.005) throw Object.assign(new Error('Supera el saldo'), { response: { data: { message: 'El valor supera el saldo pendiente.' } } });
    const outstanding = Math.round((debt.outstanding - Number(body.amount)) * 100) / 100;
    const retention = body.kind === 'RETENCION';
    const detail = retention ? { retentionType: body.retentionType, ...(body.certificateNumber ? { certificateNumber: body.certificateNumber } : {}) } : { authorizedBy: body.authorizedBy, ...(body.kind === 'CANJE' ? { goods: body.goods, ...(body.destination ? { destination: body.destination } : {}) } : {}), ...(body.kind === 'COMPENSACION' ? { offsetAgainst: body.offsetAgainst } : {}) };
    debt = { ...debt, outstanding, ...(retention ? { retainedAmount: (debt.retainedAmount || 0) + Number(body.amount) } : { settledAmount: (debt.settledAmount || 0) + Number(body.amount) }), status: outstanding === 0 ? (retention && !(debt.settledAmount > 0) ? 'PAGADO' : 'SALDADO') : debt.status, payments: [{ id: `demo-settlement-${Date.now()}`, kind: body.kind, detail, amount: Number(body.amount), paidAt: `${body.settledAt}T12:00:00Z`, notes: body.reason || null, account: null, financialRecordId: null, documents: [], supportDocuments: [] }, ...(debt.payments || [])] };
    window.__receivableSettlementBody = body;
    data = { message: retention ? (outstanding === 0 ? 'Retención en la fuente registrada. La cuenta quedó pagada; no se creó ningún ingreso.' : 'Retención registrada. No se creó ningún ingreso.') : outstanding === 0 ? 'Acuerdo por menor valor registrado. La cuenta quedó saldada; no se creó ningún ingreso.' : 'Ajuste registrado. No se creó ningún ingreso.', outstanding, receivable: { status: debt.status } };
  } else if (path.includes('/receivable-payments/') && config.method === 'patch') {
    // Como el servidor: el abono se corrige y su ingreso cambia con él; el saldo se recalcula.
    const paymentId = path.split('/').at(-1);
    const target = debt.payments.find(payment => payment.id === paymentId);
    if (!target) throw Object.assign(new Error('No existe'), { response: { data: { message: 'El abono no existe.' } } });
    if ((body.amount !== undefined || body.paidAt !== undefined || body.accountId !== undefined) && !body.reason) throw Object.assign(new Error('Sin motivo'), { response: { data: { message: 'Explica por qué se corrige el valor, la fecha o la cuenta: queda en la bitácora.' } } });
    const nextAmount = body.amount !== undefined ? Number(body.amount) : target.amount;
    const others = debt.payments.filter(payment => payment.id !== paymentId && !payment.reversedAt).reduce((sum, payment) => sum + Number(payment.amount), 0);
    let exchangeAdjustment = null, amount = debt.amount;
    if (others + nextAmount > debt.amount + 0.005) {
      if (debt.currency !== 'USD') throw Object.assign(new Error('De más'), { response: { data: { message: 'Con ese valor los abonos superarían el valor de la cuenta por cobrar.' } } });
      exchangeAdjustment = { from: debt.amount, to: others + nextAmount, at: '2026-10-19T15:00:00.000Z' };
      amount = others + nextAmount;
    }
    Object.assign(target, { amount: nextAmount, paidAt: body.paidAt ? `${body.paidAt}T12:00:00Z` : target.paidAt, reference: body.reference ?? target.reference, notes: body.notes ?? target.notes, account: body.accountId ? [account].find(item => item.id === body.accountId) || target.account : target.account });
    const paid = debt.payments.filter(payment => !payment.reversedAt && (!payment.kind || payment.kind === 'PAGO')).reduce((sum, payment) => sum + Number(payment.amount), 0);
    const outstanding = Math.round((amount - others - nextAmount) * 100) / 100;
    debt = { ...debt, amount, paidAmount: paid, outstanding, status: outstanding === 0 ? 'PAGADO' : (debt.status === 'PAGADO' ? 'DEBE' : debt.status), exchangeAdjustments: exchangeAdjustment ? [...(debt.exchangeAdjustments || []), exchangeAdjustment] : debt.exchangeAdjustments };
    if (target.financialRecordId) records = records.map(record => record.id === target.financialRecordId ? { ...record, amount: nextAmount, reference: body.reference ?? record.reference } : record);
    window.__paymentEditBody = body;
    data = { message: exchangeAdjustment ? `Abono corregido. La cartera en pesos se ajustó de $ ${exchangeAdjustment.from.toLocaleString('es-CO')} a $ ${exchangeAdjustment.to.toLocaleString('es-CO')} por la tasa del día.` : 'Abono corregido. Su ingreso en Movimientos cambió con él.', outstanding };
  } else if (path.endsWith('/receivable-adjustments')) {
    // Como el servidor: cierres sin dinero vigentes y ajustes por tasa del periodo.
    const settlements = [debt, ...loans].flatMap(row => (row.payments || []).filter(payment => payment.kind && payment.kind !== 'PAGO' && !payment.reversedAt).map(payment => ({ id: payment.id, kind: payment.kind, kindLabel: payment.kind === 'RETENCION' ? { RETEFUENTE: 'Retención en la fuente', RETEICA: 'Retención de ICA', RETEIVA: 'Retención de IVA' }[payment.detail?.retentionType] : { ACUERDO: 'Acuerdo por menor valor', CANJE: 'Canje de bienes o servicios', COMPENSACION: 'Compensación de obligaciones', CONDONACION: 'Condonación o baja autorizada' }[payment.kind], retentionType: payment.detail?.retentionType || null, certificateNumber: payment.detail?.certificateNumber || null, documents: payment.supportDocuments || [], amount: payment.amount, originalAmount: row.amount, date: payment.paidAt, clientName: row.clientName, reason: payment.notes, authorizedBy: payment.detail?.authorizedBy || null, goods: payment.detail?.goods || null, destination: payment.detail?.destination || null, offsetAgainst: payment.detail?.offsetAgainst || null })));
    const exchangeAdjustments = (debt.exchangeAdjustments || []).map(item => ({ receivableId: debt.id, clientName: debt.clientName, foreignAmount: debt.foreignAmount, date: item.at, from: item.from, to: item.to, difference: item.to - item.from }));
    const byKind = Object.fromEntries(['ACUERDO', 'CANJE', 'COMPENSACION', 'CONDONACION', 'RETENCION'].map(kind => [kind, { total: settlements.filter(item => item.kind === kind).reduce((sum, item) => sum + item.amount, 0), count: settlements.filter(item => item.kind === kind).length }]));
    const retained = settlements.filter(item => item.kind === 'RETENCION');
    const retention = { total: retained.reduce((sum, item) => sum + item.amount, 0), count: retained.length, byType: Object.fromEntries(['RETEFUENTE', 'RETEICA', 'RETEIVA'].map(type => [type, { total: retained.filter(item => item.retentionType === type).reduce((sum, item) => sum + item.amount, 0), count: retained.filter(item => item.retentionType === type).length }])) };
    const up = exchangeAdjustments.filter(item => item.difference > 0).reduce((sum, item) => sum + item.difference, 0), down = exchangeAdjustments.filter(item => item.difference < 0).reduce((sum, item) => sum - item.difference, 0);
    data = { year: 2026, items: settlements, exchangeAdjustments, summary: { byKind, retention, settledTotal: settlements.filter(item => item.kind !== 'RETENCION').reduce((sum, item) => sum + item.amount, 0), exchange: { up, down, net: up - down, count: exchangeAdjustments.length } } };
  } else if (path.endsWith('/payments')) {
    if (new URLSearchParams(location.search).has('paymentError')) throw Object.assign(new Error('Pago no guardado (simulado)'), { response: { data: { message: 'Pago no guardado (simulado)' } } });
    // Como el servidor: en dólares, lo que entró de más (o de menos, si «queda al día») ajusta la cartera.
    let exchangeAdjustment = null;
    if (debt.currency === 'USD' && (Number(body.amount) > debt.outstanding || (body.settlesInFull && Number(body.amount) < debt.outstanding))) {
      exchangeAdjustment = { from: debt.amount, to: debt.amount + (Number(body.amount) - debt.outstanding), at: '2026-10-19T15:00:00.000Z' };
      debt = { ...debt, amount: exchangeAdjustment.to, outstanding: Number(body.amount), exchangeAdjustments: [...(debt.exchangeAdjustments || []), exchangeAdjustment] };
      window.__exchangeAdjustment = exchangeAdjustment;
    } else if (Number(body.amount) + (body.retentions || []).reduce((sum, item) => sum + Number(item.amount), 0) > debt.outstanding + 0.005) throw Object.assign(new Error('De más'), { response: { data: { message: 'El pago supera el saldo pendiente de la cuenta por cobrar.' } } });
    // Como el servidor (22 de octubre de 2026): lo retenido cierra su parte sin ser ingreso y deja la cuenta pagada.
    const retained = (body.retentions || []).reduce((sum, item) => sum + Number(item.amount), 0);
    const retentionRows = (body.retentions || []).map((item, index) => ({ id: `demo-retention-${index}`, kind: 'RETENCION', detail: { retentionType: item.type }, amount: Number(item.amount), paidAt: `${body.paidAt}T12:00:00Z`, notes: null, account: null, financialRecordId: null, documents: [], supportDocuments: [] }));
    debt = { ...debt, outstanding: debt.outstanding - Number(body.amount) - retained, paidAmount: debt.paidAmount + Number(body.amount), retainedAmount: (debt.retainedAmount || 0) + retained, status: Math.abs(debt.outstanding - Number(body.amount) - retained) < 0.005 ? 'PAGADO' : debt.status, payments: [...retentionRows, ...(debt.payments || [])] };
    if (!body.financialRecordId) records = [{ ...records[0], id: 'demo-new', amount: body.amount, category: body.category, origin: 'SYSTEM', receivablePayment: { id: 'demo-payment' }, documents: [] }, ...records];
    // Como el servidor: el abono queda con su ingreso, y la respuesta trae ese ingreso.
    const recordId = body.financialRecordId || 'demo-new';
    debt = { ...debt, payments: [{ id: 'demo-payment', amount: Number(body.amount), paidAt: `${body.paidAt}T12:00:00Z`, reference: body.reference || null, notes: body.notes || null, account, financialRecordId: recordId, documents: [] }, ...(debt.payments || [])] };
    window.__receivablePaymentBody = body;
    data = { message: exchangeAdjustment ? `Pago registrado. La cartera en pesos se ajustó de $ ${exchangeAdjustment.from.toLocaleString('es-CO')} a $ ${exchangeAdjustment.to.toLocaleString('es-CO')} por la tasa del día.` : retentionRows.length ? (debt.outstanding < 0.005 ? 'Pago y retenciones registrados. La cuenta quedó pagada.' : 'Pago y retenciones registrados. Las retenciones no cuentan como ingreso.') : 'Pago de cartera registrado correctamente.', outstanding: debt.outstanding, payment: { id: 'demo-payment' }, financialRecord: { id: recordId }, receivable: { kind: 'CLIENTE', status: debt.status } };
  } else if (path.endsWith('/periods')) data = { periods: [] };
  else if (path.includes('/receivables/') && config.method === 'delete') {
    // Como el servidor: con abonos vigentes no se borra, y se dice por dónde salir.
    if ((debt.payments || []).some(payment => !payment.reversedAt)) {
      throw Object.assign(new Error('Con abonos'), { response: { data: { message: 'Esta obligación tiene 1 abono(s) vigente(s) y borrarla dejaría ese dinero sin a qué apuntar. Reviértelos primero con «Revertir», aquí mismo en la cartera, y vuelve a eliminarla.' } } });
    }
    deletedReceivables.push({ id: path.split('/').at(-1), reason: body?.reason ?? null });
    debt = { ...debt, deleted: true };
    data = { message: 'Cuenta por cobrar eliminada.' };
  }
  else if (path.includes('/receivables/') && config.method === 'patch') { debt = { ...debt, ...body }; data = { receivable: debt }; }
  // Crear la cuenta por cobrar puede crear la ficha del cliente en el mismo acto.
  else if (path.endsWith('/receivables') && config.method === 'post') {
    if (!body.clientId && !body.client?.name) throw Object.assign(new Error('Sin cliente'), { response: { data: { message: 'Elige el cliente de la cuenta por cobrar, o escribe el nombre de uno nuevo.' } } });
    createdReceivables.push(body);
    data = { receivable: { id: 'nuevo' } };
  }
  else throw new Error(`Ruta no simulada: ${config.method} ${path}`);
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><AuthProvider><MemoryRouter><div className="bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-700"><p>Muestra local · datos ficticios en memoria · nada se guarda en producción</p><button className="min-h-11 rounded-lg border border-zinc-300 px-4 dark:border-zinc-700" onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button></div><FinancialDashboard /><Toaster position="top-right" /></div></MemoryRouter></AuthProvider></QueryClientProvider>);
