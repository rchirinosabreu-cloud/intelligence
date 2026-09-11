import Select from '@/components/ui/Select';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, UploadCloud } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { invalidateFinancialQueries } from '@/utils/financialQueryCache';

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const PAGE_SIZE = 20;

export default function BankReconciliationPanel({ selectedYear, canApprove }) {
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); setPreview(null); setFile(null); }, [selectedYear]);

  const { data: accountData } = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/financials/accounts`, { headers: headers() })).data
  });
  const accounts = Array.isArray(accountData) ? accountData : accountData?.accounts || [];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bank-reconciliation', selectedYear],
    queryFn: async () => {
      try {
        return (await axios.get(`${getApiBaseUrl()}/api/financials/bank-reconciliation?year=${selectedYear}`, { headers: headers() })).data;
      } catch (requestError) {
        console.error('[Conciliación bancaria] Error de consulta:', requestError.response?.data || requestError.message);
        throw requestError;
      }
    }
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
      await invalidateFinancialQueries(queryClient);
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
      await invalidateFinancialQueries(queryClient);
      toast.success('Coincidencia aprobada y cuenta vinculada.');
    },
    onError: (error) => {
      console.error('[Conciliación bancaria] Error de aprobación:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || 'No fue posible aprobar la coincidencia.');
    }
  });
  const rebuildMutation = useMutation({
    mutationFn: async () => (await axios.post(`${getApiBaseUrl()}/api/financials/bank-reconciliation/rebuild`, { year: selectedYear }, { headers: headers() })).data,
    onSuccess: async (result) => {
      await invalidateFinancialQueries(queryClient);
      toast.success(`${result.proposalCount} coincidencias listas para revisar.`);
    },
    onError: (error) => {
      console.error('[Conciliación bancaria] Error al recalcular:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || 'No fue posible recalcular las propuestas.');
    }
  });

  const transactions = data?.transactions || [];
  const proposed = transactions.filter((item) => item.matches?.some((match) => match.status === 'PROPOSED'));
  const unmatched = transactions.filter((item) => item.status === 'UNMATCHED');
  const internalTransfers = data?.internalTransferCandidates || [];
  const continuityGaps = data?.continuityGaps || [];
  const internalTransferIds = new Set(internalTransfers.flatMap((item) => [item.debitTransactionId, item.creditTransactionId]));
  const hasComparableStatements = useMemo(() => {
    const accountsWithStatements = new Set();
    for (const statement of data?.imports || []) {
      const statementAccount = statement.accountId || statement.account?.id;
      if (!statementAccount) continue;
      if (accountsWithStatements.has(statementAccount)) return true;
      accountsWithStatements.add(statementAccount);
    }
    return false;
  }, [data?.imports]);
  const pageCount = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const visibleTransactions = transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Conciliación bancaria</h2><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">El extracto no altera el libro contable. Cada coincidencia necesita aprobación.</p></div>
        {canApprove && <div className="flex flex-col gap-2 sm:flex-row"><label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300"><span className="mb-1 block">Cuenta del extracto</span><Select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-950 dark:text-white sm:w-64"><option value="">Seleccionar cuenta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label><div className="self-end"><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) previewMutation.mutate(selected); event.target.value = ''; }} /><Button type="button" disabled={!accountId || previewMutation.isPending} onClick={() => inputRef.current?.click()} className="min-h-11 bg-violet-600 hover:bg-violet-700"><UploadCloud className="mr-2 h-4 w-4" />{previewMutation.isPending ? 'Leyendo…' : 'Importar extracto'}</Button></div></div>}
      </div>

      {canApprove && data?.transactions?.length > 0 && <div className="flex justify-end"><Button type="button" disabled={rebuildMutation.isPending} onClick={() => rebuildMutation.mutate()} className="bg-[#009EB9] hover:bg-[#008da6]"><RefreshCw className={`mr-2 h-4 w-4 ${rebuildMutation.isPending ? 'animate-spin' : ''}`} />{rebuildMutation.isPending ? 'Recalculando…' : 'Recalcular propuestas'}</Button></div>}

      {preview && <Card className="rounded-2xl border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-zinc-900 dark:text-white">Revisión previa</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{preview.periodStart} a {preview.periodEnd} · {preview.transactions.length} movimientos · saldo final {currency.format(preview.closingBalance)}</p></div><div className="flex gap-2"><Button variant="outline" type="button" onClick={() => { setPreview(null); setFile(null); }}>Cancelar</Button><Button type="button" disabled={importMutation.isPending} onClick={() => importMutation.mutate()} className="bg-violet-600 hover:bg-violet-700">{importMutation.isPending ? 'Guardando…' : 'Confirmar importación'}</Button></div></div></Card>}

      {isLoading ? (
        <div role="status" className="flex justify-center gap-2 py-12 text-sm text-zinc-500 dark:text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" />Cargando conciliación…</div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 p-5 text-sm text-destructive">
          <p>No fue posible cargar la conciliación bancaria. No se han comprobado los saldos.</p>
          <Button variant="outline" type="button" className="mt-3 min-h-11 text-zinc-700 dark:text-zinc-200" onClick={() => refetch()}>Reintentar</Button>
        </div>
      ) : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Extractos cargados', data?.imports?.length || 0],
            ['Coincidencias propuestas', proposed.length],
            ['Movimientos sin coincidencia', unmatched.length],
            ['Transferencias internas detectadas', internalTransfers.length]
          ].map(([label, count]) => <Card key={label} className="rounded-2xl border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p><p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-white">{count}</p></Card>)}
        </div>

        <div className={`rounded-2xl border px-4 py-3 text-sm ${continuityGaps.length ? 'border-destructive/30 text-destructive' : 'border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300'}`}>
          <span className="font-semibold">Continuidad de saldos:</span>{' '}
          {!data?.imports?.length ? 'Aún no hay extractos para comprobar la continuidad.'
            : !hasComparableStatements ? 'Se necesitan al menos dos extractos de una misma cuenta para comparar cierres y aperturas.'
              : !Array.isArray(data?.continuityGaps) ? 'No fue posible comprobar la continuidad de los extractos.'
                : continuityGaps.length ? `${continuityGaps.length} diferencia(s) requieren revisión o extractos faltantes.`
                  : 'Sin diferencias en las transiciones de los extractos cargados. No confirma que estén todos los meses ni que los movimientos estén conciliados.'}
        </div>

        <div className="space-y-3">
          {visibleTransactions.map((transaction) => {
            const isMatched = transaction.status === 'MATCHED';
            const approvedMatch = transaction.matches?.find((item) => item.status === 'APPROVED');
            const match = transaction.matches?.find((item) => item.status === 'PROPOSED');
            const isInternalTransfer = internalTransferIds.has(transaction.id);
            const highConfidence = Number(match?.confidence || 0) >= 0.9;
            return <article key={transaction.id} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isMatched ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                      : <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
                    <p className="break-words text-sm font-semibold text-zinc-900 dark:text-white">{transaction.description}</p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{new Date(transaction.postedAt).toLocaleDateString('es-CO', { timeZone: 'UTC' })} · {transaction.account?.name}</p>
                  {isMatched && <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">Conciliado{approvedMatch?.financialRecord?.description ? ` · ${approvedMatch.financialRecord.description}` : ''}</p>}
                  {isInternalTransfer && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">Posible traslado entre cuentas propias. Revisa ambos movimientos antes de contabilizar.</p>}
                  {!isMatched && match && <div className="mt-2 space-y-1">
                    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-white/10 dark:text-zinc-200">{highConfidence ? 'Alta confianza' : 'Requiere verificación'}</span>
                    <p className="text-xs text-violet-700 dark:text-violet-300">Coincidencia propuesta: {match.financialRecord?.description || 'Movimiento contable'} · {match.reason}</p>
                  </div>}
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <span className={`font-semibold ${Number(transaction.amount) >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-zinc-900 dark:text-zinc-100'}`}>{currency.format(Number(transaction.amount))}</span>
                  {!isMatched && match && canApprove && <Button size="sm" type="button" className="min-h-11" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(match.id)}>Aprobar</Button>}
                </div>
              </div>
            </article>;
          })}
          {transactions.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700"><FileSpreadsheet className="mx-auto h-7 w-7 text-zinc-400" /><p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">{data?.imports?.length ? 'No hay movimientos bancarios en el año seleccionado' : 'Aún no hay extractos importados'}</p></div>}
        </div>

        {transactions.length > 0 && <nav aria-label="Paginación de conciliación" className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-300">
          <p aria-live="polite">Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, transactions.length)} de {transactions.length} movimientos</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" type="button" className="min-h-11" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</Button>
            <span>Página {page} de {pageCount}</span>
            <Button variant="outline" type="button" className="min-h-11" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Siguiente</Button>
          </div>
        </nav>}
      </>}
    </section>
  );
}
