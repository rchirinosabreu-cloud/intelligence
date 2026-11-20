// Adicionales de una liquidación de nómina (Rodny, 19 de noviembre de 2026: «el valor del contrato es fijo,
// pero puede que alguien se gane un bono … sería mejor cargarlo a la nómina»). Un bono, una comisión u otro pago
// adicional sube el bruto y el neto de esa liquidación; el dinero sale después con «Registrar pago», como
// siempre. Regla compartida por la pantalla y el servidor.

export const PAYROLL_ADDITION_TYPES = Object.freeze({
  BONUS: 'Bono',
  COMMISSION: 'Comisión',
  NOVELTY: 'Otro pago adicional'
});

export const PAYROLL_ADDITION_MARK = 'ADDITION';

/**
 * Solo los adicionales registrados por este recorrido. Los ajustes históricos sin marca (importaciones viejas)
 * y los descuentos de préstamo, que llevan su pago de Cartera, no son adicionales.
 */
export const isPayrollAddition = adjustment => Boolean(
  adjustment
  && Object.hasOwn(PAYROLL_ADDITION_TYPES, adjustment.type)
  && !adjustment.receivablePaymentId
  && adjustment.detail?.kind === PAYROLL_ADDITION_MARK
);

export const payrollAdditionLabel = type => PAYROLL_ADDITION_TYPES[type] || 'Adicional';

/** Lo que suman los adicionales vigentes, en pesos con centavos. */
export const payrollAdditionsTotal = (adjustments = []) => Math.round(
  adjustments.filter(item => isPayrollAddition(item) && !item.reversedAt).reduce((sum, item) => sum + Number(item.amount || 0) * 100, 0)
) / 100;

/** Lo mismo sobre la lista que ya entrega Nómina, donde el servidor solo pone adicionales. */
export const listedAdditionsTotal = (additions = []) => Math.round(
  additions.filter(item => !item.reversedAt).reduce((sum, item) => sum + Number(item.amount || 0) * 100, 0)
) / 100;
