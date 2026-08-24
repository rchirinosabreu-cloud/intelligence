import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });

export default function BankReconciliationPanel({ selectedYear, canApprove }) {
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/financials/accounts`, { headers: headers() })).data
  });
  const { data, isLoading } = useQuery({
    queryKey: ['bank-reconciliation', selectedYear],
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/financials/bank-reconciliation?year=${selectedYear}`, { headers: headers() })).data
  });

  const previewMutation = useMutation({
    mutationFn: async (selectedFile) => {
      const body = new FormData(); body.append('file', selectedFile); body.append('year', String(selectedYear));
      return (await axios.post(`${getApiBaseUrl()}/api/financials/bank-reconciliation/preview`, body, { headers: headers() })).data;
    },
    onSuccess: (result, selectedFile) => { setPreview(result); setFile(selectedFile); },
    onError: (error) => {
      console.error('[Conciliación bancaria] Error de lectura:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || 'No fue posible leer el extracto.');
    }
  });
  const importMutation = useMutation({
    mutationFn: async () => {
      const body = new FormData(); body.append('file', file); body.append('accountId', accountId); body.append('year', String(selectedYear));
      return (await axios.post(`${getApiBaseUrl()}/api/financials/bank-reconciliation/import`, body, { headers: headers() })).data;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['bank-reconciliation', selectedYear] });
      setPreview(null); setFile(null);
      toast.success(`${result.transactionCount} movimientos importados para revisión.`);
    },
    onError: (error) => {
      console.error('[Conciliación bancaria] Error de importación:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || 'No fue posible importar el extracto.');
    }
  });
  const approveMutation = useMutation({
    mutationFn: async (id) => (await axios.post(`${getApiBaseUrl()}/api/financials/bank-reconciliation/matches/${id}/approve`, {}, { headers: headers() })).data,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bank-reconciliation', selectedYear] }),
        queryClient.invalidateQueries({ queryKey: ['financial-records'] })
      ]);
      toast.success('Coincidencia aprobada y cuenta vinculada.');
    },
    onError: (error) => {
      console.error('[Conciliación bancaria] Error de aprobación:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || 'No fue posible aprobar la coincidencia.');
    }
  });

  const transactions = data?.transactions || [];
  const proposed = transactions.filter((item) => item.matches?.some((match) => match.status === 'PROPOSED'));
  const unmatched = transactions.filter((item) => item.status === 'UNMATCHED');
  const internalTransfers = data?.internalTransferCandidates || [];
  const continuityGaps = data?.continuityGaps || [];
  const internalTransferIds = new Set(internalTransfers.flatMap((item) => [item.debitTransactionId, item.creditTransactionId]));

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Conciliación bancaria</h2><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">El extracto no altera el libro contable. Cada coincidencia necesita aprobación.</p></div>
        {canApprove && <div className="flex flex-col gap-2 sm:flex-row"><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300"><span className="mb-1 block">Cuenta del extracto</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-950 dark:text-white sm:w-64"><option value="">Seleccionar cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><div className="self-end"><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) previewMutation.mutate(selected); event.target.value = ''; }} /><Button type="button" disabled={!accountId || previewMutation.isPending} onClick={() => inputRef.current?.click()} className="min-h-11 bg-violet-600 hover:bg-violet-700"><UploadCloud className="mr-2 h-4 w-4" />{previewMutation.isPending ? 'Leyendo…' : 'Importar extracto'}</Button></div></div>}
      </div>

      {preview && <Card className="rounded-2xl border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-zinc-900 dark:text-white">Revisión previa</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{preview.periodStart} a {preview.periodEnd} · {preview.transactions.length} movimientos · saldo final {currency.format(preview.closingBalance)}</p></div><div className="flex gap-2"><Button variant="outline" type="button" onClick={() => { setPreview(null); setFile(null); }}>Cancelar</Button><Button type="button" disabled={importMutation.isPending} onClick={() => importMutation.mutate()} className="bg-violet-600 hover:bg-violet-700">{importMutation.isPending ? 'Guardando…' : 'Confirmar importación'}</Button></div></div></Card>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card className="rounded-2xl border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><p className="text-xs text-zinc-500 dark:text-zinc-400">Extractos cargados</p><p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-white">{data?.imports?.length || 0}</p></Card><Card className="rounded-2xl border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><p className="text-xs text-zinc-500 dark:text-zinc-400">Coincidencias propuestas</p><p className="mt-2 text-2xl font-bold text-violet-600 dark:text-violet-300">{proposed.length}</p></Card><Card className="rounded-2xl border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><p className="text-xs text-zinc-500 dark:text-zinc-400">Movimientos sin coincidencia</p><p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-300">{unmatched.length}</p></Card><Card className="rounded-2xl border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><p className="text-xs text-zinc-500 dark:text-zinc-400">Transferencias internas detectadas</p><p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-300">{internalTransfers.length}</p></Card></div>

      <div className={`rounded-2xl border px-4 py-3 text-sm ${continuityGaps.length ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'}`}><span className="font-semibold">Continuidad de saldos:</span> {continuityGaps.length ? `${continuityGaps.length} diferencia(s) requieren revisión o extractos faltantes.` : 'los cierres y aperturas cargados coinciden.'}</div>

      {isLoading ? <div className="flex justify-center py-12 text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /></div> : <div className="space-y-3">{transactions.slice(0, 80).map((transaction) => { const match = transaction.matches?.find((item) => item.status === 'PROPOSED'); const isInternalTransfer = internalTransferIds.has(transaction.id); const highConfidence = Number(match?.confidence || 0) >= 0.9; return <article key={transaction.id} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2">{match || isInternalTransfer ? <CheckCircle2 className="h-4 w-4 shrink-0 text-violet-500" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}<p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{transaction.description}</p></div><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{new Date(transaction.postedAt).toLocaleDateString('es-CO', { timeZone: 'UTC' })} · {transaction.account?.name}</p>{isInternalTransfer && <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">Posible traslado entre cuentas propias; no se contabiliza dos veces.</p>}{match && <div className="mt-2 space-y-1"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${highConfidence ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'}`}>{highConfidence ? 'Alta confianza' : 'Requiere verificación'}</span><p className="text-xs text-violet-700 dark:text-violet-300">Coincidencia propuesta: {match.financialRecord?.description || 'Movimiento contable'} · {match.reason}</p></div>}</div><div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end"><span className={`font-semibold ${Number(transaction.amount) >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>{currency.format(Number(transaction.amount))}</span>{match && canApprove && <Button size="sm" type="button" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(match.id)}>Aprobar</Button>}</div></div></article>; })}{transactions.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700"><FileSpreadsheet className="mx-auto h-7 w-7 text-zinc-400" /><p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">Aún no hay extractos importados</p></div>}</div>}
    </section>
  );
}
