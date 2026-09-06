import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const categories = { MARCA: 'Marca', ESTRATEGIA: 'Estrategia', GRAMATICA: 'Gramática', CONSISTENCIA: 'Consistencia' };
const statuses = { PROPOSED: 'Por validar', APPROVED: 'Aprobado', REJECTED: 'Rechazado', REVOKED: 'Revocado' };
const actions = { EDIT: ['Ajustar propuesta', 'Guardar ajuste'], APPROVE: ['Aprobar criterio', 'Confirmar aprobación'], REJECT: ['Rechazar propuesta', 'Confirmar rechazo'], REVOKE: ['Revocar criterio', 'Confirmar revocación'], DELETE: ['Eliminar criterio', 'Eliminar definitivamente'] };
const textActionClass = 'min-h-11 min-w-11 px-0 font-medium active:scale-100';
const criterionActionClass = `${textActionClass} text-destructive brain-destructive-text`;
const approveActionClass = `${textActionClass} text-[rgb(var(--bria-header-end))] dark:text-cyan-300`;
const neutralActionClass = `${textActionClass} text-zinc-600 dark:text-zinc-300`;
const menuActionClass = 'min-h-11 cursor-pointer rounded-lg px-3';
const historyLabels = { PROPOSE: 'Propuesta', EDIT: 'Ajuste', APPROVE: 'Aprobación', REJECT: 'Rechazo', REVOKE: 'Revocación' };
const inputClass = 'min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const formatDate = value => Number.isFinite(new Date(value).getTime())
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value)) : 'Fecha no disponible';

