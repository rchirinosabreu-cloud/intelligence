import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatFinancialPeriod } from '@/utils/financialReceivables';

const action = 'min-h-11 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40';
const muted = 'text-sm text-zinc-500 dark:text-zinc-400';
function money(value, currency = 'COP') {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Por verificar';
  try { return Number(value).toLocaleString('es-CO', { style: 'currency', currency, maximumFractionDigits: 2 }); }
  catch { return `${value} · moneda por verificar`; }
}
function day(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value.length === 10 ? `${value}T12:00:00-05:00` : value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' });
}
function Support({ record }) {
  let href;
  try { const url = new URL(record?.attachmentUrl); if (['https:', 'http:'].includes(url.protocol)) href = url.href; } catch { /* A missing or unsafe support URL is not a link. */ }
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${action} inline-flex items-center text-primary`}>Ver soporte</a> : null;
}

export default function ClientFinancialStatementDialog({ client, year, onClose }) {
  const [section, setSection] = useState('debts');
  const [cursors, setCursors] = useState([null]);
  const cursor = cursors.at(-1);
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['financial-client-statement', client.id, year, section, cursor],
    retry: false,
    queryFn: async () => {
      try {
        return (await axios.get(`${getApiBaseUrl()}/api/financials/clients/${encodeURIComponent(client.id)}/statement`, {
          params: { year, section, ...(cursor ? { cursor } : {}) },
          headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
        })).data;
      } catch (failure) { console.error('[Client statement] Read failed:', failure.response?.data || failure); throw failure; }
    }
  });
  const changeSection = next => { setSection(next); setCursors([null]); };
  return <Dialog open onOpenChange={open => !open && onClose()}>
    <DialogContent className="gap-5 sm:max-w-3xl bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      <DialogHeader className="pr-8 text-left space-y-2">
        <DialogTitle>Estado de cuenta · {client.name}</DialogTitle>
        <DialogDescription>{section === 'debts' ? `Obligaciones de ${year} con su saldo actual. No es toda la cartera histórica ni un saldo al cierre del año.` : `Ingresos registrados en ${year}. Solo los abonos vinculados descuentan el saldo de una obligación.`}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700" aria-label="Vista del estado de cuenta">
        {[['debts', 'Obligaciones y abonos'], ['income', 'Ingresos registrados']].map(([value, label]) => <button key={value} type="button" aria-pressed={section === value} onClick={() => changeSection(value)} className={`${action} ${section === value ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white' : muted}`}>{label}</button>)}
      </div>
      {error ? <div role="alert" className="space-y-2 text-sm text-destructive">
        <p>{error.response?.data?.message || 'No fue posible cargar el estado de cuenta.'}</p>
        <button type="button" className={action} onClick={() => error.response?.status === 409 && cursor ? setCursors([null]) : refetch()}>{error.response?.status === 409 && cursor ? 'Volver a la primera página' : 'Reintentar'}</button>
      </div> : isLoading ? <p role="status" className={muted}>Consultando estado de cuenta…</p> : <>
        {!data?.items?.length && <p className={`${muted} py-6`}>{section === 'debts' ? 'No hay obligaciones registradas para este año.' : 'No hay ingresos registrados para este año.'}</p>}
        <div className="space-y-4" aria-busy={isFetching}>
          {data?.items?.map(item => section === 'debts' ? <article key={item.id} className="space-y-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <div className="space-y-1"><h3 className="text-sm font-semibold">{formatFinancialPeriod(item.period)}</h3><p className={muted}>{item.dueDate ? `Vence: ${day(item.dueDate)}` : 'Sin vencimiento registrado'}</p>{(item.notes || item.comments) && <p className={`${muted} break-words`}>{item.notes || item.comments}</p>}</div>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div><dt className={muted}>Valor de la obligación</dt><dd className="mt-1 text-sm font-semibold">{money(item.amount, item.currency)}</dd></div>
              <div><dt className={muted}>Abonos registrados</dt><dd className="mt-1 text-sm font-semibold">{money(item.paidAmount, item.currency)}</dd></div>
              <div><dt className={muted}>{item.balanceReviewRequired ? 'Saldo por verificar' : 'Saldo pendiente'}</dt><dd className="mt-1 text-sm font-semibold">{money(item.outstanding, item.currency)}</dd></div>
            </dl>
            {item.balanceReviewRequired && <p className="text-sm text-destructive">El historial de pagos requiere revisión. No se asume que la obligación esté saldada ni se inventa un saldo pendiente.</p>}
            {!!item.payments?.length && <details className="border-t border-zinc-200 pt-1 dark:border-zinc-700"><summary className={`${action} flex cursor-pointer items-center px-0 text-primary`}>Ver abonos ({item.payments.length})</summary>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">{item.payments.map(payment => <li key={payment.id} className="space-y-1 py-3 text-sm">
                <p className="font-medium">{day(payment.paidAt)} · {money(payment.amount, payment.account?.currency || item.currency)}</p>
                <p className={muted}>{payment.account?.name || 'Cuenta sin identificar'}</p>
                {payment.reference && <p className={`${muted} break-all`}>Referencia: {payment.reference}</p>}
                <p className={`${muted} break-words`}>{payment.financialRecord?.description || 'Ingreso vinculado no disponible'}</p>
                <Support record={payment.financialRecord} />
              </li>)}</ul>
            </details>}
          </article> : <article key={item.id} className="space-y-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <div className="flex flex-wrap justify-between gap-2 text-sm font-semibold"><h3 className="min-w-0 break-words">{item.description || 'Ingreso registrado'}</h3><span>{money(item.amount, item.account?.currency)}</span></div>
            <p className={muted}>{day(item.date)} · {item.account?.name || 'Cuenta sin identificar'}</p>
            {item.reference && <p className={`${muted} break-all`}>Referencia: {item.reference}</p>}
            <p className={muted}>{item.receivablePayment ? 'Aplicado a una obligación' : 'Sin aplicación a cartera'}</p><Support record={item}/>
          </article>)}
        </div>
        <nav aria-label="Paginación del estado de cuenta" className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <button type="button" className={action} disabled={cursors.length === 1 || isFetching} onClick={() => setCursors(current => current.slice(0, -1))}>Anterior</button>
          <span className={muted}>Página {cursors.length}</span>
          <button type="button" className={action} disabled={!data?.nextCursor || isFetching} onClick={() => setCursors(current => [...current, data.nextCursor])}>Siguiente</button>
        </nav>
      </>}
    </DialogContent>
  </Dialog>;
}
