import React, { useMemo } from 'react';
import { AGING_BUCKETS, bogotaToday, isOpenReceivable, summarizeAging } from '@/lib/receivableAging';
import { FinancialSummaryCard } from './FinancialSectionParts';

const cents = (value) => Math.round((Number(value) || 0) * 100);
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// El resumen de Cuentas por cobrar (Elisa, 23 de octubre de 2026): cuánto se debe, a quién —clientes o
// préstamos a terceros— y cuánto lleva esperando. Cada cifra es también un filtro de la lista de abajo:
// tocarla la elige, tocarla otra vez la suelta.
export default function ReceivableAgingSummary({ items = [], formatCurrency, kind, onKindChange, bucket, onBucketChange, today = bogotaToday() }) {
    const open = useMemo(() => items.filter(isOpenReceivable), [items]);
    const byKind = useMemo(() => {
        const total = (list) => open.filter(list).reduce((sum, item) => sum + cents(item.outstanding), 0) / 100;
        return {
            all: { amount: total(() => true), count: open.length },
            CLIENTE: { amount: total((item) => item.kind !== 'PRESTAMO'), count: open.filter((item) => item.kind !== 'PRESTAMO').length },
            PRESTAMO: { amount: total((item) => item.kind === 'PRESTAMO'), count: open.filter((item) => item.kind === 'PRESTAMO').length }
        };
    }, [open]);
    // La antigüedad se resume sobre lo que está a la vista: clientes, préstamos o todo.
    const aging = useMemo(() => summarizeAging(kind ? items.filter((item) => (kind === 'PRESTAMO') === (item.kind === 'PRESTAMO')) : items, today), [items, kind, today]);

    return (
        <div className="space-y-3" data-receivable-summary>
            <div className="grid gap-3 sm:grid-cols-3">
                <FinancialSummaryCard data-receivable-kind="ALL" label="Por cobrar" value={formatCurrency(byKind.all.amount)}
                    hint={plural(byKind.all.count, 'cuenta abierta', 'cuentas abiertas')}
                    onClick={() => { onKindChange(null); onBucketChange(null); }} pressed={!kind && !bucket} />
                <FinancialSummaryCard data-receivable-kind="CLIENTE" label="Clientes" value={formatCurrency(byKind.CLIENTE.amount)}
                    hint={plural(byKind.CLIENTE.count, 'cuenta de cobro', 'cuentas de cobro')}
                    onClick={() => onKindChange(kind === 'CLIENTE' ? null : 'CLIENTE')} pressed={kind === 'CLIENTE'} />
                <FinancialSummaryCard data-receivable-kind="PRESTAMO" label="Préstamos a terceros" value={formatCurrency(byKind.PRESTAMO.amount)}
                    hint={plural(byKind.PRESTAMO.count, 'préstamo por recuperar', 'préstamos por recuperar')} tone="accent"
                    onClick={() => onKindChange(kind === 'PRESTAMO' ? null : 'PRESTAMO')} pressed={kind === 'PRESTAMO'} />
            </div>
            <div>
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Antigüedad · desde el vencimiento o, si no tiene, desde que se emitió</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {aging.buckets.map((row) => {
                        const meta = AGING_BUCKETS.find((item) => item.key === row.key);
                        const late = meta.maxDays > 60 && row.amount > 0;
                        return (
                            <FinancialSummaryCard key={row.key} data-receivable-aging={row.key} label={row.label}
                                value={formatCurrency(row.amount)} hint={plural(row.count, 'cuenta', 'cuentas')}
                                tone={late ? 'danger' : 'neutral'}
                                onClick={() => onBucketChange(bucket === row.key ? null : row.key)} pressed={bucket === row.key} />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