export default function BriaClientCriteria({ planId, onChanged }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [error, setError] = useState('');
  const [form, setForm] = useState(null), [text, setText] = useState(''), [category, setCategory] = useState('MARCA'), [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [scope, setScope] = useState('CLIENT'), [detailId, setDetailId] = useState(null);
  const [discovery, setDiscovery] = useState(null), [discovering, setDiscovering] = useState(false);
  const [saving, setSaving] = useState(false), [loading, setLoading] = useState(false);
  const sequence = useRef(0), mounted = useRef(true), requestId = useRef(null), interacting = useRef(false);
  interacting.current = Boolean(form || saving || discovering);
  const endpoint = `${getApiBaseUrl()}/api/content/plans/${planId}/criteria`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; }; }, []);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const response = await axios.get(endpoint, auth());
      if (mounted.current && sequence.current === current) { setData(response.data); setError(''); }
    } catch (failure) {
      console.error('Bria criteria load:', failure.response?.data || failure);
      if (mounted.current && sequence.current === current) setError(failure.response?.data?.error || 'No fue posible cargar los criterios.');
    } finally { if (mounted.current && sequence.current === current) setLoading(false); }
  }, [endpoint]);
  const loadDiscovery = useCallback(async () => {
    try {
      const response = await axios.get(`${endpoint}/discovery`, auth());
      if (mounted.current) setDiscovery(response.data);
    } catch (failure) { console.error('Bria discovery status:', failure.response?.data || failure); }
  }, [endpoint]);
  useEffect(() => {
    if (!open) return undefined;
    load();
    loadDiscovery();
    const refresh = () => { if (!interacting.current) { load(); loadDiscovery(); } };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); sequence.current++; };
  }, [open, load, loadDiscovery]);
  const discover = async () => {
    if (discovering) return;
    setDiscovering(true); setError('');
    try {
      const response = await axios.post(`${endpoint}/discover`, {}, { ...auth(), timeout: 100000 });
      if (!mounted.current) return;
      setDiscovery(response.data); await load();
    } catch (failure) {
      console.error('Bria discovery:', failure.response?.data || failure);
      if (mounted.current) setError(failure.response?.data?.error || 'No se completó la búsqueda. Reintenta para continuar.');
    } finally { if (mounted.current) setDiscovering(false); }
  };
  const changeOpen = value => {
    setOpen(value);
    if (!value) { setForm(null); setDetailId(null); setReason(''); setConfirmation(''); setError(''); sequence.current++; }
  };
  const start = (action, criterion = null) => {
    setError(''); setReason(''); setConfirmation(''); setText(action === 'EDIT' ? criterion.text : ''); setCategory(action === 'EDIT' ? criterion.category : 'MARCA'); setScope(criterion?.scope || 'CLIENT');
    requestId.current = crypto.randomUUID();
    setForm({ action, criterion });
  };
  const save = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); sequence.current++;
    try {
      if (form.action === 'PROPOSE') await axios.post(endpoint, { text, category, ...(reason.trim() ? { reason: reason.trim() } : {}), requestId: requestId.current }, auth());
      else if (form.action === 'EDIT') await axios.patch(`${endpoint}/${form.criterion.id}/draft`, { text, category, scope, reason, version: form.criterion.version }, auth());
      else if (form.action === 'DELETE') await axios.delete(`${endpoint}/${form.criterion.id}`, { ...auth(), data: { version: form.criterion.version, confirmation } });
      else await axios.patch(`${endpoint}/${form.criterion.id}`, { action: form.action, version: form.criterion.version, reason }, auth());
      if (!mounted.current) return;
      setForm(null); setReason('');
      await load();
      onChanged?.();
    } catch (failure) {
      console.error('Bria criteria action:', failure.response?.data || failure);
      if (mounted.current) setError(failure.response?.data?.error || 'No fue posible guardar. Tu explicación se conserva para reintentar.');
    } finally { if (mounted.current) setSaving(false); }
  };
  const proposing = form?.action === 'PROPOSE';
  const editing = form?.action === 'EDIT', drafting = proposing || editing;
  const deleting = form?.action === 'DELETE';
  return <>
    <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => changeOpen(true)}>Criterios del cliente</Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent overlayClassName="z-[70] motion-reduce:animate-none" className="z-[71] block gap-0 rounded-2xl border-zinc-200 bg-white p-0 text-zinc-900 motion-reduce:animate-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-2xl">
        <div data-bria-header className="brain-ai-header px-[24px] py-[24px] pr-[56px] text-white">
          <DialogHeader className="flex-row items-center gap-[12px] space-y-0 text-left">
            <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-white dark:bg-white"><img src="/brainstudio-mascot-tip.png" alt="" className="h-[40px] w-[40px] object-contain" /></span>
            <div className="min-w-0 space-y-2 break-words">
              <DialogTitle className="leading-snug text-white">{form ? proposing ? 'Proponer un criterio' : actions[form.action][0] : 'Lo que Bria debe recordar'}</DialogTitle>
              <DialogDescription className="text-white/95">{data?.clientName || 'Criterios del cliente'} · memoria editorial validada</DialogDescription>
            </div>
          </DialogHeader>
        </div>
        <div className="space-y-5 p-5 sm:p-6" aria-busy={saving || loading || discovering}>
          {error && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive dark:text-destructive-foreground">{error}</p>}
          {form ? <form onSubmit={save} className="space-y-5">
            {drafting ? <>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">La propuesta no se aplica hasta que la valide el responsable de esta parrilla, un PM o un admin. Descartar un hallazgo no crea una regla.</p>
              <label className="grid gap-2 text-sm font-medium">Categoría<select value={category} disabled={saving} onChange={e => setCategory(e.target.value)} className={inputClass}>{Object.entries(categories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
              <label className="grid gap-2 text-sm font-medium">Criterio<textarea required maxLength={800} rows={3} disabled={saving} value={text} onChange={e => setText(e.target.value)} placeholder="Describe una regla concreta, vigente y aplicable a este cliente." className={inputClass} /></label>
              {editing && <label className="grid gap-2 text-sm font-medium">Alcance<select value={scope} disabled={saving} onChange={e => setScope(e.target.value)} className={inputClass}><option value="PLAN">Solo parrilla de origen</option><option value="CLIENT">Todo el cliente</option></select></label>}
            </> : <>
              <p className="break-words text-sm font-medium leading-relaxed">{form.criterion.text}</p>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{deleting ? 'Se eliminarán este criterio y todo su historial. Bria dejará de usarlo. Esta acción no se puede deshacer. Las revisiones ya guardadas se conservarán.' : form.action === 'APPROVE' ? form.criterion.scope === 'PLAN' ? 'Bria usará este criterio solo en la parrilla de origen. No se aplicará a otras parrillas del cliente.' : 'Bria usará este criterio en las revisiones de este cliente. Las parrillas activas se revisarán de nuevo.' : form.action === 'REVOKE' ? 'Bria dejará de usar este criterio. La decisión y su historial se conservarán.' : 'La propuesta no se incorporará a la memoria. El motivo quedará en el historial.'}</p>
              {form.action === 'APPROVE' && Boolean(form.criterion.provenance?.conflicts?.length) && <p className="text-sm text-destructive brain-destructive-text">Esta propuesta señala un conflicto con criterios aprobados. Revisa las fuentes y resuelve la contradicción antes de aprobar.</p>}
            </>}
            {deleting ? <label className="grid gap-2 text-sm font-medium">Escribe ELIMINAR para confirmar<input required autoComplete="off" maxLength={8} disabled={saving} value={confirmation} onChange={e => setConfirmation(e.target.value)} className={inputClass} /></label>
              : proposing ? <details className="text-sm text-zinc-600 dark:text-zinc-300">
                <summary className="min-h-11 cursor-pointer content-center rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Añadir contexto</summary>
                <label className="mt-3 grid gap-2 text-sm font-medium">Contexto o fuente (opcional)<textarea maxLength={500} rows={3} disabled={saving} value={reason} onChange={e => setReason(e.target.value)} placeholder="Si aporta valor, añade el acuerdo, la guía o la fuente que respalda este criterio." className={inputClass} /></label>
              </details>
              : <label className="grid gap-2 text-sm font-medium">{editing ? 'Motivo del ajuste' : 'Motivo de la decisión'}<textarea required maxLength={500} rows={3} disabled={saving} value={reason} onChange={e => setReason(e.target.value)} placeholder="Indica el acuerdo, la guía vigente o el contexto que respalda tu decisión." className={inputClass} /></label>}
            <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" className="min-h-11" disabled={saving} onClick={() => { setForm(null); setError(''); }}>Cancelar</Button>
              <Button type="submit" variant={drafting ? 'default' : 'link'} data-saving={saving} className={drafting ? 'min-h-11 bg-[rgb(var(--bria-header-end))] text-white hover:bg-[rgb(var(--bria-header-start))] dark:bg-[rgb(var(--bria-header-end))]' : form.action === 'APPROVE' ? approveActionClass : form.action === 'REJECT' ? neutralActionClass : criterionActionClass} disabled={saving || (deleting ? confirmation !== 'ELIMINAR' : (!proposing && !reason.trim()) || (drafting && !text.trim()))}>{saving ? deleting ? 'Eliminando…' : 'Guardando…' : proposing ? 'Guardar propuesta' : actions[form.action][1]}</Button>
            </div>
          </form> : <>
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">Solo los criterios aprobados se usan en las revisiones de este cliente. Puedes consultar quién los validó y por qué.</p>
              <div className="flex flex-wrap gap-3">
                {data?.canPropose && <Button type="button" variant="outline" disabled={saving || discovering} onClick={() => start('PROPOSE')} className="min-h-11 shrink-0 rounded-xl">Proponer criterio</Button>}
                {data?.canDiscover && <Button type="button" variant="outline" data-discovering={discovering} disabled={saving || discovering || discovery?.state === 'RUNNING'} onClick={discover} className="min-h-11 rounded-xl">{discovering ? 'Buscando aprendizajes…' : 'Buscar aprendizajes'}</Button>}
              </div>
              {data?.canDiscover && <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Bria contrasta feedback, notas internas y piezas aprobadas de este cliente. Solo propone; el equipo decide.</p>}
            </div>
            {discovery?.state === 'RUNNING' && <p role="status" className="text-sm">Bria está buscando aprendizajes. {discovery.processedBatches}/{discovery.totalBatches} lotes procesados.</p>}
            {['FAILED', 'INTERRUPTED'].includes(discovery?.state) && <p role="status" className="text-sm text-destructive brain-destructive-text">La búsqueda no terminó. Puedes volver a buscar para continuar.</p>}
            {discovery?.state === 'COMPLETED' && <p role="status" className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Última búsqueda: {discovery.result?.sourceCount || 0} fuentes analizadas · {discovery.result?.created || 0} propuestas nuevas. Sin cambios en las fuentes, se conserva este resultado.</p>}
            {!data && loading && <p role="status" className="text-sm">Cargando criterios…</p>}
            {error && !data && <Button type="button" variant="outline" className="min-h-11" onClick={load}>Reintentar</Button>}
            {data && !data.criteria?.length && <p className="py-6 text-sm text-zinc-600 dark:text-zinc-300">Aún no hay criterios propuestos. Bria puede revisar redacción y coherencia sin memoria del cliente.</p>}
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(data?.criteria || []).map(criterion => <article key={criterion.id} className="space-y-3 py-5 first:pt-0">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><span>{categories[criterion.category]}</span><span>·</span><span>{statuses[criterion.status]}</span></div>
                  <span className="ml-auto">v{criterion.version}</span>
                  {(criterion.canDelete || (criterion.canValidate && ['PROPOSED', 'APPROVED'].includes(criterion.status))) && <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" aria-label="Más opciones" className="h-11 w-11 shrink-0 p-0 text-xl text-zinc-500 dark:text-zinc-400">⋯</Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="brain-popover-surface z-[72] overflow-y-auto motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none" collisionPadding={16}>
                      {criterion.canValidate && criterion.status === 'PROPOSED' && <DropdownMenuItem className={menuActionClass} onSelect={() => start('EDIT', criterion)}>Ajustar</DropdownMenuItem>}
                      {criterion.canValidate && criterion.status === 'APPROVED' && <DropdownMenuItem className={`${menuActionClass} text-destructive brain-destructive-text focus:text-destructive`} onSelect={() => start('REVOKE', criterion)}>Revocar</DropdownMenuItem>}
                      {criterion.canDelete && <DropdownMenuItem className={`${menuActionClass} text-destructive brain-destructive-text focus:text-destructive`} onSelect={() => start('DELETE', criterion)}>Eliminar</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>}
                </div>
                <p className="break-words text-sm leading-relaxed">{criterion.text}</p>
                {criterion.provenance?.origin === 'BRIA' && <div className="space-y-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  <p className="flex flex-wrap gap-x-3"><span>Propuesto por Bria</span><span>{criterion.scope === 'PLAN' ? 'Solo parrilla de origen' : 'Todo el cliente'}</span></p>
                  <p>{criterion.history?.[0]?.reason}</p>
                  {criterion.provenance.scopeNote && <p>{criterion.provenance.scopeNote}</p>}
                  {Boolean(criterion.provenance.conflicts?.length) && <p className="text-destructive brain-destructive-text">Posible conflicto con {criterion.provenance.conflicts.length} criterio(s) aprobado(s). No se sustituirán automáticamente.</p>}
                </div>}
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {criterion.canValidate && criterion.status === 'PROPOSED' && <><Button type="button" variant="link" className={approveActionClass} onClick={() => start('APPROVE', criterion)}>Aprobar</Button><Button type="button" variant="link" className={neutralActionClass} onClick={() => start('REJECT', criterion)}>Rechazar</Button></>}
                  <Button type="button" variant="link" className={neutralActionClass} aria-expanded={detailId === criterion.id} aria-controls={`criterion-detail-${criterion.id}`} onClick={() => setDetailId(value => value === criterion.id ? null : criterion.id)}>{detailId === criterion.id ? 'Cerrar detalle' : 'Ver detalle'}</Button>
                </div>
                {detailId === criterion.id && <div id={`criterion-detail-${criterion.id}`} className="space-y-4 border-l border-zinc-200 pl-4 dark:border-zinc-700">
                  {criterion.provenance?.evidence?.length > 0 && <section className="space-y-3" aria-label="Fuentes del criterio"><h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Fuentes</h3><ul className="space-y-4">{criterion.provenance.evidence.map((source, index) => <li key={index} className="space-y-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  <p className="font-medium">{source.attribution}</p><p className="break-words text-sm">{source.quote}</p>
                  <p>Parrilla {source.period} · {source.eventDate ? formatDate(source.eventDate) : 'Fecha del comentario no registrada'}</p>
                  {typeof source.url === 'string' && /^\/parrillas\/[a-zA-Z0-9-]+(?:\?item=[a-zA-Z0-9-]+)?$/.test(source.url) && <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Ver origen <span className="sr-only">(nueva pestaña)</span></a>}
                </li>)}</ul></section>}
                  <details className="text-zinc-600 dark:text-zinc-300"><summary className="min-h-11 cursor-pointer content-center rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Historial</summary>
                    <p className="mb-3 text-xs leading-relaxed">Quién propuso, ajustó o validó este criterio, y por qué.</p>
                    <ol className="space-y-4">{(criterion.history || []).map((entry, index) => <li key={index} className="space-y-1 text-xs leading-relaxed"><p className="font-medium">{historyLabels[entry.action]} · {entry.actorName} · v{entry.version}</p><p className="text-zinc-500 dark:text-zinc-400">{formatDate(entry.at)}</p><p className="break-words text-sm">{entry.reason || (entry.action === 'PROPOSE' ? 'Sin contexto añadido.' : 'Motivo no registrado.')}</p></li>)}</ol>
                  </details>
                </div>}
              </article>)}
            </div>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
