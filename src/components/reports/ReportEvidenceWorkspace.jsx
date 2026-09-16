import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Select from '@/components/ui/Select';
import { formatEvidenceValue } from '@/lib/reportEvidenceFormat';
import { buildReportPresentation } from '@/lib/reportPresentationModel';
import { EditorialSummary, EditorialComment, EditorialStrategy } from './ReportEditorial';

const platformNames = { INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', CROSS_PLATFORM: 'Facebook e Instagram', META_ADS: 'Meta Ads', UNKNOWN: 'Plataforma por confirmar' };
const scopeNames = { TOTAL: 'Total', ORGANIC: 'Orgánico', PAID: 'Anuncios', UNKNOWN: 'Sin desglose' };
const precisionNames = { EXACT: 'Exacto', ROUNDED: 'Abreviado / aproximado', UNKNOWN: 'Por confirmar' };
const metricOptions = { views: 'Visualizaciones', viewers: 'Espectadores', reach: 'Alcance', impressions: 'Impresiones', interactions: 'Interacciones con el contenido', profileVisits: 'Visitas al perfil', linkClicks: 'Clics en el enlace', followers: 'Seguidores del período', follows: 'Nuevos seguidores', followerTotal: 'Total acumulado de seguidores', contentCount: 'Contenido publicado', watchTime: 'Tiempo de reproducción', threeSecondVideoViews: 'Reproducciones de 3 segundos', spend: 'Importe gastado', costPerResult: 'Costo por resultado', results: 'Resultados', budget: 'Presupuesto' };
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = `${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`;
const field = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary';
const surface = 'rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-6';
const sourceName = source => source?.originalName || source?.extractionData?.originalName || source?.sourceId || 'Captura';
const periodText = period => period?.start && period?.end ? `${period.start} — ${period.end}` : 'Período por confirmar';
const readableEvidence = value => typeof value === 'string' ? value : value == null ? 'Sin transcripción de evidencia' : JSON.stringify(value);
const contextNames = { ACCOUNT_TOTAL: 'Resumen de la cuenta', account_content: 'Contenido de la cuenta', 'instagram-overview': 'Resumen de Instagram', 'facebook-overview': 'Resumen de Facebook', instagram_content_with_facebook_distribution: 'Contenido de Instagram y su distribución en Facebook', facebook_distribution_of_instagram_content: 'Contenido de Instagram distribuido en Facebook' };
const contextName = fact => fact.contextLabel || contextNames[fact.contextKey] || 'Contexto propio de la captura';

function ReportSections({ presentation, observations, findSource, onOriginal, onEdit, canEdit, busy, editorial }) {
  const references = (row, compact = false) => {
    const ids = [...new Set([...(row.observationIds || []), ...Object.values(row.cells || {}).flatMap(cell => cell.observationIds || [])])];
    const items = ids.map(id => observations.find(item => item.observationId === id)).filter(Boolean);
    if (!items.length) return null;
    return <details className={compact ? 'mt-1' : 'mt-2'}><summary className="min-h-11 cursor-pointer py-2 text-xs text-muted-foreground">Ver fuentes ({items.length})</summary><div className="space-y-3 pb-2">{items.map(item => <div key={item.observationId} className="min-w-0 text-xs"><p className="break-words font-medium">{sourceName(findSource(item.sourceId))} · {formatEvidenceValue(item)}</p><p className="mt-1 break-words text-muted-foreground">{readableEvidence(item.evidence)}</p><div className="mt-2 flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => onOriginal(item.sourceId)}>Ver captura original</button>{canEdit && <button className={button} disabled={busy} onClick={() => onEdit(item)}>Corregir observación</button>}</div></div>)}</div></details>;
  };
  return <div data-report-presentation className="space-y-5">{presentation.sections.map(section => <section className={surface} key={section.id} aria-label={section.title}>
    <h3 className="text-lg font-semibold">{section.title}</h3>
    {section.contextLabel && <p className="mt-1 text-sm text-muted-foreground">{section.contextLabel}</p>}
    {section.kind === 'table' ? <div className="mt-4 max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border bg-muted/50"><tr><th scope="col" className="min-w-40 px-3 py-3 font-medium">{section.entityLevel === 'AD' ? 'Anuncio' : section.entityLevel === 'CAMPAIGN' ? 'Campaña' : 'Formato'}</th>{section.columns.map(column => <th scope="col" key={column.key} className="whitespace-nowrap px-3 py-3 text-right font-medium">{column.label}</th>)}</tr></thead><tbody>{section.rows.map(row => <tr className="border-b border-border last:border-b-0" key={row.id}><th scope="row" className="min-w-40 max-w-80 px-3 py-3 align-top font-normal"><span className="break-words font-medium">{row.label}</span>{row.resultType && !['SUMMARY', 'METRIC', 'COMPONENT', 'TOTAL'].includes(row.resultType) && <span className="mt-1 block text-xs text-muted-foreground">{row.resultType}</span>}{references(row, true)}</th>{section.columns.map(column => <td key={column.key} className="whitespace-nowrap px-3 py-3 text-right align-top tabular-nums">{row.cells?.[column.key]?.text ?? '—'}</td>)}</tr>)}</tbody></table></div>
      : <div className="mt-4 grid min-w-0 grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-3">{section.rows.map(row => <article key={row.id} className="min-w-0 border-b border-border py-4"><h4 className="text-sm font-medium">{row.label}</h4><p className="mt-2 break-words text-2xl font-semibold tabular-nums">{row.valueText}</p>{row.changeText && row.changeText !== 'Sin comparación' && <p className="mt-1 text-xs text-muted-foreground">{row.changeText} frente al período comparado</p>}{row.scope === 'UNKNOWN' && <p className="mt-1 text-xs text-muted-foreground">Sin desglose orgánico / anuncios</p>}{references(row)}</article>)}</div>}
    <EditorialComment comment={editorial?.sectionComments.find(item => item.sectionId === section.id)} />
  </section>)}</div>;
}

export function getEvidenceWorkspaceState(report, hasDraft = false) {
  const metrics = report?.normalizedMetrics || {};
  const excluded = new Set((metrics.excludedSources || []).map(item => item.sourceId));
  const pendingSources = (metrics.sourceFailures || []).filter(item => !excluded.has(item.sourceId));
  const blocking = (metrics.issues || []).filter(item => item.blocking);
  const narrative = report?.narrative || {};
  const currentNarrative = narrative.generationMode === 'EVIDENCE_AI' && !narrative.needsRegeneration
    && narrative.dataVersion === metrics.dataVersion && Boolean(narrative.claims?.length);
  const ready = (metrics.facts || []).some(item => item.status !== 'CONFLICT' && typeof item.value === 'number' && Number.isFinite(item.value)) && !hasDraft;
  return { blocking, pendingSources, currentNarrative,
    canAnalyze: ready && report?.status !== 'PUBLISHED',
    canPublish: ready && currentNarrative && report?.status !== 'PUBLISHED',
    canDownload: ready && currentNarrative && report?.status === 'PUBLISHED',
  };
}

export function buildObservationUpdate(observation, draft) {
  const reason = String(draft.reason || '').trim();
  if (!reason) throw new Error('Indica el motivo de la corrección.');
  const next = {};
  for (const name of ['value', 'changePct', 'platform', 'scope', 'precision', 'unit', 'contextKey', 'period', 'excluded', 'key', 'label']) {
    if (!(name in draft)) continue;
    let value = draft[name];
    if (name === 'value') {
      value = value === null || String(value).trim() === '' ? null : Number(value);
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error('El valor debe ser un número no negativo o quedar vacío.');
    }
    if (name === 'changePct') {
      value = value === null || String(value).trim() === '' ? null : Number(value);
      if (value !== null && !Number.isFinite(value)) throw new Error('El porcentaje debe ser un número con signo o quedar vacío.');
    }
    if (name === 'unit' || name === 'contextKey') value = String(value || '').trim();
    if (JSON.stringify(value) !== JSON.stringify(observation[name] ?? (name === 'excluded' ? false : null))) next[name] = value;
  }
  if (!Object.keys(next).length) throw new Error('Realiza un cambio antes de guardar.');
  return { observationId: observation.observationId, ...next, reason };
}

const editableColumns = row => Object.keys(row || {}).filter(key => !['label', 'name', 'id', 'rowId', 'sourceId', 'evidence'].includes(key) && (row[key] === null || typeof row[key] === 'number'));
const columnNames = { value: 'Valor', views: 'Visualizaciones', impressions: 'Impresiones', reach: 'Alcance', interactions: 'Interacciones', clicks: 'Clics', results: 'Resultados', spend: 'Importe gastado', count: 'Cantidad', percentage: 'Porcentaje' };

export function buildPanelUpdate(panel, draft) {
  const reason = String(draft.reason || '').trim();
  if (!reason) throw new Error('Indica el motivo de la corrección.');
  if (draft.excluded === true) return { panelId: panel.panelId, excluded: true, reason };
  const changes = {};
  for (const key of ['platform', 'scope', 'unit', 'period', 'contextKey']) {
    if (key in draft && JSON.stringify(draft[key]) !== JSON.stringify(panel[key])) changes[key] = draft[key];
  }
  const rowIndex = Number(draft.rowIndex);
  const row = panel.dataset?.[rowIndex];
  if (!Number.isInteger(rowIndex) || !row) throw new Error('Selecciona una fila vigente del panel.');
  if (!editableColumns(row).includes(draft.field)) throw new Error('Selecciona una columna numérica del panel.');
  const value = draft.value == null || String(draft.value).trim() === '' ? null : Number(draft.value);
  if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error('El valor debe ser un número no negativo o quedar vacío.');
  if (value !== row[draft.field]) Object.assign(changes, { rowIndex, rowLabel: String(row.label ?? row.name ?? ''), field: draft.field, value });
  if (!Object.keys(changes).length) throw new Error('Realiza un cambio antes de guardar.');
  return { panelId: panel.panelId, ...changes, reason };
}

function PanelEditor({ editing, onChange, onSave, onCancel, busy, stale }) {
  const { panel, draft } = editing;
  const row = panel.dataset?.[Number(draft.rowIndex)];
  const update = (key, value) => onChange({ ...draft, [key]: value });
  return <form className={surface} onSubmit={onSave} aria-label="Corregir panel"><h3 className="text-base font-semibold">Corregir {panel.title || 'panel'}</h3>
    {stale && <p className="mt-2 text-sm text-destructive" role="alert">El panel cambió de versión. Conservamos tu borrador; recarga antes de guardarlo.</p>}
    <fieldset disabled={busy} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Fila del panel<Select aria-label="Fila del panel" disabled={draft.excluded} value={draft.rowIndex} onChange={event => { const nextRow = panel.dataset[Number(event.target.value)]; const nextField = editableColumns(nextRow)[0] || ''; onChange({ ...draft, rowIndex: event.target.value, field: nextField, value: nextRow[nextField] ?? '' }); }}>{(panel.dataset || []).map((item, index) => <option key={`${item.id || item.label || item.name}:${index}`} value={String(index)}>{item.label || item.name || `Fila ${index + 1}`}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Columna del panel<Select aria-label="Columna del panel" disabled={draft.excluded} value={draft.field} onChange={event => onChange({ ...draft, field: event.target.value, value: row[event.target.value] ?? '' })}>{editableColumns(row).map(key => <option key={key} value={key}>{columnNames[key] || key}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Valor del panel<input disabled={draft.excluded} className={field} type="number" min="0" step="any" value={draft.value} onChange={event => update('value', event.target.value)} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.excluded} onChange={event => update('excluded', event.target.checked)} />Excluir este panel del informe</label>
      <label className="space-y-1 text-sm">Plataforma del panel<Select aria-label="Plataforma del panel" disabled={draft.excluded} value={draft.platform} onChange={event => update('platform', event.target.value)}>{Object.entries(platformNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Distribución del panel<Select aria-label="Distribución del panel" disabled={draft.excluded} value={draft.scope} onChange={event => update('scope', event.target.value)}>{Object.entries(scopeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Unidad o moneda del panel<input disabled={draft.excluded} className={field} value={draft.unit} onChange={event => update('unit', event.target.value)} /></label>
      <label className="space-y-1 text-sm">Contexto del panel<input disabled={draft.excluded} className={field} value={draft.contextKey} onChange={event => update('contextKey', event.target.value)} /></label>
      <label className="space-y-1 text-sm">Inicio del período del panel<input disabled={draft.excluded} className={field} type="date" value={draft.period.start || ''} onChange={event => update('period', { ...draft.period, start: event.target.value })} /></label>
      <label className="space-y-1 text-sm">Fin del período del panel<input disabled={draft.excluded} className={field} type="date" value={draft.period.end || ''} onChange={event => update('period', { ...draft.period, end: event.target.value })} /></label>
      <label className="space-y-1 text-sm sm:col-span-2">Motivo de la corrección del panel<textarea className={`${field} min-h-20`} value={draft.reason} required maxLength={1000} onChange={event => update('reason', event.target.value)} /></label>
    </fieldset><div className="mt-4 flex flex-wrap gap-2"><button className={primaryButton} type="submit" disabled={busy || stale}>Guardar panel</button><button className={button} type="button" disabled={busy} onClick={onCancel}>Cancelar edición del panel</button></div>
  </form>;
}

function ObservationEditor({ editing, onChange, onSave, onCancel, busy, stale }) {
  const { draft, observation } = editing;
  const change = (key, value) => onChange({ ...draft, [key]: value });
  const firstField = useRef(null);
  useEffect(() => { firstField.current?.focus(); }, [observation.observationId]);
  return <form onSubmit={onSave} className={surface} aria-label="Corregir observación">
    <h3 className="text-base font-semibold">Corregir {observation.label}</h3>
    <p className="mt-1 break-words text-sm text-muted-foreground">{platformNames[observation.platform]} · {scopeNames[observation.scope]} · Fuente: {observation.sourceId}</p>
    {stale && <p className="mt-3 text-sm text-destructive" role="alert">La versión cambió. Tu borrador sigue aquí; recarga la versión vigente antes de enviarlo.</p>}
    <fieldset disabled={busy} className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1 text-sm">Indicador<Select aria-label="Indicador" value={draft.key} onChange={event => onChange({ ...draft, key: event.target.value, label: metricOptions[event.target.value] || draft.label })}>{!Object.hasOwn(metricOptions, draft.key) && <option value={draft.key}>{observation.label}</option>}{Object.entries(metricOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Valor (vacío si no está disponible)<input ref={firstField} className={field} type="number" min="0" step="any" value={draft.value} onChange={event => change('value', event.target.value)} /></label>
      <label className="space-y-1 text-sm">Variación porcentual (vacío si no es visible)<input className={field} type="number" step="any" value={draft.changePct} onChange={event => change('changePct', event.target.value)} placeholder="Ej. −59 o +32,9" /></label>
      <label className="space-y-1 text-sm">Plataforma<Select aria-label="Plataforma" value={draft.platform} onChange={event => change('platform', event.target.value)}>{Object.entries(platformNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Distribución<Select aria-label="Distribución" value={draft.scope} onChange={event => change('scope', event.target.value)}>{Object.entries(scopeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Precisión<Select aria-label="Precisión" value={draft.precision} onChange={event => change('precision', event.target.value)}>{Object.entries(precisionNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Unidad o moneda<input className={field} value={draft.unit} onChange={event => change('unit', event.target.value)} placeholder="count, %, COP, USD…" /></label>
      <label className="space-y-1 text-sm">Contexto de la cifra<input className={field} value={draft.contextKey} onChange={event => change('contextKey', event.target.value)} /></label>
      <label className="space-y-1 text-sm">Inicio del período<input className={field} type="date" value={draft.period.start || ''} onChange={event => change('period', { ...draft.period, start: event.target.value })} /></label>
      <label className="space-y-1 text-sm">Fin del período<input className={field} type="date" value={draft.period.end || ''} onChange={event => change('period', { ...draft.period, end: event.target.value })} /></label>
      <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input className="h-4 w-4 accent-primary" type="checkbox" checked={draft.excluded} onChange={event => change('excluded', event.target.checked)} />Excluir esta observación</label>
      <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-3">Motivo de la corrección<textarea className={`${field} min-h-20`} required maxLength={1000} value={draft.reason} onChange={event => change('reason', event.target.value)} placeholder="Explica qué comprobaste en la captura." /></label>
    </fieldset>
    <div className="mt-4 flex flex-wrap gap-2"><button className={primaryButton} type="submit" disabled={busy || stale}>Guardar corrección</button><button className={button} type="button" disabled={busy} onClick={onCancel}>Cancelar edición</button></div>
  </form>;
}

export default function ReportEvidenceWorkspace({ report, onReportChange, apiBaseUrl = '' }) {
  const metrics = report.normalizedMetrics || {};
  const observations = metrics.observations || [];
  const [editing, setEditing] = useState(null);
  const [panelEditing, setPanelEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(null);
  const [original, setOriginal] = useState(null);
  const [failureReasons, setFailureReasons] = useState({});
  const hasDraft = Boolean(editing || panelEditing);
  const state = getEvidenceWorkspaceState(report, hasDraft);
  const editorial = state.currentNarrative && report.narrative?.editorial?.version === 1 ? report.narrative.editorial : null;
  const stale = (editing || panelEditing) && (editing || panelEditing).version !== metrics.version;
  const endpoint = `${String(apiBaseUrl).replace(/\/$/, '')}/api/reports/${encodeURIComponent(report.id)}`;
  const headers = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? window.localStorage.getItem('authToken') || '' : ''}` });
  const sources = [...(report.sources || []), ...(metrics.sourceExtractions || [])];
  const findSource = sourceId => sources.find(source => source.sourceId === sourceId || source.id === sourceId);
  const presentation = buildReportPresentation(report);
  const contextIssues = presentation.contextNotes.filter(item => !item.blocking);

  useEffect(() => () => { if (original?.url) URL.revokeObjectURL(original.url); }, [original]);
  useEffect(() => { setEditing(null); setPanelEditing(null); setError(''); setConflict(false); setNotice(''); setPreview(null); setOriginal(null); setFailureReasons({}); }, [report.id]);
  useEffect(() => { setPreview(null); }, [metrics.version]);

  const fail = async failure => {
    let data = failure.response?.data;
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      try { data = JSON.parse(await data.text()); } catch { data = { error: 'No se pudo leer la respuesta del servidor.' }; }
    }
    console.error('[Reports evidence workspace]', data || failure.message);
    setError(data?.error || failure.message || 'No se pudo completar la operación.');
    if (failure.response?.status === 409 || data?.report?.normalizedMetrics?.version !== undefined) setConflict(true);
  };

  const requestAction = async (action, payload = {}, method = 'post') => {
    setBusy(action); setError(''); setNotice('');
    try {
      const response = await axios[method](`${endpoint}/${action}`, { expectedVersion: metrics.version, ...payload }, { headers: headers() });
      if (!response.data?.report) throw new Error('El servidor no devolvió la versión guardada del informe.');
      onReportChange(response.data.report);
      setConflict(false);
      return response.data.report;
    } catch (failure) { await fail(failure); return null; }
    finally { setBusy(''); }
  };

  const startEditing = observation => {
    if (hasDraft) { setError('Guarda o cancela la edición actual antes de abrir otra observación.'); return; }
    setError(''); setNotice('');
    setEditing({ observation, version: metrics.version, draft: { ...observation, value: observation.value == null ? '' : String(observation.value), changePct: observation.changePct == null ? '' : String(observation.changePct), period: { start: observation.period?.start || '', end: observation.period?.end || '' }, excluded: Boolean(observation.excluded), reason: '' } });
  };

  const saveObservation = async event => {
    event.preventDefault();
    try {
      const update = buildObservationUpdate(editing.observation, editing.draft);
      const saved = await requestAction('observations', { expectedVersion: editing.version, updates: [update] }, 'patch');
      if (saved) { setEditing(null); setNotice('Corrección guardada. Genera el análisis con las cifras vigentes.'); }
    } catch (failure) { setError(failure.message); }
  };

  const startPanelEditing = panel => {
    if (hasDraft) { setError('Guarda o cancela la edición actual antes de abrir otro panel.'); return; }
    const key = editableColumns(panel.dataset?.[0])[0] || '';
    setError(''); setNotice('');
    setPanelEditing({ panel, version: metrics.version, draft: { rowIndex: '0', field: key, value: panel.dataset?.[0]?.[key] ?? '', excluded: false, reason: '', platform: panel.platform || 'UNKNOWN', scope: panel.scope || 'UNKNOWN', unit: panel.unit || 'UNKNOWN', contextKey: panel.contextKey || '', period: { start: panel.period?.start || '', end: panel.period?.end || '' } } });
  };

  const savePanel = async event => {
    event.preventDefault();
    try {
      const update = buildPanelUpdate(panelEditing.panel, panelEditing.draft);
      const saved = await requestAction('observations', { expectedVersion: panelEditing.version, panelUpdates: [update] }, 'patch');
      if (saved) { setPanelEditing(null); setNotice('Panel guardado. Genera el análisis con la versión vigente.'); }
    } catch (failure) { setError(failure.message); }
  };

  const reload = async () => {
    setBusy('reload'); setError('');
    try {
      const response = await axios.get(endpoint, { headers: headers() });
      if (!response.data?.report) throw new Error('El servidor no devolvió el informe.');
      onReportChange(response.data.report); setEditing(null); setPanelEditing(null); setFailureReasons({}); setConflict(false); setNotice('Versión vigente cargada.');
    } catch (failure) { await fail(failure); }
    finally { setBusy(''); }
  };

  const showOriginal = async sourceId => {
    const source = findSource(sourceId);
    const storagePath = source?.storagePath || source?.extractionData?.storagePath;
    if (!storagePath) { setError('Esta captura no tiene un archivo disponible.'); return; }
    setBusy('source'); setError('');
    try {
      const response = await axios.get(`${String(apiBaseUrl).replace(/\/$/, '')}/api/reports/image-proxy`, { headers: headers(), params: { path: storagePath }, responseType: 'blob' });
      setOriginal({ url: URL.createObjectURL(response.data), name: sourceName(source) });
    } catch (failure) { await fail(failure); }
    finally { setBusy(''); }
  };

  const showPreview = async () => {
    setBusy('preview'); setError('');
    try {
      const response = await axios.get(`${endpoint}/preview`, { headers: headers(), params: { version: metrics.version } });
      if (typeof response.data?.html !== 'string' || response.data.version !== metrics.version) throw new Error('La vista previa no corresponde a esta versión.');
      setPreview(response.data);
    } catch (failure) { await fail(failure); }
    finally { setBusy(''); }
  };

  const download = async () => {
    setBusy('pdf'); setError(''); setNotice('');
    try {
      const response = await axios.get(`${endpoint}/pdf`, { headers: headers(), params: { version: metrics.version }, responseType: 'blob' });
      if (!((await response.data.slice(0, 5).text()) === '%PDF-')) throw new Error('La descarga no contiene un PDF válido.');
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `informe-${report.id}-v${metrics.dataVersion}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('PDF descargado con la versión emitida.');
    } catch (failure) { await fail(failure); }
    finally { setBusy(''); }
  };

  return <section className="min-w-0 space-y-5 text-foreground" aria-label="Revisión del informe">
    <header className={surface}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-xl font-semibold">Informe de resultados</h2><p className="mt-1 text-sm text-muted-foreground">{report.client?.name || 'Informe del cliente'} · {periodText(metrics.reportPeriod || { start: report.startDate?.slice(0, 10), end: report.endDate?.slice(0, 10) })}</p></div><p className="text-sm font-medium">{report.status === 'PUBLISHED' ? 'Informe emitido' : report.status === 'REVIEW' ? 'En revisión' : 'Lectura inicial'} · Versión {metrics.version}</p></div>
      <p className="mt-4 text-sm text-muted-foreground">{metrics.processingSummary?.totalFiles ?? metrics.sourceExtractions?.length ?? 0} capturas · Resultados por red y pauta</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {report.status !== 'PUBLISHED' ? <><button className={primaryButton} disabled={Boolean(busy) || !state.canAnalyze} onClick={() => requestAction('analyze')}>{busy === 'analyze' ? 'Generando análisis…' : 'Generar análisis'}</button><button className={button} disabled={Boolean(busy) || !state.canPublish} onClick={() => requestAction('publish')}>Emitir informe</button></> : <button className={button} disabled={Boolean(busy)} onClick={() => requestAction('reopen')}>Reabrir revisión</button>}
        <button className={button} disabled={Boolean(busy) || hasDraft} onClick={showPreview}>Vista previa</button>
        <button className={button} disabled={Boolean(busy) || !state.canDownload} onClick={download}>{busy === 'pdf' ? 'Preparando PDF…' : 'Descargar PDF'}</button>
      </div>
      {report.status !== 'PUBLISHED' && <p className="mt-3 text-sm text-muted-foreground">{state.blocking.length || state.pendingSources.length ? 'Puedes emitir el informe con los datos disponibles. Las correcciones pendientes se conservan para revisarlas después.' : 'Genera el análisis y emite la versión que descargarás en PDF.'}</p>}
    </header>

    {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</div>}
    {notice && <p className="text-sm text-foreground" role="status">{notice}</p>}
    {(conflict || stale) && <button className={hasDraft ? 'brain-danger-button-outline brain-destructive-text inline-flex min-h-11 items-center justify-center rounded-xl border bg-background px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50' : button} disabled={Boolean(busy)} onClick={reload}>{hasDraft ? 'Descartar borrador y recargar versión vigente' : 'Recargar versión vigente'}</button>}

    {(state.blocking.length > 0 || state.pendingSources.length > 0) && <section className={surface} aria-labelledby="report-pending-title"><h3 id="report-pending-title" className="text-base font-semibold text-destructive">Revisión pendiente</h3>
      {state.blocking.length > 0 && <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{presentation.contextNotes.filter(issue => issue.blocking).map(issue => <li key={issue.id}>{issue.message}</li>)}</ul>}
      {state.pendingSources.map(source => <div key={source.sourceId} className="mt-4 space-y-2 border-t border-border pt-4"><p className="break-words text-sm font-medium">{source.originalName || source.sourceId}</p><p className="text-sm text-muted-foreground">{source.error || 'La captura no pudo leerse.'}</p><label className="block space-y-1 text-sm">Motivo para excluir esta captura<textarea className={field} value={failureReasons[source.sourceId] || ''} onChange={event => setFailureReasons(previous => ({ ...previous, [source.sourceId]: event.target.value }))} maxLength={1000} /></label><button className={button} disabled={Boolean(busy) || hasDraft || !failureReasons[source.sourceId]?.trim() || report.status === 'PUBLISHED'} onClick={async () => { const saved = await requestAction('observations', { sourceDecisions: [{ sourceId: source.sourceId, exclude: true, reason: failureReasons[source.sourceId].trim() }] }, 'patch'); if (saved) setFailureReasons(previous => ({ ...previous, [source.sourceId]: '' })); }}>Excluir captura del informe</button></div>)}
    </section>}

    {editing && <ObservationEditor editing={editing} onChange={draft => setEditing(previous => ({ ...previous, draft }))} onSave={saveObservation} onCancel={() => setEditing(null)} busy={Boolean(busy)} stale={Boolean(stale)} />}
    {panelEditing && <PanelEditor editing={panelEditing} onChange={draft => setPanelEditing(previous => ({ ...previous, draft }))} onSave={savePanel} onCancel={() => setPanelEditing(null)} busy={Boolean(busy)} stale={Boolean(stale)} />}

    {original && <figure className={surface}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><figcaption className="break-words text-sm font-medium">{original.name}</figcaption><button className={button} onClick={() => setOriginal(null)}>Cerrar captura</button></div><img className="mx-auto max-h-[75vh] max-w-full object-contain" src={original.url} alt={`Captura original: ${original.name}`} /></figure>}

    {editorial && <EditorialSummary editorial={editorial} />}
    <ReportSections presentation={presentation} observations={observations} findSource={findSource} onOriginal={showOriginal} onEdit={startEditing} canEdit={report.status !== 'PUBLISHED'} busy={Boolean(busy)} editorial={editorial} />
    {editorial && <EditorialStrategy editorial={editorial} />}

    {contextIssues.length > 0 && <details className={surface}><summary className="min-h-11 cursor-pointer text-sm font-medium">Metodología y contexto</summary><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">{contextIssues.map(issue => <li key={issue.id || issue.code}>{issue.message}</li>)}</ul></details>}

    <details className={surface} data-report-audit><summary className="min-h-11 cursor-pointer text-sm font-medium">Fuentes y revisión detallada · {observations.length} observaciones</summary><p className="mb-4 text-sm text-muted-foreground">Las capturas originales y las correcciones se conservan para comprobar el informe.</p>
      {[...new Set(observations.map(item => item.sourceId))].map(sourceId => <details key={sourceId || "unidentified-source"} className="border-t border-border py-2"><summary className="min-h-11 cursor-pointer break-words py-2 text-sm font-medium">{sourceName(findSource(sourceId))}</summary><button className={button} disabled={Boolean(busy)} onClick={() => showOriginal(sourceId)}>Ver captura original</button><div className="mt-3 divide-y divide-border">{observations.filter(item => item.sourceId === sourceId).map(observation => <div key={observation.observationId} className="space-y-2 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{observation.label} · {platformNames[observation.platform]} · {scopeNames[observation.scope]}</p><p className="font-semibold tabular-nums">{formatEvidenceValue(observation)}</p></div><p className="break-words text-muted-foreground">{readableEvidence(observation.evidence)}</p>{observation.review?.reason && <p className="text-xs text-muted-foreground">Revisión: {observation.review.reason}</p>}{report.status !== 'PUBLISHED' && <button className={button} disabled={Boolean(busy)} onClick={() => startEditing(observation)}>Corregir observación</button>}</div>)}</div></details>)}
      {presentation.detailFacts.length > 0 && <details className="border-t border-border py-2"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Datos complementarios y celdas sin cifra</summary>{presentation.detailFacts.map(fact => <p className="py-2 text-sm" key={fact.factId}>{platformNames[fact.platform]} · {fact.label} · {formatEvidenceValue(fact)}</p>)}</details>}

    {observations.some(item => item.excluded) && <details className={surface}><summary className="min-h-11 cursor-pointer text-sm font-medium">Observaciones excluidas ({observations.filter(item => item.excluded).length})</summary>{observations.filter(item => item.excluded).map(observation => <div className="space-y-2 border-t border-border py-3 text-sm" key={observation.observationId}><p>{observation.label} · {formatEvidenceValue(observation)} · {observation.review?.reason || 'Excluida de la conciliación'}</p>{report.status !== 'PUBLISHED' && <button className={button} disabled={Boolean(busy)} onClick={() => startEditing(observation)}>Revisar exclusión</button>}</div>)}</details>}

    {(metrics.panels || []).length > 0 && <section className={surface}><h3 className="text-lg font-semibold">Paneles de las capturas</h3><div className="mt-4 space-y-4">{metrics.panels.map(panel => {
      const columns = [...new Set((panel.dataset || []).flatMap(row => Object.keys(row)))].filter(key => !['id', 'rowId', 'sourceId', 'evidence'].includes(key));
      return <details key={panel.panelId}><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{panel.title || panel.metricKey} · {platformNames[panel.platform]}</summary><p className="mb-3 text-xs text-muted-foreground">{contextName(panel)} · {scopeNames[panel.scope]} · {periodText(panel.period)}</p><div className="max-w-full overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{columns.map(key => <th key={key} scope="col" className="px-3 py-2 font-medium">{key === 'label' || key === 'name' ? 'Categoría' : columnNames[key] || key}</th>)}</tr></thead><tbody>{(panel.dataset || []).map((row, index) => <tr key={`${row.id || row.label || row.name}:${index}`} className="border-t border-border">{columns.map(key => <td key={key} className="px-3 py-2">{typeof row[key] === 'number' || row[key] === null ? formatEvidenceValue({ value: row[key], unit: key === 'value' || key === panel.metricKey ? panel.unit : '' }) : readableEvidence(row[key])}</td>)}</tr>)}</tbody></table></div><div className="mt-3 flex flex-wrap gap-2"><button className={button} disabled={Boolean(busy)} onClick={() => showOriginal(panel.sourceId)}>Ver captura del panel</button>{report.status !== 'PUBLISHED' && <button className={button} disabled={Boolean(busy)} onClick={() => startPanelEditing(panel)}>Corregir panel</button>}</div></details>;
    })}</div></section>}

    </details>

    {!editorial && report.narrative?.claims?.length > 0 && <section className={surface}><h3 className="text-lg font-semibold">Análisis del informe</h3>{!state.currentNarrative && <p className="mt-2 text-sm text-destructive">Este análisis corresponde a una versión anterior. Vuelve a generarlo con las cifras vigentes.</p>}<div className="mt-4 space-y-4 text-sm leading-relaxed">{report.narrative.headline && <p className="font-semibold">{report.narrative.headline}</p>}{report.narrative.sections?.length ? report.narrative.sections.map(section => <div key={section.platform}><h4 className="font-semibold">{section.title || platformNames[section.platform]}</h4>{section.paragraphs?.map(paragraph => <p className="mt-2" key={paragraph}>{paragraph}</p>)}</div>) : report.narrative.claims.map((claim, index) => <p key={claim.factId || claim.id || `claim:${index}`}>{claim.text || claim.interpretation}</p>)}{report.narrative.actionPlan?.length > 0 && <div className="border-t border-border pt-4"><h4 className="font-semibold">Acciones propuestas</h4><ul className="mt-2 space-y-3">{report.narrative.actionPlan.map(item => <li key={item.factId || item.action}><p>{item.action}</p><p className="text-xs text-muted-foreground">Indicador: {item.kpi}</p></li>)}</ul></div>}</div></section>}

    {preview && <section className={surface}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold">Vista previa · Versión {preview.version}</h3><button className={button} onClick={() => setPreview(null)}>Cerrar vista previa</button></div><iframe className="h-[75vh] w-full rounded-xl border border-border bg-background" title="Vista previa del informe y su PDF" sandbox="" srcDoc={preview.html} /></section>}
  </section>;
}
