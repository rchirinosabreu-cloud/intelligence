import React, { useMemo } from 'react';
import { bogotaToday, receivableAgeStart, summarizeAging } from '@/lib/debtAging';
import { FinancialSummaryCard } from './FinancialSectionParts';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const TONE = { neutral: 'neutral', warning: 'warning', danger: 'danger' };

// El resumen de lo que se debe, con el modelo que mandó Elisa el 23 de octubre de 2026: cuántos terceros
// tienen saldo, cuánto hay en 0–30, 31–60 y más de 60 días, y el total. Lo usan Cuentas por cobrar y
// Cuentas por pagar. Cada tramo es también un filtro de la lista: tocarlo lo elige, tocarlo otra vez lo
// suelta.
export default function DebtAgingSummary({ items = [], formatCurrency, bucket, onBucketChange, totalLabel, startOf = receivableAgeStart, partyOf, today = bogotaToday(), ...rest }) {
    const summary = useMemo(() => summarizeAging(items, { today, startOf, ...(partyOf ? { partyOf } : {}) }), [items, today, startOf, partyOf]);
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-debt-aging {...rest}>
            <FinancialSummaryCard data-debt-aging-parties label="Terceros con saldo" value={summary.parties}
                hint={plural(summary.count, 'cuenta abierta', 'cuentas abiertas')} />
            {summary.buckets.map((row) => (
                <FinancialSummaryCard key={row.key} data-debt-aging-bucket={row.key} label={row.label}
                    value={formatCurrency(row.amount)} hint={plural(row.count, 'cuenta', 'cuentas')}
                    tone={row.amount > 0 ? TONE[row.tone] : 'neutral'}
                    onClick={onBucketChange ? () => onBucketChange(bucket === row.key ? null : row.key) : undefined} pressed={bucket === row.key} />
            ))}
            <FinancialSummaryCard data-debt-aging-total label={totalLabel} value={formatCurrency(summary.total)} tone="accent"
                onClick={onBucketChange ? () => onBucketChange(null) : undefined} pressed={onBucketChange ? !bucket : undefined}
                hint="Todo lo abierto con estos filtros" />
        </div>
    );
}
