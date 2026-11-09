import { randomUUID } from 'node:crypto';
import { calculatePayrollPeriod, payrollDay, payrollPeriodsOverlap, unknownPayrollPeriods } from '../lib/payrollPeriods.js';
import { assertOpenFinancialPeriod } from './financialRecordService.js';
import { atomic, authorize, audit, clone, hash, fail, conflict, request, includePayroll, payroll, openPayrollPeriod } from './payrollPeriodShared.js';
export { readPayrollDeductions, createPayrollDeduction, reversePayrollDeduction } from './payrollLoanDeductionService.js';

async function load(tx, contractId) {
  const contract = await tx.payrollContract.findUnique({ where: { id: contractId }, include: { collaborator: true } });
  if (!contract) throw fail('PAYROLL_CONTRACT_NOT_FOUND', 'El contrato no existe.', 404);
  const rows = await tx.payrollTransaction.findMany({ where: contract.collaboratorId ? { contract: { collaboratorId: contract.collaboratorId, importBatchId: null } } : { contractId }, include: includePayroll, orderBy: [{ year: 'asc' }, { month: 'asc' }, { id: 'asc' }] });
  return { contract, rows, revision: hash({ contract, rows }) };
}
function checkRange(ctx, start, end, excludeId) {
  const live = ctx.rows.filter(row => !row.voidedAt && row.id !== excludeId);
  const unknown = unknownPayrollPeriods(live);
  if (unknown.length) throw fail('PAYROLL_LEGACY_PERIOD_UNKNOWN', `Faltan las fechas de ${unknown.map(row => `${row.month}/${row.year} (${row.status === 'DRAFT' ? 'borrador' : 'liquidación'})`).join(', ')}. En «Períodos e historial», precisa sus fechas o revisa la reversión si el registro sobra. Sus pagos se conservan.`);
  if (live.some(row => payrollPeriodsOverlap(start, end, row.serviceStart, row.serviceEnd))) throw fail('PAYROLL_PERIOD_OVERLAP', 'Estas fechas se superponen con una liquidación vigente. Revisa los períodos antes de continuar.');
}
const result = ctx => ({ ...ctx, transactions: ctx.rows.map(row => ({ ...row, contract: undefined })) });
export const readPayrollPeriods = (db, contractId, actor) => db.$transaction(async tx => { await authorize(tx, actor, 'read'); return result(await load(tx, contractId)); }, { isolationLevel: 'RepeatableRead' });

export async function createPayrollPeriod(db, contractId, input, actor) {
  const { reason, requestId } = request(input), calculation = calculatePayrollPeriod(input);
  const year = Number(input.year), month = Number(input.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) throw fail('PAYROLL_PERIOD_INVALID', 'Selecciona el año y mes de liquidación.', 400);
  const fingerprint = hash({ contractId, input });
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'write');
    const previous = await tx.payrollTransaction.findUnique({ where: { creationRequestId: requestId } });
    if (previous) {
      if (previous.voidedAt || previous.periodDetails?.fingerprint !== fingerprint || previous.periodDetails?.actorId !== user.id) throw conflict();
      return { transaction: previous, replayed: true };
    }
    const ctx = await load(tx, contractId);
    if (ctx.revision !== input.expectedRevision) throw conflict();
    if (ctx.contract.importBatchId || (ctx.contract.collaborator && !ctx.contract.collaborator.isActive)) throw fail('PAYROLL_CONTRACT_UNAVAILABLE', 'Este contrato no está disponible para nuevas liquidaciones. Se conserva su historial.');
    checkRange(ctx, calculation.start, calculation.end);
    if (calculation.start < payrollDay(ctx.contract.startDate) || (ctx.contract.endDate && calculation.end > payrollDay(ctx.contract.endDate))) throw fail('PAYROLL_OUTSIDE_CONTRACT', 'El nuevo período debe estar dentro de la vigencia actual del contrato.');
    await assertOpenFinancialPeriod(tx, year, month);
    const transaction = await tx.payrollTransaction.create({ data: {
      contractId, userId: ctx.contract.userId, year, month, periodKey: randomUUID(), serviceStart: new Date(`${calculation.start}T12:00:00Z`), serviceEnd: new Date(`${calculation.end}T12:00:00Z`),
      baseSalary: calculation.baseSalary, socialSecurity: calculation.socialSecurity, grossAmount: calculation.grossAmount, netAmount: calculation.grossAmount,
      creationRequestId: requestId, periodDetails: clone({ ...calculation, inputBase: input.baseSalary, inputSecurity: input.socialSecurity ?? 0, reason, actorId: user.id, actorName: user.name, fingerprint, contractSnapshot: ctx.contract })
    } });
    await audit(tx, 'PayrollTransaction', transaction.id, {}, { operation: 'PERIOD_CREATED', transaction, reason, actorName: user.name }, user);
    return { transaction };
  });
}

