import { assertOpenFinancialPeriod, parseFinancialDateInput } from './financialRecordService.js';
import { isReceivableClosed, receivableStatusAfter } from '../lib/receivableSettlement.js';
import { atomic, authorize, audit, clone, hash, fail, conflict, request, payroll, payrollBalance, openPayrollPeriod, cents, money } from './payrollPeriodShared.js';

const includeLoan = { loanCollaborator: { select: { thirdPartyId: true } }, payments: { orderBy: { id: 'asc' } } };
function loanBalance(loan) {
  const applied = loan.payments.filter(p => !p.reversedAt).reduce((total, p) => total + cents(p.amount), 0), amount = cents(loan.amount);
  if (!Number.isSafeInteger(applied) || applied > amount || (isReceivableClosed(loan.status) && applied !== amount)) throw fail('PAYROLL_LOAN_REVIEW', 'El préstamo tiene un saldo histórico por verificar. Revísalo en Cartera.');
  return amount - applied;
}
async function load(tx, id) {
  const row = await payroll(tx, id);
  const loans = await tx.accountsReceivable.findMany({ where: { kind: 'PRESTAMO', OR: [{ loanCollaboratorId: row.contract.collaboratorId || '__none__' }, ...(row.contract.collaborator?.thirdPartyId ? [{thirdPartyId:row.contract.collaborator.thirdPartyId},{loanCollaborator:{thirdPartyId:row.contract.collaborator.thirdPartyId}}] : []), { thirdPartyId:null, loanCollaboratorId: null, counterpartyType: 'COLABORADOR' }] }, include: includeLoan, orderBy: { id: 'asc' } });
  return { row, loans, revision: hash({ row, loans }) };
}
function view(ctx) {
  const balance = payrollBalance(ctx.row), options = [], unavailable = [];
  for (const loan of ctx.loans) {
    try {
      const outstanding = loanBalance(loan);
      if (outstanding > 0 && loan.currency === 'COP') options.push({ id: loan.id, name: loan.counterpartyName, amount: money(cents(loan.amount)), outstanding: money(outstanding), linked: Boolean(loan.loanCollaboratorId || loan.thirdPartyId) });
    } catch (error) { unavailable.push({ id: loan.id, name: loan.counterpartyName, reason: error.message }); }
  }
  const deductions = ctx.row.adjustments.filter(a => a.receivablePaymentId).map(item => {
    const loan = ctx.loans.find(l => l.id === item.detail?.receivableId);
    let loanOutstanding = null;
    try { if (loan) loanOutstanding = money(loanBalance(loan)); } catch { /* El origen requiere revisión; no inventar un saldo cero. */ }
    return { ...item, loanOutstanding };
  });
  return { transaction: ctx.row, revision: ctx.revision, outstanding: money(balance.outstanding), paidAmount: money(balance.paid), options, unavailable, deductions };
}
export const readPayrollDeductions = (db, id, actor) => db.$transaction(async tx => { await authorize(tx, actor, 'read'); return view(await load(tx, id)); }, { isolationLevel: 'RepeatableRead' });
async function checkPeriods(tx, row, loan, date) {
  await openPayrollPeriod(tx, row);
  const period = parseFinancialDateInput(new Date(loan.period).toISOString().slice(0, 10));
  await assertOpenFinancialPeriod(tx, loan.year || period.year, loan.month || period.month);
  await assertOpenFinancialPeriod(tx, date.year, date.month);
}
function changedPayroll(row, amountDelta) {
  const { paid, net } = payrollBalance(row), newNet = net - amountDelta, deductions = cents(row.deductions) + amountDelta;
  if (newNet < paid || deductions < 0 || !Number.isSafeInteger(newNet) || !Number.isSafeInteger(deductions)) throw fail('PAYROLL_DEDUCTION_EXCEEDS', 'El descuento supera lo que falta por pagar de la nómina.');
  if (cents(row.grossAmount) !== net + cents(row.deductions)) throw fail('PAYROLL_BALANCE_REVIEW', 'El bruto, los descuentos y el neto requieren revisión antes de aplicar este descuento.');
  return { netAmount: money(newNet), deductions: money(deductions), status: newNet === paid ? 'PAID' : 'APPROVED', paidAt: newNet === paid ? row.payments.filter(p => !p.reversedAt).map(p => p.paidAt).sort((a, b) => new Date(b) - new Date(a))[0] || null : null };
}
export async function createPayrollDeduction(db, id, input, actor) {
  const { reason, requestId } = request(input), amount = cents(input.amount), authorizedBy = String(input.authorizedBy || '').trim();
  if (amount <= 0 || !authorizedBy || authorizedBy.length > 120) throw fail('PAYROLL_DEDUCTION_INVALID', 'Indica un importe positivo y quién autorizó el descuento.', 400);
  const date = parseFinancialDateInput(input.settledAt), fingerprint = hash({ id, input });
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'approve');
    const previous = await tx.payrollAdjustment.findUnique({ where: { requestId }, include: { receivablePayment: true } });
    if (previous) {
      if (previous.reversedAt || previous.detail?.fingerprint !== fingerprint || previous.detail?.actorId !== user.id) throw conflict();
      return { adjustment: previous, payment: previous.receivablePayment, transaction: await payroll(tx, id), replayed: true };
    }
    const ctx = await load(tx, id), row = ctx.row;
    if (ctx.revision !== input.expectedRevision) throw conflict();
    if (row.voidedAt || row.status !== 'APPROVED') throw fail('PAYROLL_DEDUCTION_NOT_APPROVED', 'Aprueba una liquidación vigente con saldo antes de descontar el préstamo.');
    if (!row.contract.collaboratorId || !row.contract.collaborator?.isActive) throw fail('PAYROLL_BORROWER_REQUIRED', 'El contrato debe estar vinculado a un colaborador activo.');
    const loan = ctx.loans.find(l => l.id === input.receivableId);
    if (!loan || loan.currency !== 'COP') throw fail('PAYROLL_LOAN_UNAVAILABLE', 'Selecciona un préstamo en COP de esta persona.');
    if (!loan.loanCollaboratorId && !loan.thirdPartyId && input.confirmBorrower !== true) throw fail('PAYROLL_BORROWER_CONFIRMATION', 'Confirma expresamente a quién pertenece este préstamo antes de vincularlo.');
    const beforeLoan = loanBalance(loan);
    if (amount > beforeLoan) throw fail('PAYROLL_LOAN_EXCEEDS', 'El descuento supera el saldo del préstamo.');
    const update = changedPayroll(row, amount);
    await checkPeriods(tx, row, loan, date);
    const payment = await tx.receivablePayment.create({ data: { receivableId: loan.id, kind: 'COMPENSACION', amount: money(amount), paidAt: date.date, notes: reason, createdById: user.id, detail: clone({ payrollTransactionId: id, authorizedBy, offsetAgainst: `Nómina ${row.year}-${row.month}`, requestId, actorName: user.name }) } });
    const adjustment = await tx.payrollAdjustment.create({ data: { transactionId: id, type: 'DEDUCTION', amount: money(amount), description: reason, receivablePaymentId: payment.id, requestId, detail: clone({ fingerprint, actorId: user.id, actorName: user.name, authorizedBy, receivableId: loan.id, loanName: loan.counterpartyName, settledAt: date.date, borrowerConfirmed: !loan.loanCollaboratorId && !loan.thirdPartyId, beforeNet: row.netAmount, beforeLoan: money(beforeLoan) }) } });
    const afterLoan = await tx.accountsReceivable.update({ where: { id: loan.id }, data: { loanCollaboratorId: loan.loanCollaboratorId || row.contract.collaboratorId, thirdPartyId: loan.thirdPartyId || row.contract.collaborator?.thirdPartyId || null, status: receivableStatusAfter({ outstandingCents: beforeLoan - amount, payments: [...loan.payments, payment], currentStatus: loan.status }) } });
    const transaction = await tx.payrollTransaction.update({ where: { id }, data: update });
    await audit(tx, 'PayrollTransaction', id, row, { operation: 'LOAN_DEDUCTION', transaction, adjustment, reason }, user);
    await audit(tx, 'AccountsReceivable', loan.id, loan, { operation: 'PAYROLL_DEDUCTION', receivable: afterLoan, payment, reason }, user);
    return { transaction, adjustment, payment, loanOutstanding: money(beforeLoan - amount), outstanding: money(cents(transaction.netAmount) - payrollBalance(row).paid) };
  });
}
export async function reversePayrollDeduction(db, adjustmentId, input, actor) {
  const { reason, requestId } = request(input), fingerprint = hash({ adjustmentId, input });
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'approve');
    const adjustment = await tx.payrollAdjustment.findUnique({ where: { id: adjustmentId }, include: { receivablePayment: true } });
    if (!adjustment?.receivablePayment) throw fail('PAYROLL_DEDUCTION_NOT_FOUND', 'El descuento vinculado no existe.', 404);
    if (adjustment.reversedAt) {
      const previous = adjustment.detail?.reversal;
      if (previous?.requestId !== requestId || previous.fingerprint !== fingerprint || previous.actorId !== user.id) throw conflict();
      return { adjustment, transaction: await payroll(tx, adjustment.transactionId), replayed: true };
    }
    const ctx = await load(tx, adjustment.transactionId), row = ctx.row, payment = adjustment.receivablePayment;
    if (ctx.revision !== input.expectedRevision) throw conflict();
    if (row.voidedAt || payment.reversedAt || payment.detail?.payrollTransactionId !== row.id || cents(payment.amount) !== cents(adjustment.amount) || payment.financialRecordId || payment.accountId) throw fail('PAYROLL_DEDUCTION_INCONSISTENT', 'El vínculo del descuento requiere revisión antes de revertirlo.');
    const loan = await tx.accountsReceivable.findUnique({ where: { id: payment.receivableId }, include: includeLoan });
    if (!loan || (loan.loanCollaboratorId !== row.contract.collaboratorId && !(row.contract.collaborator?.thirdPartyId && (loan.thirdPartyId === row.contract.collaborator.thirdPartyId || loan.loanCollaborator?.thirdPartyId === row.contract.collaborator.thirdPartyId)))) throw fail('PAYROLL_DEDUCTION_INCONSISTENT', 'El préstamo ya no corresponde al colaborador de esta liquidación.');
    const beforeLoan = loanBalance(loan), amount = cents(adjustment.amount), update = changedPayroll(row, -amount);
    const originalDate = parseFinancialDateInput(new Date(payment.paidAt).toISOString().slice(0, 10));
    await checkPeriods(tx, row, loan, originalDate);
    const currentDate = parseFinancialDateInput(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }));
    await assertOpenFinancialPeriod(tx, currentDate.year, currentDate.month);
    const reversedAt = new Date();
    const reversed = await tx.payrollAdjustment.update({ where: { id: adjustmentId }, data: { reversedAt, reversalReason: reason, reversedById: user.id, detail: clone({ ...adjustment.detail, reversal: { requestId, fingerprint, actorId: user.id, actorName: user.name } }) } });
    await tx.receivablePayment.update({ where: { id: payment.id }, data: { reversedAt, reversalReason: reason, reversedById: user.id } });
    const afterLoan = await tx.accountsReceivable.update({ where: { id: loan.id }, data: { status: receivableStatusAfter({ outstandingCents: beforeLoan + amount, payments: loan.payments.filter(p => p.id !== payment.id), currentStatus: loan.status }) } });
    const transaction = await tx.payrollTransaction.update({ where: { id: row.id }, data: update });
    await audit(tx, 'PayrollTransaction', row.id, row, { operation: 'LOAN_DEDUCTION_REVERSED', transaction, adjustment: reversed, reason }, user);
    await audit(tx, 'AccountsReceivable', loan.id, loan, { operation: 'PAYROLL_DEDUCTION_REVERSED', receivable: afterLoan, paymentId: payment.id, reason }, user);
    return { transaction, adjustment: reversed, outstanding: money(cents(transaction.netAmount) - payrollBalance(row).paid), loanOutstanding: money(beforeLoan + amount) };
  });
}
