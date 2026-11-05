import React, { useRef, useState } from 'react';
import Select from '@/components/ui/Select';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DraftNotice from '@/components/ui/DraftNotice';
import { useFormDraft } from '@/hooks/useFormDraft';
import { shortDate } from '@/lib/clientOperations';
import { PROJECT_MODALITIES } from '@/lib/projectOperations';
import { bogotaDate } from '@/lib/colombiaBusinessDays';

const FIELD = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100';
const ACTION = 'min-h-11 rounded-lg px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 disabled:opacity-50 dark:text-brand-cyan';
const PRIMARY = 'min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50';
const MODALITIES = Object.fromEntries(PROJECT_MODALITIES.map(({ value, label }) => [value, label]));

const initialForm = (project) => ({
  title: project.title || '', modality: project.modality || '', startDate: project.startDate || '', endDate: project.endDate || '',
  projectManagerId: project.projectManagerId || '', notes: project.notes || '',
  productionDays: project.productionDays ?? '', productionHours: project.productionHours ?? '',
  reportRequired: project.reportRequired == null ? '' : String(project.reportRequired),
  deliverables: (project.deliverables || []).map((row) => ({ id: row.id, label: row.label || '', description: row.description || '', quantity: row.quantity ?? '', unit: row.unit || '' })),
});
const nullableNumber = (value) => value === '' || value == null ? null : Number(value);

function ApprovedScope({ source }) {
  if (!source) return null;
  return <details className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-white/10">
    <summary className="min-h-9 cursor-pointer font-semibold">Alcance de origen · {source.code}</summary>
    <p className="my-2 text-xs text-zinc-500 dark:text-zinc-400">{source.scenarioName || 'Propuesta aprobada'}{source.acceptedAt ? ` · ${shortDate(bogotaDate(source.acceptedAt))}` : ''}. Las cantidades de servicios no equivalen a cantidades de piezas.</p>
    <ul className="space-y-3">
      {(source.services || []).map((service) => <li key={service.id}>
        <p className="font-medium">{service.label}{service.quantity != null ? ` · ${service.quantity} servicio(s)` : ''}</p>
        {service.description && <p className="whitespace-pre-line break-words text-zinc-600 dark:text-zinc-300">{service.description}</p>}
      </li>)}
    </ul>
    {(source.phases || []).length > 0 && <ul className="mt-3 space-y-2 border-t border-zinc-100 pt-3 dark:border-white/5">
      {source.phases.map((phase) => <li key={phase.id}><p className="font-medium">{phase.title}</p>{phase.description && <p className="whitespace-pre-line break-words text-zinc-600 dark:text-zinc-300">{phase.description}</p>}</li>)}
    </ul>}
  </details>;
}

