import { randomUUID } from 'node:crypto';
import {
  assertOpenFinancialPeriod,
  FinancialDomainError,
  parseFinancialDateInput
} from './financialRecordService.js';
import { financialAmountFromCents, financialCents } from '../utils/financialMoney.js';

const toNumber = (value) => {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
};

const normalizePeriod = (input = {}) => {
  const year = Number.parseInt(input.year, 10);
  const month = Number.parseInt(input.month, 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new FinancialDomainError('PAYROLL_PERIOD_INVALID', 'El periodo de nomina no es valido.');
  }
  return { year, month };
};

const actorIdFrom = (actor) => actor?.id || actor?.userId || null;

export const generatePayrollPeriod = async (prismaClient, input, actor) => {
  const { year, month } = normalizePeriod(input);
  const periodStart = new Date(Date.UTC(year, month - 1, 1, 12));
  const periodEnd = new Date(Date.UTC(year, month, 0, 12));
  const actorId = actorIdFrom(actor);

  return prismaClient.$transaction(async (tx) => {
    await assertOpenFinancialPeriod(tx, year, month);
    const activeImportBatch = await tx.financialImportBatch.findFirst({
      where: { year, status: 'IMPORTED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    });
    const contracts = await tx.payrollContract.findMany({
      where: {
        AND: [
          {
            startDate: { lte: periodEnd },
            OR: [{ endDate: null }, { endDate: { gte: periodStart } }]
          },
          activeImportBatch
            ? { OR: [{ importBatchId: activeImportBatch.id }, { importBatchId: null }] }
            : { importBatchId: null }
        ]
      },
      include: { collaborator: { select: { displayName: true } } }
    });

    const transactions = [];
    for (const contract of contracts) {
      const baseSalary = toNumber(contract.baseSalary);
      const socialSecurity = toNumber(contract.socialSecurity);
      const grossAmount = baseSalary + socialSecurity;
      const transaction = await tx.payrollTransaction.upsert({
        where: { contractId_month_year: { contractId: contract.id, month, year } },
        update: {},
        create: {
          userId: contract.userId || null,
          contractId: contract.id,
          month,
          year,
          baseSalary,
          socialSecurity,
          grossAmount,
          deductions: 0,
          netAmount: grossAmount,
          status: 'DRAFT'
        }
      });
      transactions.push(transaction);
    }

    await tx.financialAuditEvent.create({
      data: {
        entityType: 'PayrollPeriod',
        entityId: `${year}-${String(month).padStart(2, '0')}`,
        action: 'CREATE',
        after: { transactionIds: transactions.map((transaction) => transaction.id) },
        actorId
      }
    });
    return { year, month, transactions };
  });
};

export const approvePayrollTransaction = async (prismaClient, transactionId, actor) => {
  const actorId = actorIdFrom(actor);
  return prismaClient.$transaction(async (tx) => {
    const existing = await tx.payrollTransaction.findUnique({ where: { id: transactionId } });
    if (!existing) throw new FinancialDomainError('PAYROLL_TRANSACTION_NOT_FOUND', 'La liquidacion no existe.', 404);
    if (existing.status === 'PAID') throw new FinancialDomainError('PAYROLL_ALREADY_PAID', 'La liquidacion ya fue pagada.', 409);
    await assertOpenFinancialPeriod(tx, existing.year, existing.month);
    const transaction = await tx.payrollTransaction.update({
      where: { id: transactionId },
      data: { status: 'APPROVED', approvedAt: new Date() }
    });
    await tx.financialAuditEvent.create({
      data: { entityType: 'PayrollTransaction', entityId: transactionId, action: 'POST', before: existing, after: transaction, actorId }
    });
    return transaction;
  });
};

// ---------------------------------------------------------------------------------------
// Pagos de una liquidación (Rodny, 30 de septiembre de 2026: «ese pago se hizo el 15 y el 30
// y antes se le hicieron adelantos … necesito poder editar el pago para partirlo y subir las
// referencias»). Como los abonos de Cartera: una liquidación recibe varios pagos, cada uno con
// su propio egreso, su fecha, su cuenta y su referencia, y queda pagada cuando suman el neto.
// Un pago no se edita en su dinero: se parte, o se revierte y se vuelve a registrar. Los
// comprobantes van en el egreso de cada pago (FinancialRecordDocument).
// ---------------------------------------------------------------------------------------

export const PAYROLL_REVERSAL_REASON_MAX = 300;
export const PAYROLL_REFERENCE_MAX = 200;
export const PAYROLL_NOTES_MAX = 1000;
export const PAYROLL_SPLIT_MAX_PARTS = 12;

const cloneForAudit = (value) => JSON.parse(JSON.stringify(value ?? null));
const pesos = (cents) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(cents / 100);
const optionalText = (value, max, code, label) => {
  const text = String(value ?? '').trim();
  if (text.length > max) throw new FinancialDomainError(code, `${label} admite como máximo ${max} caracteres.`);
  return text || null;
};
const amountCentsOf = (value, code = 'PAYROLL_PAYMENT_AMOUNT_INVALID') => {
  const cents = financialCents(value);
  if (cents === null || cents <= 0) {
    throw new FinancialDomainError(code, 'El valor del pago debe ser positivo y tener como máximo dos decimales.');
  }
  return cents;
};
const requireAccountId = (value) => {
  const accountId = String(value || '').trim();
  if (!accountId) throw new FinancialDomainError('PAYROLL_ACCOUNT_REQUIRED', 'Selecciona la cuenta desde la cual se pagó la nómina.');
  return accountId;
};
const assertActiveAccount = async (tx, accountId) => {
  const account = await tx.financialAccount.findUnique({ where: { id: accountId } });
  if (!account?.isActive) throw new FinancialDomainError('PAYROLL_ACCOUNT_UNAVAILABLE', 'Selecciona una cuenta de caja o banco activa.', 409);
  if (account.currency && account.currency !== 'COP') {
    throw new FinancialDomainError('PAYROLL_ACCOUNT_CURRENCY_UNSUPPORTED', 'La nómina se paga desde una cuenta en pesos.', 409);
  }
  return account;
};

const loadTransaction = async (tx, transactionId) => {
  const transaction = await tx.payrollTransaction.findUnique({
    where: { id: transactionId },
    include: { contract: { include: { collaborator: { select: { displayName: true } } } } }
  });
  if (!transaction) throw new FinancialDomainError('PAYROLL_TRANSACTION_NOT_FOUND', 'La liquidación no existe.', 404);
  return transaction;
};

const activePaymentsOf = async (tx, transactionId) => (await tx.payrollPayment.findMany({ where: { transactionId } }))
  .filter((payment) => !payment.reversedAt);

const sumCents = (payments) => payments.reduce((total, payment) => {
  const cents = financialCents(payment.amount);
  if (cents === null || !Number.isSafeInteger(total + cents)) {
    throw new FinancialDomainError('PAYROLL_BALANCE_INVALID', 'Los pagos de esta liquidación requieren revisión antes de registrar otro.', 409);
  }
  return total + cents;
}, 0);

const netCentsOf = (transaction) => {
  const cents = financialCents(toNumber(transaction.netAmount));
  if (cents === null || cents <= 0) throw new FinancialDomainError('PAYROLL_BALANCE_INVALID', 'El neto de la liquidación requiere revisión antes de pagarla.', 409);
  return cents;
};

// Pagada cuando los pagos vigentes cubren el neto, con la fecha del último; si deja de estar
// cubierta vuelve a «Aprobada». Nunca se inventa un pago para cuadrarla.
const settleTransaction = async (tx, transaction, payments) => {
  const netCents = netCentsOf(transaction);
  const paidCents = sumCents(payments);
  if (paidCents > netCents) throw new FinancialDomainError('PAYROLL_OVERPAYMENT', 'Los pagos superan el neto de la liquidación.', 409);
  const outstandingCents = netCents - paidCents;
  const lastPaidAt = payments.map((payment) => new Date(payment.paidAt)).sort((a, b) => b - a)[0] || null;
  const data = outstandingCents === 0
    ? { status: 'PAID', paidAt: lastPaidAt }
    : { status: 'APPROVED', paidAt: null };
  const updated = await tx.payrollTransaction.update({ where: { id: transaction.id }, data });
  return { transaction: updated, outstanding: financialAmountFromCents(outstandingCents) };
};

const collaboratorNameOf = (transaction) => transaction.contract?.collaborator?.displayName || transaction.contract?.sourceLabel || 'Colaborador';

const createPaymentWithRecord = async (tx, transaction, part, actorId, extraMetadata = {}) => {
  const { date: paidAt, year, month } = parseFinancialDateInput(part.paidAt);
  await assertOpenFinancialPeriod(tx, year, month);
  const amount = financialAmountFromCents(part.amountCents);
  const paymentId = `payroll-payment:${randomUUID()}`;
  const financialRecord = await tx.financialRecord.create({
    data: {
      amount,
      category: 'NOMINA',
      type: 'EXPENSE',
      section: 'ADMIN_COST',
      date: paidAt,
      year,
      month,
      userId: part.userId ?? transaction.userId ?? null,
      createdById: actorId,
      accountId: part.accountId,
      description: `Pago de nómina: ${collaboratorNameOf(transaction)}`,
      scenario: 'ACTUAL',
      status: 'POSTED',
      origin: 'SYSTEM',
      isProjection: false,
      reference: part.reference,
      notes: part.notes,
      postedAt: new Date(),
      metadata: { payrollTransactionId: transaction.id, payrollPaymentId: paymentId, ...extraMetadata }
    }
  });
  const payment = await tx.payrollPayment.create({
    data: {
      id: paymentId,
      transactionId: transaction.id,
      accountId: part.accountId,
      financialRecordId: financialRecord.id,
      amount,
      paidAt,
      reference: part.reference,
      notes: part.notes,
      createdById: actorId
    }
  });
  return { payment, financialRecord };
};

const serializableConflict = (error, message) => {
  if (error?.code === 'P2034' || error?.code === 'P2002') {
    throw new FinancialDomainError('PAYROLL_PAYMENT_CONFLICT', message, 409);
  }
  throw error;
};

// Un egreso que ya se registró a mano (un adelanto, por ejemplo) se aplica a la liquidación en
// vez de crear otro: si no, el mismo dinero saldría dos veces del libro.
const isApplicablePayrollRecord = (record) => Boolean(
  record && record.status === 'POSTED' && record.scenario === 'ACTUAL' && record.isProjection !== true &&
  record.type === 'EXPENSE' && record.category === 'NOMINA' && record.origin !== 'SYSTEM' &&
  !record.receivablePayment && !record.payrollTransaction && !record.payrollPayment
);
const incompatibleRecord = () => new FinancialDomainError(
  'PAYROLL_PAYMENT_RECORD_INCOMPATIBLE',
  'Solo se puede aplicar un egreso de categoría Nómina, registrado a mano, vigente y que no esté aplicado a otro pago. Si el adelanto tiene otra categoría, cámbiala primero en Movimientos.',
  409
);

export const payPayrollTransaction = async (prismaClient, transactionId, input = {}, actor) => {
  const actorId = actorIdFrom(actor);
  const financialRecordId = String(input.financialRecordId || '').trim() || null;
  const reference = optionalText(input.reference, PAYROLL_REFERENCE_MAX, 'PAYROLL_REFERENCE_TOO_LONG', 'La referencia');
  const notes = optionalText(input.notes, PAYROLL_NOTES_MAX, 'PAYROLL_NOTES_TOO_LONG', 'La nota');
  const hasAmount = input.amount !== undefined && input.amount !== null && String(input.amount).trim() !== '';
  const requestedCents = hasAmount ? amountCentsOf(input.amount) : null;
  const accountId = financialRecordId ? null : requireAccountId(input.accountId);
  const paidAtInput = financialRecordId ? null : input.paidAt;
  if (!financialRecordId) parseFinancialDateInput(paidAtInput);

  try {
    return await prismaClient.$transaction(async (tx) => {
      const existing = await loadTransaction(tx, transactionId);
      if (existing.status === 'PAID') throw new FinancialDomainError('PAYROLL_ALREADY_PAID', 'La liquidación ya está pagada. Para cambiar un pago, desglósalo o reviértelo.', 409);
      if (existing.status !== 'APPROVED') throw new FinancialDomainError('PAYROLL_NOT_APPROVED', 'La liquidación debe aprobarse antes de pagarla.', 409);
      const payments = await activePaymentsOf(tx, transactionId);
      const outstandingCents = netCentsOf(existing) - sumCents(payments);

      let payment;
      let financialRecord;
      if (financialRecordId) {
        const record = await tx.financialRecord.findUnique({
          where: { id: financialRecordId },
          include: { receivablePayment: { select: { id: true } }, payrollTransaction: { select: { id: true } }, payrollPayment: { select: { id: true } } }
        });
        if (!isApplicablePayrollRecord(record)) throw incompatibleRecord();
        const recordCents = financialCents(toNumber(record.amount));
        if (recordCents === null || recordCents <= 0) throw incompatibleRecord();
        if (requestedCents !== null && requestedCents !== recordCents) throw incompatibleRecord();
        if (recordCents > outstandingCents) {
          throw new FinancialDomainError('PAYROLL_OVERPAYMENT', `Ese egreso es de $ ${pesos(recordCents)} y a la liquidación le faltan $ ${pesos(outstandingCents)}.`, 409);
        }
        await assertOpenFinancialPeriod(tx, record.year, record.month);
        financialRecord = record;
        payment = await tx.payrollPayment.create({
          data: {
            id: `payroll-payment:${randomUUID()}`,
            transactionId,
            accountId: record.accountId || null,
            financialRecordId: record.id,
            amount: financialAmountFromCents(recordCents),
            paidAt: record.date,
            reference: reference ?? record.reference ?? null,
            notes,
            createdById: actorId
          }
        });
      } else {
        const amountCents = requestedCents ?? outstandingCents;
        if (amountCents <= 0) throw new FinancialDomainError('PAYROLL_ALREADY_PAID', 'La liquidación ya está cubierta.', 409);
        if (amountCents > outstandingCents) {
          throw new FinancialDomainError('PAYROLL_OVERPAYMENT', `El pago supera lo que falta por pagar: $ ${pesos(outstandingCents)}.`, 409);
        }
        await assertActiveAccount(tx, accountId);
        ({ payment, financialRecord } = await createPaymentWithRecord(tx, existing, { amountCents, paidAt: paidAtInput, accountId, reference, notes }, actorId));
      }

      const settled = await settleTransaction(tx, existing, [...payments, payment]);
      await tx.financialAuditEvent.create({
        data: {
          entityType: 'PayrollTransaction',
          entityId: transactionId,
          action: 'PAYMENT',
          before: cloneForAudit({ status: existing.status, paidAt: existing.paidAt, outstanding: financialAmountFromCents(outstandingCents) }),
          after: cloneForAudit({ status: settled.transaction.status, paidAt: settled.transaction.paidAt, outstanding: settled.outstanding, paymentId: payment.id, financialRecordId: financialRecord.id, appliedExistingExpense: Boolean(financialRecordId) }),
          actorId
        }
      });
      return { transaction: settled.transaction, payment, financialRecord, outstanding: settled.outstanding };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    return serializableConflict(error, 'Otro proceso modificó esta liquidación. Actualiza la nómina y vuelve a intentarlo.');
  }
};

/** Egresos registrados a mano que se pueden aplicar a una liquidación: adelantos ya pagados. */
export const listPayrollPaymentCandidates = async (prismaClient, transactionId) => {
  const transaction = await loadTransaction(prismaClient, transactionId);
  const payments = await activePaymentsOf(prismaClient, transactionId);
  const outstandingCents = netCentsOf(transaction) - sumCents(payments);
  const records = await prismaClient.financialRecord.findMany({
    where: { type: 'EXPENSE', category: 'NOMINA', status: 'POSTED', scenario: 'ACTUAL', year: transaction.year, origin: { not: 'SYSTEM' } },
    include: { receivablePayment: { select: { id: true } }, payrollTransaction: { select: { id: true } }, payrollPayment: { select: { id: true } } },
    orderBy: [{ date: 'desc' }]
  });
  return records
    .filter((record) => isApplicablePayrollRecord(record))
    .filter((record) => {
      const cents = financialCents(toNumber(record.amount));
      return cents !== null && cents > 0 && cents <= outstandingCents;
    })
    .map((record) => ({
      id: record.id,
      amount: toNumber(record.amount),
      date: record.date,
      description: record.description || record.sourceLabel || 'Egreso de nómina',
      reference: record.reference || null,
      accountId: record.accountId || null
    }));
};

const loadPayment = async (tx, paymentId) => {
  const payment = await tx.payrollPayment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new FinancialDomainError('PAYROLL_PAYMENT_NOT_FOUND', 'El pago no existe.', 404);
  if (payment.reversedAt) throw new FinancialDomainError('PAYROLL_PAYMENT_ALREADY_REVERSED', 'Este pago ya fue revertido.', 409);
  return payment;
};

// Suelta el egreso de un pago: el que creó la plataforma se anula (ese dinero lo cuentan ahora
// otros pagos, o ya no salió); el registrado a mano se conserva intacto y queda libre.
const releasePaymentRecord = async (tx, payment, transaction, voidReason, actorId) => {
  const record = payment.financialRecordId ? await tx.financialRecord.findUnique({ where: { id: payment.financialRecordId } }) : null;
  let voidedRecord = null;
  if (record) {
    await assertOpenFinancialPeriod(tx, record.year, record.month);
    if (record.origin === 'SYSTEM' && record.status !== 'VOIDED') {
      voidedRecord = await tx.financialRecord.update({
        where: { id: record.id },
        data: { status: 'VOIDED', voidedAt: new Date(), voidReason }
      });
      await tx.financialAuditEvent.create({
        data: { entityType: 'FinancialRecord', entityId: record.id, action: 'VOID', before: cloneForAudit(record), after: cloneForAudit(voidedRecord), actorId }
      });
    }
  }
  // El vínculo único de antes (un solo pago por liquidación) se suelta si apuntaba aquí.
  if (record && transaction.financialRecordId === record.id) {
    await tx.payrollTransaction.update({ where: { id: transaction.id }, data: { financialRecordId: null } });
    transaction.financialRecordId = null;
  }
  return { record, voidedRecord };
};

export const reversePayrollPayment = async (prismaClient, paymentId, input = {}, actor) => {
  const reason = String(input.reason || '').trim();
  if (!reason) throw new FinancialDomainError('PAYROLL_PAYMENT_REVERSAL_REASON_REQUIRED', 'Explica por qué se revierte el pago.');
  if (reason.length > PAYROLL_REVERSAL_REASON_MAX) {
    throw new FinancialDomainError('PAYROLL_PAYMENT_REVERSAL_REASON_TOO_LONG', `El motivo admite como máximo ${PAYROLL_REVERSAL_REASON_MAX} caracteres.`);
  }
  const actorId = actorIdFrom(actor);
  try {
    return await prismaClient.$transaction(async (tx) => {
      const payment = await loadPayment(tx, paymentId);
      const transaction = await loadTransaction(tx, payment.transactionId);
      const { record, voidedRecord } = await releasePaymentRecord(tx, payment, transaction, `Reversión del pago de nómina: ${reason}`, actorId);
      const reversed = await tx.payrollPayment.update({
        where: { id: paymentId },
        data: { reversedAt: new Date(), reversalReason: reason, reversedById: actorId, financialRecordId: null }
      });
      const remaining = (await activePaymentsOf(tx, transaction.id)).filter((other) => other.id !== paymentId);
      const settled = await settleTransaction(tx, transaction, remaining);
      await tx.financialAuditEvent.create({
        data: {
          entityType: 'PayrollPayment',
          entityId: paymentId,
          action: 'VOID',
          before: cloneForAudit(payment),
          after: cloneForAudit({ reversalReason: reason, transactionStatus: settled.transaction.status, outstanding: settled.outstanding, voidedFinancialRecordId: voidedRecord?.id || null, unlinkedFinancialRecordId: voidedRecord ? null : (record?.id || null) }),
          actorId
        }
      });
      return { payment: reversed, transaction: settled.transaction, outstanding: settled.outstanding };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    return serializableConflict(error, 'Otro proceso modificó este pago. Actualiza la nómina y vuelve a intentarlo.');
  }
};

/**
 * Parte un pago en varios (el adelanto, la quincena del 15, la del 30), cada uno con su fecha,
 * cuenta y referencia. Las partes suman exactamente el pago: el total de la liquidación no
 * cambia. El pago original y su egreso se conservan como evidencia, revertido y anulado.
 */
export const splitPayrollPayment = async (prismaClient, paymentId, input = {}, actor) => {
  const rawParts = Array.isArray(input.parts) ? input.parts : [];
  if (rawParts.length < 2) throw new FinancialDomainError('PAYROLL_SPLIT_PARTS_REQUIRED', 'Para desglosar un pago hacen falta al menos dos ítems.');
  if (rawParts.length > PAYROLL_SPLIT_MAX_PARTS) throw new FinancialDomainError('PAYROLL_SPLIT_TOO_MANY_PARTS', `Un pago se desglosa en como máximo ${PAYROLL_SPLIT_MAX_PARTS} ítems.`);
  const parts = rawParts.map((part) => {
    const amountCents = amountCentsOf(part?.amount);
    const accountId = requireAccountId(part?.accountId);
    parseFinancialDateInput(part?.paidAt);
    return {
      amountCents,
      accountId,
      paidAt: part.paidAt,
      reference: optionalText(part?.reference, PAYROLL_REFERENCE_MAX, 'PAYROLL_REFERENCE_TOO_LONG', 'La referencia'),
      notes: optionalText(part?.notes, PAYROLL_NOTES_MAX, 'PAYROLL_NOTES_TOO_LONG', 'La nota')
    };
  });
  const actorId = actorIdFrom(actor);
  try {
    return await prismaClient.$transaction(async (tx) => {
      const payment = await loadPayment(tx, paymentId);
      const paymentCents = financialCents(toNumber(payment.amount));
      const partsCents = parts.reduce((total, part) => total + part.amountCents, 0);
      if (partsCents !== paymentCents) {
        throw new FinancialDomainError('PAYROLL_SPLIT_TOTAL_MISMATCH', `Los ítems suman $ ${pesos(partsCents)} y el pago es de $ ${pesos(paymentCents)}. Tienen que sumar lo mismo.`);
      }
      const record = payment.financialRecordId ? await tx.financialRecord.findUnique({ where: { id: payment.financialRecordId } }) : null;
      if (!record || record.origin !== 'SYSTEM') {
        throw new FinancialDomainError('PAYROLL_SPLIT_NOT_SYSTEM', 'Este pago es un egreso que se registró a mano en Movimientos. Para cambiarlo, usa «Revertir» aquí y corrígelo desde Movimientos.', 409);
      }
      const transaction = await loadTransaction(tx, payment.transactionId);
      for (const part of parts) await assertActiveAccount(tx, part.accountId);
      await releasePaymentRecord(tx, payment, transaction, `Desglosado en ${parts.length} pagos`, actorId);
      await tx.payrollPayment.update({
        where: { id: paymentId },
        data: { reversedAt: new Date(), reversalReason: `Desglosado en ${parts.length} pagos`, reversedById: actorId, financialRecordId: null }
      });
      const created = [];
      for (const part of parts) {
        created.push(await createPaymentWithRecord(tx, transaction, { ...part, userId: record.userId ?? transaction.userId ?? null }, actorId, { splitFromPaymentId: paymentId }));
      }
      const remaining = (await activePaymentsOf(tx, transaction.id)).filter((other) => other.id !== paymentId);
      const settled = await settleTransaction(tx, transaction, remaining);
      await tx.financialAuditEvent.create({
        data: {
          entityType: 'PayrollPayment',
          entityId: paymentId,
          // FinancialAuditAction no tiene «SPLIT» y ampliarlo exigiría tocar el tipo en la
          // base; la operación va nombrada dentro del evento.
          action: 'UPDATE',
          before: cloneForAudit(payment),
          after: cloneForAudit({ operation: 'SPLIT', parts: created.map(({ payment: part }) => ({ id: part.id, amount: part.amount, paidAt: part.paidAt, accountId: part.accountId, reference: part.reference })), voidedFinancialRecordId: record.id }),
          actorId
        }
      });
      return { payments: created.map(({ payment: part }) => part), transaction: settled.transaction, outstanding: settled.outstanding };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    return serializableConflict(error, 'Otro proceso modificó este pago. Actualiza la nómina y vuelve a intentarlo.');
  }
};

/** Corrige la referencia y la nota de un pago y de su egreso. El dinero no se toca. */
export const updatePayrollPayment = async (prismaClient, paymentId, input = {}, actor) => {
  const data = {};
  if (input.reference !== undefined) data.reference = optionalText(input.reference, PAYROLL_REFERENCE_MAX, 'PAYROLL_REFERENCE_TOO_LONG', 'La referencia');
  if (input.notes !== undefined) data.notes = optionalText(input.notes, PAYROLL_NOTES_MAX, 'PAYROLL_NOTES_TOO_LONG', 'La nota');
  if (Object.keys(data).length === 0) throw new FinancialDomainError('PAYROLL_PAYMENT_NO_CHANGES', 'No hay cambios para guardar.');
  const actorId = actorIdFrom(actor);
  return prismaClient.$transaction(async (tx) => {
    const payment = await loadPayment(tx, paymentId);
    const updated = await tx.payrollPayment.update({ where: { id: paymentId }, data });
    if (payment.financialRecordId) await tx.financialRecord.update({ where: { id: payment.financialRecordId }, data });
    await tx.financialAuditEvent.create({
      data: { entityType: 'PayrollPayment', entityId: paymentId, action: 'UPDATE', before: cloneForAudit({ reference: payment.reference, notes: payment.notes }), after: cloneForAudit(data), actorId }
    });
    return updated;
  });
};
