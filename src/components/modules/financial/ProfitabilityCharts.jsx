import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine, Cell
} from 'recharts';
import { Card } from '@/components/ui/Card';
import InfoHint from '@/components/ui/InfoHint';
import { PROFITABILITY_HINTS } from '@/lib/clientProfitability';

/**
 * Los dos gráficos de Rentabilidad (Rodny, 12 de noviembre de 2026: «esta pantalla de
 * rentabilidad no puede tener también gráficos?»). Responden dos preguntas distintas:
 *
 *   1. **Quién se come el mes**: el margen de cada cuenta, en plata. Mide el peso.
 *   2. **Qué deja cada hora**: lo que ingresó por hora, contra el costo hora de la
 *      agencia. Mide el rendimiento, que el margen solo no dice —una cuenta grande con
 *      margen flojo puede dejar más plata que una pequeña muy rentable—.
 *
 * Ninguna cuenta se esconde: recortar la lista en una pantalla de rentabilidad sería
 * justamente ocultar la que importa.
 */

const ROW_HEIGHT = 26;
const MIN_HEIGHT = 180;
const chartHeight = (rows) => Math.max(MIN_HEIGHT, rows * ROW_HEIGHT + 48);

const shortName = (name) => (String(name || '').length > 22 ? `${String(name).slice(0, 21)}…` : String(name || ''));

function ChartTooltip({ active, payload, money, hours, hourCostCents }) {
    const row = active && payload?.length ? payload[0].payload : null;
    if (!row) return null;
    return (
        <div className="brain-popover-surface p-3 text-xs">
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">{row.name}</p>
            <dl className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-300">
                <div className="flex justify-between gap-6"><dt>Ingreso</dt><dd className="tabular-nums">{money(row.revenueCents)}</dd></div>
                <div className="flex justify-between gap-6"><dt>Costo</dt><dd className="tabular-nums">{money(row.costCents)}</dd></div>
                <div className="flex justify-between gap-6"><dt>Horas</dt><dd className="tabular-nums">{hours(row.hoursMs)}</dd></div>
                <div className="flex justify-between gap-6 font-semibold text-zinc-900 dark:text-zinc-50">
                    <dt>Margen</dt><dd className="tabular-nums">{money(row.marginCents)}</dd>
                </div>
                {row.revenuePerHourCents !== null && (
                    <div className="flex justify-between gap-6">
                        <dt>Deja por hora</dt>
                        <dd className="tabular-nums">{money(row.revenuePerHourCents)}{hourCostCents ? ` · cuesta ${money(hourCostCents)}` : ''}</dd>
                    </div>
                )}
            </dl>
        </div>
    );
}

export default function ProfitabilityCharts({ clients = [], hourCostCents = null, money, hours }) {
    // El margen: de la que más deja a la que más cuesta, para que el ojo lea el orden.
    const byMargin = [...clients]
        .sort((a, b) => b.marginCents - a.marginCents)
        .map((row) => ({ ...row, label: shortName(row.name) }));

    // El rendimiento por hora solo existe donde hubo horas medidas; lo demás se dice, no se rellena.
    const byHour = byMargin
        .filter((row) => row.revenuePerHourCents !== null && row.revenuePerHourCents !== undefined)
        .sort((a, b) => b.revenuePerHourCents - a.revenuePerHourCents);
    const sinHoras = clients.length - byHour.length;

    if (clients.length === 0) return null;

    // Pesos legibles en un eje estrecho: millones con una decimal, y miles por debajo.
    const axisMoney = (cents) => {
        const pesos = cents / 100;
        if (Math.abs(pesos) >= 1_000_000) return `$${(pesos / 1_000_000).toFixed(1).replace('.', ',')}M`;
        if (pesos === 0) return '$0';
        return `$${Math.round(pesos / 1000)}k`;
    };

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2" data-profitability-charts>
            <Card className="min-w-0 p-5 dark:bg-zinc-900">
                <div className="mb-4 min-w-0">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        Quién se come el mes
                        <InfoHint label="Margen por cliente">{PROFITABILITY_HINTS.clientMargin}</InfoHint>
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">El margen de cada cuenta: lo que dejó menos lo que costó atenderla.</p>
                </div>
                <div style={{ height: chartHeight(byMargin.length) }} data-chart-margin>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byMargin} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.05} horizontal={false} />
                            <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} tickFormatter={axisMoney} />
                            <YAxis type="category" dataKey="label" width={132} fontSize={10} tickLine={false} axisLine={false} interval={0} />
                            <ReferenceLine x={0} strokeOpacity={0.3} />
                            <Tooltip cursor={{ fillOpacity: 0.04 }} content={<ChartTooltip money={money} hours={hours} hourCostCents={hourCostCents} />} />
                            <Bar dataKey="marginCents" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
                                {byMargin.map((row) => (
                                    <Cell key={row.clientId}
                                        className={row.marginCents < 0 ? 'fill-[rgb(var(--brand-coral))]' : 'fill-[rgb(var(--brand-green))]'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card className="min-w-0 p-5 dark:bg-zinc-900">
                <div className="mb-4 min-w-0">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        Qué deja cada hora
                        <InfoHint label="Por hora">{PROFITABILITY_HINTS.perHour}</InfoHint>
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {hourCostCents
                            ? <>Lo que ingresó por hora trabajada. La línea es el costo hora de la agencia, {money(hourCostCents)}: a su izquierda, la cuenta cuesta más de lo que deja.</>
                            : 'Lo que ingresó por hora trabajada en cada cuenta.'}
                    </p>
                </div>
                {byHour.length > 0 ? (
                    <div style={{ height: chartHeight(byHour.length) }} data-chart-hour>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={byHour} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.05} horizontal={false} />
                                <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} tickFormatter={axisMoney} />
                                <YAxis type="category" dataKey="label" width={132} fontSize={10} tickLine={false} axisLine={false} interval={0} />
                                {hourCostCents ? <ReferenceLine x={hourCostCents} strokeOpacity={0.45} strokeDasharray="4 4" /> : null}
                                <Tooltip cursor={{ fillOpacity: 0.04 }} content={<ChartTooltip money={money} hours={hours} hourCostCents={hourCostCents} />} />
                                {/* Una cuenta que dejó $0 por hora existe y es la peor: con ancho cero
                                    su nombre quedaba flotando como si fuera un error. */}
                                <Bar dataKey="revenuePerHourCents" radius={[0, 4, 4, 0]} barSize={14} minPointSize={2} isAnimationActive={false}>
                                    {byHour.map((row) => (
                                        <Cell key={row.clientId}
                                            className={hourCostCents && row.revenuePerHourCents < hourCostCents ? 'fill-[rgb(var(--brand-coral))]' : 'fill-[rgb(var(--brand-green))]'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="py-10 text-center text-xs italic opacity-40">Ninguna cuenta tiene horas medidas este mes</p>
                )}
                {sinHoras > 0 && (
                    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400" data-chart-hour-missing>
                        {sinHoras === 1 ? 'Una cuenta no aparece aquí' : `${sinHoras} cuentas no aparecen aquí`} porque no tienen horas medidas este mes.
                    </p>
                )}
            </Card>
        </div>
    );
}
