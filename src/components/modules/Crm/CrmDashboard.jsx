import React from 'react';
import { Users, Target, CheckCircle2, Trophy, AlertTriangle, CalendarClock, Clock, TrendingUp, DollarSign, AlertCircle, ArrowRight, FileText } from '@/components/ui/icons';
import { SERVICE_CATEGORIES } from '@/lib/commercialRequestForm';
import { cn } from '@/lib/utils';
import TeamAvatar from '@/components/ui/TeamAvatar';
import CrmStatCard from './CrmStatCard';
import CrmFilters from './CrmFilters';
import { useCrmMetrics } from './crmApi';
import {
  StageBadge, TrafficLightBadge, TrafficLightDot, FollowUpLabel, formatCurrency, formatCompact, formatPercent, formatDays,
  formatDate, originLabel, stageLabel, leadTitle, leadSubtitle, trafficLightLabel
} from './crmPresentation';

const Panel = ({ title, description, children, className, action }) => (
  <section className={cn('rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950', className)}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const Bar = ({ label, value, total, tone = 'bg-brand-cyan', suffix }) => {
  const width = total ? Math.max(2, Math.round((value / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">{label}</span>
        <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">{value}{suffix ? ` · ${suffix}` : ''}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
};

const lightTones = { VERDE: 'bg-status-positive', AMARILLO: 'bg-status-attention', ROJO: 'bg-destructive' };

const Skeleton = () => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {[0, 1, 2, 3, 4, 5, 6, 7].map(item => <div key={item} className="h-32 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" />)}
  </div>
);

const CrmDashboard = ({ filters, onFiltersChange, team, onOpenLead, onShowTab }) => {
  const { data: metrics, isLoading, error } = useCrmMetrics(filters);
  const funnel = metrics?.funnel;
  const total = metrics?.total || 0;
  const lights = metrics?.byTrafficLight || { VERDE: 0, AMARILLO: 0, ROJO: 0 };

  return (
    <div className="space-y-6">
      <CrmFilters filters={filters} onChange={onFiltersChange} team={team} show={['stage', 'origin', 'priority', 'ownerId', 'trafficLight', 'dates']} />

      {error && (
        <div className="brain-alert-surface rounded-2xl p-4 text-sm">
          <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> No pudimos cargar el tablero</div>
          <p className="mt-1 pl-6">{error.message}</p>
        </div>
      )}

      {isLoading && !metrics ? <Skeleton /> : metrics && (
        <>
          {metrics.newRequests > 0 && (
            <section className="rounded-2xl border border-brand-magenta/30 bg-brand-magenta/[0.06] p-5 dark:bg-brand-magenta/10" aria-label="Solicitudes nuevas" data-crm-new-requests>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-magenta text-white"><FileText className="h-4 w-4" /></span>
                  {metrics.newRequests === 1 ? '1 solicitud nueva del formulario sin contactar' : `${metrics.newRequests} solicitudes nuevas del formulario sin contactar`}
                </h2>
                <button type="button" onClick={() => { onFiltersChange({ ...filters, request: 'NUEVAS' }); onShowTab?.('oportunidades'); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-magenta-deep transition-colors hover:bg-brand-magenta/10 dark:text-brand-magenta">Ver todas <ArrowRight className="h-3.5 w-3.5" /></button>
              </div>
              <ul className="grid gap-2 md:grid-cols-2">
                {metrics.recentRequests.map(lead => (
                  <li key={lead.id}>
                    <button type="button" onClick={() => onOpenLead?.(lead.id)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:border-brand-magenta/40 dark:border-zinc-800 dark:bg-zinc-950">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{leadTitle(lead)}</span>
                        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{leadSubtitle(lead) || lead.email || lead.code} · {(lead.request?.services || []).map(value => SERVICE_CATEGORIES.find(item => item.value === value)?.label || value).join(', ') || lead.serviceInterest}</span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-zinc-500 dark:text-zinc-400">{lead.code}<br />{formatDate(lead.enteredAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Números principales">
            <CrmStatCard tone="hero" icon={Users} label="Total de leads" value={total} detail={`LinkedIn ${metrics.linkedin} · Brain Studio ${metrics.brainStudio}`} />
            <CrmStatCard icon={Target} label="Oportunidades abiertas" value={metrics.open} detail={`${formatCurrency(metrics.quotedOpenValue)} cotizado en pipeline`} onClick={() => onShowTab?.('oportunidades')} />
            <CrmStatCard tone="positive" icon={CheckCircle2} label="Aprobadas por formalizar" value={metrics.approved} detail="Contrato, pago inicial y onboarding pendientes" />
            <CrmStatCard tone="magenta" icon={Trophy} label="Ganadas" value={metrics.won} detail={`${formatCurrency(metrics.wonValue)} · ${metrics.lost} perdidas o descartadas`} />
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Semáforo y seguimientos">
            <CrmStatCard tone="negative" icon={AlertTriangle} label="Seguimientos vencidos" value={metrics.followUps.VENCIDO} detail="Requieren acción inmediata" onClick={() => onShowTab?.('seguimientos')} />
            <CrmStatCard icon={CalendarClock} label="Para hoy" value={metrics.followUps.HOY} detail={`${metrics.followUps.SEMANA} más esta semana · ${metrics.followUps.SIN_FECHA} sin fecha`} onClick={() => onShowTab?.('seguimientos')} />
            <CrmStatCard icon={Clock} label="Ingreso → contacto" value={formatDays(metrics.avgDaysToFirstContact)} detail="Promedio de días hasta el primer contacto" />
            <CrmStatCard icon={TrendingUp} label="Ingreso → cierre" value={formatDays(metrics.avgDaysToWin)} detail={`Conversión a ganado ${formatPercent(funnel?.rates?.won)}`} />
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <Panel title="Semáforo" description="Calculado con fechas y respuestas reales; se puede fijar a mano en cada ficha.">
              <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                {['VERDE', 'AMARILLO', 'ROJO'].map(key => total > 0 && lights[key] > 0 && (
                  <div key={key} className={cn('h-full', lightTones[key])} style={{ width: `${(lights[key] / total) * 100}%` }} title={`${trafficLightLabel(key)}: ${lights[key]}`} />
                ))}
              </div>
              <ul className="space-y-3">
                {['VERDE', 'AMARILLO', 'ROJO'].map(key => (
                  <li key={key}>
                    <button type="button" onClick={() => { onFiltersChange({ ...filters, trafficLight: key }); onShowTab?.('oportunidades'); }} className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900">
                      <span className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200"><TrafficLightDot value={key} /> {trafficLightLabel(key)}</span>
                      <span className="text-2xl font-bold tabular-nums text-zinc-950 dark:text-zinc-50">{lights[key]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Embudo" description="Cuántos leads pasan por cada momento comercial.">
              <div className="space-y-3">
                <Bar label="Entraron" value={funnel.counts.entered} total={funnel.counts.entered} tone="bg-brand-cyan" />
                <Bar label="Contactados" value={funnel.counts.contacted} total={funnel.counts.entered} tone="bg-brand-cyan/80" suffix={formatPercent(funnel.rates.contacted)} />
                <Bar label="Con reunión" value={funnel.counts.meeting} total={funnel.counts.entered} tone="bg-brand-green" suffix={formatPercent(funnel.rates.meeting)} />
                <Bar label="Con propuesta" value={funnel.counts.proposal} total={funnel.counts.entered} tone="bg-brand-green/80" suffix={formatPercent(funnel.rates.proposal)} />
                <Bar label="Ganados" value={funnel.counts.won} total={funnel.counts.entered} tone="bg-brand-magenta" suffix={formatPercent(funnel.rates.won)} />
              </div>
            </Panel>

            <Panel title="Valor" description="Lo cotizado y lo ganado dentro del filtro actual.">
              <dl className="space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Pipeline abierto</dt>
                  <dd className="text-2xl font-bold tabular-nums text-zinc-950 dark:text-zinc-50" title={formatCurrency(metrics.quotedOpenValue)}>{formatCompact(metrics.quotedOpenValue)}</dd>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Cotizado total</dt>
                  <dd className="text-2xl font-bold tabular-nums text-zinc-950 dark:text-zinc-50" title={formatCurrency(metrics.quotedTotalValue)}>{formatCompact(metrics.quotedTotalValue)}</dd>
                </div>
                <div className="flex items-end justify-between gap-3 rounded-xl bg-brand-green/10 px-3 py-2">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-brand-green-deep dark:text-brand-green"><DollarSign className="h-3.5 w-3.5" /> Ganado</dt>
                  <dd className="text-2xl font-bold tabular-nums text-brand-green-deep dark:text-brand-green" title={formatCurrency(metrics.wonValue)}>{formatCompact(metrics.wonValue)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">Valores en COP. Solo cuentan los leads con valor cotizado registrado.</p>
            </Panel>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <Panel title="Por origen" description="Qué canales generan oportunidades.">
              <div className="space-y-3">
                {Object.entries(metrics.byOrigin).sort((a, b) => b[1] - a[1]).map(([origin, count]) => (
                  <Bar key={origin} label={originLabel(origin)} value={count} total={total} tone={origin === 'LINKEDIN' ? 'bg-brand-cyan' : 'bg-brand-green'} />
                ))}
                {total === 0 && <p className="text-xs text-zinc-500">Aún no hay leads en este filtro.</p>}
              </div>
            </Panel>
            <Panel title="Por etapa" description="Dónde está cada oportunidad hoy.">
              <div className="space-y-3">
                {Object.entries(metrics.byStage).sort((a, b) => b[1] - a[1]).map(([stage, count]) => (
                  <Bar key={stage} label={stageLabel(stage)} value={count} total={total} tone="bg-brand-cyan" />
                ))}
                {total === 0 && <p className="text-xs text-zinc-500">Aún no hay leads en este filtro.</p>}
              </div>
            </Panel>
          </section>

          <Panel
            title="Prioridades inmediatas"
            description="Rojas, vencidas y de hoy. Lo primero que toca mover."
            action={<button type="button" onClick={() => onShowTab?.('seguimientos')} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">Ver seguimientos <ArrowRight className="h-3.5 w-3.5" /></button>}
          >
            {metrics.priorities.length === 0 ? (
              <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">Nada urgente. Todas las oportunidades tienen su seguimiento al día.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[56rem] text-left text-sm">
                  <thead className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-2 pr-4">Empresa / contacto</th>
                      <th className="py-2 pr-4">Etapa</th>
                      <th className="py-2 pr-4">Semáforo</th>
                      <th className="py-2 pr-4">Última gestión</th>
                      <th className="py-2 pr-4">Próxima acción</th>
                      <th className="py-2 pr-4">Seguimiento</th>
                      <th className="py-2">Resp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {metrics.priorities.map(lead => (
                      <tr key={lead.id} onClick={() => onOpenLead?.(lead.id)} className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                        <td className="py-3 pr-4">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-50">{leadTitle(lead)}</p>
                          <p className="text-xs text-zinc-500">{leadSubtitle(lead) || lead.code}</p>
                        </td>
                        <td className="py-3 pr-4"><StageBadge stage={lead.stage} /></td>
                        <td className="py-3 pr-4"><TrafficLightBadge light={lead.trafficLight} showMode={false} /></td>
                        <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-300">{formatDate(lead.lastActivityAt)}</td>
                        <td className="max-w-[18rem] py-3 pr-4 text-zinc-700 dark:text-zinc-200"><p className="line-clamp-2">{lead.nextAction || <span className="text-zinc-400">Sin próxima acción</span>}</p></td>
                        <td className="py-3 pr-4"><FollowUpLabel lead={lead} /></td>
                        <td className="py-3">{lead.owner ? <TeamAvatar member={lead.owner} className="h-7 w-7" size={28} /> : <span className="text-xs text-zinc-400">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
};

export default CrmDashboard;
