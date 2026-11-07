import { createHash } from 'node:crypto';
import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { hasFinancialPermission } from '../utils/financialPermissions.js';
import { FinancialDomainError, assertOpenFinancialPeriod, parseFinancialDateInput } from './financialRecordService.js';
import { payableStatusAfter } from '../lib/accountsPayable.js';

const kinds = {
  payroll: { payment: 'payrollPayment', parent: 'payrollTransaction', parentKey: 'transactionId', entity: 'PayrollPayment', permission: 'approve', include: { contract: { include: { collaborator: true } } } },
  payable: { payment: 'payablePayment', parent: 'accountsPayable', parentKey: 'payableId', entity: 'PayablePayment', permission: 'write', include: { thirdParty: true } }
};
const fail = (code, message, status = 409) => new FinancialDomainError(code, message, status);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const day = value => { const date = new Date(value); if (!value || Number.isNaN(date.getTime())) throw fail('PAYMENT_DATE_REVIEW', 'La fecha original del pago requiere revisión.'); return date.toISOString().slice(0, 10); };
const money = value => { const result = financialCents(value); if (result === null || result < 0) throw fail('PAYMENT_BALANCE_REVIEW', 'Los valores de este pago requieren revisión.'); return result; };
const sum = rows => rows.reduce((total, row) => { const next = total + money(row.amount); if (!Number.isSafeInteger(next)) throw fail('PAYMENT_BALANCE_REVIEW', 'El saldo excede el rango permitido.'); return next; }, 0);
const fields = payment => ({ id: payment.id, amount: financialAmountFromCents(money(payment.amount)), accountId: payment.accountId, paidAt: payment.paidAt, reference: payment.reference || null, notes: payment.notes || null, updatedAt: payment.updatedAt, reversedAt: payment.reversedAt });
const config = kind => { if (!Object.hasOwn(kinds, kind)) throw fail('PAYMENT_KIND_INVALID', 'Ese tipo de pago no admite esta corrección.', 400); return kinds[kind]; };

async function authorize(tx, actor, permission) {
  const user = await tx.user.findUnique({ where: { id: actor?.userId || actor?.id || '' } });
  if (!hasFinancialPermission(user, permission)) throw fail('FINANCIAL_ACCESS_DENIED', 'Tu acceso actual no permite esta operación financiera.', 403);
  return user;
}
async function load(tx, kind, id) {
  const rule = config(kind);
  const payment = await tx[rule.payment].findUnique({ where: { id } });
  if (!payment) throw fail('PAYMENT_NOT_FOUND', 'No encontramos ese pago.', 404);
  const parent = await tx[rule.parent].findUnique({ where: { id: payment[rule.parentKey] }, include: rule.include });
  if (!parent) throw fail('PAYMENT_SOURCE_MISSING', 'No encontramos la obligación de este pago.');
  const record = payment.financialRecordId ? await tx.financialRecord.findUnique({ where: { id: payment.financialRecordId }, include: { allocations: true, bankMatches: { select: { id: true } } } }) : null;
  const siblings = await tx[rule.payment].findMany({ where: { [rule.parentKey]: parent.id, reversedAt: null } });
  const total = money(kind === 'payroll' ? parent.netAmount : parent.amount);
  const paid = sum(siblings);
  const revision = hash({ payment: fields(payment), record, parent, siblings: siblings.map(fields).sort((a, b) => a.id.localeCompare(b.id)) });
  let blocker = null;
  if (payment.reversedAt) blocker = 'El pago está revertido. Registra uno nuevo desde su obligación.';
  else if (!record || record.status !== 'POSTED' || record.scenario !== 'ACTUAL' || record.isProjection || record.type !== 'EXPENSE') blocker = 'El movimiento vinculado requiere revisión antes de corregir el pago.';
  else if (record.origin !== 'SYSTEM') blocker = 'Este pago aplica un egreso que ya existía. Revierte su aplicación desde el origen y corrige el egreso en Movimientos; después vuelve a aplicarlo.';
  else if (money(record.amount) !== money(payment.amount) || record.accountId !== payment.accountId || day(record.date) !== day(payment.paidAt)) blocker = 'El pago y su movimiento no coinciden. Revisa el historial antes de corregirlos.';
  else if (record.allocations?.length) blocker = 'Este movimiento tiene un desglose. Revisa sus asignaciones antes de cambiar el pago.';
  else if (record.bankMatches?.length) blocker = 'Este movimiento está vinculado a una conciliación bancaria. Revisa esa conciliación antes de corregir el pago.';
  else if (kind === 'payable' && parent.currency !== 'COP') blocker = 'La moneda de esta obligación requiere revisión antes de corregir el pago.';
  else if (kind === 'payroll' ? !['APPROVED', 'PAID'].includes(parent.status) : parent.status === 'ANULADA') blocker = 'La obligación no está habilitada para corregir pagos.';
  else if (paid > total) blocker = 'Los pagos superan la obligación. El saldo requiere revisión.';
  return { rule, payment, record, parent, siblings, total, paid, revision, blocker };
}

