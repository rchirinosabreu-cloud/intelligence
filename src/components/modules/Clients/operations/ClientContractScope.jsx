import React, { useId, useRef } from 'react';
import Select from '@/components/ui/Select';
import { CalendarDays, FileBarChart, Plus, Trash2, Video } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { STORY_FREQUENCIES, labelOf } from '@/lib/clientOperations';
import { SCOPE_FORMATS, SCOPE_RULES, STORY_PERIODS, PRODUCTION_PERIODS, SERVICE_CATEGORIES, SERVICE_FREQUENCIES } from '@/lib/clientContractScope';

const FIELD = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const LABEL = 'block text-sm font-medium text-zinc-800 dark:text-zinc-100';
const HELP = 'text-xs text-zinc-500 dark:text-zinc-400';
const ACTION = 'inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 disabled:opacity-40 dark:text-brand-cyan';
const RULE = { EXACTA: 'Exacta', MINIMO: 'Mínimo', MAXIMO: 'Hasta' };
const PERIOD = { SEMANA: 'por semana', MES: 'por mes', CONTRATO: 'por contrato', PUNTUAL: 'una vez' };
const STORY_PERIOD = { SEMANA: 'Historias por semana', MES: 'Historias por mes', DIAS_SEMANA: 'Días con historias por semana' };
const CATEGORY = { BLOG: 'Blog', WEB: 'Web', COMUNIDAD: 'Comunidad', MARCAS: 'Marcas', PERFILES: 'Perfiles', OTRO: 'Otro servicio' };
const fieldValue = value => value ?? '';
const prefix = rule => rule === 'MAXIMO' ? 'Hasta ' : rule === 'MINIMO' ? 'Mínimo ' : '';
const emptyDetails = () => ({ version: 1, contentLimits: [], stories: null, production: null, additionalServices: [], reviewPending: null });

function Remove({ label, onClick }) {
  return <button type="button" aria-label={label} onClick={onClick} className="brain-danger-button-icon inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl"><Trash2 className="h-4 w-4" /></button>;
}

