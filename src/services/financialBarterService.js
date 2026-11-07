import { createHash } from 'node:crypto';
import { financialCents, financialAmountFromCents as amountOf } from '../utils/financialMoney.js';
import { hasFinancialPermission } from '../utils/financialPermissions.js';
import { FinancialDomainError, assertOpenFinancialPeriod, parseFinancialDateInput } from './financialRecordService.js';
import { outstandingCentsOf } from './receivablePaymentService.js';
import { receivableStatusAfter, isReceivableClosed } from '../lib/receivableSettlement.js';

const text = v => String(v ?? '').trim();
const clone = v => JSON.parse(JSON.stringify(v));
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = (code, message, status = 409) => new FinancialDomainError(code, message, status);
const conflict = () => fail('BARTER_CONFLICT', 'El canje o sus saldos cambiaron. Actualiza y revisa antes de confirmar.');
const include = { client: { select: { id: true, name: true } }, payments: { orderBy: { id: 'asc' } } };
async function authorize(tx, actor, permission) {
  const user = await tx.user.findUnique({ where: { id: actor?.userId || actor?.id || '' } });
  if (!hasFinancialPermission(user, permission)) throw fail('FINANCIAL_ACCESS_DENIED', 'Tu acceso actual no permite esta operación financiera.', 403);
  return user;
}
async function atomic(db, work, read = false) {
  try { return await db.$transaction(work, { isolationLevel: read ? 'RepeatableRead' : 'Serializable' }); }
  catch (error) { if (['P2034', 'P2002'].includes(error.code)) throw conflict(); throw error; }
}
const summary = row => row ? { id: row.id, name: row.client?.name || row.counterpartyName || row.sourceLabel, amount: amountOf(financialCents(row.amount)), outstanding: amountOf(outstandingCentsOf(row)), status: row.status } : null;
async function load(tx, { receivableId, paymentId }) {
  const payment = paymentId ? await tx.receivablePayment.findUnique({ where: { id: paymentId }, include: { documents: { where: { voidedAt: null }, select: { id: true, name: true, mimeType: true, size: true } } } }) : null;
  if (paymentId && (!payment || payment.kind !== 'CANJE' || payment.financialRecordId || payment.accountId)) throw fail('BARTER_NOT_FOUND', 'No encontramos un canje sin movimiento bancario.', 404);
  const ar = await tx.accountsReceivable.findUnique({ where: { id: payment?.receivableId || receivableId }, include });
  if (!ar || ar.kind !== 'CLIENTE' || !ar.clientId || ar.currency !== 'COP') throw fail('BARTER_SOURCE_INVALID', 'Este recorrido requiere una cuenta de cliente en COP. No convierte monedas ni reclasifica préstamos.');
  const beneficiary = paymentId ? await tx.accountsReceivable.findUnique({ where: { barterPaymentId: paymentId }, include }) : null;
  if (payment?.detail?.destinationMode === 'BENEFICIARIO' && (!beneficiary || beneficiary.kind !== 'BENEFICIARIO' || financialCents(beneficiary.amount) !== financialCents(payment.amount) || beneficiary.beneficiaryThirdPartyId !== payment.detail.beneficiaryThirdPartyId)) throw fail('BARTER_LINK_INVALID', 'El vínculo del beneficiario requiere revisión. No se modificó el canje.');
  for (const row of [ar, beneficiary].filter(Boolean)) {
    const balance = outstandingCentsOf(row);
    if (isReceivableClosed(row.status) && balance) throw fail('BARTER_BALANCE_INVALID', 'La cuenta figura cerrada pero sus aplicaciones no respaldan el saldo.');
  }
  return { ar, payment, beneficiary, revision: hash({ ar, payment, beneficiary }) };
}
function result(ctx, user) {
  const applied = ctx.beneficiary?.payments.some(p => !p.reversedAt) || false;
  return { outstanding: amountOf(outstandingCentsOf(ctx.ar)), receivable: summary(ctx.ar), beneficiary: summary(ctx.beneficiary), payment: ctx.payment, revision: ctx.revision,
    canWrite: hasFinancialPermission(user, 'write'), canReverse: !!ctx.payment && !ctx.payment.reversedAt && !applied && hasFinancialPermission(user, 'write'),
    reversalBlock: applied && !ctx.payment?.reversedAt ? 'El beneficiario tiene cobros o aplicaciones vigentes. Revísalos y reviértelos desde su origen antes de anular el canje; no se borra ni se devuelve dinero automáticamente.' : null };
}
async function periods(tx, ctx, date) {
  for (const row of [ctx.ar, ctx.beneficiary].filter(Boolean)) {
    const p = parseFinancialDateInput(new Date(row.period).toISOString().slice(0, 10));
    await assertOpenFinancialPeriod(tx, row.year || p.year, row.month || p.month);
  }
  for (const at of [date, ctx.payment?.paidAt, new Date()].filter(Boolean)) {
    const p = parseFinancialDateInput(new Date(at).toISOString().slice(0, 10));
    await assertOpenFinancialPeriod(tx, p.year, p.month);
  }
}
function request(input) {
  const reason = text(input.reason), requestId = text(input.requestId);
  if (!reason || reason.length > 300 || !/^[a-zA-Z0-9-]{10,100}$/.test(requestId) || !text(input.expectedRevision)) throw fail('BARTER_REVIEW_REQUIRED', 'Revisa el canje e indica un motivo de hasta 300 caracteres antes de confirmar.', 400);
  return { reason, requestId };
}
async function destination(tx, input) {
  const mode = input.destinationMode, authorizedBy = text(input.authorizedBy), destination = text(input.destination);
  if (!['AGENCIA', 'BENEFICIARIO', 'OTRO_AUTORIZADO'].includes(mode) || !authorizedBy || authorizedBy.length > 120 || destination.length > 500) throw fail('BARTER_DESTINATION_REQUIRED', 'Selecciona el destino y quién lo autorizó.', 400);
  const party = mode === 'BENEFICIARIO' ? await tx.thirdParty.findUnique({ where: { id: text(input.beneficiaryThirdPartyId) } }) : null;
  if (mode === 'BENEFICIARIO' && !party?.isActive) throw fail('BARTER_BENEFICIARY_REQUIRED', 'Selecciona un beneficiario activo del directorio de Terceros.', 400);
  if (mode !== 'BENEFICIARIO' && !destination) throw fail('BARTER_DESTINATION_REQUIRED', 'Explica el uso o la disposición autorizada del canje.', 400);
  return { destinationMode: mode, authorizedBy, destination: destination || party.name, beneficiaryThirdPartyId: party?.id || null, beneficiaryName: party?.name || null };
}
async function writeAudit(tx, before, after, operation, user, extra) {
  for (const id of [after.ar.id, after.beneficiary?.id].filter(Boolean)) await tx.financialAuditEvent.create({ data: {
    entityType: 'AccountsReceivable', entityId: id, action: 'UPDATE', actorId: user.id,
    before: clone({ receivable: summary(before.ar), beneficiary: summary(before.beneficiary), payment: before.payment }),
    after: clone({ operation, receivable: summary(after.ar), beneficiary: summary(after.beneficiary), paymentId: after.payment.id, actorName: user.name, ...extra })
  } });
}
async function replay(tx, arId, requestId, fingerprint, user, operation) {
  const prior = await tx.financialAuditEvent.findFirst({ where: { entityType: 'AccountsReceivable', entityId: arId, after: { path: ['requestId'], equals: requestId } } });
  if (!prior) return null;
  if (prior.actorId !== user.id || prior.after.fingerprint !== fingerprint || prior.after.operation !== operation) throw conflict();
  const ctx = await load(tx, { paymentId: prior.after.paymentId });
  if (operation !== 'BARTER_REVERSE' && ctx.payment.reversedAt) throw conflict();
  return { ...result(ctx, user), replayed: true };
}
async function createBeneficiary(tx, payment, dest) {
  if (dest.destinationMode !== 'BENEFICIARIO') return;
  const at = new Date(payment.paidAt);
  await tx.accountsReceivable.create({ data: { barterPaymentId: payment.id, beneficiaryThirdPartyId: dest.beneficiaryThirdPartyId, kind: 'BENEFICIARIO', counterpartyName: dest.beneficiaryName, amount: payment.amount,
    period: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)), year: at.getUTCFullYear(), month: at.getUTCMonth() + 1,
    origin: 'SYSTEM', sourceLabel: `Bienes o servicios recibidos por canje · ${dest.beneficiaryName}`, concept: payment.detail.goods,
    metadata: { barterPaymentId: payment.id, sourceReceivableId: payment.receivableId }, notes: payment.notes } });
}
export async function barterContext(db, ids, actor) {
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'read'), ctx = await load(tx, ids);
    const parties = !ctx.payment?.detail?.destinationMode ? await tx.thirdParty.findMany({ where: { isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true, kind: true, documentNumber: true } }) : [];
    const history = ctx.payment && hasFinancialPermission(user, 'admin') ? await tx.financialAuditEvent.findMany({ where: { entityType: 'AccountsReceivable', entityId: ctx.ar.id, after: { path: ['paymentId'], equals: ctx.payment.id } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) : [];
    return { ...result(ctx, user), parties, history };
  }, true);
}
export async function createBarter(db, receivableId, input, actor) {
  const { reason, requestId } = request(input), value = financialCents(input.amount), goods = text(input.goods);
  if (!value || value < 0 || !goods || goods.length > 500) throw fail('BARTER_INVALID', 'Indica el valor exacto y los bienes o servicios recibidos (máximo 500 caracteres).', 400);
  const date = parseFinancialDateInput(input.settledAt).date, fingerprint = hash({ receivableId, input });
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'write');
    const previous = await replay(tx, receivableId, requestId, fingerprint, user, 'BARTER_CREATE');
    if (previous) return previous;
    const before = await load(tx, { receivableId });
    if (before.revision !== input.expectedRevision) throw conflict();
    if (isReceivableClosed(before.ar.status) || value > outstandingCentsOf(before.ar)) throw fail('BARTER_EXCEEDS_BALANCE', 'El valor supera el saldo pendiente del cliente.');
    await periods(tx, before, date);
    const dest = await destination(tx, input);
    const payment = await tx.receivablePayment.create({ data: { id: `barter:${requestId}`, receivableId, kind: 'CANJE', amount: amountOf(value), paidAt: date, notes: reason, createdById: user.id, detail: { ...dest, goods, actorName: user.name } } });
    await createBeneficiary(tx, payment, dest);
    await tx.accountsReceivable.update({ where: { id: receivableId }, data: { status: receivableStatusAfter({ outstandingCents: outstandingCentsOf(before.ar) - value, payments: [...before.ar.payments, payment], currentStatus: before.ar.status }) } });
    const after = await load(tx, { paymentId: payment.id });
    await writeAudit(tx, before, after, 'BARTER_CREATE', user, { reason, requestId, fingerprint });
    return result(after, user);
  });
}
export async function assignBarterDestination(db, paymentId, input, actor) {
  const { reason, requestId } = request(input), fingerprint = hash({ paymentId, input });
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'write'), before = await load(tx, { paymentId });
    const previous = await replay(tx, before.ar.id, requestId, fingerprint, user, 'BARTER_DESTINATION');
    if (previous) return previous;
    if (before.revision !== input.expectedRevision || before.payment.reversedAt || before.payment.detail?.destinationMode || before.beneficiary) throw conflict();
    await periods(tx, before, before.payment.paidAt);
    const dest = await destination(tx, input);
    const payment = await tx.receivablePayment.update({ where: { id: paymentId }, data: { detail: { ...before.payment.detail, ...dest, legacyDestination: before.payment.detail?.destination || null, legacyAuthorizedBy: before.payment.detail?.authorizedBy || null, destinationReason: reason, destinationActorId: user.id, destinationActorName: user.name, destinationAt: new Date().toISOString() } } });
    await createBeneficiary(tx, payment, dest);
    const after = await load(tx, { paymentId });
    await writeAudit(tx, before, after, 'BARTER_DESTINATION', user, { reason, requestId, fingerprint });
    return result(after, user);
  });
}
export async function reverseBarter(db, paymentId, input, actor) {
  const { reason, requestId } = request(input), fingerprint = hash({ paymentId, input });
  return atomic(db, async tx => {
    const user = await authorize(tx, actor, 'write'), before = await load(tx, { paymentId });
    const previous = await replay(tx, before.ar.id, requestId, fingerprint, user, 'BARTER_REVERSE');
    if (previous) return previous;
    if (before.revision !== input.expectedRevision || before.payment.reversedAt) throw conflict();
    if (before.beneficiary?.payments.some(p => !p.reversedAt)) throw fail('BARTER_BENEFICIARY_APPLIED', 'El beneficiario tiene cobros o aplicaciones vigentes. Revísalos desde su origen antes de revertir el canje.');
    await periods(tx, before, before.payment.paidAt);
    const now = new Date();
    await tx.receivablePayment.update({ where: { id: paymentId }, data: { reversedAt: now, reversedById: user.id, reversalReason: reason } });
    await tx.accountsReceivable.update({ where: { id: before.ar.id }, data: { status: receivableStatusAfter({ outstandingCents: outstandingCentsOf(before.ar) + financialCents(before.payment.amount), payments: before.ar.payments.filter(p => p.id !== paymentId), currentStatus: before.ar.status }) } });
    if (before.beneficiary) {
      await tx.receivablePayment.create({ data: { receivableId: before.beneficiary.id, amount: before.beneficiary.amount, paidAt: now, kind: 'REVERSO_CANJE', notes: reason, createdById: user.id, detail: { barterPaymentId: paymentId, actorName: user.name } } });
      await tx.accountsReceivable.update({ where: { id: before.beneficiary.id }, data: { status: 'SALDADO' } });
    }
    const after = await load(tx, { paymentId });
    await writeAudit(tx, before, after, 'BARTER_REVERSE', user, { reason, requestId, fingerprint });
    return result(after, user);
  });
}
