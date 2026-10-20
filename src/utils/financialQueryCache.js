// All financial tabs are projections of the same operations.
export const invalidateFinancialQueries = (queryClient) => Promise.all([
  'financial-records', 'financial-accounts', 'financials-dashboard-data',
  'financials-receivables-ledger', 'financials-client-reconciliation',
  'financials-payroll-ledger', 'financials-monthly-ledger', 'financial-periods',
  'bank-reconciliation', 'financial-integrity', 'financial-payment-candidates', 'financial-client-statement',
  // El directorio de clientes y las listas de clientes de los formularios (30 de septiembre de 2026).
  'financial-client-directory', 'financial-record-clients',
  // Ajustes de cartera y egresos de préstamo disponibles (20 de octubre de 2026).
  'financial-receivable-adjustments', 'financial-loan-candidates'
].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
