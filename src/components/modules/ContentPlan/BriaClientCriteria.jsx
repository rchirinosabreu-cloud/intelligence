import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const categories = { MARCA: 'Marca', ESTRATEGIA: 'Estrategia', GRAMATICA: 'Gramática', CONSISTENCIA: 'Consistencia' };
const statuses = { PROPOSED: 'Por validar', APPROVED: 'Aprobado', REJECTED: 'Rechazado', REVOKED: 'Revocado' };
const actions = { APPROVE: ['Aprobar criterio', 'Confirmar aprobación'], REJECT: ['Rechazar propuesta', 'Confirmar rechazo'], REVOKE: ['Revocar criterio', 'Confirmar revocación'] };
const historyLabels = { PROPOSE: 'Propuesta', APPROVE: 'Aprobación', REJECT: 'Rechazo', REVOKE: 'Revocación' };
const inputClass = 'min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-cyan-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const formatDate = value => Number.isFinite(new Date(value).getTime())
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value)) : 'Fecha no disponible';

export default function BriaClientCriteria({ planId, onChanged }) {
  const [open, setOpen] = useState(false), [data, setData] = useState(null), [error, setError] = useState('');
  const [form, setForm] = useState(null), [text, setText] = useState(''), [category, setCategory] = useState('MARCA'), [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false), [loading, setLoading] = useState(false), [historyId, setHistoryId] = useState(null);
  const sequence = useRef(0), mounted = useRef(true), requestId = useRef(null), interacting = useRef(false);
  interacting.current = Boolean(form || saving);
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
  useEffect(() => {
    if (!open) return undefined;
    load();
    const refresh = () => { if (!interacting.current) load(); };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); sequence.current++; };
  }, [open, load]);
  const changeOpen = value => {
    setOpen(value);
    if (!value) { setForm(null); setReason(''); setError(''); sequence.current++; }
  };
  const start = (action, criterion = null) => {
    setError(''); setReason(''); setText(''); setCategory('MARCA');
    requestId.current = crypto.randomUUID();
    setForm({ action, criterion });
  };
  const save = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); sequence.current++;
    try {
      if (form.action === 'PROPOSE') await axios.post(endpoint, { text, category, reason, requestId: requestId.current }, auth());
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
        <div className="space-y-5 p-5 sm:p-6" aria-busy={saving || loading}>
          {error && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive dark:text-destructive-foreground">{error}</p>}
          {form ? <form onSubmit={save} className="space-y-5">
            {proposing ? <>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">La propuesta no se aplica hasta que la valide el responsable de esta parrilla, un PM o un admin. Descartar un hallazgo no crea una regla.</p>
              <label className="grid gap-2 text-sm font-medium">Categoría<select value={category} disabled={saving} onChange={e => setCategory(e.target.value)} className={inputClass}>{Object.entries(categories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
              <label className="grid gap-2 text-sm font-medium">Criterio<textarea required maxLength={800} rows={3} disabled={saving} value={text} onChange={e => setText(e.target.value)} placeholder="Describe una regla concreta, vigente y aplicable a este cliente." className={inputClass} /></label>
            </> : <>
              <p className="break-words text-sm font-medium leading-relaxed">{form.criterion.text}</p>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{form.action === 'APPROVE' ? 'Bria usará este criterio en las revisiones de este cliente. Las parrillas activas se revisarán de nuevo.' : form.action === 'REVOKE' ? 'Bria dejará de usar este criterio. La decisión y su historial se conservarán.' : 'La propuesta no se incorporará a la memoria. El motivo quedará en el historial.'}</p>
            </>}
            <label className="grid gap-2 text-sm font-medium">{proposing ? 'Por qué debe recordarlo Bria' : 'Motivo de la decisión'}<textarea required maxLength={500} rows={3} disabled={saving} value={reason} onChange={e => setReason(e.target.value)} placeholder="Indica el acuerdo, la guía vigente o el contexto que respalda tu decisión." className={inputClass} /></label>
            <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" className="min-h-11" disabled={saving} onClick={() => { setForm(null); setError(''); }}>Cancelar</Button>
              <Button type="submit" data-saving={saving} className={`min-h-11 ${form.action === 'REVOKE' || form.action === 'REJECT' ? 'bg-destructive text-destructive-foreground hover:bg-destructive hover:brightness-95' : 'bg-[rgb(var(--bria-header-end))] text-white hover:bg-[rgb(var(--bria-header-start))] dark:bg-[rgb(var(--bria-header-end))]'}`} disabled={saving || !reason.trim() || (proposing && !text.trim())}>{saving ? 'Guardando…' : proposing ? 'Guardar propuesta' : actions[form.action][1]}</Button>
            </div>
          </form> : <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">Solo los criterios aprobados se usan en las revisiones de este cliente. Puedes consultar quién los validó y por qué.</p>
              {data?.canPropose && <Button type="button" variant="outline" disabled={saving} onClick={() => start('PROPOSE')} className="min-h-11 shrink-0 rounded-xl">Proponer criterio</Button>}
            </div>
            {!data && loading && <p role="status" className="text-sm">Cargando criterios…</p>}
            {error && !data && <Button type="button" variant="outline" className="min-h-11" onClick={load}>Reintentar</Button>}
            {data && !data.criteria?.length && <p className="py-6 text-sm text-zinc-600 dark:text-zinc-300">Aún no hay criterios propuestos. Bria puede revisar redacción y coherencia sin memoria del cliente.</p>}
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(data?.criteria || []).map(criterion => <article key={criterion.id} className="space-y-3 py-5 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-300"><span>{categories[criterion.category]}</span><span>·</span><span>{statuses[criterion.status]}</span><span className="ml-auto">v{criterion.version}</span></div>
                <p className="break-words text-sm leading-relaxed">{criterion.text}</p>
                <div className="flex flex-wrap gap-2">
                  {criterion.canValidate && criterion.status === 'PROPOSED' && <><Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => start('APPROVE', criterion)}>Aprobar</Button><Button type="button" variant="destructive" className="min-h-11 hover:bg-destructive hover:brightness-95" onClick={() => start('REJECT', criterion)}>Rechazar</Button></>}
                  {criterion.canValidate && criterion.status === 'APPROVED' && <Button type="button" variant="destructive" className="min-h-11 hover:bg-destructive hover:brightness-95" onClick={() => start('REVOKE', criterion)}>Revocar</Button>}
                  <Button type="button" variant="ghost" className="min-h-11" aria-expanded={historyId === criterion.id} onClick={() => setHistoryId(value => value === criterion.id ? null : criterion.id)}>Historial</Button>
                </div>
                {historyId === criterion.id && <ol className="space-y-4 border-l border-zinc-200 pl-4 dark:border-zinc-700">{criterion.history.map((entry, index) => <li key={index} className="space-y-1 text-xs leading-relaxed"><p className="font-medium">{historyLabels[entry.action]} · {entry.actorName} · v{entry.version}</p><p className="text-zinc-500 dark:text-zinc-400">{formatDate(entry.at)}</p><p className="break-words text-sm text-zinc-600 dark:text-zinc-300">{entry.reason}</p></li>)}</ol>}
              </article>)}
            </div>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