/** Los límites describen condiciones; el cupo de piezas se edita por separado. */
export function ContractScopeFields({ scope, contract, onChange, onLegacyChange }) {
  const id = useId();
  const groupKeys = useRef(new WeakMap());
  const value = scope || emptyDetails();
  const update = patch => onChange({ ...value, ...patch });
  const patchStories = patch => update({ stories: { ...value.stories, ...patch } });
  const patchProduction = patch => update({ production: { ...value.production, ...patch } });
  const limits = value.contentLimits || [];
  const groups = value.contentGroups || [];
  const services = value.additionalServices || [];
  const used = new Set(limits.map(row => row.format));
  const limitChange = (index, patch) => update({ contentLimits: limits.map((row, i) => i === index ? { ...row, ...patch } : row) });
  const groupKey = group => {
    if (!groupKeys.current.has(group)) groupKeys.current.set(group, crypto.randomUUID());
    return groupKeys.current.get(group);
  };
  const groupChange = (index, patch) => update({ contentGroups: groups.map((row, i) => {
    if (i !== index) return row;
    const next = { ...row, ...patch };
    groupKeys.current.set(next, groupKey(row));
    return next;
  }) });
  const serviceChange = (serviceId, patch) => update({ additionalServices: services.map(row => row.id === serviceId ? { ...row, ...patch } : row) });
  const stories = value.stories;
  const production = value.production;
  return <div className="space-y-5" data-contract-scope-fields>
    {contract.serviceType === 'PARRILLA' && <fieldset className="space-y-2" data-scope-limits>
      <legend className={LABEL}>Límites por formato <span className="font-normal text-zinc-500 dark:text-zinc-400">(opcional)</span></legend>
      {limits.length > 0 && <ul className="space-y-2">{limits.map((row, index) => <li key={row.format} className="grid grid-cols-[1fr_5rem_2.75rem] items-center gap-2 sm:grid-cols-[1fr_7rem_5rem_2.75rem]">
        <Select aria-label={`Formato del límite ${index + 1}`} value={row.format} onChange={event => limitChange(index, { format: event.target.value })} className={FIELD}>{SCOPE_FORMATS.map(format => <option key={format} value={format} disabled={format !== row.format && used.has(format)}>{format}</option>)}</Select>
        <Select aria-label={`Tipo del límite ${index + 1}`} value={row.rule} onChange={event => limitChange(index, { rule: event.target.value })} className={cn(FIELD, 'col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto')}>{SCOPE_RULES.map(rule => <option key={rule} value={rule}>{RULE[rule]}</option>)}</Select>
        <input aria-label={`Cantidad del límite ${index + 1}`} type="number" min={0} max={999} value={fieldValue(row.quantity)} onChange={event => limitChange(index, { quantity: event.target.value })} placeholder="—" className={FIELD} />
        <Remove label={`Quitar límite de ${row.format}`} onClick={() => update({ contentLimits: limits.filter((_, i) => i !== index) })} />
      </li>)}</ul>}
      <button type="button" className={ACTION} disabled={used.size >= SCOPE_FORMATS.length} onClick={() => update({ contentLimits: [...limits, { format: SCOPE_FORMATS.find(format => !used.has(format)), quantity: null, rule: 'MAXIMO' }] })}><Plus className="h-4 w-4" />Añadir límite</button>
      <p className={HELP}>Estos límites no cambian el cupo mensual ni el semáforo.</p>
    </fieldset>}

    {contract.serviceType === 'PARRILLA' && <fieldset className="space-y-3" data-scope-groups>
      <legend className={LABEL}>Cupos compartidos entre formatos <span className="font-normal text-zinc-500 dark:text-zinc-400">(opcional)</span></legend>
      {groups.map((group, index) => <fieldset key={groupKey(group)} className="min-w-0 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-white/10">
        <legend className={HELP}>Grupo {index + 1}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">{SCOPE_FORMATS.map(format => <label key={format} className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
          <input type="checkbox" aria-label={`${format} en grupo ${index + 1}`} checked={group.formats.includes(format)} onChange={event => groupChange(index, { formats: event.target.checked ? [...group.formats, format] : group.formats.filter(item => item !== format) })} className="h-4 w-4 accent-primary" />{format}
        </label>)}</div>
        <div className="grid grid-cols-[1fr_5rem_2.75rem] items-end gap-2">
          <label className={HELP}>Cantidad del conjunto<Select aria-label={`Tipo de cantidad del grupo ${index + 1}`} value={group.rule} onChange={event => groupChange(index, { rule: event.target.value })} className={cn(FIELD, 'mt-1')}>{SCOPE_RULES.map(rule => <option key={rule} value={rule}>{RULE[rule]}</option>)}</Select></label>
          <label className={HELP}>Contenidos<input aria-label={`Cantidad del grupo ${index + 1}`} type="number" min={0} max={999} value={fieldValue(group.quantity)} onChange={event => groupChange(index, { quantity: event.target.value })} placeholder="—" className={cn(FIELD, 'mt-1')} /></label>
          <Remove label={`Quitar grupo ${index + 1}`} onClick={() => update({ contentGroups: groups.filter((_, i) => i !== index) })} />
        </div>
      </fieldset>)}
      <button type="button" className={ACTION} disabled={groups.length >= 10} onClick={() => update({ contentGroups: [...groups, { formats: [], quantity: null, rule: 'EXACTA' }] })}><Plus className="h-4 w-4" />Añadir grupo de formatos</button>
      <p className={HELP}>Elige al menos dos formatos. La cantidad corresponde al conjunto, sin exigir un reparto fijo entre ellos.</p>
    </fieldset>}

    <fieldset className="space-y-2" data-scope-stories>
      <legend className={LABEL}>Historias</legend>
      {stories ? <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={HELP}>Cantidad<input aria-label="Cantidad de historias" type="number" min={0} max={stories.period === 'DIAS_SEMANA' ? 7 : 999} value={fieldValue(stories.quantity)} onChange={event => patchStories({ quantity: event.target.value })} placeholder="Por confirmar" className={cn(FIELD, 'mt-1')} /></label>
          <label className={HELP}>Unidad y frecuencia<Select aria-label="Unidad de historias" value={stories.period || ''} onChange={event => patchStories({ period: event.target.value || null, ...(event.target.value !== 'DIAS_SEMANA' ? { perOccasion: null } : {}) })} className={cn(FIELD, 'mt-1')}><option value="">Por confirmar</option>{STORY_PERIODS.map(period => <option key={period} value={period}>{STORY_PERIOD[period]}</option>)}</Select></label>
          {stories.period === 'DIAS_SEMANA' && <label className={HELP}>Historias por día<input aria-label="Historias por día" type="number" min={0} max={999} value={fieldValue(stories.perOccasion)} onChange={event => patchStories({ perOccasion: event.target.value })} placeholder="Por confirmar" className={cn(FIELD, 'mt-1')} /></label>}
        </div>
        <p className={HELP}>Se conserva la unidad elegida; los días no equivalen a cantidad de historias.</p>
      </> : <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Historias por semana" value={String(contract.storiesPerWeek ?? 0)} onChange={event => onLegacyChange({ storiesPerWeek: Number(event.target.value) })} className={cn(FIELD, 'sm:max-w-xs')}>{STORY_FREQUENCIES.map(option => <option key={option.value} value={String(option.value)}>{option.label}</option>)}</Select>
        <button type="button" className={ACTION} onClick={() => update({ stories: { quantity: contract.storiesPerWeek ?? null, period: 'SEMANA', perOccasion: null } })}>Detallar historias</button>
      </div>}
    </fieldset>

    <fieldset className="space-y-2" data-scope-production>
      <legend className={LABEL}>Producción</legend>
      {production ? <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={HELP}>Incluida<Select aria-label="Producción incluida" value={production.included == null ? '' : String(production.included)} onChange={event => patchProduction({ included: event.target.value === '' ? null : event.target.value === 'true' })} className={cn(FIELD, 'mt-1')}><option value="">Por confirmar</option><option value="true">Sí</option><option value="false">No</option></Select></label>
          <label className={HELP}>Frecuencia<Select aria-label="Frecuencia de producción" value={production.period || ''} onChange={event => patchProduction({ period: event.target.value || null })} className={cn(FIELD, 'mt-1')}><option value="">Por confirmar</option>{PRODUCTION_PERIODS.map(period => <option key={period} value={period}>{PERIOD[period]}</option>)}</Select></label>
          <label className={HELP}>Jornadas<input aria-label="Jornadas de producción" type="number" min={0} max={366} value={fieldValue(production.quantity)} onChange={event => patchProduction({ quantity: event.target.value })} placeholder="Por confirmar" className={cn(FIELD, 'mt-1')} /></label>
          <label className={HELP}>Cantidad de jornadas<Select aria-label="Tipo de cantidad de jornadas" value={production.rule || 'EXACTA'} onChange={event => patchProduction({ rule: event.target.value })} className={cn(FIELD, 'mt-1')}><option value="EXACTA">Exacta</option><option value="MAXIMO">Hasta</option></Select></label>
          <label className={HELP}>Horas por jornada<input aria-label="Horas por jornada" type="number" min={0} max={24} step="any" value={fieldValue(production.hours)} onChange={event => patchProduction({ hours: event.target.value })} placeholder="Por confirmar" className={cn(FIELD, 'mt-1')} /></label>
          <label className={HELP}>Duración de la jornada<Select aria-label="Tipo de duración de la jornada" value={production.hoursRule || 'EXACTA'} onChange={event => patchProduction({ hoursRule: event.target.value })} className={cn(FIELD, 'mt-1')}><option value="EXACTA">Exacta</option><option value="MAXIMO">Hasta</option></Select></label>
        </div>
        {production.included === false && (Number(production.quantity) > 0 || Number(production.hours) > 0) && <p className="text-xs text-destructive">Revisa las jornadas y horas antes de indicar que la producción no está incluida.</p>}
      </> : <div className="flex flex-wrap items-end gap-2">
        <label className={HELP}>Jornadas al mes<input aria-label="Jornadas al mes" type="number" min={0} max={31} value={contract.productionDays ?? 0} onChange={event => onLegacyChange({ productionDays: event.target.value })} className={cn(FIELD, 'mt-1 sm:w-40')} /></label>
        <button type="button" className={ACTION} onClick={() => update({ production: { included: contract.productionDays > 0 ? true : null, quantity: contract.productionDays ?? null, period: 'MES', hours: null, rule: 'EXACTA', hoursRule: 'EXACTA' } })}>Detallar producción</button>
      </div>}
    </fieldset>

    <fieldset className="space-y-3" data-scope-services>
      <legend className={LABEL}>Otros servicios</legend>
      {services.map((service, index) => <div key={service.id} className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-white/10">
        <div className="flex items-center gap-2"><input aria-label={`Nombre del servicio ${index + 1}`} value={service.label || ''} maxLength={180} onChange={event => serviceChange(service.id, { label: event.target.value })} placeholder="Nombre del servicio" className={FIELD} /><Remove label={`Quitar servicio ${index + 1}`} onClick={() => update({ additionalServices: services.filter(row => row.id !== service.id) })} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={HELP}>Categoría<Select aria-label={`Categoría del servicio ${index + 1}`} value={service.category} onChange={event => serviceChange(service.id, { category: event.target.value })} className={cn(FIELD, 'mt-1')}>{SERVICE_CATEGORIES.map(category => <option key={category} value={category}>{CATEGORY[category]}</option>)}</Select></label>
          <label className={HELP}>Cantidad<input aria-label={`Cantidad del servicio ${index + 1}`} type="number" min={0} max={99999} step="any" value={fieldValue(service.quantity)} onChange={event => serviceChange(service.id, { quantity: event.target.value })} placeholder="Por confirmar" className={cn(FIELD, 'mt-1')} /></label>
          <label className={HELP}>Unidad<input aria-label={`Unidad del servicio ${index + 1}`} value={service.unit || ''} maxLength={80} onChange={event => serviceChange(service.id, { unit: event.target.value || null })} placeholder="Artículos, perfiles…" className={cn(FIELD, 'mt-1')} /></label>
          <label className={HELP}>Frecuencia<Select aria-label={`Frecuencia del servicio ${index + 1}`} value={service.frequency || ''} onChange={event => serviceChange(service.id, { frequency: event.target.value || null })} className={cn(FIELD, 'mt-1')}><option value="">Por confirmar</option>{SERVICE_FREQUENCIES.map(frequency => <option key={frequency} value={frequency}>{PERIOD[frequency]}</option>)}</Select></label>
        </div>
        <label className={HELP}>Alcance y condiciones<textarea aria-label={`Alcance del servicio ${index + 1}`} rows={2} maxLength={1000} value={service.notes || ''} onChange={event => serviceChange(service.id, { notes: event.target.value || null })} className={cn(FIELD, 'mt-1 resize-y')} /></label>
      </div>)}
      <button type="button" className={ACTION} disabled={services.length >= 30} onClick={() => update({ additionalServices: [...services, { id: crypto.randomUUID(), category: 'OTRO', label: '', quantity: null, unit: null, frequency: null, notes: null }] })}><Plus className="h-4 w-4" />Añadir servicio</button>
      <p className={HELP}>Historias, producción y otros servicios se registran aparte del cupo de contenidos.</p>
    </fieldset>
    <div className="space-y-1.5"><label htmlFor={`${id}-pending`} className={LABEL}>Por confirmar <span className="font-normal text-zinc-500 dark:text-zinc-400">(opcional)</span></label><textarea id={`${id}-pending`} rows={2} maxLength={2000} value={value.reviewPending || ''} onChange={event => update({ reviewPending: event.target.value || null })} placeholder="Qué falta acordar sobre este alcance." className={cn(FIELD, 'resize-y')} /></div>
  </div>;
}

