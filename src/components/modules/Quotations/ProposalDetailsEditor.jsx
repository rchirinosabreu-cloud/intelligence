import React, { useId, useRef, useState } from 'react';
import RichTextEditor from '@/components/ui/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { normalizeProposalDetails, plainTextToProposalHtml, safeProposalLink } from '@/services/quotationProposalDetails';
import { ProposalPayments } from './ProposalContent';

export const proposalInput = 'w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-primary/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100';
const action = 'min-h-11 text-sm font-semibold text-primary';
const destructive = 'brain-destructive-text text-destructive min-h-11 text-sm font-medium';

export function ProposalRichField({ label, value = '', onChange }) {
  const id = useId(), change = useRef(onChange); change.current = onChange;
  const [open, setOpen] = useState(false), [url, setUrl] = useState(''), [linkText, setLinkText] = useState('');
  return <div className="space-y-2" role="group" aria-labelledby={id}>
    <label id={id} className="block text-sm font-medium">{label}</label>
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
      <RichTextEditor value={value} onChange={html => change.current(html)} className="min-h-[88px] text-sm" placeholder="Escribe el alcance, entregables o contexto…" />
    </div>
    <button type="button" className={action} onClick={() => setOpen(true)}>Añadir enlace</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogTitle>Añadir enlace</DialogTitle><DialogDescription>Se añadirá al final de este texto.</DialogDescription>
      <label className="space-y-2 text-sm">Texto del enlace<input className={proposalInput} value={linkText} onChange={e => setLinkText(e.target.value)} /></label>
      <label className="space-y-2 text-sm">Dirección web<input className={proposalInput} value={url} placeholder="https://…" onChange={e => setUrl(e.target.value)} /></label>
      <Button type="button" disabled={!linkText.trim() || !safeProposalLink(url)} onClick={() => {
        const escapedLabel = plainTextToProposalHtml(linkText).replace(/^<p>|<\/p>$/g, '');
        change.current(`${value}<p><a href="${safeProposalLink(url).replaceAll('"', '&quot;')}">${escapedLabel}</a></p>`);
        setOpen(false); setUrl(''); setLinkText('');
      }}>Insertar enlace</Button>
    </DialogContent></Dialog>
  </div>;
}

export function ExecutionEditor({ value, onChange, label = 'Duración de ejecución' }) {
  return <fieldset className="space-y-3"><legend className="text-sm font-medium">{label}</legend>
    {!value ? <button type="button" className={action} onClick={() => onChange({ min: 1, max: 1, unit: 'WEEKS', startNote: '' })}>Añadir duración</button> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="text-xs text-zinc-500 dark:text-zinc-400">Desde<input aria-label={`${label}: desde`} className={proposalInput} type="number" min="1" value={value.min} onChange={e => onChange({ ...value, min: e.target.value })} /></label>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">Hasta<input aria-label={`${label}: hasta`} className={proposalInput} type="number" min="1" value={value.max} onChange={e => onChange({ ...value, max: e.target.value })} /></label>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">Unidad<select aria-label={`${label}: unidad`} className={proposalInput} value={value.unit} onChange={e => onChange({ ...value, unit: e.target.value })}><option value="DAYS">Días</option><option value="WEEKS">Semanas</option><option value="MONTHS">Meses</option></select></label>
      </div>
      <input aria-label={`${label}: condición de inicio`} className={proposalInput} placeholder="Condición de inicio (opcional)" value={value.startNote || ''} onChange={e => onChange({ ...value, startNote: e.target.value })} />
      <button type="button" className={destructive} onClick={() => onChange(null)}>Quitar duración</button>
    </>}
  </fieldset>;
}


