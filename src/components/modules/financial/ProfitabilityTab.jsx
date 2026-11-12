import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Card } from '@/components/ui/Card';
import { BrainMonthPicker } from '@/components/ui/BrainDatePicker';
import { Loader2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import InfoHint from '@/components/ui/InfoHint';
import ProfitabilityCharts from './ProfitabilityCharts';
import { PROFITABILITY_HINTS } from '@/lib/clientProfitability';

// Rentabilidad por cliente (Rodny, 22 de octubre de 2026): lo facturado del mes frente a lo que costó atender cada
// cuenta, con un solo costo hora de la agencia. Solo administradores; la cuenta la hace el servidor
// (`buildClientProfitability`) y aquí solo se muestra. Primero la cuenta que más pierde.

const authed = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const money = (centsValue) => (centsValue === null || centsValue === undefined ? '—' : `${centsValue < 0 ? '-' : ''}$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(centsValue / 100)))}`);
const hours = (ms) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format((ms || 0) / 3_600_000)} h`;
const percent = (rate) => (rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)} %`);
const monthKey = (period) => (period ? `${period.year}-${String(period.month).padStart(2, '0')}-01` : '');

function Figure({ label, value, hint, explain }) {
  return (
    <Card className="min-w-0 p-4 dark:bg-zinc-900">
      <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="min-w-0 truncate">{label}</span>
        {explain && <InfoHint label={label}>{explain}</InfoHint>}
      </p>
      <p className="mt-1 truncate text-xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </Card>
  );
}

/** La cabecera de una columna de la tabla, con su iconito a la derecha de la palabra. */
function ColumnHead({ label, explain, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {label}
      <InfoHint label={label} side="bottom">{explain}</InfoHint>
    </span>
  );
}

export default function ProfitabilityTab({ enabled, initialMonth = '' }) {
  const [month, setMonth] = useState(initialMonth);
  const [year, monthNumber] = month ? month.split('-').map(Number) : [null, null];
  const { data, isLoading, error } = useQuery({
    queryKey: ['client-profitability', month || 'ultimo'],
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/client-profitability`, { ...authed(), params: month ? { year, month: monthNumber } : {} })).data,
    enabled,
    staleTime: 60_000
  });
  if (error) console.error('[Rentabilidad] No se pudo leer:', error.response?.data || error);
  const agency = data?.agency;

  return (
    <div className="space-y-6" data-profitability>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Rentabilidad por cliente{data?.period ? ` · ${data.period.label}` : ''}</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Lo facturado en el mes —o, si el cliente no tiene cuenta por cobrar del mes, lo que entró en Movimientos— frente a lo que costó atender cada cuenta: sus horas por el costo hora de la agencia, más lo que se pagó directamente por ella.</p>
        </div>
        <label className="w-56 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">
          <span className="block">Mes</span>
          <BrainMonthPicker ariaLabel="Mes de la rentabilidad" value={month || monthKey(data?.period)} onChange={setMonth} />
        </label>
      </div>

      {isLoading && <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</div>}
      {error && <p role="alert" className="text-sm text-destructive">{error.response?.data?.error || 'No se pudo calcular la rentabilidad del mes.'}</p>}

      {agency && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure label="Ingreso de clientes" value={money(agency.revenueCents)} explain={PROFITABILITY_HINTS.revenue} hint={agency.fromIncome ? `${agency.fromIncome} sin cuenta por cobrar: se usó lo que entró` : 'Lo facturado del mes'} />
            <Figure label="Costo de operación" value={money(agency.costCents)} explain={PROFITABILITY_HINTS.cost} hint={agency.directCostCents ? `${money(agency.directCostCents)} directo de clientes` : null} />
            <Figure label="Costo hora de la agencia" value={money(agency.hourCostCents)} explain={PROFITABILITY_HINTS.hourCost} />
            <Figure label="Horas medidas" value={hours(agency.hoursMs)} explain={PROFITABILITY_HINTS.hoursMeasured} hint={agency.coverage === null ? null : `${percent(agency.coverage)} de lo cerrado tiene tiempo`} />
          </div>

          {/* Los gráficos antes de la tabla: primero quién pesa, después el detalle fila a fila. */}
          <ProfitabilityCharts clients={data.clients} hourCostCents={agency.hourCostCents} money={money} hours={hours} />

          {data.notes?.length > 0 && (
            <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-300" data-profitability-notes>
              {data.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}

          <Card className="overflow-hidden dark:bg-zinc-900">
            <div className="hidden grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))] gap-3 border-b border-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:border-white/5 dark:text-zinc-400 md:grid">
              <span>Cliente</span>
              <ColumnHead label="Ingreso" explain={PROFITABILITY_HINTS.clientRevenue} className="justify-end" />
              <ColumnHead label="Horas" explain={PROFITABILITY_HINTS.clientHours} className="justify-end" />
              <ColumnHead label="Costo" explain={PROFITABILITY_HINTS.clientCost} className="justify-end" />
              <ColumnHead label="Margen" explain={PROFITABILITY_HINTS.clientMargin} className="justify-end" />
              <ColumnHead label="Por hora" explain={PROFITABILITY_HINTS.perHour} className="justify-end" />
            </div>
            {data.clients.length === 0 && <p className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">No hay facturación ni horas de clientes en este mes.</p>}
            <ul className="divide-y divide-zinc-100 dark:divide-white/5">
              {data.clients.map((row) => {
                const loses = row.marginCents < 0;
                return (
                  <li key={row.clientId} className="px-4 py-3" data-profitability-client={row.name}>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))] md:items-baseline">
                      <span className="col-span-2 min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-50 md:col-span-1">{row.name}</span>
                      <span className="text-zinc-500 md:hidden">Ingreso</span>
                      <span className="text-right text-zinc-700 dark:text-zinc-200" data-profitability-source={row.revenueSource || 'NINGUNO'}>
                        {money(row.revenueCents)}
                        {row.revenueSource && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{row.revenueSource === 'INGRESOS' ? 'lo que entró' : 'facturado'}</span>}
                      </span>
                      <span className="text-zinc-500 md:hidden">Horas</span><span className="text-right text-zinc-700 dark:text-zinc-200">{hours(row.hoursMs)}</span>
                      <span className="text-zinc-500 md:hidden">Costo</span><span className="text-right text-zinc-700 dark:text-zinc-200">{money(row.costCents)}</span>
                      <span className="text-zinc-500 md:hidden">Margen</span>
                      <span className={cn('text-right font-semibold', loses ? 'text-destructive brain-destructive-text' : row.marginCents > 0 ? 'text-status-positive-fg' : 'text-zinc-900 dark:text-zinc-50')} data-profitability-margin={loses ? 'negativo' : row.marginCents > 0 ? 'positivo' : 'cero'}>{money(row.marginCents)}{row.marginRate !== null ? <span className="ml-1 text-xs font-normal">({percent(row.marginRate)})</span> : null}</span>
                      <span className="text-zinc-500 md:hidden">Por hora</span><span className="text-right text-zinc-700 dark:text-zinc-200">{money(row.revenuePerHourCents)}</span>
                    </div>
                    {row.reading.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                        {row.reading.map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    )}
                  </li>
                );
              })}
              {agency.internalHoursMs > 0 && (
                <li className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300" data-profitability-internal>
                  Trabajo interno, sin cliente: {hours(agency.internalHoursMs)} · {money(agency.internalCostCents)}
                </li>
              )}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