function ProjectEditor({ project, latest, team, onClose, onSave, onReload }) {
  const [form, setForm, draft] = useFormDraft({ scope: `project-operation:${project.id}`, initial: initialForm(project), fingerprint: String(project.revision) });
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const stale = conflict || (latest && latest.revision !== project.revision);
  const blocked = saving || stale || draft.conflict;
  const patch = (fields) => { setForm((current) => ({ ...current, ...fields })); setProblem(''); };
  const updateRow = (id, fields) => setForm((current) => ({ ...current, deliverables: current.deliverables.map((row) => row.id === id ? { ...row, ...fields } : row) }));
  const save = async (review) => {
    if (blocked) return;
    setSaving(true); setProblem('');
    try {
      await onSave(project, {
        ...form, expectedRevision: project.revision, review,
        modality: form.modality || null, projectManagerId: form.projectManagerId || null,
        startDate: form.startDate || null, endDate: form.endDate || null,
        productionDays: nullableNumber(form.productionDays), productionHours: nullableNumber(form.productionHours),
        reportRequired: form.reportRequired === '' ? null : form.reportRequired === 'true',
        deliverables: form.deliverables.map((row) => ({ ...row, quantity: nullableNumber(row.quantity), unit: row.unit || null })),
      });
      draft.clear(); onClose();
    } catch (error) {
      console.error('[ProjectOperations] No se pudo guardar la ficha:', error.response?.data || error.message);
      setProblem(error.message || 'No se pudo guardar la ficha.');
      if (error.status === 409 && (!error.code || error.code === 'PROJECT_REVISION_CONFLICT')) setConflict(true);
    } finally { setSaving(false); }
  };
  const reload = async () => {
    if (saving) return;
    setSaving(true);
    try { await onReload(project.id, () => draft.clear()); }
    catch (error) {
      console.error('[ProjectOperations] No se pudo recargar la ficha:', error.response?.data || error.message);
      setProblem(error.message || 'No se pudo cargar la versión actual.');
    } finally { setSaving(false); }
  };
  const activeTeam = team.filter((person) => person.isActive !== false);
  return <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
    <DialogContent data-project-dialog className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl dark:bg-zinc-900" onInteractOutside={(event) => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Ficha del proyecto</DialogTitle>
        <DialogDescription>Define cómo se ejecutará este alcance. La revisión operativa conserva la propuesta aprobada y las condiciones del servicio mensual del cliente.</DialogDescription>
      </DialogHeader>
      <ApprovedScope source={project.source} />
      {project.source?.issue && <p role="alert" className="text-sm text-destructive brain-destructive-text">La propuesta no identifica un único escenario aprobado. Comercial debe aclararlo antes de revisar la ficha.</p>}
      <DraftNotice draft={draft} disabled={saving || stale} />
      {stale && <div role="alert" className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm text-destructive brain-destructive-text dark:border-white/10">
        <p>La ficha cambió. Tus cambios siguen aquí; cargar la versión actual los sustituirá por lo guardado.</p>
        <button type="button" onClick={reload} disabled={saving} className={ACTION}>Cargar versión actual</button>
      </div>}
      <fieldset disabled={blocked} className="min-w-0 space-y-4 disabled:opacity-70">
        <label className="block space-y-1.5 text-sm"><span>Nombre del proyecto</span><input className={FIELD} maxLength={200} value={form.title} onChange={(e) => patch({ title: e.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm"><span>Modalidad</span><Select aria-label="Modalidad" className={FIELD} value={form.modality} onChange={(e) => patch({ modality: e.target.value })}>
            <option value="">Por definir</option>{Object.entries(MODALITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select></label>
          <label className="block space-y-1.5 text-sm"><span>Project manager</span><Select aria-label="Project manager" className={FIELD} value={form.projectManagerId} onChange={(e) => patch({ projectManagerId: e.target.value })}>
            <option value="">Sin asignar</option>
            {form.projectManagerId && !activeTeam.some((person) => person.id === form.projectManagerId) && <option value={form.projectManagerId} disabled>{project.projectManager?.name || 'Responsable no disponible'}</option>}
            {activeTeam.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </Select></label>
          <label className="block space-y-1.5 text-sm"><span>Fecha de inicio</span><BrainDatePicker ariaLabel="Fecha de inicio" className={FIELD} value={form.startDate} onChange={(value) => patch({ startDate: value })} /></label>
          <label className="block space-y-1.5 text-sm"><span>Fecha de cierre</span><BrainDatePicker ariaLabel="Fecha de cierre" className={FIELD} value={form.endDate} min={form.startDate || undefined} isClearable onChange={(value) => patch({ endDate: value })} /></label>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Entregables operativos</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Indica la unidad o formato: reels, diseños, páginas u otra entrega. Los adicionales comerciales requieren su aprobación de origen.</p>
          {form.deliverables.map((row, index) => <div key={row.id} className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-white/10">
            <label className="block space-y-1 text-sm"><span>Descripción del entregable</span><input aria-label={`Descripción del entregable ${index + 1}`} className={FIELD} maxLength={200} value={row.label} onChange={(e) => updateRow(row.id, { label: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1 text-sm"><span>Cantidad</span><input aria-label={`Cantidad ${index + 1}`} className={FIELD} type="number" min="0" step="0.01" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: e.target.value })} /></label>
              <label className="block space-y-1 text-sm"><span>Unidad</span><input aria-label={`Unidad ${index + 1}`} className={FIELD} maxLength={80} value={row.unit} placeholder="Ej. reels" onChange={(e) => updateRow(row.id, { unit: e.target.value })} /></label>
            </div>
            {row.description && <p className="whitespace-pre-line break-words text-xs text-zinc-500 dark:text-zinc-400">{row.description}</p>}
            <button type="button" onClick={() => patch({ deliverables: form.deliverables.filter((item) => item.id !== row.id) })} className="min-h-9 text-xs text-destructive brain-destructive-text underline">Retirar entregable</button>
          </div>)}
          <button type="button" className={ACTION} onClick={() => patch({ deliverables: [...form.deliverables, { id: crypto.randomUUID(), label: '', description: '', quantity: '', unit: '' }] })}>Añadir entregable</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm"><span>Jornadas de producción</span><input className={FIELD} type="number" min="0" step="1" value={form.productionDays} placeholder="Por definir" onChange={(e) => patch({ productionDays: e.target.value })} /></label>
          <label className="block space-y-1.5 text-sm"><span>Horas de producción</span><input className={FIELD} type="number" min="0" step="0.01" value={form.productionHours} placeholder="Total de horas contratadas" onChange={(e) => patch({ productionHours: e.target.value })} /></label>
          <label className="block space-y-1.5 text-sm"><span>Informe incluido</span><Select aria-label="Informe incluido" className={FIELD} value={form.reportRequired} onChange={(e) => patch({ reportRequired: e.target.value })}>
            <option value="">Por definir</option><option value="true">Sí</option><option value="false">No</option>
          </Select></label>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">En servicios mensuales, cantidades, jornadas y horas corresponden a cada ciclo; en puntuales, al proyecto completo. Si es mixto, aclara el periodo de cada entrega.</p>
        <label className="block space-y-1.5 text-sm"><span>Notas operativas</span><textarea aria-label="Notas operativas" className={`${FIELD} min-h-24`} maxLength={4000} value={form.notes} onChange={(e) => patch({ notes: e.target.value })} /></label>
      </fieldset>
      {problem && <p role="alert" className="text-sm text-destructive brain-destructive-text">{problem}</p>}
      <DialogFooter className="gap-2">
        <button type="button" className={ACTION} disabled={saving} onClick={onClose}>Cerrar</button>
        <button type="button" className={ACTION} disabled={blocked} onClick={() => save(false)}>Guardar borrador</button>
        <button type="button" className={PRIMARY} disabled={blocked || Boolean(project.source?.issue)} onClick={() => save(true)}>{saving ? 'Guardando…' : 'Guardar revisión'}</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export default function ClientProjects({ projects = [], team = [], loading = false, error, onRetry, onSave }) {
  const [editing, setEditing] = useState(null);
  const [readProblem, setReadProblem] = useState('');
  const latestProjects = useRef(projects); latestProjects.current = projects;
  const retry = async () => {
    setReadProblem('');
    try { await onRetry(); }
    catch (failure) {
      console.error('[ProjectOperations] No se pudo consultar:', failure.response?.data || failure.message);
      setReadProblem(failure.message || 'No se pudieron cargar los proyectos.');
    }
  };
  const reload = async (projectId, discardDraft) => {
    const result = await onRetry();
    const current = (Array.isArray(result) ? result : latestProjects.current).find((row) => row.id === projectId);
    if (!current) throw new Error('El proyecto ya no está disponible. Cierra esta ficha y revisa la lista.');
    discardDraft(); setEditing(current);
  };
  return <section aria-label="Proyectos y servicios" className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
    <h2 className="text-base font-semibold">Proyectos y servicios</h2>
    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Cada propuesta conserva su alcance y su revisión operativa.</p>
    {error || readProblem ? <div className="mt-4 space-y-2"><p role="alert" className="text-sm text-destructive brain-destructive-text">{readProblem || error.message || String(error)}</p><button type="button" className={ACTION} onClick={retry}>Volver a consultar</button></div>
      : loading ? <p role="status" className="mt-4 text-sm">Cargando proyectos…</p>
        : projects.length === 0 ? <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Todavía no hay propuestas vinculadas a proyectos de este cliente.</p>
          : <div className="mt-4 divide-y divide-zinc-100 dark:divide-white/5">{projects.map((project) => <article key={project.id} data-project-id={project.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{project.title}</h3><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"><span>{project.source?.code}</span> · {MODALITIES[project.modality] || 'Modalidad por definir'}</p></div>
              <span className={`rounded-md px-2 py-1 text-xs font-medium ${project.formalizationStatus === 'HABILITADO' ? 'bg-status-positive/10 text-status-positive-fg' : 'bg-zinc-100 text-zinc-700 dark:bg-white/5 dark:text-zinc-200'}`}>{project.formalizationStatus === 'HABILITADO' ? 'Habilitado para iniciar' : 'Formalización pendiente'}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{project.projectManager?.name || 'Project manager por asignar'} · {project.startDate ? `Inicio ${shortDate(project.startDate)}` : 'Inicio por definir'}{project.endDate ? ` · Cierre ${shortDate(project.endDate)}` : ''}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{project.reviewStatus === 'REVISADO' ? `Ficha revisada${project.reviewedBy?.name ? ` por ${project.reviewedBy.name}` : ''}${project.reviewedAt ? ` el ${shortDate(bogotaDate(project.reviewedAt))}` : ''}` : 'Ficha pendiente de revisión'}</p>
            {project.missing?.length > 0 && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Por definir: {project.missing.join(', ')}.</p>}
            {project.formalizationStatus === 'HABILITADO' && <button type="button" data-project-edit className={`${ACTION} mt-2 -ml-3`} onClick={() => setEditing(project)}>Revisar ficha</button>}
          </article>)}</div>}
    {editing && <ProjectEditor key={`${editing.id}:${editing.revision}`} project={editing} latest={projects.find((row) => row.id === editing.id)} team={team}
      onClose={() => setEditing(null)} onSave={onSave} onReload={reload} />}
  </section>;
}
