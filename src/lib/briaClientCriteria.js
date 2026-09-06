import { hasModulePermission, isManagerRole } from '../config/security.js';

export const CRITERION_CATEGORIES = ['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'];
export const criterionError = (status, message) => Object.assign(new Error(message), { status });
export const canValidateClientCriterion = (actor, sourcePlan) => Boolean(
  actor?.isActive && hasModulePermission(actor, 'parrillas') && (
    isManagerRole(actor.role) || (sourcePlan && !sourcePlan.deletedAt && sourcePlan.owner?.userId === actor.id)
  )
);
const boundedText = (value, max, name) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw criterionError(400, `${name} es obligatorio y admite hasta ${max} caracteres.`);
  return value.trim();
};
export const validateCriterionProposal = ({ text, reason, category } = {}) => {
  if (!CRITERION_CATEGORIES.includes(category)) throw criterionError(400, 'Selecciona una categoría válida.');
  return { text: boundedText(text, 800, 'El criterio'), reason: boundedText(reason, 500, 'El motivo'), category };
};
export const criterionDecision = (criterion, { action, version, reason } = {}) => {
  const transitions = { APPROVE: ['PROPOSED', 'APPROVED'], REJECT: ['PROPOSED', 'REJECTED'], REVOKE: ['APPROVED', 'REVOKED'] };
  const transition = transitions[action];
  if (!transition) throw criterionError(400, 'La acción no es válida.');
  const note = boundedText(reason, 500, 'El motivo');
  if (!Number.isInteger(version) || version !== criterion.version || criterion.status !== transition[0]) {
    throw criterionError(409, 'Este criterio cambió. Actualiza la lista antes de decidir.');
  }
  return { status: transition[1], version: version + 1, reason: note };
};
