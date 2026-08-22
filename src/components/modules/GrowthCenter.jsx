import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import { Target, TrendingUp, CheckCircle2, AlertTriangle, UploadCloud, Loader2, Calendar } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

const API = `${getApiBaseUrl()}/growth`;
const statusLabel = {
  PENDING: 'Pendiente', IN_PROGRESS: 'En curso', SUBMITTED: 'En revisión', APPROVED: 'Aprobada',
  RETURNED: 'Devuelta', COMPLETED: 'Completada', DETECTED: 'Detectada', IN_REVIEW: 'En revisión',
  FINANCE_PROPOSAL: 'Propuesta de Finanzas', APPLIED: 'Aplicada'
};
const phases = [
  { name: 'Ordenar', from: 1, to: 4 }, { name: 'Vender', from: 5, to: 8 }, { name: 'Consolidar', from: 9, to: 13 }
];
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
const phaseFor = (week) => phases.find((phase) => week >= phase.from && week <= phase.to)?.name || 'Preparación';
const currentWeekFor = (cycle) => {
  if (!cycle?.startDate) return 1;
  return Math.min(13, Math.max(1, Math.floor((Date.now() - new Date(cycle.startDate).getTime()) / (7 * 86400000)) + 1));
};

export default function GrowthCenter() {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const { data, isLoading, error } = useQuery({ queryKey: ['growth-dashboard'], queryFn: async () => (await axios.get(`${API}/dashboard`)).data });
  const cycle = data?.cycle;
  useEffect(() => { if (cycle) setSelectedWeek(currentWeekFor(cycle)); }, [cycle?.id]);

  const previewImport = async (selected) => {
    const form = new FormData(); form.append('file', selected);
    try { setPreview((await axios.post(`${API}/import/preview`, form)).data); setFile(selected); }
    catch (requestError) { console.error('[Growth] Error de previsualización:', requestError.response?.data || requestError.message); toast.error(requestError.response?.data?.error || 'No fue posible leer el plan.'); }
  };
  const importMutation = useMutation({
    mutationFn: async () => { const form = new FormData(); form.append('file', file); form.append('startDate', '2026-08-24T05:00:00.000Z'); form.append('endDate', '2026-11-22T04:59:59.999Z'); return (await axios.post(`${API}/import/commit`, form)).data; },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['growth-dashboard'] }); setPreview(null); setFile(null); toast.success('Ruta de crecimiento activada.'); },
    onError: (requestError) => { console.error('[Growth] Error guardando plan:', requestError.response?.data || requestError.message); toast.error(requestError.response?.data?.error || 'No fue posible guardar el plan.'); }
  });
  const actionMutation = useMutation({
    mutationFn: ({ id, status }) => axios.patch(`${API}/actions/${id}`, { status }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['growth-dashboard'] }); toast.success('Acción actualizada.'); },
    onError: (requestError) => { console.error('[Growth] Error actualizando acción:', requestError.response?.data || requestError.message); toast.error(requestError.response?.data?.error || 'No fue posible actualizar la acción.'); }
  });

  const actions = cycle?.actions || [];
  const completed = actions.filter((action) => ['APPROVED', 'COMPLETED'].includes(action.status)).length;
  const progress = actions.length ? Math.round((completed / actions.length) * 100) : 0;
  const selectedWeekData = cycle?.weeks?.find((week) => week.number === selectedWeek);
  const weekActions = useMemo(() => actions.filter((action) => action.weekId === selectedWeekData?.id), [actions, selectedWeekData?.id]);

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center text-slate-500 dark:text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error) return <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">No fue posible cargar el Centro de Crecimiento.</div>;

  return <div className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
    <PageHeader title="Centro de Crecimiento" subtitle="Ejecución, métricas y decisiones de la ruta de 90 días." />
    {!cycle ? <section className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"><Target className="h-6 w-6" /></div>
      <h2 className="mt-4 text-xl font-semibold text-slate-950 dark:text-white">Importa la Ruta de 90 días</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">Primero revisaremos semanas, acciones y métricas. Nada se guarda hasta que confirmes la importación.</p>
      <input ref={fileRef} className="hidden" type="file" accept=".xlsx,.xlsm,.xls" onChange={(event) => event.target.files?.[0] && previewImport(event.target.files[0])} />
      <button onClick={() => fileRef.current?.click()} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700"><UploadCloud className="h-5 w-5" /> Seleccionar plan</button>
      {preview && <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-slate-700 dark:bg-slate-950/50"><p className="font-semibold text-slate-900 dark:text-white">Revisión lista</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{preview.weeks.length} semanas · {preview.actions.length} acciones · {preview.metrics.length} métricas</p><button disabled={importMutation.isPending} onClick={() => importMutation.mutate()} className="mt-4 min-h-11 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{importMutation.isPending ? 'Importando…' : 'Confirmar importación'}</button></div>}
    </section> : <>
      <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Dato financiero provisional</p><p className="mt-1 text-sm">Caja, cartera, ingresos, costos y rentabilidad permanecen pendientes de conciliación contable. No generan conclusiones ni estados verdes hasta ser aprobados.</p></div></div></section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Avance general', `${progress}%`, TrendingUp], ['Acciones completadas', `${completed}/${actions.length}`, CheckCircle2], ['Semana activa', `${selectedWeek} · ${phaseFor(selectedWeek)}`, Calendar], ['Alertas abiertas', data.discrepancies.length, AlertTriangle]].map(([label, value, Icon]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><p className="text-sm text-slate-500 dark:text-slate-400">{label}</p><Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" /></div><p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{value}</p></article>)}</section>
      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Ruta completa</p><h2 className="text-lg font-semibold text-slate-950 dark:text-white">13 semanas: Ordenar, Vender y Consolidar</h2></div><p className="text-sm text-slate-500 dark:text-slate-400">{date.format(new Date(cycle.startDate))} – {date.format(new Date(cycle.endDate))}</p></div><div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-13">{cycle.weeks.map((week) => <button key={week.id} type="button" onClick={() => setSelectedWeek(week.number)} aria-pressed={selectedWeek === week.number} className={cn('min-h-14 rounded-xl border px-2 py-2 text-center transition', selectedWeek === week.number ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200')}><span className="block text-xs font-bold">S{week.number}</span><span className="mt-1 block text-[9px] font-medium">{phaseFor(week.number)}</span></button>)}</div></section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Semana {selectedWeek} · {phaseFor(selectedWeek)}</p><h2 className="text-xl font-semibold text-slate-950 dark:text-white">Acciones de la semana</h2></div><span className="text-sm text-slate-500 dark:text-slate-400">{selectedWeekData?.startsAt ? `${date.format(new Date(selectedWeekData.startsAt))} – ${date.format(new Date(selectedWeekData.endsAt))}` : cycle.name}</span></div><div className="mt-5 space-y-3">{weekActions.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">Esta semana no tiene acciones importadas.</p> : weekActions.map((action) => <article key={action.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900 dark:text-white">{action.title}</p>{action.isCritical && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300">Crítica</span>}</div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{action.front || 'Frente por definir'} · {action.ownerName || 'Sin responsable asignado'}{action.evidenceRequired ? ' · Requiere evidencia' : ''}</p></div><select aria-label={`Estado de ${action.title}`} value={action.status} onChange={(event) => actionMutation.mutate({ id: action.id, status: event.target.value })} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"><option value="PENDING">Pendiente</option><option value="IN_PROGRESS">En curso</option><option value="SUBMITTED">Enviar a revisión</option><option value="COMPLETED">Completada</option></select></div></article>)}</div></section>
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold text-slate-950 dark:text-white">Métricas clave</h2><div className="mt-4 space-y-3">{cycle.metrics.slice(0, 8).map((metric) => { const provisional = metric.unit === 'COP' || metric.source === 'IMPORT_PROVISIONAL'; return <div key={metric.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/60"><div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-700 dark:text-slate-300">{metric.name}</span><span className="font-semibold text-slate-950 dark:text-white">{metric.unit === 'COP' ? money.format(metric.value) : Number(metric.value).toLocaleString('es-CO')}</span></div>{provisional && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">Pendiente de conciliación</p>}</div>; })}</div></section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><h2 className="text-lg font-semibold text-slate-950 dark:text-white">Conciliación financiera</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Discordancias visibles hasta que Dirección apruebe su resolución.</p><div className="mt-4 space-y-3">{data.discrepancies.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">Sin discordancias registradas. Los indicadores continúan provisionales hasta la conciliación formal.</p> : data.discrepancies.slice(0, 5).map((item) => <article key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20"><p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{item.explanation}</p><span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-slate-900 dark:text-amber-300">{statusLabel[item.status] || 'Estado pendiente'}</span></article>)}</div></section>
        </div>
      </div>
    </>}
  </div>;
}
