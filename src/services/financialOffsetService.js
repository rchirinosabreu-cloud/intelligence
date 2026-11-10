import { createHash } from 'node:crypto';
import { financialCents, financialAmountFromCents as amountOf } from '../utils/financialMoney.js';
import { hasFinancialPermission } from '../utils/financialPermissions.js';
import { FinancialDomainError, assertOpenFinancialPeriod, parseFinancialDateInput } from './financialRecordService.js';
import { isReceivableClosed, receivableStatusAfter } from '../lib/receivableSettlement.js';
import { isPayableClosed, payableStatusAfter } from '../lib/accountsPayable.js';

const fail = (code, message, status = 409) => new FinancialDomainError(code, message, status);
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = value => String(value ?? '').trim();
const includeAR = { client: { select: { id: true, name: true } }, payments: { orderBy: { id: 'asc' } } };
const includeAP = { thirdParty: true, payments: { orderBy: { id: 'asc' } } };
const conflict = () => fail('OFFSET_CONFLICT', 'Las obligaciones o el cruce cambiaron. Actualiza los datos y vuelve a revisar antes de confirmar.');
function cents(value) {
  const result = financialCents(value);
  if (result === null) throw fail('OFFSET_BALANCE_REVIEW', 'Un importe requiere revisión de precisión antes de cruzar estas obligaciones.');
  return result;
}
function balance(row, closed) {
  const total = cents(row.amount);
  let applied = 0;
  for (const payment of row.payments.filter(p => !p.reversedAt)) {
    applied += cents(payment.amount);
    if (!Number.isSafeInteger(applied)) throw fail('OFFSET_BALANCE_REVIEW', 'El saldo excede la precisión admitida.');
  }
  if (total <= 0 || applied > total || (closed(row.status) && total !== applied)) throw fail('OFFSET_BALANCE_REVIEW', 'La obligación tiene un saldo histórico por verificar. Revísalo antes de cruzar.');
  return total - applied;
}
async function authorize(tx, actor, permission) {
  const user = await tx.user.findUnique({ where: { id: actor?.userId || actor?.id || '' } });
  if (!hasFinancialPermission(user, permission)) throw fail('FINANCIAL_ACCESS_DENIED', 'Tu acceso actual no permite esta operación financiera.', 403);
  return user;
}
function context(ar, ap) {
  if (!ar || !ap) throw fail('OFFSET_SOURCE_MISSING', 'No encontramos ambas obligaciones.', 404);
  if (ap.status === 'ANULADA') throw fail('OFFSET_SOURCE_VOIDED', 'La cuenta por pagar está anulada.');
  const receivableBalance = balance(ar, isReceivableClosed);
  const payableBalance = balance(ap, isPayableClosed);
  return { ar, ap, receivableBalance, payableBalance, revision: hash({ ar, ap }) };
}
async function load(tx, receivableId, payableId) {
  const ar = await tx.accountsReceivable.findUnique({ where: { id: receivableId }, include: includeAR });
  const ap = await tx.accountsPayable.findUnique({ where: { id: payableId }, include: includeAP });
  return context(ar, ap);
}
const summary = ctx => ({
  outstanding: amountOf(ctx.receivableBalance),
  receivable: { id: ctx.ar.id, label: ctx.ar.concept || ctx.ar.sourceLabel || 'Cuenta por cobrar', number: ctx.ar.number, clientName: ctx.ar.client?.name || ctx.ar.counterpartyName || ctx.ar.sourceLabel, amount: amountOf(cents(ctx.ar.amount)), outstanding: amountOf(ctx.receivableBalance), status: ctx.ar.status },
  payable: { id: ctx.ap.id, label: ctx.ap.concept, number: ctx.ap.documentNumber, thirdPartyName: ctx.ap.thirdParty.name, amount: amountOf(cents(ctx.ap.amount)), outstanding: amountOf(ctx.payableBalance), status: ctx.ap.status },
  revision: ctx.revision
});
function eligible(ctx) {
  const { ar, ap } = ctx;
  const sameParty = ar.kind === 'BENEFICIARIO' ? !!ar.beneficiaryThirdPartyId && ar.beneficiaryThirdPartyId === ap.thirdParty.id : ar.kind === 'CLIENTE' && !!ar.clientId && ap.thirdParty.clientId === ar.clientId;
  if (!sameParty) throw fail('OFFSET_PARTY_MISMATCH', 'Las obligaciones deben pertenecer a la misma persona vinculada en Terceros. Completa ese vínculo en Financiero → Terceros.');
  if (!ap.thirdParty.isActive) throw fail('OFFSET_PARTY_INACTIVE', 'El tercero de pago está inactivo. Revisa su ficha en Terceros.');
  if (ar.currency !== 'COP' || ap.currency !== 'COP') throw fail('OFFSET_CURRENCY_UNSUPPORTED', 'Este cruce requiere ambas obligaciones en COP. Las obligaciones en otra moneda necesitan una revisión de conversión.');
  if (!ctx.receivableBalance || !ctx.payableBalance) throw fail('OFFSET_SOURCE_CLOSED', 'Ambas obligaciones deben tener saldo pendiente.');
}
async function periods(tx, ctx, at) {
  const arPeriod = parseFinancialDateInput(new Date(ctx.ar.period).toISOString().slice(0, 10));
  const operation = parseFinancialDateInput(new Date(at).toISOString().slice(0, 10));
  for (const [year, month] of [[ctx.ar.year || arPeriod.year, ctx.ar.month || arPeriod.month], [ctx.ap.year, ctx.ap.month], [operation.year, operation.month]]) await assertOpenFinancialPeriod(tx, year, month);
}
async function transaction(db, work) {
  try { return await db.$transaction(work, { isolationLevel: 'Serializable' }); }
  catch (error) { if (['P2034', 'P2002'].includes(error.code)) throw conflict(); throw error; }
}
function request(input) {
  const reason = text(input.reason), requestId = text(input.requestId);
  if (!reason || reason.length > 300) throw fail('OFFSET_REASON_REQUIRED', 'Explica el motivo en un máximo de 300 caracteres.', 400);
  if (!requestId || requestId.length > 100 || !text(input.expectedRevision)) throw fail('OFFSET_REVIEW_REQUIRED', 'Vuelve a abrir el cruce para revisar los saldos antes de confirmar.', 400);
  return { reason, requestId };
}
async function audit(tx, ctx, after, operation, user, extra) {
  for (const [entityType, row] of [['AccountsReceivable', ctx.ar], ['AccountsPayable', ctx.ap]]) {
    await tx.financialAuditEvent.create({ data: { entityType, entityId: row.id, action: 'UPDATE', actorId: user.id, before: clone(summary(ctx)), after: clone({ ...summary(after), operation, actorName: user.name, ...extra }) } });
  }
}