function storiesText(stories) {
  if (stories.quantity == null) return 'Por confirmar';
  if (stories.period === 'DIAS_SEMANA') return `${stories.quantity} días por semana · ${stories.perOccasion == null ? 'historias por día: Por confirmar' : `${stories.perOccasion} historias por día`}`;
  return `${stories.quantity} historias ${PERIOD[stories.period] || '· frecuencia por confirmar'}`;
}

export function ContractScopeSummary({ contract }) {
  const scope = contract.scopeDetails;
  const stories = scope?.stories;
  const production = scope?.production;
  return <div className="space-y-4" data-contract-scope-summary>
    {scope?.contentGroups?.length > 0 && <div data-contract-content-groups><p className={HELP}>Cupos compartidos entre formatos</p><ul className="mt-1.5 space-y-2 text-sm text-zinc-800 dark:text-zinc-100">{scope.contentGroups.map(group => <li key={`${[...group.formats].sort().join('-')}-${group.rule}`}>
      <span className="font-medium">{group.quantity == null ? 'Cantidad por confirmar' : `${prefix(group.rule)}${group.quantity} ${group.quantity === 1 ? 'contenido' : 'contenidos'}`}</span> entre {new Intl.ListFormat('es', { type: 'conjunction' }).format(group.formats)}
    </li>)}</ul><p className={cn(HELP, 'mt-1.5')}>Se distribuyen dentro del cupo mensual; no se suman a él.</p></div>}
    {scope?.contentLimits?.length > 0 && <div><p className={HELP}>Límites por formato</p><div className="mt-1.5 flex flex-wrap gap-1.5">{scope.contentLimits.map(row => <span key={row.format} className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium dark:border-white/10">{row.quantity == null ? 'Por confirmar' : `${prefix(row.rule)}${row.quantity}`} {row.format}</span>)}</div><p className={cn(HELP, 'mt-1.5')}>No se suman al cupo mensual.</p></div>}
    <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
      {(stories || contract.storiesPerWeek > 0) && <li className="flex items-start gap-2" data-contract-stories><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" /><span>Historias: {stories ? storiesText(stories) : labelOf(STORY_FREQUENCIES, contract.storiesPerWeek).toLowerCase()}</span></li>}
      {(production || contract.productionDays > 0) && <li className="flex items-start gap-2" data-contract-production><Video className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />{production ? <div>Producción: {production.included === false ? 'No incluida' : production.included === true ? 'Incluida' : 'Por confirmar'}{production.included !== false && <><p>{production.quantity == null ? 'Jornadas: Por confirmar' : `${prefix(production.rule)}${production.quantity} jornadas ${PERIOD[production.period] || '· frecuencia por confirmar'}`}</p><p className={HELP}>{production.hours == null ? 'Horas por jornada: Por confirmar' : `${prefix(production.hoursRule)}${production.hours} horas por jornada`}</p></>}</div> : <span>{contract.productionDays === 1 ? '1 jornada de producción al mes' : `${contract.productionDays} jornadas de producción al mes`}</span>}</li>}
      {contract.monthlyReport && <li className="flex items-start gap-2"><FileBarChart className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />Informe mensual</li>}
    </ul>
    {scope?.additionalServices?.length > 0 && <div className="space-y-3 border-t border-zinc-100 pt-3 dark:border-white/5">{scope.additionalServices.map(service => <div key={service.id}><p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{service.label}</p><p className="text-sm text-zinc-700 dark:text-zinc-300">{service.quantity == null ? 'Cantidad por confirmar' : service.quantity}{service.unit ? ` ${service.unit}` : ''} {PERIOD[service.frequency] || '· frecuencia por confirmar'}</p>{service.notes && <p className={cn(HELP, 'mt-0.5 whitespace-pre-line')}>{service.notes}</p>}</div>)}</div>}
    {scope?.reviewPending && <div className="rounded-xl border border-zinc-200 p-3 dark:border-white/10"><p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Por confirmar</p><p className="mt-1 whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">{scope.reviewPending}</p></div>}
  </div>;
}