export default function ProposalDetailsEditor({ value, onChange, totalsByScenario, currency }) {
  const details = value || { version: 1 }, [scope, setScope] = useState('');
  const change = patch => onChange({ ...details, ...patch });
  const phases = details.phases || [], plans = details.paymentPlans || [];
  const scopeId = scope || null, activePlan = plans.find(plan => plan.scenarioId === scopeId);
  const retiredScopes = plans.filter(plan => plan.scenarioId && !totalsByScenario.some(s => s.id === plan.scenarioId));
  const updatePlan = plan => change({ paymentTermsConfirmed: false, paymentPlans: [...plans.filter(p => p.scenarioId !== scopeId), plan] });
  const updateRow = (i, patch) => updatePlan({ ...activePlan, installments: activePlan.installments.map((row, n) => n === i ? { ...row, ...patch } : row) });
  let validation = '';
  try { normalizeProposalDetails(details, { issue: true, totalsByScenario }); } catch (error) { validation = error.message; }
  const sampleTotals = totalsByScenario.find(s => s.id === scopeId)?.totals || totalsByScenario[0]?.totals;
  const panelClass = 'rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900';
  return <section className="space-y-4" aria-label="Contenido de la propuesta">
    <div><h3 className="text-base font-semibold">Una propuesta a la medida</h3><p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Estos bloques son opcionales. Las etapas describen la ejecución; las cuotas organizan el pago.</p></div>
    <details className={panelClass}><summary className="cursor-pointer text-sm font-semibold">Presentación y objetivos</summary><div className="mt-5 space-y-5">
      <label className="block space-y-2 text-sm">Título de la propuesta<input className={proposalInput} value={details.title || ''} onChange={e => change({ title: e.target.value })} /></label>
      <ProposalRichField label="Contexto y objetivos" value={details.introductionHtml} onChange={introductionHtml => change({ introductionHtml })} />
    </div></details>
    <details className={panelClass}><summary className="cursor-pointer text-sm font-semibold">Cronograma y etapas{phases.length ? ` · ${phases.length}` : ''}</summary><div className="mt-5 space-y-6">
      <ExecutionEditor value={details.execution} onChange={execution => change({ execution })} label="Plazo global (opcional)" />
      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">Los plazos no multiplican el precio. Indica qué etapas van en paralelo; el plazo global no se suma automáticamente.</p>
      {phases.map((phase, i) => { const edit = patch => change({ phases: phases.map((p, n) => n === i ? { ...p, ...patch } : p) }); return <div key={phase.id} className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <div className="flex items-center gap-3"><span className="text-xs text-zinc-500">{i + 1}</span><input aria-label={`Nombre de etapa ${i + 1}`} className={proposalInput} value={phase.title} onChange={e => edit({ title: e.target.value })} placeholder="Nombre de la etapa" /></div>
        <label className="block space-y-2 text-sm">Comienza<select className={proposalInput} value={phase.starts} onChange={e => edit({ starts: e.target.value })}><option value="AT_START">Al inicio del proyecto</option><option value="AFTER_PREVIOUS">Después de la etapa anterior</option><option value="PARALLEL">En paralelo (detallar debajo)</option></select></label>
        <ExecutionEditor value={phase.execution} onChange={execution => edit({ execution })} label={`Duración de etapa ${i + 1}`} />
        <ProposalRichField label="Alcance de esta etapa" value={phase.descriptionHtml} onChange={descriptionHtml => edit({ descriptionHtml })} />
        <input className={proposalInput} aria-label={`Entregable de etapa ${i + 1}`} placeholder="Entregable o criterio de cierre" value={phase.completion || ''} onChange={e => edit({ completion: e.target.value })} />
        <div className="flex gap-5"><button className={action} type="button" disabled={!i} onClick={() => { const reordered = [...phases]; [reordered[i - 1], reordered[i]] = [reordered[i], reordered[i - 1]]; change({ phases: reordered }); }}>Subir etapa</button><button type="button" className={destructive} onClick={() => change({ phases: phases.filter(p => p.id !== phase.id) })}>Eliminar etapa</button></div>
      </div>; })}
      <button type="button" className={action} onClick={() => change({ phases: [...phases, { id: crypto.randomUUID(), title: '', starts: phases.length ? 'AFTER_PREVIOUS' : 'AT_START', execution: null, descriptionHtml: '' }] })}>Añadir etapa</button>
    </div></details>
    <details className={panelClass}><summary className="cursor-pointer text-sm font-semibold">Plan de pagos</summary><div className="mt-5 space-y-5">
      <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">Divide la inversión total, impuestos incluidos, por fechas o entregables. Esto no crea facturas ni registra cobros.</p>
      {(totalsByScenario.length > 1 || retiredScopes.length > 0) && <label className="block text-sm">Aplicar a<select className={proposalInput} value={scope} onChange={e => setScope(e.target.value)}><option value="">Todos los escenarios</option>{totalsByScenario.filter(s => s.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}{retiredScopes.map(plan => <option key={plan.scenarioId} value={plan.scenarioId}>Opción retirada · quitar este plan</option>)}</select></label>}
      {!activePlan ? <button className={action} type="button" onClick={() => updatePlan({ scenarioId: scopeId, mode: 'PERCENTAGE', installments: [{ id: crypto.randomUUID(), label: 'Anticipo', value: 50, dueType: 'MILESTONE', milestone: 'Al iniciar' }, { id: crypto.randomUUID(), label: 'Saldo', value: 50, dueType: 'MILESTONE', milestone: 'Al finalizar' }] })}>Añadir plan de pagos</button> : <>
        <label className="block space-y-2 text-sm">Distribución<select className={proposalInput} value={activePlan.mode} onChange={e => updatePlan({ ...activePlan, mode: e.target.value, installments: activePlan.installments.map(row => ({ ...row, value: 0 })) })}><option value="PERCENTAGE">Porcentajes del total</option><option value="FIXED">Importes exactos</option></select></label>
        {activePlan.installments.map((row, i) => <div key={row.id} className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="grid gap-3 sm:grid-cols-[1fr_130px]"><input aria-label={`Nombre de cuota ${i + 1}`} className={proposalInput} value={row.label} onChange={e => updateRow(i, { label: e.target.value })} placeholder={`Cuota ${i + 1}`} /><input aria-label={`Valor de cuota ${i + 1}`} className={proposalInput} type="number" min="0" step="0.01" value={row.value} onChange={e => updateRow(i, { value: e.target.value })} /></div>
          <select aria-label={`Vencimiento de cuota ${i + 1}`} className={proposalInput} value={row.dueType} onChange={e => updateRow(i, { dueType: e.target.value })}><option value="MILESTONE">Al cumplir un hito</option><option value="DATE">En una fecha</option><option value="AFTER_START">Días después del inicio</option></select>
          {row.dueType === 'MILESTONE' ? <input aria-label={`Hito de cuota ${i + 1}`} className={proposalInput} value={row.milestone || ''} onChange={e => updateRow(i, { milestone: e.target.value })} placeholder="Ej. Al aprobar el núcleo CRM" /> : row.dueType === 'DATE' ? <input aria-label={`Fecha de cuota ${i + 1}`} className={proposalInput} type="date" value={row.date || ''} onChange={e => updateRow(i, { date: e.target.value })} /> : <input aria-label={`Días de cuota ${i + 1}`} className={proposalInput} type="number" min="0" value={row.days || 0} onChange={e => updateRow(i, { days: e.target.value })} />}
          <button type="button" className={destructive} onClick={() => updatePlan({ ...activePlan, installments: activePlan.installments.filter(p => p.id !== row.id) })}>Eliminar cuota {i + 1}</button>
        </div>)}
        <div className="flex flex-wrap gap-5"><button type="button" className={action} onClick={() => updatePlan({ ...activePlan, installments: [...activePlan.installments, { id: crypto.randomUUID(), label: '', value: 0, dueType: 'MILESTONE', milestone: '' }] })}>Añadir cuota</button><button type="button" className={destructive} onClick={() => change({ paymentPlans: plans.filter(p => p.scenarioId !== scopeId), paymentTermsConfirmed: false })}>Quitar este plan</button></div>
        <ProposalPayments plan={activePlan} totals={sampleTotals} currency={currency} />
      </>}
      {plans.length > 0 && <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1.5" type="checkbox" checked={details.paymentTermsConfirmed || false} onChange={e => change({ paymentTermsConfirmed: e.target.checked })} />Confirmo que las condiciones de la propuesta son compatibles con este plan de pagos.</label>}
      {validation && <p className="text-xs leading-5 text-destructive">Antes de emitir: {validation}</p>}
    </div></details>
    {[['bonusHtml', 'Beneficios incluidos'], ['exclusionsHtml', 'Exclusiones'], ['referencesHtml', 'Referencias y trabajos de Brainstudio']].map(([key, title]) => <details key={key} className={panelClass}><summary className="cursor-pointer text-sm font-semibold">{title}</summary><div className="mt-5"><ProposalRichField label={title} value={details[key]} onChange={html => change({ [key]: html })} /></div></details>)}
  </section>;
}
