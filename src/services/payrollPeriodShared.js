import { createHash } from 'node:crypto';
import { hasFinancialPermission } from '../utils/financialPermissions.js';
import { financialCents, financialAmountFromCents } from '../utils/financialMoney.js';
import { FinancialDomainError, assertOpenFinancialPeriod } from './financialRecordService.js';
export const fail = (code, message, status = 409) => new FinancialDomainError(code, message, status);
export const clone = value => JSON.parse(JSON.stringify(value));
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const money = financialAmountFromCents;
export function cents(value) {
  const amount = financialCents(value);
  if (amount === null || amount < 0) throw fail('PAYROLL_BALANCE_REVIEW', 'Hay un importe histórico por verificar. Revisa la liquidación y sus pagos.');
  return amount;
}
export async function authorize(tx, actor, permission) {
  const user = await tx.user.findUnique({ where: { id: actor?.id || actor?.userId || '' } });
  if (!hasFinancialPermission(user, permission)) throw fail('FINANCIAL_ACCESS_DENIED', 'Tu permiso actual no permite esta operación financiera.', 403);
  return user;
}
export const conflict = () => fail('PAYROLL_REVIEW_CHANGED', 'La información cambió. Actualiza y vuelve a revisar antes de confirmar.');
export async function atomic(db, work) {
  try { return await db.$transaction(work, { isolationLevel: 'Serializable' }); }
  catch (error) { if (['P2034', 'P2002'].includes(error.code)) throw conflict(); throw error; }
}
export function request(input) {
  const reason = String(input.reason || '').trim(), requestId = String(input.requestId || '').trim();
  if (!reason || reason.length > 300) throw fail('PAYROLL_REASON_REQUIRED', 'Explica el motivo en un máximo de 300 caracteres.', 400);
  if (!requestId || requestId.length > 100 || !input.expectedRevision) throw fail('PAYROLL_REVIEW_REQUIRED', 'Revisa la información antes de confirmar.', 400);
  return { reason, requestId };
}
export const audit = (tx, entityType, entityId, before, after, user) => tx.financialAuditEvent.create({ data: { entityType, entityId, action: 'UPDATE', actorId: user.id, before: clone(before), after: clone(after) } });
export const includePayroll = { contract: { include: { collaborator: true } }, payments: { orderBy: { id: 'asc' } }, adjustments: { orderBy: { id: 'asc' } } };
export async function payroll(tx, id) {
  const row = await tx.payrollTransaction.findUnique({ where: { id }, include: includePayroll });
  if (!row) throw fail('PAYROLL_TRANSACTION_NOT_FOUND', 'La liquidación no existe.', 404);
  return row;
}
export function payrollBalance(row) {
  const paid = row.payments.filter(p => !p.reversedAt).reduce((total, p) => total + cents(p.amount), 0);
  const net = cents(row.netAmount);
  if (!Number.isSafeInteger(paid) || paid > net || (row.financialRecordId && !row.payments.some(p => !p.reversedAt && p.financialRecordId === row.financialRecordId)) || (row.status === 'PAID' && paid !== net)) throw fail('PAYROLL_BALANCE_REVIEW', 'Esta liquidación conserva pagos históricos por verificar. Revísalos en Nómina antes de descontar.');
  return { paid, net, outstanding: net - paid };
}
export const openPayrollPeriod = (tx, row) => assertOpenFinancialPeriod(tx, row.year, row.month);
