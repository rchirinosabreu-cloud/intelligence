import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import IncomeStatementTab from '@/components/modules/financial/IncomeStatementTab';

/* Muestra local del estado de resultados mensual (Análisis de Financiero).
   Septiembre y octubre son las cifras que motivaron el cambio: septiembre figuraba en
   rojo por $15,4 millones y lo que lo torcía eran $25,3 millones prestados. El resto de
   los meses son de muestra. Nada de esto toca registros reales. */
const CASH_FLOW = [
    { year: 2026, month: 1, income: 31200000, expense: 25580000, loansGranted: 0, loanRepayments: 0 },
    { year: 2026, month: 2, income: 28400000, expense: 23770000, loansGranted: 0, loanRepayments: 0 },
    { year: 2026, month: 3, income: 35100000, expense: 26500000, loansGranted: 0, loanRepayments: 0 },
    { year: 2026, month: 4, income: 33800000, expense: 25080000, loansGranted: 0, loanRepayments: 0 },
    { year: 2026, month: 5, income: 29900000, expense: 26190000, loansGranted: 0, loanRepayments: 0 },
    { year: 2026, month: 6, income: 27600000, expense: 28270000, loansGranted: 1000000, loanRepayments: 0 },
    { year: 2026, month: 7, income: 41500000, expense: 25020000, loansGranted: 0, loanRepayments: 0 },
    { year: 2026, month: 8, income: 44200000, expense: 23690000, loansGranted: 0, loanRepayments: 500000 },
    { year: 2026, month: 9, income: 44800129, expense: 60248034, loansGranted: 25323150, loanRepayments: 0 },
    { year: 2026, month: 10, income: 48981917, expense: 33987127, loansGranted: 218146, loanRepayments: 0 },
    { year: 2026, month: 11, income: 12058315, expense: 8567250, loansGranted: 0, loanRepayments: 0 }
];

const EXPENSE_DISTRIBUTION = {
    NOMINA: 237140000,
    OPERATIVO: 41860000,
    ADMINISTRATIVO: 19740000,
    LOGISTICA: 8120000,
    TAX: 6480000,
    PAUTA: 2310000,
    PRESTAMO: 26841296
};

const LABELS = {
    NOMINA: 'Nómina', OPERATIVO: 'Operativo', ADMINISTRATIVO: 'Administrativo',
    LOGISTICA: 'Logística', TAX: 'Impuestos', PAUTA: 'Pauta', PRESTAMO: 'Préstamos'
};

const formatCurrency = (value) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
}).format(value);

function App() {
    const [pending, setPending] = useState(false);
    return (
        <main className="min-h-screen bg-zinc-50/50 p-6 text-zinc-900 dark:bg-zinc-950/20 dark:text-white sm:p-10">
            <div className="mx-auto max-w-6xl">
                <p className="text-sm text-brand-cyan-deep dark:text-brand-cyan">FINANCIERO · ANÁLISIS · MUESTRA LOCAL</p>
                <h1 className="mt-2 text-3xl font-bold">Estado de resultados mensual</h1>
                <p className="mt-3 text-zinc-500 dark:text-zinc-400">Cifras de muestra. Esta pantalla no cambia registros reales.</p>
                <div className="mt-6 flex flex-wrap gap-4">
                    <button type="button" data-toggle-theme className="min-h-11 underline"
                        onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
                    <button type="button" data-toggle-pending className="min-h-11 underline"
                        onClick={() => setPending((value) => !value)}>{pending ? 'Mostrar datos' : 'Ver mientras carga'}</button>
                </div>
                <div className="mt-8">
                    <IncomeStatementTab cashFlow={CASH_FLOW} expenseDistribution={EXPENSE_DISTRIBUTION}
                        categoryLabel={(name) => LABELS[name] || name}
                        formatCurrency={formatCurrency} pending={pending} />
                </div>
            </div>
        </main>
    );
}

createRoot(document.getElementById('root')).render(<App />);
