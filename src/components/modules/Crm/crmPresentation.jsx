import React from 'react';
import { cn } from '@/lib/utils';
import {
  CRM_STAGES, CRM_ORIGINS, CRM_PRIORITIES, CRM_ACTIVITY_TYPES, CRM_TRAFFIC_LIGHTS, CRM_FOLLOW_UP_BUCKETS,
  stageGroup, stageLabel, bogotaDateKey
} from '@/lib/crmRules';

// ---- labels ----------------------------------------------------------------------------------------

const labelOf = (catalog, value, fallback = value) => catalog.find(item => item.value === value)?.label ?? fallback ?? '—';
export const originLabel = value => labelOf(CRM_ORIGINS, value);
export const priorityLabel = value => labelOf(CRM_PRIORITIES, value);
export const activityLabel = value => labelOf(CRM_ACTIVITY_TYPES, value);
export const trafficLightLabel = value => labelOf(CRM_TRAFFIC_LIGHTS, value);
export const bucketLabel = value => labelOf(CRM_FOLLOW_UP_BUCKETS, value, value === 'FUTURO' ? 'Más adelante' : '—');
export { stageLabel, CRM_STAGES, CRM_ORIGINS, CRM_PRIORITIES, CRM_ACTIVITY_TYPES, CRM_TRAFFIC_LIGHTS, CRM_FOLLOW_UP_BUCKETS };

// ---- formatters -----------------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const currencyFormatters = {};

/** Plain 'YYYY-MM-DD' keys are rendered as that calendar day; timestamps are converted to Bogotá. */
const compactDate = date => dateFormatter.format(date).replace(/ de /g, ' ').replace(/\.$/, '');

export const formatDate = value => {
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return compactDate(new Date(`${value}T12:00:00-05:00`));
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : compactDate(date);
};

export const formatDateTime = value => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
};

export const formatCurrency = (value, currency = 'COP') => {
  if (value === null || value === undefined || value === '') return '—';
  const key = currency || 'COP';
  currencyFormatters[key] ||= new Intl.NumberFormat('es-CO', { style: 'currency', currency: key, maximumFractionDigits: 0 });
  return currencyFormatters[key].format(Number(value) || 0);
};

export const formatCompact = value => new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
export const formatPercent = value => (value === null || value === undefined ? '—' : `${Math.round(Number(value) * 100)} %`);
export const formatDays = value => (value === null || value === undefined ? '—' : `${Number(value).toFixed(Number.isInteger(Number(value)) ? 0 : 1)} d`);

/** Relative days in Bogotá: "hoy", "hace 3 d", "en 2 d". */
export const relativeDays = (value, now = new Date()) => {
  const target = bogotaDateKey(value);
  const today = bogotaDateKey(now);
  if (!target || !today) return '';
  const days = Math.round((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  return days < 0 ? `hace ${Math.abs(days)} d` : `en ${days} d`;
};

/** Today's local date input value ('YYYY-MM-DD') in Bogotá. */
export const todayKey = () => bogotaDateKey(new Date());

// ---- badges ----------------------------------------------------------------------------------------

const lightStyles = {
  VERDE: { dot: 'bg-status-positive', text: 'text-status-positive-fg', chip: 'border-status-positive/30 bg-status-positive/10 text-status-positive-fg' },
  AMARILLO: { dot: 'bg-status-attention', text: 'text-status-attention-fg', chip: 'border-status-attention/40 bg-status-attention/15 text-status-attention-fg' },
  ROJO: { dot: 'bg-destructive', text: 'text-destructive', chip: 'border-destructive/25 bg-destructive/10 text-destructive' }
};

export const TrafficLightDot = ({ value, className }) => (
  <span aria-hidden="true" className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', lightStyles[value]?.dot || 'bg-zinc-300 dark:bg-zinc-600', className)} />
);

export const TrafficLightBadge = ({ light, className, showMode = true }) => {
  const value = light?.value;
  const style = lightStyles[value] || {};
  return (
    <span title={light?.reason || ''} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', style.chip || 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300', className)}>
      <TrafficLightDot value={value} />
      {trafficLightLabel(value)}
      {showMode && light?.mode === 'MANUAL' && <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">manual</span>}
    </span>
  );
};

const stageStyles = {
  ABIERTO: 'border-brand-cyan/25 bg-brand-cyan/10 text-brand-cyan-deep dark:text-brand-cyan',
  APROBADO: 'border-brand-green/30 bg-brand-green/10 text-brand-green-deep dark:text-brand-green',
  GANADO: 'brain-gradient-primary border-transparent text-white',
  CERRADO: 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
};

export const StageBadge = ({ stage, className }) => (
  <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', stageStyles[stageGroup(stage)] || stageStyles.CERRADO, className)}>
    {stageLabel(stage)}
  </span>
);

const priorityStyles = {
  ALTA: 'border-brand-coral/30 bg-brand-coral/10 text-brand-coral-deep dark:text-brand-coral',
  MEDIA: 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  BAJA: 'border-zinc-200 bg-transparent text-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
};

export const PriorityBadge = ({ priority, className }) => (
  <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', priorityStyles[priority] || priorityStyles.MEDIA, className)}>
    {priorityLabel(priority)}
  </span>
);

const bucketStyles = {
  VENCIDO: 'text-destructive',
  HOY: 'text-brand-magenta-deep dark:text-brand-magenta',
  SEMANA: 'text-brand-cyan-deep dark:text-brand-cyan',
  SIN_FECHA: 'text-zinc-400',
  FUTURO: 'text-zinc-500 dark:text-zinc-400'
};

export const FollowUpLabel = ({ lead, className }) => {
  if (!lead) return null;
  if (!lead.followUpBucket) return <span className={cn('text-xs text-zinc-400', className)}>Cerrada</span>;
  if (lead.followUpBucket === 'SIN_FECHA') return <span className={cn('text-xs font-medium text-zinc-400', className)}>Sin fecha</span>;
  return (
    <span className={cn('inline-flex flex-col leading-tight', className)}>
      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{formatDate(lead.nextFollowUpAt)}</span>
      <span className={cn('text-[11px] font-semibold', bucketStyles[lead.followUpBucket])}>{lead.followUpBucket === 'VENCIDO' ? `Vencido · ${relativeDays(lead.nextFollowUpAt)}` : relativeDays(lead.nextFollowUpAt)}</span>
    </span>
  );
};

export const OriginBadge = ({ origin, className }) => (
  <span className={cn('inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300', className)}>
    {originLabel(origin)}
  </span>
);

/** Marks leads that arrived through the public request form. */
export const RequestBadge = ({ lead, className }) => (lead?.hasRequest ? (
  <span className={cn('inline-flex items-center rounded-md border border-brand-magenta/30 bg-brand-magenta/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand-magenta-deep dark:text-brand-magenta', className)} title="Llegó por el formulario de solicitud">
    Formulario
  </span>
) : null);

export const leadTitle = lead => lead?.company || lead?.contactName || 'Sin nombre';
export const leadSubtitle = lead => {
  if (!lead) return '';
  if (lead.company && lead.contactName) return [lead.contactName, lead.jobTitle].filter(Boolean).join(' · ');
  return lead.jobTitle || '';
};

export const inputClass = 'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500';
export const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400';
