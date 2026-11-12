import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine, LabelList, Cell
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { FinancialSummaryCard } from './FinancialSectionParts';
import {
    MARGIN_FLOOR,
    monthlyIncomeStatement,
    incomeStatementTotals,
    incomeStatementReadings,
    marginBarClass,
    splitOutgoings,
    percentLabel
} from '@/lib/incomeStatement';

/**
 * Estado de resultados mensual — punto 7 del frente 8 del plan «el negocio primero»
 * (10 de octubre de 2026). Sustituye la gráfica de ingresos vs egresos brutos, que
 * dibujaba un septiembre de 2026 en rojo por $15,4 millones que nunca existió: la
 * diferencia fueron $25,3 millones prestados a dos personas, que siguen en cartera.
 *
 * La regla vive en `src/lib/incomeStatement.js`. Aquí solo se dibuja.
 */

/** El globo del gráfico: dice lo que entró, lo que salió y lo prestado por separado. */
export function StatementTooltip({ active, payload, formatCurrency }) {
    const month = active && payload?.length ? payload[0].payload : null;
    if (!month) return null;
    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs shadow-lg dark:border-white/10 dark:bg-zinc-900">
            <p className="font-bold capitalize text-zinc-900 dark:text-white">
                {month.name} {month.year}{month.inProgress ? ` · va por el día ${month.daysElapsed} de ${month.daysInMonth}` : ''}
            </p>
            <dl className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-300">
                <div className="flex justify-between gap-6"><dt>Entró por operar</dt><dd className="tabular-nums">{formatCurrency(month.operatingIncome)}</dd></div>
                <div className="flex justify-between gap-6"><dt>Salió por operar</dt><dd className="tabular-nums">{formatCurrency(month.operatingExpense)}</dd></div>
                <div className="flex justify-between gap-6 font-bold text-zinc-900 dark:text-white">
                    <dt>Margen</dt>
                    <dd className="tabular-nums">{formatCurrency(month.operatingMargin)}{month.marginRate === null ? '' : ` · ${percentLabel(month.marginRate)}`}</dd>
                </div>
                {month.loansGranted > 0 && <div className="flex justify-between gap-6"><dt>Prestado, no gastado</dt><dd className="tabular-nums">{formatCurrency(month.loansGranted)}</dd></div>}
                {month.loanRepayments > 0 && <div className="flex justify-between gap-6"><dt>Reintegros, no venta</dt><dd className="tabular-nums">{formatCurrency(month.loanRepayments)}</dd></div>}
            </dl>
        </div>
    );
}

