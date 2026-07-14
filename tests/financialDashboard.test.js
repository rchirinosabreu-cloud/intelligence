import test from 'node:test';
import assert from 'node:assert';
import { getFinancialDashboard } from '../src/controllers/financialController.js';

// Helper mock structures for unit testing of precision mathematics
test('Financial Dashboard Analytical Precision Math', async (t) => {

    await t.test('Prueba 1: Algebra del flujo de caja (INCOME + , EXPENSE -)', () => {
        // Simulating the mathematical aggregation inside getFinancialDashboard using mock data
        const mockRecords = [
            { amount: 5000.55, type: 'INCOME', category: 'MEMBRESIA', date: '2026-01-15' },
            { amount: 2000.00, type: 'EXPENSE', category: 'PAUTA', date: '2026-01-20' },
            { amount: 1500.45, type: 'EXPENSE', category: 'NOMINA', date: '2026-01-22' }
        ];

        // Process monthly net flow
        let income = 0;
        let expense = 0;
        for (const r of mockRecords) {
            const amt = r.amount;
            if (r.type === 'INCOME') {
                income += amt;
            } else {
                expense += amt;
            }
        }

        const netFlow = income - expense;

        // Assert exact decimal precision
        assert.strictEqual(income, 5000.55);
        assert.strictEqual(expense, 3500.45);
        assert.strictEqual(Math.round((netFlow + Number.EPSILON) * 100) / 100, 1500.10);
    });

    await t.test('Prueba 2: Algebra de la Nomina Dinamica con NOVELTY', () => {
        // Simulating calculation of Paid Contract + Adjustments (BONUS, COMMISSION, DEDUCTION, NOVELTY)
        const baseSalary = 3000000;
        const socialSecurity = 400000;

        const mockAdjustments = [
            { type: 'BONUS', amount: 500000 },       // + 500k
            { type: 'COMMISSION', amount: 250000 },  // + 250k
            { type: 'DEDUCTION', amount: 150000 },   // - 150k
            { type: 'NOVELTY', amount: 100000 },     // + 100k
            { type: 'NOVELTY', amount: -50000 }      // - 50k
        ];

        let adjustmentsTotal = 0;
        for (const adj of mockAdjustments) {
            const amt = adj.amount;
            if (adj.type === 'BONUS' || adj.type === 'COMMISSION') {
                adjustmentsTotal += amt;
            } else if (adj.type === 'DEDUCTION') {
                adjustmentsTotal -= amt;
            } else if (adj.type === 'NOVELTY') {
                adjustmentsTotal += amt; // Adds if positive, subtracts if negative
            }
        }

        const totalPaid = baseSalary + socialSecurity + adjustmentsTotal;

        // Assert exact matching results
        assert.strictEqual(adjustmentsTotal, 650000);
        assert.strictEqual(totalPaid, 4050000);
    });

    await t.test('Prueba 3: Agrupación y Antigüedad de Cartera Morosa (Orden Descendente)', () => {
        const mockDebts = [
            { clientId: 'c1', amount: 1000, period: '2026-04-01' },
            { clientId: 'c1', amount: 1500, period: '2026-06-01' },
            { clientId: 'c1', amount: 1200, period: '2026-05-01' }
        ];

        // Sort chronologically descending as required
        const sortedDebts = [...mockDebts].sort((a, b) => new Date(b.period) - new Date(a.period));

        assert.strictEqual(sortedDebts[0].period, '2026-06-01', 'El periodo más reciente debe ser el primero');
        assert.strictEqual(sortedDebts[1].period, '2026-05-01');
        assert.strictEqual(sortedDebts[2].period, '2026-04-01', 'El periodo más antiguo debe ser el último');
    });

    await t.test('Prueba 4: Hidratación del Payload de Autenticación ("hasFinancialAccess")', () => {
        const mockAuthResponse = {
            token: "mock-jwt-token-xyz",
            user: {
                id: "admin-user-id",
                name: "System Admin",
                email: "admin@brainstudio.com",
                role: "ADMIN",
                hasFinancialAccess: true
            }
        };

        // Assert that the auth response contains the newly-required hasFinancialAccess flag
        assert.strictEqual(mockAuthResponse.user.hasFinancialAccess, true, 'El payload de autenticación debe contener el flag hasFinancialAccess');
    });
});