export async function readPaymentCorrection(db, kind, id, actor) {
  return db.$transaction(async tx => {
    const user = await authorize(tx, actor, 'read');
    const context = await load(tx, kind, id);
    const { rule, payment, parent, total, paid, blocker, revision } = context;
    const history = user.role === 'ADMIN' ? await tx.financialAuditEvent.findMany({ where: { entityType: rule.entity, entityId: id, after: { path: ['operation'], equals: 'CORRECTION' } }, orderBy: { createdAt: 'desc' }, take: 20 }) : [];
    const account = payment.accountId ? await tx.financialAccount.findUnique({ where: { id: payment.accountId } }) : null;
    return { kind, payment: fields(payment), accountName: account?.name || 'Sin cuenta', revision, blocker,
      label: kind === 'payroll' ? parent.contract?.collaborator?.displayName || 'Nómina' : `${parent.thirdParty?.name || 'Proveedor'} · ${parent.concept}`,
      total: total / 100, outstanding: (total - paid) / 100, canCorrect: !blocker && hasFinancialPermission(user, rule.permission),
      history: history.map(event => ({ id: event.id, date: event.createdAt, actorId: event.actorId, actorName: event.after?.actorName || null, reason: event.after?.reason || null, before: event.before?.payment || null, after: event.after?.payment || null })) };
  }, { isolationLevel: 'RepeatableRead' });
}

