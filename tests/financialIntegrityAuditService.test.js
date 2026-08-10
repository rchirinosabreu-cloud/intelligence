import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFinancialIntegrity } from '../src/services/financialIntegrityAuditService.js';

test('auditFinancialIntegrity reports blockers that prevent a reliable monthly close', async () => {
    const prismaClient = {
        financialRecord: {
            count: async ({ where }) => {
                if (where?.status === 'DRAFT') return 2;
                if (where?.accountId === null) return 3;
                if (where?.clientId === null) return 4;
                return 1;
            }
        },
        accountsReceivable: {
            findMany: async () => [{ id: 'debt-1', amount: 1000, status: 'PAGADO', payments: [{ amount: 400 }] }]
        },
        payrollContract: {
            findMany: async () => [{ id: 'contract-1', collaboratorId: null, sourceLabel: 'Gabriel / Kamila', startDate: new Date(), endDate: null }]
        },
        payrollTransaction: { count: async () => 2 },
        financialAccount: { count: async () => 0 },
        financialPeriod: { count: async () => 0 }
    };

    const audit = await auditFinancialIntegrity(prismaClient, { year: 2026 });

    assert.equal(audit.ready, false);
    assert.ok(audit.issues.some((issue) => issue.code === 'ACTUAL_WITHOUT_ACCOUNT' && issue.count === 3));
    assert.ok(audit.issues.some((issue) => issue.code === 'RECEIVABLE_STATUS_MISMATCH'));
    assert.ok(audit.issues.some((issue) => issue.code === 'SHARED_PAYROLL_CONTRACT'));
    assert.ok(audit.issues.some((issue) => issue.code === 'NO_FINANCIAL_ACCOUNTS'));
});
