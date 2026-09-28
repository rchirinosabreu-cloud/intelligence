import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Select from '@/components/ui/Select';
import { displayDate } from './GovernanceRecords';

// Registro central de uso de IA (27 de septiembre de 2026): quién, desde qué flujo, con qué
// proveedor y modelo, para qué cliente y con qué resultado. Nunca el contenido.

const PERIODS = [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['365', 'Último año']];
const OUTCOME_LABELS = { ALLOWED: 'Permitida', BLOCKED: 'Bloqueada', ERROR: 'Error' };
const FLOW_LABELS = {
  'parrillas.review': 'Revisión de parrillas', content: 'Parrillas', reports: 'Reportes', minutes: 'Minutas',
  'minutes-automatic': 'Minutas automáticas', chat: 'Chat', openai: 'Asistente', fireflies: 'Fireflies',
  'talent-radar': 'Radar de talento', activity: 'Calendario', drive: 'Drive', automatico: 'Automático (sin persona)'
};
const flowLabel = (flow) => FLOW_LABELS[flow] || flow;
const number = (value) => new Intl.NumberFormat('es-CO').format(value || 0);
const buttonStyle = 'min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50';

const Stat = ({ label, value, tone = '' }) => (
  <div className="min-w-0 rounded-xl border border-border bg-background p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
  </div>
);

export default function GovernanceUsage({ request }) {
  const [days, setDays] = useState('30');
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState('');
  const summary = useQuery({ queryKey: ['governance', 'usage', 'summary', days], queryFn: () => request(`/usage/summary?days=${days}`), staleTime: 60000 });
  const events = useQuery({ queryKey: ['governance', 'usage', 'list', days, page], queryFn: () => request(`/usage?days=${days}&page=${page}`), staleTime: 60000 });

  const download = async () => {
    setExportError('');
    try {
      const blob = await request(`/usage/export?days=${days}`, { download: true });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `uso-ia-${days}-dias.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error.message);
    }
  };

  const s = summary.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Uso de IA</h2>
          <p className="text-sm text-muted-foreground">Cada llamada a un proveedor de IA, sin su contenido. Se conserva un año.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block space-y-1" htmlFor="gov-usage-period">
            <span className="block text-xs text-muted-foreground">Periodo</span>
            <Select id="gov-usage-period" value={days} onChange={(event) => { setDays(event.target.value); setPage(1); }}>
              {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
          <button type="button" className={buttonStyle} onClick={download}>Exportar CSV</button>
        </div>
      </div>
      {exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}

      {summary.isLoading ? <p role="status">Cargando resumen…</p> : summary.error ? <p role="alert" className="text-destructive">{summary.error.message}</p> : s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Llamadas" value={number(s.calls)} />
            <Stat label="Personas" value={number(s.people)} />
            <Stat label="Bloqueadas por gobierno" value={number(s.blocked)} tone={s.blocked ? 'text-destructive' : ''} />
            <Stat label="Con error" value={number(s.errors)} />
            <Stat label="Tokens (entrada / salida)" value={`${number(s.inputTokens)} / ${number(s.outputTokens)}`} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">Por flujo</h3>
              {s.byFlow.length ? <ul className="mt-2 space-y-1 text-sm">{s.byFlow.map((row) => <li key={row.flow} className="flex justify-between gap-3"><span className="truncate">{flowLabel(row.flow)}</span><span className="tabular-nums text-muted-foreground">{number(row.calls)}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Sin llamadas en el periodo.</p>}
            </div>
            <div className="min-w-0 rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">Por proveedor y modelo</h3>
              {s.byProvider.length ? <ul className="mt-2 space-y-1 text-sm">{s.byProvider.map((row) => <li key={`${row.provider}:${row.model}`} className="flex justify-between gap-3"><span className="truncate">{row.provider} · {row.model}</span><span className="tabular-nums text-muted-foreground">{number(row.calls)}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Sin llamadas en el periodo.</p>}
            </div>
          </div>
        </>
      )}

      <div className="min-w-0 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>{['Fecha', 'Persona', 'Flujo', 'Proveedor / modelo', 'Cliente', 'Resultado', 'Tokens', 'Duración'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {events.isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center" role="status">Cargando registro…</td></tr>}
            {events.error && <tr><td colSpan={8} className="px-3 py-6 text-center text-destructive" role="alert">{events.error.message}</td></tr>}
            {events.data && !events.data.items.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Sin llamadas en el periodo.</td></tr>}
            {events.data?.items.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2">{displayDate(e.occurredAt)}</td>
                <td className="px-3 py-2">{e.actorName || <span className="text-muted-foreground">Automático</span>}</td>
                <td className="px-3 py-2">{flowLabel(e.flow)}</td>
                <td className="px-3 py-2">{e.provider} · {e.model}</td>
                <td className="px-3 py-2">{e.clientName || '—'}</td>
                <td className={`px-3 py-2 ${e.outcome === 'ALLOWED' ? '' : 'font-medium text-destructive'}`}>{OUTCOME_LABELS[e.outcome] || e.outcome}{e.statusCode ? ` (${e.statusCode})` : ''}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{e.inputTokens != null ? `${number(e.inputTokens)} / ${number(e.outputTokens)}` : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{e.durationMs != null ? `${number(e.durationMs)} ms` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3 text-sm">
        <button type="button" className={buttonStyle} disabled={page === 1 || events.isFetching} onClick={() => setPage((p) => p - 1)}>Anterior</button>
        <span>Página {page}</span>
        <button type="button" className={buttonStyle} disabled={!events.data?.hasMore || events.isFetching} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