/** Corrige la operación original completa. No crea otro pago ni altera documentos o cierres históricos. */
export async function correctExpensePayment(db, kind, id, input, actor) {
  const rule = config(kind);
  const requestId = String(input.requestId || '').trim();
  if (!requestId || requestId.length > 100) throw fail('PAYMENT_REQUEST_REQUIRED', 'Vuelve a abrir el pago para preparar la corrección.', 400);
  const reason = String(input.reason || '').trim();
  if (!reason || reason.length > 300) throw fail('PAYMENT_REASON_REQUIRED', 'Explica la corrección en un máximo de 300 caracteres.', 400);
  const amount = financialCents(input.amount);
  if (amount === null || amount <= 0) throw fail('PAYMENT_AMOUNT_INVALID', 'El valor debe ser positivo y tener como máximo dos decimales.', 400);
  const date = parseFinancialDateInput(input.paidAt);
  const accountId = String(input.accountId || '').trim();
  const reference = String(input.reference || '').trim() || null;
  const notes = String(input.notes || '').trim() || null;
  if ((reference?.length || 0) > 200 || (notes?.length || 0) > 1000) throw fail('PAYMENT_TEXT_TOO_LONG', 'La referencia admite 200 caracteres y las notas 1000.', 400);
  const fingerprint = hash({ expectedRevision: input.expectedRevision, amount, paidAt: input.paidAt, accountId, reference, notes, reason });
  try {
    return await db.$transaction(async tx => {
      const user = await authorize(tx, actor, rule.permission);
      const context = await load(tx, kind, id);
      const previous = await tx.financialAuditEvent.findFirst({ where: { entityType: rule.entity, entityId: id, after: { path: ['requestId'], equals: requestId } } });
      if (previous) {
        if (previous.actorId !== user.id || previous.after.fingerprint !== fingerprint || previous.after.revision !== context.revision) throw fail('PAYMENT_CORRECTION_CONFLICT', 'La corrección o el pago cambió. Actualiza antes de confirmar.');
        return { ok: true, replayed: true, outstanding: (context.total - context.paid) / 100 };
      }
      if (!input.expectedRevision || input.expectedRevision !== context.revision) throw fail('PAYMENT_CORRECTION_CONFLICT', 'El pago o su obligación cambió. Carga la versión actual y revisa la corrección.');
      if (context.blocker) throw fail('PAYMENT_CORRECTION_BLOCKED', context.blocker);
      const { payment, record, parent, siblings, total } = context;
      const otherPayments = siblings.filter(row => row.id !== id);
      const paidAfter = sum(otherPayments) + amount;
      if (!Number.isSafeInteger(paidAfter) || paidAfter > total) throw fail('PAYMENT_OVERPAYMENT', 'Los pagos superarían el valor de la obligación.');
      const account = await tx.financialAccount.findUnique({ where: { id: accountId } });
      if (!account?.isActive || account.currency !== 'COP') throw fail('PAYMENT_ACCOUNT_UNAVAILABLE', 'Selecciona una cuenta activa en pesos.');
      const old = parseFinancialDateInput(day(payment.paidAt));
      await assertOpenFinancialPeriod(tx, old.year, old.month);
      await assertOpenFinancialPeriod(tx, record.year, record.month);
      await assertOpenFinancialPeriod(tx, date.year, date.month);
      if (kind === 'payroll') await assertOpenFinancialPeriod(tx, parent.year, parent.month);
      const paymentData = { amount: financialAmountFromCents(amount), paidAt: date.date, accountId, reference, notes };
      await tx[rule.payment].update({ where: { id }, data: paymentData });
      const updatedRecord = await tx.financialRecord.update({ where: { id: record.id }, data: { amount: financialAmountFromCents(amount), date: date.date, year: date.year, month: date.month, accountId, reference, notes } });
      const status = kind === 'payroll' ? paidAfter === total ? 'PAID' : 'APPROVED' : payableStatusAfter({ amountCents: total, paidCents: paidAfter });
      const paidAt = kind === 'payroll' && status === 'PAID' ? [...otherPayments.map(row => new Date(row.paidAt)), date.date].sort((a, b) => b - a)[0] : null;
      await tx[rule.parent].update({ where: { id: parent.id }, data: { status, ...(kind === 'payroll' ? { paidAt } : {}) } });
      const after = await load(tx, kind, id);
      await tx.financialAuditEvent.create({ data: { entityType: 'FinancialRecord', entityId: record.id, action: 'UPDATE', before: clone(record), after: clone(updatedRecord), actorId: user.id } });
      await tx.financialAuditEvent.create({ data: { entityType: rule.entity, entityId: id, action: 'UPDATE', actorId: user.id,
        before: clone({ payment: fields(payment), parentStatus: parent.status, outstanding: (context.total - context.paid) / 100 }),
        after: clone({ operation: 'CORRECTION', payment: fields(after.payment), parentStatus: status, outstanding: (total - paidAfter) / 100, reason, actorName: user.name || null, requestId, fingerprint, revision: after.revision }) } });
      return { ok: true, outstanding: (total - paidAfter) / 100 };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (['P2034', 'P2002'].includes(error.code)) throw fail('PAYMENT_CORRECTION_CONFLICT', 'Otra persona cambió este pago. Actualiza antes de confirmar.');
    throw error;
  }
}
