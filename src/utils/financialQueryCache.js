// All financial tabs are projections of the same operations.
export const invalidateFinancialQueries = (queryClient) => Promise.all([
  'financial-records', 'financial-accounts', 'financials-dashboard-data',
  'financials-receivables-ledger', 'financials-client-reconciliation',
  'financials-payroll-ledger', 'financials-monthly-ledger', 'financial-periods',
  'bank-reconciliation', 'financial-integrity', 'financial-payment-candidates'
].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
