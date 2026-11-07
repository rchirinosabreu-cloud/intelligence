import prisma from '../lib/prisma.js';
import { readPayrollPeriods, createPayrollPeriod, identifyPayrollPeriod, reversePayrollPeriod, readPayrollDeductions, createPayrollDeduction, reversePayrollDeduction } from '../services/payrollPeriodService.js';

export const payrollPeriodHandler = (operation, { prismaClient = prisma } = {}) => async (req, res) => {
  try {
    const reading = operation === 'periods' || operation === 'deductions';
    const methods = { periods: readPayrollPeriods, create: createPayrollPeriod, identify: identifyPayrollPeriod, reverse: reversePayrollPeriod, deductions: readPayrollDeductions, deduct: createPayrollDeduction, undoDeduction: reversePayrollDeduction };
    const result = await methods[operation](prismaClient, req.params.id, ...(reading ? [req.user] : [req.body || {}, req.user]));
    return res.status(reading ? 200 : 201).json(result);
  } catch (error) {
    if (!error.statusCode) console.error('[Payroll periods]', error);
    return res.status(error.statusCode || 500).json({ error: error.code, message: error.statusCode ? error.message : 'No fue posible guardar el cambio. Conserva los datos y vuelve a intentarlo.' });
  }
};
