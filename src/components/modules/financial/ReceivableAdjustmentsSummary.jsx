import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Card } from '@/components/ui/Card';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { RETENTION_KIND, RETENTION_TYPES, SETTLEMENT_KINDS } from '@/lib/receivableSettlement';
import RecordDocumentsInline from './RecordDocumentsInline';
import { retentionCertificateApi } from '@/lib/financialDocumentsClient';

// Resumen de ajustes de cartera (Rodny, 20 de octubre de 2026: «el resumen de ajustes de cartera
// en Financiero»). Lo saldado sin dinero y la diferencia en cambio del periodo, de una vez, sin
// entrar cliente por cliente. Nada de esto es un movimiento: no entró ni salió dinero.
const money = value => Number(value || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const day = value => (value ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'UTC' }) : '');

export default function ReceivableAdjustmentsSummary({ filterQuery, enabled = true }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['financial-receivable-adjustments', filterQuery],
    enabled,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/financials/receivable-adjustments?${filterQuery}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })).data
  });
  if (!enabled) return null;
  const summary = data?.summary;
  const items = data?.items || [];
  const exchange = data?.exchangeAdjustments || [];
  const count = items.length + exchange.length;
  return <Card data-receivable-adjustments className="rounded-2xl border-zinc-200/50 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-zinc-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Ajustes de cartera</h3>
        <p className="mt-1 text-xs text-zinc-500">Lo que bajó la cartera sin entrar como dinero: retenciones de los clientes, acuerdos, canjes, compensaciones, condonaciones y la diferencia en cambio de las cuentas en dólares. No son movimientos.</p>
      </div>
      {count > 0 && <button type="button" aria-expanded={open} onClick={() => setOpen(current => !current)} className="min-h-11 rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">{open ? 'Ocultar detalle' : `Ver detalle (${count})`}</button>}
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-destructive">No fue posible cargar los ajustes de cartera.</p>
      : isLoading ? <p className="mt-3 text-xs text-zinc-500">Cargando ajustes…</p>
      : count === 0 ? <p data-receivable-adjustments-empty className="mt-3 text-xs text-zinc-500">Sin ajustes en el periodo seleccionado.</p>
      : <>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Lo retenido por los clientes, con su desglose por tipo: lo que Francisco descuenta en su
              declaración y para lo que hay que pedir certificados (22 de octubre de 2026). */}
          <div data-adjustment-retention className="rounded-xl border border-zinc-100 px-3 py-2 dark:border-white/5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Retenciones de clientes</p>
            <p className="mt-1 text-sm font-semibold text-brand-cyan-deep dark:text-brand-cyan">{money(summary?.retention?.total)}</p>
            <p className="text-[10px] text-zinc-500">{RETENTION_TYPES.filter(type => summary?.retention?.byType?.[type.value]?.count).map(type => `${type.short} ${money(summary.retention.byType[type.value].total)}`).join(' · ') || 'Sin retenciones'}</p>
          </div>
          {SETTLEMENT_KINDS.filter(kind => kind.value !== RETENTION_KIND).map(kind => {
            const bucket = summary?.byKind?.[kind.value] || { total: 0, count: 0 };
            return <div key={kind.value} data-adjustment-kind={kind.value} className="rounded-xl border border-zinc-100 px-3 py-2 dark:border-white/5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{kind.label}</p>
              <p className="mt-1 text-sm font-semibold text-brand-magenta-deep dark:text-brand-magenta">{money(bucket.total)}</p>
              <p className="text-[10px] text-zinc-500">{bucket.count === 1 ? '1 cuenta' : `${bucket.count} cuentas`}</p>
            </div>;
          })}
          <div data-adjustment-exchange className="rounded-xl border border-zinc-100 px-3 py-2 dark:border-white/5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Diferencia en cambio</p>
            <p className="mt-1 text-sm font-semibold text-brand-cyan-deep dark:text-brand-cyan">{summary?.exchange?.net >= 0 ? '+' : '−'}{money(Math.abs(summary?.exchange?.net || 0))}</p>
            <p className="text-[10px] text-zinc-500">{summary?.exchange?.count === 1 ? '1 pago en dólares' : `${summary?.exchange?.count || 0} pagos en dólares`}</p>
          </div>
        </div>
        {open && <div className="mt-4 space-y-3">
          {items.length > 0 && <ul className="divide-y divide-zinc-200 dark:divide-white/10">
            {items.map(item => <li key={item.id} data-adjustment-item className="flex flex-wrap items-start justify-between gap-2 py-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 dark:text-white">{item.clientName}{item.counterpartyLabel ? <span className="ml-1.5 font-normal text-zinc-500">· {item.counterpartyLabel}</span> : null}</p>
                <p className="text-zinc-500">{day(item.date)} · {item.kindLabel}{item.authorizedBy ? ` · Autorizó ${item.authorizedBy}` : ''}{item.certificateNumber ? ` · Certificado ${item.certificateNumber}` : ''} · de un valor original de {money(item.originalAmount)}</p>
                {item.kind === RETENTION_KIND && <RecordDocumentsInline className="mt-1" recordId={item.id} documents={item.documents || []} api={retentionCertificateApi} canWrite={false} />}
                {item.goods && <p className="text-zinc-600 dark:text-zinc-300">Se recibió: {item.goods}{item.destination ? ` · Destino: ${item.destination}` : ''}</p>}
                {item.offsetAgainst && <p className="text-zinc-600 dark:text-zinc-300">Compensado contra: {item.offsetAgainst}</p>}
                {item.reason && <p className="whitespace-pre-line text-zinc-600 dark:text-zinc-300">{item.reason}</p>}
              </div>
              <span className={item.kind === RETENTION_KIND ? 'font-semibold text-brand-cyan-deep dark:text-brand-cyan' : 'font-semibold text-brand-magenta-deep dark:text-brand-magenta'}>{money(item.amount)}</span>
            </li>)}
          </ul>}
          {exchange.length > 0 && <ul className="divide-y divide-zinc-200 dark:divide-white/10">
            {exchange.map(item => <li key={`${item.receivableId}-${item.date}`} data-adjustment-exchange-item className="flex flex-wrap items-start justify-between gap-2 py-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 dark:text-white">{item.clientName}</p>
                <p className="text-zinc-500">{day(item.date)} · Cuenta en dólares{item.foreignAmount ? ` (USD ${Number(item.foreignAmount).toLocaleString('es-CO')})` : ''} · la cartera en pesos pasó de {money(item.from)} a {money(item.to)} por la tasa del día</p>
              </div>
              <span className="font-semibold text-brand-cyan-deep dark:text-brand-cyan">{item.difference >= 0 ? '+' : '−'}{money(Math.abs(item.difference))}</span>
            </li>)}
          </ul>}
        </div>}
      </>}
  </Card>;
}