export async function identifyPayrollPeriod(db, id, input, actor) {
  const { reason, requestId } = request(input), start = payrollDay(input.start), end = payrollDay(input.end);
  if (end < start) throw fail('PAYROLL_PERIOD_INVALID', 'La fecha final no puede ser anterior al inicio.', 400);
  const fingerprint = hash({ id, input });
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'approve'), row = await payroll(tx, id);
    const prior = row.periodDetails?.identification;
    if (prior?.requestId === requestId) {
      if (prior.fingerprint !== fingerprint || prior.actorId !== user.id) throw conflict();
      return { transaction: row, replayed: true };
    }
    if (row.voidedAt) throw fail('PAYROLL_PERIOD_VOIDED', 'La liquidación está revertida.');
    const ctx = await load(tx, input.reviewContractId || row.contractId);
    if (!ctx.rows.some(item => item.id === id)) throw conflict();
    if (ctx.revision !== input.expectedRevision) throw conflict();
    // Identificar fechas no altera valores ni pagos. Las filas aún sin fechas no se inventan.
    if (ctx.rows.some(other => other.id !== id && !other.voidedAt && other.serviceStart && other.serviceEnd && payrollPeriodsOverlap(start, end, other.serviceStart, other.serviceEnd))) throw fail('PAYROLL_PERIOD_OVERLAP', 'Las fechas se superponen con otra liquidación vigente.');
    await openPayrollPeriod(tx, row);
    const transaction = await tx.payrollTransaction.update({ where: { id }, data: { serviceStart: new Date(`${start}T12:00:00Z`), serviceEnd: new Date(`${end}T12:00:00Z`), periodDetails: clone({ ...row.periodDetails, identification: { requestId, fingerprint, reason, actorId: user.id, actorName: user.name, at: new Date() } }) } });
    await audit(tx, 'PayrollTransaction', id, row, { operation: 'PERIOD_IDENTIFIED', transaction, reason }, user);
    return { transaction };
  });
}

export async function reversePayrollPeriod(db, id, input, actor) {
  const { reason, requestId } = request(input), fingerprint = hash({ id, input });
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'approve'), row = await payroll(tx, id);
    const prior = row.periodDetails?.reversal;
    if (row.voidedAt) {
      if (prior?.requestId !== requestId || prior.fingerprint !== fingerprint || prior.actorId !== user.id) throw conflict();
      return { transaction: row, replayed: true };
    }
    const ctx = await load(tx, input.reviewContractId || row.contractId);
    if (!ctx.rows.some(item => item.id === id)) throw conflict();
    if (ctx.revision !== input.expectedRevision) throw conflict();
    await openPayrollPeriod(tx, row);
    if (row.financialRecordId || row.payments.some(p => !p.reversedAt) || row.adjustments.some(a => !a.reversedAt)) throw fail('PAYROLL_PERIOD_HAS_APPLICATIONS', 'Primero revierte los pagos y descuentos vigentes desde esta liquidación. Sus comprobantes e historial se conservarán.');
    const transaction = await tx.payrollTransaction.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason, periodDetails: clone({ ...row.periodDetails, reversal: { requestId, fingerprint, actorId: user.id, actorName: user.name } }) } });
    await audit(tx, 'PayrollTransaction', id, row, { operation: 'PERIOD_REVERSED', transaction, reason }, user);
    return { transaction };
  });
}