/** Opciones por vínculo nativo, nunca por parecido de nombres. No modifica datos al leer. */
export async function offsetOptions(db, receivableId, actor) {
  return db.$transaction(async tx => {
    await authorize(tx, actor, 'read');
    const ar = await tx.accountsReceivable.findUnique({ where: { id: receivableId }, include: includeAR });
    if (!ar) throw fail('OFFSET_SOURCE_MISSING', 'No encontramos la cuenta por cobrar.', 404);
    const partyFilter = ar.kind === 'BENEFICIARIO' && ar.beneficiaryThirdPartyId ? { id: ar.beneficiaryThirdPartyId, isActive: true } : ar.clientId ? { clientId: ar.clientId, isActive: true } : null;
    const payableRows = partyFilter ? await tx.accountsPayable.findMany({ where: { thirdParty: partyFilter, status: { in: ['POR_PAGAR', 'PARCIAL'] } }, include: includeAP, orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }] }) : [];
    const options = [], unavailable = [];
    for (const ap of payableRows) {
      try { const ctx = context(ar, ap); eligible(ctx); options.push({ id: ap.id, ...summary(ctx) }); }
      catch (error) { if (!(error instanceof FinancialDomainError)) throw error; unavailable.push({ id: ap.id, label: ap.concept, reason: error.message }); }
    }
    return { options, unavailable, message: options.length ? null : 'No hay obligaciones aptas para cruzar. Revisa el vínculo cliente–proveedor en Terceros, los saldos y la moneda. Las compensaciones anteriores no se reaplican automáticamente.' };
  }, { isolationLevel: 'RepeatableRead' });
}

