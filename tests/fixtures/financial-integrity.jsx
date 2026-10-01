import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { AuthProvider } from '../../src/context/AuthContext';
import FinancialDashboard from '../../src/components/modules/FinancialDashboard';
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
// Unos cuantos egresos administrativos para que el filtro por categoría tenga dos bolsas que comparar.
const isAdminExpense = (i) => i >= 40 && i < 50;
let records = Array.from({ length: 62 }, (_, i) => ({ id: `demo-record-${i}`, clientId: client.id, client, date: '2026-09-07T05:00:00Z', year: 2026, month: 9, amount: i ? 10000 : 200000, type: isAdminExpense(i) ? 'EXPENSE' : 'INCOME', category: isAdminExpense(i) ? 'ADMINISTRATIVO' : 'SERVICIO', status: 'POSTED', scenario: 'ACTUAL', origin: 'MANUAL', description: isAdminExpense(i) ? `Gasto administrativo ${i + 1}` : (i ? `Ingreso de muestra ${i + 1}` : 'Adicional ya registrado'), accountId: account.id, account, reference: `DEMO-${i}` }));
const income = () => records.filter(record => record.type === 'INCOME').reduce((sum, record) => sum + Number(record.amount), 0);
// El ingreso que generó un abono: no se edita ni se anula desde Movimientos.
records[1] = { ...records[1], amount: 400000, origin: 'SYSTEM', description: 'Pago de cartera: Cliente de muestra', attachmentUrl: 'https://example.invalid/soporte.pdf', receivablePayment: { id: 'historical-payment', receivableId: debt.id } };
records[2] = { ...records[2], attachmentUrl: 'javascript:alert(1)' };
// ?payrollRecord: el egreso del pago de nómina de Rodny en el libro, para actuar sobre él
// desde Movimientos (1 de octubre de 2026). Fuera de esa URL el libro no cambia.
if (new URLSearchParams(location.search).has('payrollRecord')) {
  records.unshift({ id: 'rec-payroll-legacy', date: '2026-09-30T12:00:00Z', year: 2026, month: 9, amount: 4808300, type: 'EXPENSE', category: 'NOMINA', status: 'POSTED', scenario: 'ACTUAL', origin: 'SYSTEM', description: 'Pago de nomina: Rodny Chirinos', accountId: account.id, account, reference: null, documents: [], payrollPayment: { id: 'payroll-payment-legacy:tx-rodny' } });
}
if (!debt.balanceReviewRequired) debt.payments = [{ id: 'historical-payment', amount: 400000, paidAt: '2026-09-01T05:00:00Z', reference: 'ABONO-01', notes: 'Pagó la mitad; el resto queda para el 15 de octubre.', account, financialRecord: records[1] }];
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
    data = { cashFlow: [{ year: 2026, month: 9, income: scopedIncome, expense: scopedExpense, netFlow: scopedIncome - scopedExpense }], categoriesDistribution: { INCOME: { SERVICIO: scopedIncome }, EXPENSE: { OPERATIVO: scopedExpense } }, accountsReceivable: debt.outstanding > 0 ? [{ client, clientId: client.id, totalOutstanding: debt.outstanding }] : [], payroll: { collaborators: [] }, sourceSummary: { totals: { income: scopedIncome, expense: scopedExpense, netFlow: scopedIncome - scopedExpense, receivable: debt.outstanding } } };
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
    const document = { id: `doc-${++payrollCounter}`, name: file.name, mimeType: file.type || 'application/pdf', size: file.size };
    payment?.documents.push(document);
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
    data = { year: 2026, items: debt.deleted ? [] : [{ ...debt }], totals: { outstandingTotal: debt.deleted ? 0 : debt.outstanding, total: debt.deleted ? 0 : debt.outstanding, reviewCount: debt.balanceReviewRequired ? 1 : 0 } };
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
  else if (path.endsWith('/statement')) {
    if (new URLSearchParams(location.search).has('statementError')) throw Object.assign(new Error('Estado de cuenta no disponible (simulado)'), { response: { status: 500, data: { message: 'Estado de cuenta no disponible (simulado)' } } });
    const section = url.searchParams.get('section'), offset = Number(url.searchParams.get('cursor') || 0);
    const items = section === 'income' ? records : [{ ...debt, currency: 'COP' }];
    data = { client, scope: { year: 2026, section }, items: items.slice(offset, offset + 25), nextCursor: offset + 25 < items.length ? String(offset + 25) : null };
  } else if (path.endsWith('/records')) {
    const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 50);
    const category = url.searchParams.get('category'), accountId = url.searchParams.get('accountId');
    const selection = records.filter(record => (!category || record.category === category) && (!accountId || record.accountId === accountId));
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
    debt = {
      ...debt,
      outstanding: debt.outstanding + Number(target.amount),
      paidAmount: debt.paidAmount - Number(target.amount),
      status: 'DEBE',
      payments: debt.payments.map(payment => payment.id === paymentId ? { ...payment, reversedAt: '2026-09-20T05:00:00Z', reversalReason: body.reason } : payment)
    };
    records = records.map(record => record.id === target.financialRecord?.id ? { ...record, status: 'VOIDED' } : record);
    data = { message: 'Abono revertido. El ingreso que había generado quedó anulado.', outstanding: debt.outstanding };
  } else if (path.endsWith('/payments')) {
    if (new URLSearchParams(location.search).has('paymentError')) throw Object.assign(new Error('Pago no guardado (simulado)'), { response: { data: { message: 'Pago no guardado (simulado)' } } });
    debt = { ...debt, outstanding: debt.outstanding - Number(body.amount), paidAmount: debt.paidAmount + Number(body.amount), status: debt.outstanding === Number(body.amount) ? 'PAGADO' : debt.status };
    if (!body.financialRecordId) records = [{ ...records[0], id: 'demo-new', amount: body.amount, category: body.category }, ...records];
    data = { outstanding: debt.outstanding, payment: { id: 'demo-payment' } };
  } else if (path.endsWith('/bank-reconciliation')) data = { transactions: Array.from({ length: 90 }, (_, i) => ({ id: `bank-${i}`, description: `Movimiento bancario ${i + 1}`, postedAt: '2026-09-07', amount: 10000, account, status: i === 0 ? 'MATCHED' : 'UNMATCHED', matches: i === 0 ? [{ id: 'match', status: 'APPROVED' }] : [] })), continuityGaps: [], statements: [] };
  else if (path.endsWith('/periods')) data = { periods: [] };
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
