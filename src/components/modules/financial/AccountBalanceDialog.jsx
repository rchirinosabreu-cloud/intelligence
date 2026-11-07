import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

export default function AccountBalanceDialog({ account, formatCurrency, onClose, onViewMovements }) {
  const [page, setPage] = useState(1);
  const { data, isFetching, error, refetch } = useQuery({ queryKey: ['financials-account-statement', account.id, page], queryFn: async () => {
    const response = await axios.get(`${getApiBaseUrl()}/api/financials/accounts/${account.id}/statement?page=${page}`, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
    return response.data;
  } });
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto rounded-xl sm:max-w-4xl dark:bg-zinc-900">
    <DialogHeader className="min-w-0 pr-8 text-left"><DialogTitle>Composición del saldo · {account.name}</DialogTitle><DialogDescription>Saldo registrado desde la apertura de esta cuenta, de todos los años. No es el saldo confirmado por el banco ni el resultado del periodo filtrado.</DialogDescription></DialogHeader>
    {error ? <div><p role="alert" className="text-sm text-destructive">No fue posible explicar el saldo. No se mostrará como cero.</p><button type="button" className="min-h-11 text-primary underline" onClick={() => refetch()}>Reintentar</button></div> : isFetching ? <p role="status" className="py-6 text-sm text-zinc-500">Consultando el saldo y sus movimientos…</p> : data && <div className="min-w-0 space-y-5" data-account-statement>
      <dl className="grid grid-cols-2 gap-4 border-y border-zinc-200 py-4 text-sm sm:grid-cols-4 dark:border-white/10">{[['Saldo inicial', data.summary.openingBalance], ['Ingresos desde apertura', data.summary.income], ['Egresos desde apertura', data.summary.expense], ['Saldo registrado', data.summary.balance]].map(([label, value]) => <div key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-semibold">{formatCurrency(value)}</dd></div>)}</dl>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Apertura: {data.summary.openingDay}. Saldo inicial + ingresos − egresos = saldo registrado. Se excluyen borradores, anulaciones y proyecciones. Los canjes y compensaciones no mueven esta cuenta.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-zinc-200 dark:border-white/10">{['Fecha', 'Movimiento', 'Ingreso', 'Egreso', 'Saldo acumulado'].map(title => <th key={title} className="px-2 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{data.items.map(row => <tr key={row.id} className="border-b border-zinc-100 dark:border-white/5"><td className="whitespace-nowrap px-2 py-3 text-xs">{String(row.date).slice(0, 10)}</td><td className="max-w-xs px-2 py-3"><p>{row.description || 'Sin concepto'}</p>{row.reference && <p className="text-xs text-zinc-500">{row.reference}</p>}</td><td className="whitespace-nowrap px-2 py-3">{row.type === 'INCOME' ? formatCurrency(row.amount) : '—'}</td><td className="whitespace-nowrap px-2 py-3">{row.type === 'EXPENSE' ? formatCurrency(row.amount) : '—'}</td><td className="whitespace-nowrap px-2 py-3 font-medium">{formatCurrency(row.runningBalance)}</td></tr>)}</tbody></table></div>
      {!data.total && <p className="text-sm text-zinc-500">No hay movimientos posteriores a la apertura. El saldo corresponde al valor inicial registrado.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{data.total} movimientos · página {page} de {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className="flex gap-2"><button type="button" disabled={page === 1} className="min-h-11 px-3 disabled:opacity-40" onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={!data.hasMore} className="min-h-11 px-3 disabled:opacity-40" onClick={() => setPage(value => value + 1)}>Siguiente</button></div></div>
      <button type="button" onClick={onViewMovements} className="min-h-11 rounded-lg border border-zinc-200 px-4 text-sm font-medium dark:border-white/10">Ver movimientos con los filtros del periodo</button>
    </div>}
  </DialogContent></Dialog>;
}