export async function createOffset(db, receivableId, input, actor) {
  const { reason, requestId } = request(input);
  const amount = cents(input.amount), authorizedBy = text(input.authorizedBy);
  if (amount <= 0 || !authorizedBy || authorizedBy.length > 120) throw fail('OFFSET_INVALID', 'Indica un importe positivo y quién autorizó el cruce (máximo 120 caracteres).', 400);
  const date = parseFinancialDateInput(input.settledAt);
  const payableId = text(input.payableId);
  const fingerprint = hash({ receivableId, payableId, amount, settledAt: date.date, authorizedBy, reason, expectedRevision: input.expectedRevision });
  return transaction(db, async tx => {
    const user = await authorize(tx, actor, 'write');
    const previous = await tx.payablePayment.findUnique({ where: { offsetRequestId: requestId }, include: { offsetReceivablePayment: true } });
    if (previous) {
      const payment = previous.offsetReceivablePayment;
      if (!payment || payment.createdById !== user.id || payment.detail?.fingerprint !== fingerprint || payment.reversedAt || previous.reversedAt) throw conflict();
      return { ...summary(await load(tx, receivableId, payableId)), payment, payablePayment: previous, replayed: true };
    }
    const ctx = await load(tx, receivableId, payableId);
    eligible(ctx);
    if (ctx.revision !== input.expectedRevision) throw conflict();
    if (amount > Math.min(ctx.receivableBalance, ctx.payableBalance)) throw fail('OFFSET_AMOUNT_EXCEEDS_BALANCE', 'El cruce no puede superar el saldo de ninguna de las dos obligaciones.');
    await periods(tx, ctx, date.date);
    const detail = { authorizedBy, offsetAgainst: ctx.ap.concept, offsetPayableId: payableId, fingerprint, requestId, actorName: user.name, before: summary(ctx) };
    const payment = await tx.receivablePayment.create({ data: { receivableId, kind: 'COMPENSACION', amount: amountOf(amount), paidAt: date.date, notes: reason, detail: clone(detail), createdById: user.id } });
    const payablePayment = await tx.payablePayment.create({ data: { payableId, kind: 'COMPENSACION', offsetReceivablePaymentId: payment.id, offsetRequestId: requestId, amount: amountOf(amount), paidAt: date.date, notes: reason, createdById: user.id } });
    await tx.accountsReceivable.update({ where: { id: receivableId }, data: { status: receivableStatusAfter({ outstandingCents: ctx.receivableBalance - amount, payments: [...ctx.ar.payments, payment], currentStatus: ctx.ar.status }) } });
    await tx.accountsPayable.update({ where: { id: payableId }, data: { status: payableStatusAfter({ amountCents: cents(ctx.ap.amount), paidCents: cents(ctx.ap.amount) - ctx.payableBalance + amount, hasSettlement: true }) } });
    const after = await load(tx, receivableId, payableId);
    await audit(tx, ctx, after, 'OFFSET', user, { paymentId: payment.id, payablePaymentId: payablePayment.id, reason, authorizedBy, requestId, fingerprint, amount: amountOf(amount), date: date.date });
    return { ...summary(after), payment, payablePayment };
  });
}

async function loadOffset(tx, id) {
  const payment = await tx.receivablePayment.findUnique({ where: { id }, include: { offsetPayablePayment: true, documents: { where: { voidedAt: null }, select: { id: true, name: true, mimeType: true, size: true } } } });
  const payablePayment = payment?.offsetPayablePayment;
  if (!payablePayment) throw fail('OFFSET_NOT_FOUND', 'Este ajuste no es un cruce vinculado. Los ajustes anteriores conservan su historial y su reversión original.', 404);
  if (payment.kind !== 'COMPENSACION' || payablePayment.kind !== 'COMPENSACION' || cents(payment.amount) !== cents(payablePayment.amount) || payment.accountId || payablePayment.accountId || payment.financialRecordId || payablePayment.financialRecordId || String(payment.paidAt) !== String(payablePayment.paidAt) || String(payment.reversedAt) !== String(payablePayment.reversedAt)) throw fail('OFFSET_INCONSISTENT', 'Los dos lados del cruce requieren revisión antes de revertir.');
  return { ctx: await load(tx, payment.receivableId, payablePayment.payableId), payment, payablePayment };
}