export default function IncomeStatementTab({
    cashFlow = [],
    expenseDistribution = null,
    categoryLabel,
    formatCurrency,
    pending = false
}) {
    const statement = useMemo(
        () => (pending ? [] : monthlyIncomeStatement({ months: cashFlow || [] })),
        [cashFlow, pending]
    );
    const totals = useMemo(() => incomeStatementTotals(statement), [statement]);
    const readings = useMemo(() => incomeStatementReadings(statement), [statement]);
    const outgoings = useMemo(
        () => (pending ? splitOutgoings(null) : splitOutgoings(expenseDistribution, categoryLabel)),
        [expenseDistribution, categoryLabel, pending]
    );

    const indicator = (value) => (pending ? '—' : formatCurrency(value));

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            {/* La lectura: un hecho y su causa, con la cifra que lo sostiene.
                La decisión la toma quien lee; la pantalla no opina. */}
            {readings.length > 0 && (
                <Card data-statement-readings className="rounded-2xl border-zinc-200/50 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-zinc-900">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Lo que dicen los números</h3>
                    <ul className="mt-3 space-y-2">
                        {readings.map((reading) => (
                            <li key={reading.kind} data-reading={reading.kind} className="flex gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cyan" />
                                <span>{reading.text}</span>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* El periodo, solo con meses cerrados: un mes a medias no se suma. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FinancialSummaryCard data-statement-income label="Entró por operar"
                    value={indicator(totals.operatingIncome)}
                    hint={`${totals.months} ${totals.months === 1 ? 'mes cerrado' : 'meses cerrados'}${totals.loanRepayments > 0 ? ` · sin ${formatCurrency(totals.loanRepayments)} de reintegros` : ''}`} />
                <FinancialSummaryCard data-statement-expense label="Salió por operar"
                    value={indicator(totals.operatingExpense)}
                    hint={totals.loansGranted > 0 ? `Aparte: ${formatCurrency(totals.loansGranted)} prestados` : 'Sin préstamos en el periodo'} />
                <FinancialSummaryCard data-statement-margin label="Margen operativo"
                    tone={totals.operatingMargin >= 0 ? 'positive' : 'danger'}
                    value={indicator(totals.operatingMargin)}
                    hint="Lo que quedó después de operar" />
                <FinancialSummaryCard data-statement-rate label="Margen sobre lo que entró"
                    tone={totals.marginRate === null ? 'neutral' : totals.marginRate < MARGIN_FLOOR ? 'warning' : 'positive'}
                    value={pending || totals.marginRate === null ? '—' : percentLabel(totals.marginRate)}
                    hint={`Piso del plan: ${percentLabel(MARGIN_FLOOR)}`} />
            </div>

            {/* Margen operativo mes a mes. El indicador que el plan marca como «no se
                mide». Una sola escala: la plata. El porcentaje va rotulado sobre cada
                barra y el color dice si alcanzó el piso. */}
            <Card className="rounded-2xl border-zinc-200/50 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-zinc-900">
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Margen operativo mes a mes</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Lo que quedó después de operar, sin préstamos ni reintegros. Verde alcanzó el piso de {percentLabel(MARGIN_FLOOR)} del plan; coral no; gris es el mes en curso, que todavía no se compara.
                    </p>
                </div>
                {statement.length > 0 ? (
                    <div className="h-[320px] w-full" data-statement-chart>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={statement} margin={{ top: 24, right: 12, left: 8, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.05} vertical={false} />
                                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false}
                                    tickFormatter={(value) => String(value || '').slice(0, 3)} />
                                <YAxis fontSize={10} tickLine={false} axisLine={false}
                                    tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`} />
                                <ReferenceLine y={0} strokeOpacity={0.25} />
                                <Tooltip cursor={{ fillOpacity: 0.04 }} content={<StatementTooltip formatCurrency={formatCurrency} />} />
                                {/* Sin animación de entrada: Recharts crece las barras durante 1,5 s y
                                    eso se lee como «la pantalla sigue cargando», igual que las entradas
                                    de 700 ms que Rodny quitó el 21 de septiembre de 2026. */}
                                <Bar dataKey="operatingMargin" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                                    {statement.map((month) => (
                                        <Cell key={`${month.year}-${month.month}`} className={marginBarClass(month)} />
                                    ))}
                                    {/* En celular once rótulos se montan unos sobre otros («24,5 %5,8 %»):
                                        ahí el porcentaje vive en el globo y en la cifra del periodo. */}
                                    <LabelList dataKey="marginLabel" position="top" fontSize={10} className="fill-zinc-400 max-sm:hidden" />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="flex h-[240px] items-center justify-center text-center opacity-40">
                        <p className="text-xs italic">Sin movimientos registrados en el periodo</p>
                    </div>
                )}
            </Card>

            {/* A dónde se va la plata, con nombre y cifra. Era una rueda sin rótulos donde
                nómina, el 69 % de todo lo que sale, era un arco anónimo. */}
            <Card data-outgoings className="rounded-2xl border-zinc-200/50 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-zinc-900">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">A dónde se va la plata</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Lo que salió por operar en el periodo, de mayor a menor.</p>
                    </div>
                    <p className="brain-type-value">{indicator(outgoings.operatingTotal)}</p>
                </div>
                {outgoings.operating.length > 0 ? (
                    <ul className="space-y-3">
                        {outgoings.operating.map((row) => (
                            <li key={row.rawName} data-outgoing={row.rawName} className="space-y-1">
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="font-medium text-zinc-700 dark:text-zinc-200">{row.name}</span>
                                    <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                                        {formatCurrency(row.value)} <span className="text-zinc-400 dark:text-zinc-500">· {percentLabel(row.share)}</span>
                                    </span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5">
                                    <div className="h-full rounded-full bg-brand-cyan" style={{ width: `${Math.max(row.share * 100, 1)}%` }} />
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-xs italic opacity-40">Sin egresos registrados en el periodo</p>
                )}
                {outgoings.loansTotal > 0 && (
                    <div data-outgoings-loans className="mt-6 border-t border-zinc-200/70 pt-4 dark:border-white/5">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="font-medium text-zinc-700 dark:text-zinc-200">Prestado, no gastado</span>
                            <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{formatCurrency(outgoings.loansTotal)}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5">
                            <div className="h-full rounded-full bg-brand-coral"
                                style={{ width: `${Math.max(outgoings.operatingTotal > 0 ? (outgoings.loansTotal / outgoings.operatingTotal) * 100 : 100, 1)}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            Salió de la cuenta pero no es gasto: está en Cuentas por cobrar como préstamo a terceros. No entra en el total de arriba ni en sus porcentajes.
                        </p>
                    </div>
                )}
            </Card>
        </div>
    );
}
