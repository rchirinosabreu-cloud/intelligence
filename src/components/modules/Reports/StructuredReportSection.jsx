import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Lightbulb, Sparkles } from '@/components/ui/icons';
import { formatReportMetric, getRenderableTimeSeries } from '@/utils/reportMetrics';

const CHART_COLORS = ['#8b3dff', '#2563eb', '#10b981', '#ec4899'];

const MetricCard = ({ metric, currency, featured }) => {
  const hasChange = typeof metric.changePct === 'number';
  const positiveChange = hasChange && metric.changePct >= 0;

  return (
    <article className={featured
      ? 'rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white shadow-sm dark:border-violet-500/30 dark:bg-slate-950'
      : 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900'}>
      <p className={featured
        ? 'text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300'
        : 'text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-400'}>
        {metric.label}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <strong className={featured
          ? 'text-2xl font-extrabold tracking-tight text-white'
          : 'text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50'}>
          {formatReportMetric(metric, currency)}
        </strong>
        {hasChange && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
            positiveChange
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
          }`}>
            {positiveChange ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(metric.changePct).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%
          </span>
        )}
      </div>
    </article>
  );
};

const TimeSeriesChart = ({ series, index, currency }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div className="mb-5 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-800 dark:text-slate-100">{series.label}</h4>
    </div>
    <div className="h-64 w-full" aria-label={`Gráfica de ${series.label}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            formatter={(value) => formatReportMetric({ value, unit: series.unit }, currency)}
            contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={series.label}
            stroke={CHART_COLORS[index % CHART_COLORS.length]}
            strokeWidth={3}
            dot={{ r: 3, fill: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </article>
);

const BreakdownChart = ({ breakdown, index, currency }) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div className="mb-5 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-800 dark:text-slate-100">{breakdown.label}</h4>
    </div>
    <div className="h-64 w-full" aria-label={`Gráfica de ${breakdown.label}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={breakdown.items} layout="vertical" margin={{ top: 0, right: 16, left: 16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis dataKey="label" type="category" width={100} tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value) => formatReportMetric({ value, unit: breakdown.unit }, currency)}
            contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }}
          />
          <Bar dataKey="value" name={breakdown.label} fill={CHART_COLORS[index % CHART_COLORS.length]} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </article>
);

const InsightList = ({ title, items, dark = false, icon: Icon }) => {
  if (!items?.length) return null;
  return (
    <article className={dark
      ? 'rounded-2xl bg-slate-900 p-7 text-white shadow-lg dark:bg-slate-950'
      : 'rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-700 dark:bg-slate-900'}>
      <div className="mb-5 flex items-center gap-3">
        <Icon className={dark ? 'h-5 w-5 text-violet-300' : 'h-5 w-5 text-violet-600 dark:text-violet-300'} />
        <h4 className={dark ? 'font-bold text-white' : 'font-bold text-slate-900 dark:text-slate-50'}>{title}</h4>
      </div>
      <div className="space-y-5">
        {items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="space-y-2">
            <h5 className={dark ? 'text-sm font-bold text-violet-200' : 'text-sm font-bold text-slate-900 dark:text-slate-100'}>{item.title}</h5>
            {(item.paragraphs || [item.description]).filter(Boolean).map((paragraph, paragraphIndex) => (
              <p key={paragraphIndex} className={dark ? 'text-sm leading-6 text-slate-300' : 'text-sm leading-6 text-slate-600 dark:text-slate-300'}>{paragraph}</p>
            ))}
          </div>
        ))}
      </div>
    </article>
  );
};

const StructuredReportSection = ({ section, title, badge, currency = 'COP' }) => {
  if (!section) return null;
  const timeSeries = getRenderableTimeSeries(section.timeSeries);
  const breakdowns = (section.breakdowns || []).filter((item) => Array.isArray(item.items) && item.items.length > 0);

  return (
    <section className="space-y-10 border-t border-slate-200 pt-12 first:border-t-0 first:pt-0 dark:border-slate-700">
      <header className="flex items-center justify-between border-b border-slate-200 pb-5 dark:border-slate-700">
        <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">{title}</h3>
        <span className="text-xs font-extrabold uppercase tracking-wider text-violet-600 dark:text-violet-300">{badge}</span>
      </header>

      {section.summaryMetrics?.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {section.summaryMetrics.slice(0, 8).map((metric, index) => (
            <MetricCard key={`${metric.key}-${metric.sourceId}-${index}`} metric={metric} currency={currency} featured={index === 0} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <InsightList title="Logros y lectura estratégica" items={section.insights} icon={Sparkles} />
        <InsightList title="Oportunidades y recomendaciones" items={section.recommendations} icon={Lightbulb} dark />
      </div>

      {timeSeries.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {timeSeries.map((series, index) => (
            <TimeSeriesChart key={`${series.key}-${series.sourceId}`} series={series} index={index} currency={currency} />
          ))}
        </div>
      )}

      {breakdowns.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {breakdowns.map((breakdown, index) => (
            <BreakdownChart key={`${breakdown.key}-${breakdown.sourceId}`} breakdown={breakdown} index={index + timeSeries.length} currency={currency} />
          ))}
        </div>
      )}
    </section>
  );
};

export default StructuredReportSection;