async function legacyPayment(tx, id) {
  const payment = await tx.receivablePayment.findUnique({ where: { id }, include: { offsetPayablePayment: true } });
  if (!payment || payment.kind !== 'COMPENSACION' || payment.reversedAt || payment.offsetPayablePayment || payment.accountId || payment.financialRecordId || cents(payment.amount) <= 0) throw fail('OFFSET_LEGACY_UNAVAILABLE', 'Esta compensación ya está vinculada, fue revertida o necesita revisión. Actualiza su detalle.');
  return payment;
}
function legacyEligible(ctx, payment) {
  eligible({ ...ctx, receivableBalance: cents(payment.amount) });
  if (ctx.payableBalance < cents(payment.amount)) throw fail('OFFSET_AMOUNT_EXCEEDS_BALANCE', 'La cuenta por pagar no tiene saldo suficiente para la compensación histórica completa. Revisa sus pagos antes de vincular.');
}
export async function legacyOffsetOptions(db, paymentId, actor) {
  return db.$transaction(async tx => {
    await authorize(tx, actor, 'read');
    const payment = await legacyPayment(tx, paymentId);
    const ar = await tx.accountsReceivable.findUnique({ where: { id: payment.receivableId }, include: includeAR });
    const filter = ar.kind === 'BENEFICIARIO' ? { id: ar.beneficiaryThirdPartyId || '' } : { clientId: ar.clientId || '' };
    const rows = await tx.accountsPayable.findMany({ where: { thirdParty: { ...filter, isActive: true }, status: { in: ['POR_PAGAR', 'PARCIAL'] } }, include: includeAP, orderBy: { id: 'asc' } });
    const options = [], unavailable = [];
    for (const ap of rows) {
      try { const ctx = context(ar, ap); legacyEligible(ctx, payment); options.push({ id: ap.id, ...summary(ctx) }); }
      catch (error) { if (!(error instanceof FinancialDomainError)) throw error; unavailable.push({ id: ap.id, label: ap.concept, reason: error.message }); }
    }
    return { payment: { id: payment.id, amount: amountOf(cents(payment.amount)), paidAt: payment.paidAt, authorizedBy: payment.detail?.authorizedBy }, options, unavailable, message: options.length ? null : 'No hay contrapartida disponible. Revisa en Terceros el vínculo con el cliente y en Por pagar el saldo de la obligación.' };
  }, { isolationLevel: 'RepeatableRead' });
}
export async function linkLegacyOffset(db, paymentId, input, actor) {
  const { reason, requestId } = request(input), fingerprint = hash({ paymentId, input });
  return transaction(db, async tx => {
    const user = await authorize(tx, actor, 'write');
    const prior = await tx.payablePayment.findUnique({ where: { offsetRequestId: requestId }, include: { offsetReceivablePayment: true } });
    if (prior) {
      const original = prior.offsetReceivablePayment;
      if (original?.id !== paymentId || original.detail?.legacyLink?.fingerprint !== fingerprint || prior.createdById !== user.id || prior.reversedAt) throw conflict();
      return { ...summary(await load(tx, original.receivableId, prior.payableId)), replayed: true };
    }
    const payment = await legacyPayment(tx, paymentId), ctx = await load(tx, payment.receivableId, text(input.payableId));
    const authorizedBy = text(input.authorizedBy || payment.detail?.authorizedBy);
    if (!authorizedBy || authorizedBy.length > 120) throw fail('OFFSET_INVALID', 'Confirma quién autorizó la contrapartida de este cruce (máximo 120 caracteres).', 400);
    legacyEligible(ctx, payment);
    if (ctx.revision !== input.expectedRevision) throw conflict();
    await periods(tx, ctx, payment.paidAt);
    const payablePayment = await tx.payablePayment.create({ data: { payableId: ctx.ap.id, kind: 'COMPENSACION', offsetReceivablePaymentId: payment.id, offsetRequestId: requestId, amount: payment.amount, paidAt: payment.paidAt, notes: reason, createdById: user.id } });
    const updated = await tx.receivablePayment.update({ where: { id: payment.id }, data: { detail: clone({ ...payment.detail, offsetPayableId: ctx.ap.id, legacyLink: { fingerprint, requestId, reason, authorizedBy, actorId: user.id, actorName: user.name, at: new Date() } }) } });
    await tx.accountsPayable.update({ where: { id: ctx.ap.id }, data: { status: payableStatusAfter({ amountCents: cents(ctx.ap.amount), paidCents: cents(ctx.ap.amount) - ctx.payableBalance + cents(payment.amount), hasSettlement: true }) } });
    const after = await load(tx, payment.receivableId, ctx.ap.id);
    await audit(tx, ctx, after, 'LEGACY_OFFSET_LINKED', user, { paymentId, payablePaymentId: payablePayment.id, reason, requestId, originalPayment: clone(payment) });
    return { ...summary(after), payment: updated, payablePayment };
  });
}
export async function readOffset(db, id, actor) {
  return db.$transaction(async tx => {
    const user = await authorize(tx, actor, 'read');
    const { ctx, payment, payablePayment } = await loadOffset(tx, id);
    const history = hasFinancialPermission(user, 'admin') ? await tx.financialAuditEvent.findMany({ where: { entityType: 'AccountsReceivable', entityId: ctx.ar.id, after: { path: ['paymentId'], equals: id } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) : [];
    const authorIds = [...new Set([payment.createdById, ...history.map(event => event.actorId)].filter(Boolean))];
    const names = new Map((authorIds.length ? await tx.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } }) : []).map(author => [author.id, author.name]));
    return { ...summary(ctx), payment: { ...payment, createdByName: names.get(payment.createdById) || null }, payablePayment, canReverse: !payment.reversedAt && hasFinancialPermission(user, 'write'), history: history.map(event => ({ ...event, actorName: names.get(event.actorId) || null })) };
  }, { isolationLevel: 'RepeatableRead' });
}
export async function reverseOffset(db, id, input, actor) {
  const { reason, requestId } = request(input);
  const fingerprint = hash({ id, reason, expectedRevision: input.expectedRevision });
  return transaction(db, async tx => {
    const user = await authorize(tx, actor, 'write');
    const { ctx, payment, payablePayment } = await loadOffset(tx, id);
    const previous = await tx.financialAuditEvent.findFirst({ where: { entityType: 'AccountsReceivable', entityId: ctx.ar.id, after: { path: ['requestId'], equals: requestId } } });
    if (previous) {
      if (previous.after.operation !== 'OFFSET_REVERSE' || previous.actorId !== user.id || previous.after.fingerprint !== fingerprint || !payment.reversedAt) throw conflict();
      return { ...summary(ctx), replayed: true };
    }
    if (payment.reversedAt || input.expectedRevision !== ctx.revision) throw conflict();
    await periods(tx, ctx, payment.paidAt);
    const reversal = { reversedAt: new Date(), reversedById: user.id, reversalReason: reason };
    await tx.receivablePayment.update({ where: { id }, data: reversal });
    await tx.payablePayment.update({ where: { id: payablePayment.id }, data: reversal });
    const arPayments = ctx.ar.payments.filter(row => row.id !== id);
    const apPayments = ctx.ap.payments.filter(row => row.id !== payablePayment.id && !row.reversedAt);
    const amount = cents(payment.amount);
    await tx.accountsReceivable.update({ where: { id: ctx.ar.id }, data: { status: receivableStatusAfter({ outstandingCents: ctx.receivableBalance + amount, payments: arPayments, currentStatus: ctx.ar.status }) } });
    await tx.accountsPayable.update({ where: { id: ctx.ap.id }, data: { status: payableStatusAfter({ amountCents: cents(ctx.ap.amount), paidCents: cents(ctx.ap.amount) - ctx.payableBalance - amount, hasSettlement: apPayments.some(row => row.kind === 'COMPENSACION') }) } });
    const after = await load(tx, ctx.ar.id, ctx.ap.id);
    await audit(tx, ctx, after, 'OFFSET_REVERSE', user, { paymentId: id, payablePaymentId: payablePayment.id, reason, requestId, fingerprint, amount: amountOf(amount), date: reversal.reversedAt });
    return summary(after);
  });
}
