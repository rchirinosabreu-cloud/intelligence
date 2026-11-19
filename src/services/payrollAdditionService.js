// Adicionales de una liquidación de nómina: bonos, comisiones y otros pagos que no están en el contrato
// (Rodny, 19 de noviembre de 2026: «el valor del contrato es fijo, pero puede que alguien se gane un bono …
// sería mejor cargarlo a la nómina»; «los agrega cualquiera que tenga pleno acceso a financiero, no es un
// permiso especial»; «se pueden agregar a una liquidación ya pagada en caso de que se necesite ajustar algo»).
//
// Un adicional sube el bruto y el neto de la liquidación y queda como `PayrollAdjustment` con su motivo y
// autor; no mueve dinero. El dinero sale después con «Registrar pago», como siempre, así que una liquidación
// pagada que recibe un adicional vuelve a «Aprobada» con lo que falta. Revertirlo baja el neto, salvo que ya se
// haya pagado: entonces primero se revierte o se desglosa el pago. Nunca se borra nada.
import { atomic, authorize, audit, clone, hash, fail, conflict, request, payroll, payrollBalance, openPayrollPeriod, cents, money } from './payrollPeriodShared.js';
import { PAYROLL_ADDITION_MARK, PAYROLL_ADDITION_TYPES, isPayrollAddition, payrollAdditionLabel } from '../lib/payrollAdditions.js';

const revisionOf = row => hash({ row });

function view(row) {
  const balance = payrollBalance(row);
  return {
    transaction: row,
    revision: revisionOf(row),
    additions: row.adjustments.filter(isPayrollAddition),
    paidAmount: money(balance.paid),
    outstanding: money(balance.outstanding)
  };
}

/** El bruto, los descuentos y el neto tienen que cuadrar antes de tocar nada. */
function checkTotals(row) {
  const balance = payrollBalance(row);
  if (cents(row.grossAmount) !== balance.net + cents(row.deductions)) {
    throw fail('PAYROLL_BALANCE_REVIEW', 'El bruto, los descuentos y el neto de esta liquidación requieren revisión antes de agregar o quitar un adicional.');
  }
  return balance;
}

/** El estado que sigue: un borrador sigue en borrador; lo demás queda pagado solo si los pagos cubren el neto. */
function statusAfter(row, newNet, paid) {
  if (row.status === 'DRAFT') return {};
  if (paid > 0 && newNet === paid) {
    const lastPaidAt = row.payments.filter(p => !p.reversedAt).map(p => new Date(p.paidAt)).sort((a, b) => b - a)[0] || null;
    return { status: 'PAID', paidAt: lastPaidAt };
  }
  return { status: 'APPROVED', paidAt: null };
}

export const readPayrollAdditions = (db, id, actor) => db.$transaction(async tx => {
  await authorize(tx, actor, 'read');
  return view(await payroll(tx, id));
}, { isolationLevel: 'RepeatableRead' });

export async function createPayrollAddition(db, id, input = {}, actor) {
  const { reason, requestId } = request(input), fingerprint = hash({ id, input });
  const type = String(input.type || '');
  if (!Object.hasOwn(PAYROLL_ADDITION_TYPES, type)) throw fail('PAYROLL_ADDITION_INVALID', 'Elige si es un bono, una comisión u otro pago adicional.', 400);
  let amount;
  try { amount = cents(input.amount); } catch { amount = 0; }
  if (!amount || amount <= 0) throw fail('PAYROLL_ADDITION_INVALID', 'Indica un valor positivo con un máximo de dos decimales.', 400);
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'write');
    const previous = await tx.payrollAdjustment.findUnique({ where: { requestId } });
    if (previous) {
      if (previous.transactionId !== id || previous.detail?.fingerprint !== fingerprint || previous.detail?.actorId !== user.id) throw conflict();
      return { adjustment: previous, transaction: await payroll(tx, id), replayed: true };
    }
    const row = await payroll(tx, id);
    if (revisionOf(row) !== input.expectedRevision) throw conflict();
    if (row.voidedAt) throw fail('PAYROLL_PERIOD_VOIDED', 'La liquidación está revertida. Agrega el adicional a una liquidación vigente.');
    const { paid, net } = checkTotals(row);
    const newNet = net + amount, gross = cents(row.grossAmount) + amount;
    if (!Number.isSafeInteger(newNet) || !Number.isSafeInteger(gross)) throw fail('PAYROLL_ADDITION_INVALID', 'El valor excede el rango permitido.', 400);
    await openPayrollPeriod(tx, row);
    const adjustment = await tx.payrollAdjustment.create({ data: {
      transactionId: id, type, amount: money(amount), description: reason, requestId,
      detail: clone({ kind: PAYROLL_ADDITION_MARK, fingerprint, actorId: user.id, actorName: user.name, at: new Date() })
    } });
    const transaction = await tx.payrollTransaction.update({ where: { id }, data: { grossAmount: money(gross), netAmount: money(newNet), ...statusAfter(row, newNet, paid) } });
    await audit(tx, 'PayrollTransaction', id, row, { operation: 'PAYROLL_ADDITION', type: payrollAdditionLabel(type), transaction, adjustment, reason }, user);
    return { adjustment, transaction, outstanding: money(newNet - paid) };
  });
}

export async function reversePayrollAddition(db, adjustmentId, input = {}, actor) {
  const { reason, requestId } = request(input), fingerprint = hash({ adjustmentId, input });
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'write');
    const adjustment = await tx.payrollAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!isPayrollAddition(adjustment)) throw fail('PAYROLL_ADDITION_NOT_FOUND', 'El adicional no existe.', 404);
    if (adjustment.reversedAt) {
      const prior = adjustment.detail?.reversal;
      if (prior?.requestId !== requestId || prior.fingerprint !== fingerprint || prior.actorId !== user.id) throw conflict();
      return { adjustment, transaction: await payroll(tx, adjustment.transactionId), replayed: true };
    }
    const row = await payroll(tx, adjustment.transactionId);
    if (revisionOf(row) !== input.expectedRevision) throw conflict();
    if (row.voidedAt) throw fail('PAYROLL_PERIOD_VOIDED', 'La liquidación está revertida.');
    const { paid, net } = checkTotals(row), amount = cents(adjustment.amount);
    const newNet = net - amount;
    if (newNet < paid) throw fail('PAYROLL_ADDITION_ALREADY_PAID', `Ese adicional ya se pagó: lo pagado ($ ${(paid / 100).toLocaleString('es-CO')}) quedaría por encima del neto. Revierte o desglosa primero el pago desde la liquidación.`);
    if (newNet <= 0) throw fail('PAYROLL_BALANCE_REVIEW', 'La liquidación quedaría en cero. Revísala antes de quitar este adicional.');
    await openPayrollPeriod(tx, row);
    const reversed = await tx.payrollAdjustment.update({ where: { id: adjustmentId }, data: {
      reversedAt: new Date(), reversalReason: reason, reversedById: user.id,
      detail: clone({ ...adjustment.detail, reversal: { requestId, fingerprint, actorId: user.id, actorName: user.name } })
    } });
    const transaction = await tx.payrollTransaction.update({ where: { id: row.id }, data: { grossAmount: money(cents(row.grossAmount) - amount), netAmount: money(newNet), ...statusAfter(row, newNet, paid) } });
    await audit(tx, 'PayrollTransaction', row.id, row, { operation: 'PAYROLL_ADDITION_REVERSED', transaction, adjustment: reversed, reason }, user);
    return { adjustment: reversed, transaction, outstanding: money(newNet - paid) };
  });
}
