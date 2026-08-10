import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileBarChart,
  Upload,
  User,
  Send,
  Download,
  Loader2,
  CheckCircle2,
  TrendingUp,
  BarChart3,
  PieChart,
  ArrowRight,
  Sparkles,
  X,
  FileText,
  Plus,
  Trophy,
  Target,
  ArrowUpRight,
  ChevronRight,
  Zap,
  Info,
  Calendar,
  Layout,
  ExternalLink,
  Monitor,
  Eye
} from '@/components/ui/icons';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { cn } from '@/lib/utils';
import { adaptDatasetForChart, hasReadableChartData } from '@/lib/reportChartData';
import { adaptOrganicSummary, filterCanonicalMetrics, getOrganicPlatformLabel, getReviewMetricEntries, isDemographicDataset, filterTopContentRows, splitAchievement, safeClassName, buildReportFileName, processNarrativeResponse, sanitizeNarrativeForReport } from '@/lib/reportPresentation';
import { buildScopedReportData } from '@/lib/reportStructure';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { Card } from '@/components/ui/Card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, LabelList } from 'recharts';

const BUILD_SHA = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'development';

const REPORT_PALETTE = {
  primary: '#144c8c',
  lightBlue: '#8ab9ee',
  navy: '#1f3c58',
  steel: '#627d9f',
  sand: '#d3cebe',
  ink: '#1c242c'
};

const formatReportDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const getReportYear = (value) => value
  ? new Date(value).toLocaleDateString('es-ES', { year: 'numeric', timeZone: 'UTC' })
  : new Date().getFullYear();

// Keep export-only helpers in this module so the click handler cannot reference a
// missing named binding in an independently cached production chunk.
const readLiveControlValue = (liveControl, clonedControl) => String(
  liveControl?.value ?? clonedControl?.value ?? ''
);

const collectDocumentStyles = (styleSheets = []) => Array.from(styleSheets)
  .map((sheet) => {
    try {
      return Array.from(sheet.cssRules || []).map((rule) => rule.cssText).join('\n');
    } catch {
      return '';
    }
  })
  .filter(Boolean)
  .join('\n');

const toSentenceCase = (str) => {
  if (typeof str !== 'string' || !str) return '';
  const trimmed = str.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const hasReportValue = (value) => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value)) && Number(value) !== 0;

const sumDatasetValues = (dataset) => {
  if (!Array.isArray(dataset)) return 0;
  return dataset.reduce((sum, item) => {
    const val = item.value === undefined || item.value === null ? 0 : Number(item.value);
    const h = item.hombres === undefined || item.hombres === null ? 0 : Number(item.hombres);
    const m = item.mujeres === undefined || item.mujeres === null ? 0 : Number(item.mujeres);
    return sum + val + h + m;
  }, 0);
};

const PerformanceTrendChart = ({ data }) => {
  if (!data || data.length === 0) return null;
  return (
    <div className="h-[280px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={REPORT_PALETTE.primary} stopOpacity={0.2}/>
              <stop offset="95%" stopColor={REPORT_PALETTE.primary} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
          <YAxis width={80} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
          <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold' }} />
          <Area type="monotone" dataKey="value" stroke={REPORT_PALETTE.primary} strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const DemographicsChart = ({ demographics }) => {
  if (!demographics) return null;

  const ageGenderData = (demographics.ageGender || []).filter(item => hasReportValue(item.hombres) || hasReportValue(item.mujeres));
  const citiesData = (demographics.cities || []).filter(item => hasReportValue(item.value));
  const countriesData = (demographics.countries || []).filter(item => hasReportValue(item.value));

  const totalAgeGender = ageGenderData.reduce((acc, item) => acc + (Number(item.hombres) || 0) + (Number(item.mujeres) || 0), 0);
  const totalCities = citiesData.reduce((acc, item) => acc + (Number(item.value) || 0), 0);
  const totalCountries = countriesData.reduce((acc, item) => acc + (Number(item.value) || 0), 0);

  // Render guard: if all datasets are empty or sum to 0, omit the container completely
  if (totalAgeGender === 0 && totalCities === 0 && totalCountries === 0) {
    return null;
  }

  return (
    <div className="space-y-6 mt-4 w-full">
      {ageGenderData.length > 0 && totalAgeGender > 0 && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">{toSentenceCase("Rango de edad y género")}</h5>
          <DemographicsBarChart data={ageGenderData} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {citiesData.length > 0 && totalCities > 0 && (
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">{toSentenceCase("Principales ciudades")}</h5>
            <div className="space-y-4">
              {citiesData.map((city, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{city.label}</span>
                    <span>{city.value}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#144c8c] h-full rounded-full" style={{ width: `${city.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {countriesData.length > 0 && totalCountries > 0 && (
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">{toSentenceCase("Principales países")}</h5>
            <div className="space-y-4">
              {countriesData.map((country, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{country.label}</span>
                    <span>{country.value}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#627d9f] h-full rounded-full" style={{ width: `${country.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const DynamicChartRenderer = ({ chartType, dataset, platform = 'META_ADS' }) => {
  if (!hasReadableChartData(dataset)) return null;

  // Intercept and sanitize labels for organic comparison chart and orthographic errors
  const sanitizedDataset = adaptDatasetForChart(dataset, chartType).map(item => {
    let cleanLabel = item.label || '';
    if (cleanLabel.toLowerCase().includes('publ') || cleanLabel.toLowerCase().startsWith('pub')) {
      cleanLabel = 'Publicaciones';
    } else if (cleanLabel.toLowerCase().includes('hist') || cleanLabel.toLowerCase().startsWith('his')) {
      cleanLabel = 'Historias';
    }
    return {
      ...item,
      label: cleanLabel
    };
  });

  // Find active key that contains data
  let activeDataKey = 'value';
  if (sanitizedDataset.length > 0) {
    const keys = Object.keys(sanitizedDataset[0]);
    if (keys.includes('results') && sanitizedDataset[0].results !== null && sanitizedDataset[0].results !== undefined) {
      activeDataKey = 'results';
    } else if (keys.includes('impressions') && sanitizedDataset[0].impressions !== null && sanitizedDataset[0].impressions !== undefined) {
      activeDataKey = 'impressions';
    } else if (keys.includes('reach') && sanitizedDataset[0].reach !== null && sanitizedDataset[0].reach !== undefined) {
      activeDataKey = 'reach';
    } else if (keys.includes('value') && sanitizedDataset[0].value !== null && sanitizedDataset[0].value !== undefined) {
      activeDataKey = 'value';
    } else if (keys.includes('percentage') && sanitizedDataset[0].percentage !== null && sanitizedDataset[0].percentage !== undefined) {
      activeDataKey = 'percentage';
    }
  }

  // Format tick labels cleanly (e.g. 24.000 or 24k)
  const formatYAxis = (tick) => {
    if (typeof tick !== 'number') return tick;
    if (tick >= 1000) {
      return `${(tick / 1000).toFixed(0)}k`;
    }
    return tick.toLocaleString('es-ES');
  };

  // Casing and Cromatic Styling
  const normalizedPlatform = (platform || 'META_ADS').toUpperCase();
  const colors = {
    FACEBOOK: {
      stroke: REPORT_PALETTE.primary,
      fill: REPORT_PALETTE.primary,
      bg: 'bg-[#144c8c]'
    },
    INSTAGRAM: {
      stroke: REPORT_PALETTE.lightBlue,
      fill: REPORT_PALETTE.lightBlue,
      bg: 'bg-[#8ab9ee]'
    },
    META_ADS: {
      stroke: REPORT_PALETTE.navy,
      fill: REPORT_PALETTE.steel,
      bg: 'bg-[#1f3c58]'
    },
    ORGANIC: {
      stroke: REPORT_PALETTE.steel,
      fill: REPORT_PALETTE.steel,
      bg: 'bg-[#627d9f]'
    }
  };

  const currentTheme = colors[normalizedPlatform] || colors.META_ADS;

  const isFunnelDataset = sanitizedDataset.some(item => {
    const label = (item.label || '').toLowerCase();
    return label.includes('visua') || label.includes('alcan') || label.includes('interac') || label.includes('clic') || label.includes('visit') || label.includes('seguidor');
  });

  if (isDemographicDataset(sanitizedDataset)) {
    return <DemographicsBarChart data={sanitizedDataset} />;
  }

  if (chartType === 'LINE_CHART' && isFunnelDataset) {
    // Render funnel metrics as isolatedMetricCards to prevent rendering continuos line charts on funnel stages
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
        {sanitizedDataset.map((item, idx) => (
          <div key={idx} className="bg-[#f8fafc] border border-slate-200 p-6 rounded-2xl space-y-2 shadow-sm break-inside-avoid">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {toSentenceCase(item.label)}
            </span>
            <h4 className="text-2xl font-black text-[#0f172a]">
              {((item[activeDataKey] !== undefined && item[activeDataKey] !== null) ? item[activeDataKey] : (item.value || 0)).toLocaleString('es-ES')}
            </h4>
          </div>
        ))}
      </div>
    );
  }

  if (chartType === 'LINE_CHART') {
    return (
      <div className="h-[280px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sanitizedDataset} margin={{ top: 25, right: 15, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id={`colorValueWeb-${normalizedPlatform}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={currentTheme.stroke} stopOpacity={0.25}/>
                <stop offset="95%" stopColor={currentTheme.stroke} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
            <YAxis width={80} tickFormatter={formatYAxis} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
            <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold' }} />
            <Area type="monotone" dataKey={activeDataKey} stroke={currentTheme.stroke} strokeWidth={3} fillOpacity={1} fill={`url(#colorValueWeb-${normalizedPlatform})`}>
              <LabelList dataKey={activeDataKey} position="top" style={{ fill: '#334155', fontSize: 10, fontWeight: 'bold' }} formatter={(val) => val?.toLocaleString('es-ES')} />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'BAR_CHART') {
    return (
      <div className="h-[280px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sanitizedDataset} layout="vertical" margin={{ top: 15, right: 35, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
            <YAxis width={110} dataKey="label" type="category" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} />
            <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold' }} />
            <Bar dataKey="value" fill={currentTheme.fill} radius={[0, 8, 8, 0]} barSize={16}>
              <LabelList dataKey="value" position="right" style={{ fill: '#334155', fontSize: 10, fontWeight: 'bold' }} formatter={(val) => Number(val).toLocaleString('es-ES')} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (chartType === 'DONUT_CHART') {
    return (
      <div className="mt-4 p-6 bg-slate-50 border border-slate-100 rounded-2xl space-y-4">
        {sanitizedDataset.map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-xs font-bold text-slate-600">
              <span>{item.label}</span>
              <span>{item.percentage ? `${item.percentage}%` : `${item.value}%`}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500", currentTheme.bg)}
                style={{ width: `${item.percentage || item.value || 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (chartType === 'RANKING_TABLE') {
    return (
      <div className="overflow-x-auto border border-slate-100 rounded-2xl bg-white mt-4">
        <table className="w-full border-collapse text-left text-xs text-slate-500">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 font-bold">Publicación destacada / Ad Creative</th>
              <th className="px-6 py-4 font-bold text-right">Resultados</th>
              <th className="px-6 py-4 font-bold text-right">Impresiones</th>
              <th className="px-6 py-4 font-bold text-right">Alcance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium">
            {sanitizedDataset.map((item, idx) => (
              <tr key={idx} className="break-inside-avoid">
                <td className="px-6 py-4 font-bold text-slate-700">{item.label}</td>
                <td className="px-6 py-4 text-right text-slate-600 font-semibold">{(item.results || item.value || 0).toLocaleString('es-ES')}</td>
                <td className="px-6 py-4 text-right text-slate-600 font-semibold">{(item.impressions || item.value || 0).toLocaleString('es-ES')}</td>
                <td className="px-6 py-4 text-right text-primary font-bold">{(item.reach || item.value || 0).toLocaleString('es-ES')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
};

const SectionInsight = ({ sectionId, comment, onChange }) => {
  return (
    <div className="mt-4 break-inside-avoid !h-auto !overflow-visible bg-[#f9fafb] border border-slate-200 rounded-xl p-4">
      <textarea
        rows={4}
        className="w-full bg-transparent border-none text-sm leading-relaxed text-slate-700 font-normal focus:ring-1 focus:ring-primary/10 rounded-xl resize-none outline-none !h-auto !overflow-visible space-y-4 whitespace-pre-wrap"
        style={{ height: 'auto', overflow: 'visible' }}
        value={comment || ''}
        onChange={(e) => onChange(sectionId, e.target.value)}
        placeholder="Escribe un comentario consultivo para esta sección..."
      />
    </div>
  );
};

const DemographicsBarChart = ({ data }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="h-[280px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
          <YAxis width={80} dataKey="label" type="category" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} />
          <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold' }} />
          <Bar dataKey="hombres" fill={REPORT_PALETTE.primary} radius={[0, 8, 8, 0]} barSize={12}>
            <LabelList dataKey="hombres" position="right" style={{ fill: '#334155', fontSize: 10, fontWeight: 'bold' }} formatter={(val) => `${val}%`} />
          </Bar>
          <Bar dataKey="mujeres" fill={REPORT_PALETTE.lightBlue} radius={[0, 8, 8, 0]} barSize={12}>
            <LabelList dataKey="mujeres" position="right" style={{ fill: '#334155', fontSize: 10, fontWeight: 'bold' }} formatter={(val) => `${val}%`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const TopContentTable = ({ data }) => {
  const publicationRows = filterTopContentRows(data);
  if (publicationRows.length === 0) return null;
  return (
    <div className="overflow-x-auto border border-slate-100 rounded-2xl bg-white mt-4">
      <table className="w-full border-collapse text-left text-xs text-slate-500">
        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
          <tr>
            <th className="px-6 py-4 font-bold">Publicación destacada / Ad Creative</th>
            <th className="px-6 py-4 font-bold text-right">Resultados</th>
            <th className="px-6 py-4 font-bold text-right">Impresiones</th>
            <th className="px-6 py-4 font-bold text-right">Alcance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 font-medium">
          {publicationRows.map((item, idx) => (
            <tr key={idx} className="break-inside-avoid">
              <td className="px-6 py-4 font-bold text-slate-700">{item.title}</td>
              <td className="px-6 py-4 text-right text-slate-600 font-semibold">{item.results?.toLocaleString('es-ES') || item.views?.toLocaleString('es-ES') || 'N/A'}</td>
              <td className="px-6 py-4 text-right text-slate-600 font-semibold">{item.impressions?.toLocaleString('es-ES') || item.interactions?.toLocaleString('es-ES') || 'N/A'}</td>
              <td className="px-6 py-4 text-right text-primary font-bold">{item.reach?.toLocaleString('es-ES') || item.clicks?.toLocaleString('es-ES') || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const GranularNarrativeBlock = ({ sectionKey, comment, onChange }) => (
  <SectionInsight
    sectionId={sectionKey}
    comment={comment}
    onChange={onChange}
  />
);

const ReportCover = ({ report }) => {
  const formattedStart = formatReportDate(report.startDate);
  const formattedEnd = formatReportDate(report.endDate);
  const yearStr = getReportYear(report.startDate);
  const clientName = report.client?.name || 'Cliente';

  return (
    <div className="min-h-[85vh] flex flex-col justify-between py-12 md:py-16 relative print:min-h-screen">
      {/* Top row: Client Logo on the top left */}
      <div className="flex justify-between items-center w-full">
        <div className="h-16 w-auto flex items-center justify-start shrink-0">
           <img
            src={report.client?.logoUrl ? `${getApiBaseUrl()}${report.client.logoUrl.startsWith('/api') ? '' : '/api'}${report.client.logoUrl}` : '/brainstudio-logo.png'}
            alt={clientName}
            className="h-12 w-auto object-contain opacity-90"
            onError={(e) => {
              e.target.src = '/brainstudio-logo.png';
            }}
          />
        </div>
      </div>

      {/* Main Cover Body */}
      <div className="space-y-6 md:space-y-8 my-auto">
         {/* Badge redondeado */}
         <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#8ab9ee]/20 text-[#144c8c] rounded-full text-xs font-extrabold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#144c8c]" />
            Reporte oficial
         </div>

         {/* Giant Title */}
         <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-black text-[#1c242c] tracking-tight leading-[0.95] max-w-6xl">
            <span data-cover-line="title" className="block md:whitespace-nowrap">Reporte de desempeño digital</span>
            <span data-cover-line="client" className="block mt-3 text-[#144c8c]">de {clientName}</span>
         </h1>

         {/* Subtitle with separator */}
         <p className="text-lg md:text-xl font-semibold text-slate-500 tracking-wide">
            Estrategia & resultados • {yearStr}
         </p>
      </div>

      {/* Bottom Footer Section */}
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] border-t border-slate-100 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
         <span>Creado por Brainstudio agencia</span>
         <span className="text-slate-300 hidden sm:block">•</span>
         <span>Periodo: {formattedStart} — {formattedEnd}</span>
      </div>
    </div>
  );
};

const ExecutiveSummary = ({ narrative, onUpdate }) => {
  if (!narrative) return null;

  const handlePointChange = (idx, value) => {
    const updatedPoints = [...(narrative.summaryPoints || [])];
    updatedPoints[idx] = value;
    onUpdate({ ...narrative, summaryPoints: updatedPoints });
  };

  return (
    <div className="space-y-8 break-inside-avoid">
      <div className="space-y-4">
        <textarea
          rows={2}
          className="w-full bg-transparent border-none text-3xl font-black text-[#0f172a] leading-snug tracking-tight focus:ring-1 focus:ring-primary/10 rounded-xl py-2 outline-none resize-none"
          value={toSentenceCase(narrative.headline) || ''}
          onChange={(e) => onUpdate({ ...narrative, headline: e.target.value })}
        />
        <div className="h-1 w-20 bg-primary/40 rounded-full" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(narrative.summaryPoints || []).map((point, idx) => {
          const text = toSentenceCase(point);
          const words = text.split(' ');
          const titleLimit = Math.min(words.length, 3);
          const titlePart = words.slice(0, titleLimit).join(' ') + '...';

          return (
            <Card key={idx} className="bg-[#144c8c] border-[#144c8c] p-6 flex flex-col gap-4 break-inside-avoid shadow-sm text-white rounded-3xl">
              <div className="w-8 h-8 rounded-full bg-white/20 border border-white/10 text-white flex items-center justify-center font-black text-sm shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1 space-y-2">
                <h5 className="font-bold text-base text-white mb-2">
                  {titlePart}
                </h5>
                <textarea
                  className="w-full bg-transparent border-none text-sm text-white/90 leading-relaxed font-normal focus:ring-1 focus:ring-white/10 rounded-xl resize-none outline-none !h-auto !overflow-visible"
                  rows={4}
                  style={{ height: 'auto', overflow: 'visible', color: '#ffffff' }}
                  value={text}
                  onChange={(e) => handlePointChange(idx, e.target.value)}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const CANONICAL_METRICS = {
  spend: "Inversión Total",
  impressions: "Impresiones Totales",
  reach: "Alcance Total",
  clicks: "Clics Totales",
  ctr: "CTR Promedio",
  results: "Resultados Totales",
  views: "Visualizaciones",
  viewers: "Espectadores",
  interactions: "Interacciones",
  linkClicks: "Clics en el enlace",
  profileVisits: "Visitas al perfil",
  follows: "Nuevos seguidores",
  videoViews: "Reproducciones de video",
  reachOrganic: "Alcance orgánico",
  reachPaid: "Alcance de anuncios"
};

const formatMetricValue = (key, metric) => {
  if (metric.value === null || metric.value === undefined) return 'N/A';

  if (key === 'spend') {
    return `COP $${Number(metric.value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (key === 'ctr') {
    return `${parseFloat(metric.value).toFixed(2)}%`;
  }

  return Math.round(metric.value).toLocaleString('es-ES');
};

const MetricGrid = ({ metrics }) => {
  const metricStyles = {
    spend: { component: Trophy, card: 'bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-800', icon: 'bg-violet-600' },
    impressions: { component: Eye, card: 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-100 dark:border-cyan-800', icon: 'bg-cyan-600' },
    reach: { component: User, card: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-800', icon: 'bg-blue-600' },
    clicks: { component: ArrowUpRight, card: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-800', icon: 'bg-emerald-600' },
    ctr: { component: TrendingUp, card: 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-800', icon: 'bg-amber-500' },
    results: { component: Target, card: 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-800', icon: 'bg-rose-500' },
    views: { component: Eye, card: 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-100 dark:border-cyan-800', icon: 'bg-cyan-600' },
    viewers: { component: User, card: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-800', icon: 'bg-blue-600' },
    interactions: { component: Sparkles, card: 'bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-800', icon: 'bg-violet-600' },
    linkClicks: { component: ArrowUpRight, card: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-800', icon: 'bg-emerald-600' },
    profileVisits: { component: User, card: 'bg-sky-50 dark:bg-sky-950/30 border-sky-100 dark:border-sky-800', icon: 'bg-sky-600' },
    follows: { component: Plus, card: 'bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-100 dark:border-fuchsia-800', icon: 'bg-fuchsia-600' },
    videoViews: { component: Monitor, card: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-800', icon: 'bg-indigo-600' },
    reachOrganic: { component: User, card: 'bg-teal-50 dark:bg-teal-950/30 border-teal-100 dark:border-teal-800', icon: 'bg-teal-600' },
    reachPaid: { component: Target, card: 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-800', icon: 'bg-amber-500' }
  };
  const canonicalMetrics = filterCanonicalMetrics(metrics || {});
  const gridColumns = Object.keys(canonicalMetrics).length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4 break-inside-avoid', gridColumns)}>
      {Object.entries(canonicalMetrics).map(([key, metric]) => {
        const style = metricStyles[key];
        const MetricIcon = style.component;
        return (
          <div key={key} className={cn(
            'border p-5 rounded-2xl break-inside-avoid shadow-sm flex items-center gap-4',
            style.card,
            metric.isManuallyEdited && 'ring-2 ring-primary/20'
          )}>
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0', style.icon)}>
              <MetricIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                {CANONICAL_METRICS[key] || metric.label || key}
                {metric.isManuallyEdited && (
                  <span className="ml-1 text-[9px] text-primary font-bold lowercase tracking-normal">(editado)</span>
                )}
              </span>
              <h4 className="text-2xl font-black leading-tight text-slate-900 dark:text-slate-50 break-words">
                {formatMetricValue(key, metric)}
              </h4>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ORGANIC_PLATFORM_LABELS = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram'
};

const OrganicSummary = ({ summary, organicSummaryByPlatform, sourceExtractions }) => {
  const rebuiltSummaryByPlatform = Array.isArray(sourceExtractions)
    ? buildScopedReportData(sourceExtractions).organicSummaryByPlatform
    : {};
  const derivedSummaryByPlatform = Object.keys(rebuiltSummaryByPlatform).length > 0
    ? rebuiltSummaryByPlatform
    : (organicSummaryByPlatform || {});
  const platformRows = Object.entries(derivedSummaryByPlatform || {})
    .map(([platform, platformSummary]) => ({
      key: platform,
      label: ORGANIC_PLATFORM_LABELS[platform] || getOrganicPlatformLabel(platform),
      metrics: adaptOrganicSummary(platformSummary)
    }))
    .filter((row) => Object.keys(row.metrics).length > 0);
  const rows = platformRows.length > 0
    ? platformRows
    : [{ key: 'organic', label: 'OrgÃ¡nico', metrics: adaptOrganicSummary(summary) }];
  const styles = {
    follows: { label: 'Nuevos seguidores', icon: Plus, card: 'bg-[#d3cebe]/35 border-[#d3cebe]', iconClass: 'bg-[#144c8c]' },
    views: { label: 'Visualizaciones', icon: Eye, card: 'bg-[#8ab9ee]/20 border-[#8ab9ee]/60', iconClass: 'bg-[#1f3c58]' },
    interactions: { label: 'Interacciones', icon: Sparkles, card: 'bg-[#627d9f]/15 border-[#627d9f]/40', iconClass: 'bg-[#627d9f]' },
    reach: { label: 'Alcance', icon: User, card: 'bg-[#1f3c58]/10 border-[#1f3c58]/30', iconClass: 'bg-[#1c242c]' }
  };
  if (!rows.some((row) => Object.keys(row.metrics).length > 0)) return null;
  return (
    <div className="space-y-5 break-inside-avoid">
      {rows.map((row) => (
        <div key={row.key} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#627d9f]">{row.label}</span>
            <span className="h-px flex-1 bg-[#d3cebe]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(row.metrics).map(([key, metric]) => {
              const style = styles[key];
              const Icon = style.icon;
              return (
                <div key={`${row.key}-${key}`} className={cn('border p-5 rounded-2xl shadow-sm flex items-center gap-4', style.card)}>
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0', style.iconClass)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{style.label}</span>
                    <h4 className="text-2xl font-black text-slate-900 dark:text-slate-50 truncate">{formatMetricValue(key, metric)}</h4>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

const ActionPlan = ({ narrative, onUpdate }) => {
  if (!narrative || !narrative.actionPlan) return null;
  const actionPlan = sanitizeNarrativeForReport(narrative).actionPlan || [];
  if (actionPlan.length === 0) return null;

  const handleChange = (idx, field, value) => {
    const updatedPlan = [...narrative.actionPlan];
    updatedPlan[idx] = { ...updatedPlan[idx], [field]: value };
    onUpdate({ ...narrative, actionPlan: updatedPlan });
  };

  return (
    <div className="space-y-6 break-inside-avoid pt-12 border-t border-slate-100">
      <div className="space-y-2">
        <h3 className="text-xl font-black tracking-tight text-slate-800">Plan de Acción Sugerido</h3>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Estrategias de Optimización para el Siguiente Periodo</p>
      </div>

      <div className="overflow-x-auto border border-slate-100 rounded-2xl bg-white">
        <table className="w-full border-collapse text-left text-sm text-slate-500">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 font-bold">Compromiso / Acción Recomendada</th>
              <th className="px-6 py-4 font-bold">KPI de Éxito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium">
            {actionPlan.map((item, idx) => (
              <tr key={idx} className="break-inside-avoid">
                <td className="px-6 py-4">
                  <textarea
                    rows={2}
                    className="w-full bg-transparent border-none text-slate-700 font-medium focus:ring-1 focus:ring-primary/10 rounded-lg outline-none resize-none"
                    value={item.action}
                    onChange={(e) => handleChange(idx, 'action', e.target.value)}
                  />
                </td>
                <td className="px-6 py-4">
                  <textarea
                    rows={2}
                    className="w-full bg-transparent border-none text-slate-700 font-semibold focus:ring-1 focus:ring-primary/10 rounded-lg outline-none resize-none"
                    value={item.kpi}
                    onChange={(e) => handleChange(idx, 'kpi', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SourceAppendix = ({ sources }) => {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="space-y-6 break-inside-avoid pt-12 border-t border-slate-100 print:hidden">
      <div className="space-y-2">
        <h3 className="text-xl font-black tracking-tight text-slate-800">{toSentenceCase("Apéndice de evidencias")}</h3>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{toSentenceCase("Capturas originales de Meta Ads procesadas")}</p>
      </div>
      <div className="grid grid-cols-1 gap-6">
        {sources.map((src, idx) => (
          <Card key={idx} className="overflow-hidden border-slate-100 p-4 bg-slate-50/50">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pb-3 border-b border-slate-200/60 mb-3 flex justify-between items-center">
              <span>{src.screenType || 'Evidencia'}</span>
              <span>{src.platform}</span>
            </div>
            <div className="aspect-video rounded-xl overflow-hidden border border-slate-200/70 bg-white flex items-center justify-center">
              {src.storagePath ? (
                <img
                  src={`${getApiBaseUrl()}/api/reports/image-proxy?path=${encodeURIComponent(src.storagePath)}`}
                  alt={src.screenType}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-slate-300 font-bold">Imagen no disponible</span>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const ReportMetricsReview = ({ report, onApprove, isSubmitting }) => {
  const [localMetrics, setLocalMetrics] = useState(report.normalizedMetrics || {});

  const handleValueChange = (key, val) => {
    const parsedVal = val === '' ? null : parseFloat(val);
    setLocalMetrics(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        value: parsedVal
      }
    }));
  };

  const handleApprove = () => {
    onApprove(localMetrics);
  };

  const allWarnings = [
    ...(report.normalizedMetrics?.warnings || []),
    ...(report.sources?.flatMap(s => s.warnings || []) || [])
  ].filter((warning, index, warnings) => warnings.indexOf(warning) === index);

  const hasWarning = (key) => {
    if (key === 'ctr' || key === 'clicks' || key === 'impressions') {
      return allWarnings.some(w => w.toLowerCase().includes('ctr') || w.toLowerCase().includes('matemática') || w.toLowerCase().includes('difiere'));
    }
    return false;
  };

  return (
    <div className="space-y-8 bg-white dark:bg-slate-900 border border-[#e2e8f0] dark:border-slate-700 rounded-[2.5rem] p-10 shadow-lg no-print">
      <div className="border-b border-slate-100 pb-6 space-y-2">
        <h2 className="text-2xl font-black text-slate-800 dark:text-slate-50 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Auditoría de Métricas Extraídas (Visión AI)
        </h2>
        <p className="text-sm text-slate-500 font-medium">
          Por favor, inspecciona y valida las cifras leídas automáticamente antes de proceder con el reporte ejecutivo.
        </p>
      </div>

      {allWarnings.length > 0 && (
        <div className="p-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
            <Info className="w-5 h-5 text-amber-600 animate-pulse" />
            Alertas de Coherencia Matemática y Calidad
          </div>
          <ul className="list-disc pl-5 space-y-1 text-amber-700 text-xs font-medium">
            {allWarnings.map((warn, wIdx) => (
              <li key={wIdx}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(report.normalizedMetrics?.organicSummary || {}).length > 0 && (
        <section className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-50">Resumen orgánico detectado</h3>
            <p className="text-xs text-slate-500">Un único grupo con cifras orgánicas verificables; los totales mixtos y de anuncios quedan excluidos.</p>
          </div>
          <OrganicSummary
            summary={report.normalizedMetrics.organicSummary}
            organicSummaryByPlatform={report.normalizedMetrics.organicSummaryByPlatform}
            sourceExtractions={report.normalizedMetrics.sourceExtractions}
          />
        </section>
      )}

      {getReviewMetricEntries(localMetrics).length > 0 && (
        <h3 className="text-lg font-black text-slate-800 dark:text-slate-50">Métricas de pauta detectadas</h3>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {getReviewMetricEntries(localMetrics).map(([key, metric]) => {
          const warningActive = hasWarning(key) || (metric.confidence !== undefined && metric.confidence < 0.8);

          return (
            <div
              key={key}
              className={cn(
                "border rounded-2xl p-6 space-y-4 transition-all duration-300",
                warningActive
                  ? "bg-amber-50/40 border-amber-300 shadow-amber-100/50"
                  : "bg-slate-50/50 border-slate-200 shadow-sm"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {metric.label || key}
                </span>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  warningActive ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                )}>
                  {((metric.confidence || 1.0) * 100).toFixed(0)}% conf
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {metric.unit === 'USD' || metric.unit === 'COP' || metric.unit === 'EUR' ? (
                    <span className="text-sm font-bold text-slate-500">{metric.unit}</span>
                  ) : null}
                  <input
                    type="number"
                    step="any"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xl font-bold text-slate-800 focus:ring-2 focus:ring-primary/20 outline-none"
                    value={metric.value === null || metric.value === undefined ? '' : String(metric.value)}
                    onChange={(e) => handleValueChange(key, e.target.value)}
                  />
                  {metric.unit && metric.unit !== 'USD' && metric.unit !== 'COP' && metric.unit !== 'EUR' && metric.unit !== 'count' ? (
                    <span className="text-sm font-bold text-slate-500">{metric.unit}</span>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Evidencia detectada:</p>
                  <p className="text-xs text-slate-600 bg-white/75 border border-slate-100 p-2.5 rounded-lg italic line-clamp-2">
                    &ldquo;{metric.evidence || 'N/A'}&rdquo;
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-100 pt-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="text-xs text-slate-400 font-medium">
          Una vez aprobado, el reporte avanzará al estado <span className="font-bold text-slate-600">REVIEW</span> y se habilitará el informe narrativo final.
        </div>
        <button
          onClick={handleApprove}
          disabled={isSubmitting}
          className="px-8 py-3 bg-primary hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 self-end shrink-0"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Guardando Auditoría...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Aprobar Cifras y Continuar
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const Reports = () => {
  const { currentUser } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');

  const [organicFiles, setOrganicFiles] = useState([]);
  const [adsFiles, setAdsFiles] = useState([]);
  const [logoFile, setLogoFile] = useState(null);

  const [organicPreviews, setOrganicPreviews] = useState([]);
  const [adsPreviews, setAdsPreviews] = useState([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [report, setReport] = useState(null);
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [viewMode, setViewMode] = useState('web'); // 'web' (Ver Reporte Web) | 'deck' (PDF Deck)
  const [editedTexts, setEditedTexts] = useState({
    title: '',
    organic_analysis: [],
    performance_analysis: []
  });
  const [narrativeState, setNarrativeState] = useState(null);
  const reportRef = useRef(null);

  const isGeneratingRef = useRef(false);
  const isApprovingRef = useRef(false);

  useEffect(() => {
    if (report?.narrative && (report.status === 'PUBLISHED' || report.status === 'REVIEW')) {
      let parsed = report.narrative;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          parsed = {
            headline: "Análisis General de Performance",
            summaryPoints: ["Análisis de pauta extraído exitosamente.", "Evolución optimista en los deltas de CTR.", "Acciones de mejora planificadas."],
            keyAchievements: report.narrative,
            actionPlan: [],
            granularNarratives: []
          };
        }
      }
      setNarrativeState(parsed);
    } else {
      setNarrativeState(null);
    }
  }, [report]);

  const getGranularComment = (sectionKey) => {
    const item = narrativeState?.granularNarratives?.find(n => n.sectionKey === sectionKey);
    return item ? item.consultativeComment : '';
  };

  const handleGranularCommentChange = (sectionKey, value) => {
    const list = [...(narrativeState?.granularNarratives || [])];
    const idx = list.findIndex(n => n.sectionKey === sectionKey);
    if (idx !== -1) {
      list[idx] = { ...list[idx], consultativeComment: value };
    } else {
      const defaultTitles = {
        macro_performance: 'Rendimiento y Tendencia',
        demographics: 'Distribución Demográfica',
        top_content: 'Mejores Contenidos'
      };
      list.push({ sectionKey, title: defaultTitles[sectionKey] || 'Sección', consultativeComment: value });
    }
    setNarrativeState({ ...narrativeState, granularNarratives: list });
  };

  const handleSectionCommentChange = (sectionId, value) => {
    if (!report?.sections) return;
    const updatedSections = (report.sections || []).map(s => {
      if (s.sectionId === sectionId) {
        return { ...s, narrativeComment: value };
      }
      return s;
    });
    setReport({ ...report, sections: updatedSections });
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/api/db/clients`);
      setClients(response.data || []);
    } catch (error) {
      console.error('Fetch clients error');
    }
  };

  const handleFilesChange = (type, e) => {
    const selectedFiles = Array.from(e.target.files || []);

    if (type === 'organic') {
      if (organicFiles.length + selectedFiles.length > 8) {
        toast.error('Límite máximo de 8 imágenes para RRSS');
        return;
      }
      setOrganicFiles(prev => [...prev, ...selectedFiles]);
      const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
      setOrganicPreviews(prev => [...prev, ...newPreviews]);
    } else if (type === 'ads') {
      if (adsFiles.length + selectedFiles.length > 6) {
        toast.error('Límite máximo de 6 imágenes para ADS');
        return;
      }
      setAdsFiles(prev => [...prev, ...selectedFiles]);
      const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
      setAdsPreviews(prev => [...prev, ...newPreviews]);
    } else if (type === 'logo') {
      setLogoFile(selectedFiles[0]);
    }
    e.target.value = '';
  };

  const removeFile = (type, index) => {
    if (type === 'organic') {
      setOrganicFiles(prev => prev.filter((_, i) => i !== index));
      URL.revokeObjectURL(organicPreviews[index]);
      setOrganicPreviews(prev => prev.filter((_, i) => i !== index));
    } else if (type === 'ads') {
      setAdsFiles(prev => prev.filter((_, i) => i !== index));
      URL.revokeObjectURL(adsPreviews[index]);
      setAdsPreviews(prev => prev.filter((_, i) => i !== index));
    } else if (type === 'logo') {
      setLogoFile(null);
    }
  };

  const handleTextEdit = (section, field, value, index = null) => {
    if (section === 'title') {
        setEditedTexts(prev => ({ ...prev, title: value }));
        return;
    }
    if (section === 'hoja_de_ruta' && index !== null) {
        const newRoadmap = [...(report?.analysis?.hoja_de_ruta || [])];
        newRoadmap[index] = { ...newRoadmap[index], [field]: value };
        setReport(prev => ({
            ...prev,
            analysis: {
                ...prev.analysis,
                hoja_de_ruta: newRoadmap
            }
        }));
        return;
    }
    if (Array.isArray(editedTexts[section]) && index !== null) {
        const newArray = [...editedTexts[section]];
        newArray[index] = { ...newArray[index], [field]: value };
        setEditedTexts(prev => ({ ...prev, [section]: newArray }));
        return;
    }
  };

  const generateReport = async () => {
    if (isGeneratingRef.current) return;
    if (isGenerating) return;
    if (!selectedClientId) {
      toast.error('Selecciona un cliente');
      return;
    }
    if (organicFiles.length === 0 && adsFiles.length === 0) {
        toast.error('Sube al menos un pantallazo');
        return;
    }
    if (!startDate || !endDate || startDate > endDate) {
      toast.error('Selecciona un período de reporte válido');
      return;
    }

    isGeneratingRef.current = true;
    setIsGenerating(true);
    setReport(null);
    setEditedTexts({
        title: '',
        organic_analysis: [],
        performance_analysis: []
    });

    const formData = new FormData();
    formData.append('clientId', selectedClientId);
    formData.append('periodKind', 'MONTHLY');
    formData.append('startDate', startDate);
    formData.append('endDate', endDate);
    adsFiles.forEach(file => formData.append('files', file));
    organicFiles.forEach(file => formData.append('files', file));
    if (logoFile) formData.append('logo', logoFile);

    try {
      const response = await axios.post(`${getApiBaseUrl()}/api/reports/extract-metrics`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.data?.success && response.data?.report) {
        const reportData = response.data.report;
        setReport(reportData);
        setEditedTexts({
            title: `Reporte de Performance - ${reportData.client?.name || 'Cliente'} - 2026`,
            organic_analysis: [],
            performance_analysis: []
        });
        toast.success('Extracción de métricas y reporte borrador generado exitosamente!');
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      const errMsg = error.response?.data?.error || 'Fallo en la extracción de IA. Reintenta.';
      toast.error(errMsg);
      console.error('[Reports Frontend] Extraction error:', error.response?.data || error);
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
    }
  };

  const handleApproveReview = async (reviewedMetrics) => {
    if (isApprovingRef.current) return;
    if (!report?.id) return;
    isApprovingRef.current = true;
    setIsSubmittingReview(true);
    try {
      // 1. Save audited metrics
      const patchResponse = await axios.patch(`${getApiBaseUrl()}/api/reports/${report.id}/metrics`, {
        normalizedMetrics: reviewedMetrics
      }, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (patchResponse.data?.success && patchResponse.data?.report) {
        setReport(patchResponse.data.report);
        toast.success('Métricas auditadas correctamente!');

        // 2. Trigger Narrative Generation
        setIsGeneratingNarrative(true);
        const narrativeResponse = await axios.post(`${getApiBaseUrl()}/api/reports/${report.id}/generate-narrative`, {}, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          timeout: 270000
        });

        const decision = processNarrativeResponse(narrativeResponse.data);

        if (decision.shouldUpdateReport) {
          setReport(decision.report);
        }

        if (decision.shouldShowSuccess) {
          toast.success('Reporte narrativo editorial generado exitosamente!');
        } else if (decision.shouldShowWarning) {
          toast.error(decision.warningMsg || 'Narrativa pendiente de regeneración');
        }

        if (decision.shouldThrowError) {
          throw new Error(decision.errorMsg || 'Fallo al generar la narrativa');
        }
      } else {
        throw new Error('Fallo al guardar la auditoría');
      }
    } catch (error) {
      const errMsg = error.response?.data?.error || error.message || 'Error en el proceso. Intenta de nuevo.';
      toast.error(errMsg);
      console.error('[Reports Frontend] Flow error:', error.response?.data || error);
    } finally {
      setIsSubmittingReview(false);
      setIsGeneratingNarrative(false);
      isApprovingRef.current = false;
    }
  };

  const buildReportExportHtml = ({ mode = 'html' } = {}) => {
    if (!reportRef.current) return;
    const element = reportRef.current.cloneNode(true);
    const realContainers = reportRef.current.querySelectorAll('.recharts-responsive-container');
    const clonedContainers = element.querySelectorAll('.recharts-responsive-container');

    realContainers.forEach((realCont, idx) => {
      const clonedCont = clonedContainers[idx];
      if (!clonedCont) return;

      const realSvg = realCont.querySelector('svg');
      if (realSvg) {
        const clonedSvg = realSvg.cloneNode(true);
        const width = realCont.clientWidth || 600;
        const height = realCont.clientHeight || 280;

        clonedSvg.setAttribute('width', String(width));
        clonedSvg.setAttribute('height', String(height));
        clonedSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        clonedSvg.style.width = '100%';
        clonedSvg.style.height = 'auto';

        clonedCont.innerHTML = '';
        clonedCont.appendChild(clonedSvg);
      }
    });

    element.querySelectorAll('.no-print').forEach(el => el.remove());

    const liveControls = reportRef.current.querySelectorAll('textarea, input');
    const clonedControls = element.querySelectorAll('textarea, input');
    clonedControls.forEach((ta, index) => {
      const div = document.createElement('div');
      const val = readLiveControlValue(liveControls[index], ta);
      if (ta.tagName.toLowerCase() === 'textarea' && val.includes('\n')) {
        val.split('\n\n').filter(Boolean).forEach((paragraph) => {
          const paragraphElement = document.createElement('p');
          paragraphElement.className = 'text-sm leading-relaxed font-normal';
          paragraphElement.style.margin = '0 0 12px';
          paragraphElement.style.whiteSpace = 'pre-wrap';
          paragraphElement.textContent = paragraph;
          div.appendChild(paragraphElement);
        });
      } else {
        div.textContent = val;
      }
      div.className = ta.className;
      div.style.height = 'auto';
      div.style.whiteSpace = 'pre-wrap';
      div.style.border = 'none';

      let isDarkBg = false;
      let parent = ta.parentElement;
      while (parent) {
        const classes = safeClassName(parent.className);
        if (
          classes.includes('bg-[#144c8c]') ||
          classes.includes('bg-[#1f3c58]') ||
          classes.includes('bg-[#1c242c]') ||
          classes.includes('text-white') ||
          classes.includes('bg-primary')
        ) {
          isDarkBg = true;
          break;
        }
        parent = parent.parentElement;
      }

      div.style.color = isDarkBg ? '#ffffff' : '#1e293b';
      ta.parentNode.replaceChild(div, ta);
    });

    element.querySelectorAll('*').forEach(node => {
      let isDarkBg = false;
      let parent = node.parentElement;
      while (parent) {
        const classes = safeClassName(parent.className);
        if (
          classes.includes('bg-[#144c8c]') ||
          classes.includes('bg-[#1f3c58]') ||
          classes.includes('bg-[#1c242c]') ||
          classes.includes('text-white') ||
          classes.includes('bg-primary')
        ) {
          isDarkBg = true;
          break;
        }
        parent = parent.parentElement;
      }

      if (isDarkBg && node.style && node.style.color) {
        node.style.color = '#ffffff';
      }
    });

    const compiledStyles = collectDocumentStyles(document.styleSheets);
    const isPdf = mode === 'pdf';
    const htmlContentRaw = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${editedTexts.title || 'Reporte de Performance'}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    ${compiledStyles}
    body {
      font-family: 'Inter', sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 2rem;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .report-wrapper {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
      border-radius: 2.5rem;
      overflow: hidden;
      width: 100%;
      max-width: 80rem;
    }
    .whitespace-pre-wrap {
      white-space: pre-wrap !important;
    }
    ${isPdf ? `
    @page { size: A4 landscape; margin: 10mm; }
    body.pdf-export {
      background: #ffffff;
      padding: 0;
      display: block;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .pdf-export .report-wrapper {
      width: 100%;
      max-width: none;
      border: 0;
      box-shadow: none;
      border-radius: 0;
      overflow: visible;
    }
    .pdf-export #report-canvas {
      width: 100%;
      display: block;
    }
    .pdf-export .page-break-after {
      break-after: auto !important;
      page-break-after: auto !important;
    }
    .pdf-export #report-canvas > .page-break-after:first-child {
      break-after: page !important;
      page-break-after: always !important;
    }
    .pdf-export .break-inside-avoid,
    .pdf-export table,
    .pdf-export svg {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .pdf-export textarea,
    .pdf-export input {
      border: 0 !important;
      box-shadow: none !important;
      background: transparent !important;
    }
    ` : ''}
  </style>
</head>
<body class="${isPdf ? 'pdf-export' : ''}">
  <div class="report-wrapper">
    ${element.innerHTML}
  </div>
  ${isPdf ? `<script>setTimeout(() => { window.focus(); window.print(); }, 350);</script>` : ''}
</body>
</html>`;

    return htmlContentRaw.replace(/(\d+)\.(\d+)(%)/g, (match, integerPart, decimalPart, percentSign) => {
      if (decimalPart.length > 2) {
        const roundedDecimal = Math.round(parseFloat(`0.${decimalPart}`) * 100) / 100;
        const roundedStr = roundedDecimal.toFixed(2).split('.')[1] || '00';
        return `${integerPart}.${roundedStr}${percentSign}`;
      }
      return match;
    });
  };

  const downloadHTML = () => {
    if (!reportRef.current) return;
    const toastId = toast.loading('Generando documento HTML...');
    try {
      const htmlContent = buildReportExportHtml({ mode: 'html' });

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = buildReportFileName(editedTexts.title);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Descarga HTML lista', { id: toastId });
    } catch (err) {
      console.error('HTML Export Error:', err);
      toast.error('Error al exportar HTML', { id: toastId });
    }
  };

  const downloadPDF = () => {
    if (!reportRef.current) return;
    const toastId = toast.loading('Preparando PDF optimizado...');
    try {
      const htmlContent = buildReportExportHtml({ mode: 'pdf' });
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('El navegador bloqueó la ventana de impresión.');
      }
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      toast.success('PDF listo para guardar desde el diálogo de impresión', { id: toastId });
    } catch (err) {
      console.error('PDF Export Error:', err);
      toast.error('Error al preparar PDF', { id: toastId });
    }
  };

  const getImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('/api')) {
        return `${getApiBaseUrl()}${url}`;
    }
    return url;
  };

  const SectionHeader = ({ title, client }) => (
    <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
       <h3 className="text-xl font-bold tracking-tight text-slate-800">{title}</h3>
       {client && <ClientAvatar client={client} size={40} className="rounded-xl shadow-sm border border-slate-100" />}
    </div>
  );

  return (
    <div data-build={BUILD_SHA} className="p-6 max-w-7xl mx-auto space-y-10 min-h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-inter">
      {/* Control Panel */}
      <div className="bg-white border border-[#e2e8f0] rounded-[2rem] p-8 shadow-sm space-y-8 no-print">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reporte de desempeño digital</h1>
              <p className="text-sm text-slate-500 font-medium italic">Análisis Multimodal con IA v7.0</p>
            </div>
            <div className="flex gap-3">
               {report && (
                 <>
                   <button onClick={downloadPDF} className="px-6 py-2.5 bg-primary hover:opacity-90 text-white border border-primary rounded-xl text-xs font-bold transition-all">
                    Descargar PDF
                   </button>
                   <button onClick={downloadHTML} className="px-6 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold transition-all">
                    Descargar Reporte HTML
                   </button>
                 </>
               )}
               <button
                onClick={generateReport}
                disabled={isGenerating || (organicFiles.length === 0 && adsFiles.length === 0)}
                className="px-8 py-2.5 bg-primary hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2"
               >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isGenerating ? "Procesando..." : "Generar Auditoría"}
               </button>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cliente</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="">Marca...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Desde</span>
                  <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-100" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Hasta</span>
                  <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-700 dark:text-slate-100" />
                </label>
              </div>
              <div className="relative group border border-dashed border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition-all cursor-pointer">
                 <input type="file" accept="image/*" onChange={(e) => handleFilesChange('logo', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white border border-slate-100 rounded-lg flex items-center justify-center">
                       {logoFile ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Upload className="w-4 h-4 text-slate-300" />}
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 truncate">{logoFile ? logoFile.name : "Logo PNG"}</span>
                 </div>
              </div>
            </div>

            <div className="space-y-4">
               <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pantallazos Orgánicos (Máx 8)</label>
               <div className="relative group border border-dashed border-slate-200 rounded-xl p-6 hover:bg-emerald-50/20 transition-all cursor-pointer text-center">
                 <input type="file" multiple accept="image/png, image/jpeg, image/jpg" onChange={(e) => handleFilesChange('organic', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <Plus className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">+ AÑADIR RRSS</span>
               </div>
               <div className="grid grid-cols-4 gap-2">
                 {organicPreviews.map((src, i) => (
                   <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                      <img src={src} className="w-full h-full object-cover" alt={`Preview RRSS ${i}`} />
                      <button
                        onClick={() => removeFile('organic', i)}
                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                   </div>
                 ))}
               </div>
            </div>

            <div className="space-y-4">
               <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pantallazos Pauta (Máx 6)</label>
               <div className="relative group border border-dashed border-slate-200 rounded-xl p-6 hover:bg-cyan-50/20 transition-all cursor-pointer text-center">
                 <input type="file" multiple accept="image/png, image/jpeg, image/jpg" onChange={(e) => handleFilesChange('ads', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <Plus className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">+ AÑADIR ADS</span>
               </div>
               <div className="grid grid-cols-4 gap-2">
                 {adsPreviews.map((src, i) => (
                   <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                      <img src={src} className="w-full h-full object-cover" alt={`Preview ADS ${i}`} />
                      <button
                        onClick={() => removeFile('ads', i)}
                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                   </div>
                 ))}
               </div>
            </div>
         </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-full-width {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          textarea, input {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
            resize: none !important;
          }
          @page {
            size: A4 landscape;
            margin: 0;
          }
          .page-break-after {
            page-break-after: always !important;
            break-after: page !important;
          }
        }
      `}} />

      {/* Main Report Canvas */}
      <AnimatePresence mode="wait">
        {isGeneratingNarrative ? (
          <div className="h-[500px] flex flex-col items-center justify-center space-y-6 bg-white border border-slate-200 rounded-[2.5rem] shadow-sm no-print">
             <Loader2 className="w-12 h-12 text-primary animate-spin" />
             <div className="text-center space-y-2">
               <h3 className="text-xl font-bold text-slate-800">Generando Narrativa Editorial</h3>
               <p className="text-sm text-slate-400 font-medium max-w-sm">
                 Nuestros modelos de Inteligencia Estratégica están analizando las métricas validadas para redactar el reporte ejecutivo...
               </p>
             </div>
          </div>
        ) : report ? (
          report.status === 'DRAFT' ? (
            <ReportMetricsReview
              report={report}
              onApprove={handleApproveReview}
              isSubmitting={isSubmittingReview}
            />
          ) : (
            <div className="space-y-6 flex flex-col w-full">
              {/* Tab Selector Mode (No-print) */}
              <div className="flex gap-2 no-print bg-slate-100 p-1.5 rounded-xl self-start">
                <button
                  onClick={() => setViewMode('web')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                    viewMode === 'web' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  Ver Reporte Web
                </button>
                <button
                  onClick={() => setViewMode('deck')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                    viewMode === 'deck' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  Vista PDF Deck (A4)
                </button>
              </div>

              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white border border-[#e2e8f0] shadow-2xl rounded-[2.5rem] overflow-hidden print:border-none print:shadow-none"
              >
                <div id="report-canvas" ref={reportRef} className="bg-white flex flex-col w-full">

                   {/* UNIFIED executive monocolumn continuous vertical layout */}
                   <div className="p-8 md:p-12 space-y-12 w-full">
                     {['FALLBACK', 'NARRATIVE_FAILED'].includes(narrativeState?.generationMode) && (
                       <div className="no-print rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                         <strong>Narrativa necesita regeneración:</strong> la generación editorial no produjo una versión publicable. El reporte conserva métricas y gráficas, pero debes regenerar la narrativa antes de entregar o exportar el informe.
                       </div>
                     )}
                     {/* 1. Portada Monumental */}
                     <div className="page-break-after">
                       <ReportCover report={report} />
                     </div>

                     {/* 2. Resumen Ejecutivo (Impact cards + full-width interpretive text) */}
                     <div className="border-t border-slate-100 pt-8 space-y-6 page-break-after">
                       <ExecutiveSummary narrative={narrativeState} onUpdate={setNarrativeState} />

                       <div className="space-y-4 pt-6 border-t border-slate-100/60 w-full">
                         <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">{toSentenceCase("Análisis interpretativo de logros")}</h4>
                         <Card className="bg-[#144c8c] border-[#144c8c] p-6 text-white shadow-sm w-full">
                            <textarea
                               rows={4}
                               className="w-full bg-transparent border-none text-white leading-relaxed font-normal text-base outline-none resize-none focus:ring-1 focus:ring-white/10 rounded-xl !h-auto !overflow-visible"
                               style={{ height: 'auto', overflow: 'visible', color: '#ffffff' }}
                               value={toSentenceCase(narrativeState?.keyAchievements) || ''}
                               onChange={(e) => setNarrativeState({ ...narrativeState, keyAchievements: e.target.value })}
                            />
                         </Card>
                       </div>
                     </div>

                     {/* 3. Logros y avances stacked below */}
                     {narrativeState?.logrosYAvances && narrativeState.logrosYAvances.length > 0 && (
                       <div className="border-t border-slate-100 pt-8 space-y-4 w-full page-break-after">
                         <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">{toSentenceCase("Logros y avances")}</h4>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                           {(Array.isArray(narrativeState?.logrosYAvances) ? narrativeState.logrosYAvances : []).map((bullet, idx) => {
                             const safeBullet = typeof bullet === 'string' ? bullet : '';
                             const achievement = splitAchievement(safeBullet);
                             const updateAchievement = (field, value) => {
                               const achievementsList = Array.isArray(narrativeState?.logrosYAvances) ? narrativeState.logrosYAvances : [];
                               const updated = [...achievementsList];
                               const next = { ...achievement, [field]: value };
                               updated[idx] = `**${next.title}:** ${next.description}`;
                               setNarrativeState({ ...narrativeState, logrosYAvances: updated });
                             };
                             return (
                               <div key={idx} className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm break-inside-avoid">
                                 <div className="bg-[#1c242c] px-5 py-4">
                                   <input type="text" className="w-full bg-transparent border-none text-white focus:ring-0 outline-none p-0 text-sm font-black" value={achievement.title} onChange={(e) => updateAchievement('title', e.target.value)} />
                                 </div>
                                 <textarea rows={3} className="w-full bg-white dark:bg-slate-900 border-none text-slate-600 dark:text-slate-200 focus:ring-0 outline-none p-5 text-sm leading-relaxed resize-none" value={achievement.description} onChange={(e) => updateAchievement('description', e.target.value)} />
                               </div>
                             );
                           })}
                         </div>
                       </div>
                     )}

                     {/* 4. Resultados orgánicos: nunca mezcla Facebook, Instagram o pauta */}
                     {Object.keys(report.normalizedMetrics?.organicSummary || {}).length > 0 && (
                       <div className="border-t border-slate-100 pt-8 space-y-6 page-break-after w-full">
                         <div className="space-y-1">
                           <h3 className="text-xl font-black tracking-tight text-slate-800">Resultados generales — Desempeño orgánico</h3>
                         <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Lectura consolidada de la actividad orgánica</p>
                         </div>
                         <OrganicSummary
                           summary={report.normalizedMetrics.organicSummary}
                           organicSummaryByPlatform={report.normalizedMetrics.organicSummaryByPlatform}
                           sourceExtractions={report.normalizedMetrics.sourceExtractions}
                         />
                       </div>
                     )}

                     {/* 5. Sección Orgánica (Redes Sociales): Distribución de Formatos, Demografía con Ciudades/Países, y Contenido Top */}
                     {report.sections?.some(s => s.sectionCategory === 'ORGANIC') && <div className="space-y-8 border-t border-slate-100 pt-8 w-full page-break-after">
                       <div className="space-y-1">
                         <h3 className="text-xl font-black tracking-tight text-slate-800">{toSentenceCase("Sección orgánica (redes sociales)")}</h3>
                         <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{toSentenceCase("Evolución y rendimiento en redes sociales")}</p>
                       </div>

                       {report.sections && report.sections.filter(s => s.sectionCategory === 'ORGANIC').map((sect, idx) => {
                         const hasDemographics = ['ageGender', 'cities', 'countries'].some(key => Array.isArray(sect.demographics?.[key]) && sect.demographics[key].length > 0);
                         const hasDataset = Array.isArray(sect.dataset) && sect.dataset.length > 0 && sumDatasetValues(sect.dataset) > 0;
                         if (!hasDataset && !hasDemographics) return null;
                         const platformLabel = getOrganicPlatformLabel(sect.platform);
                         const chartPlatform = sect.platform === 'FACEBOOK' || sect.platform === 'INSTAGRAM' ? sect.platform : 'ORGANIC';
                         return (
                         <div key={sect.sectionId || `organic-${idx}`} className="space-y-3 p-6 bg-slate-50/20 border border-slate-100 rounded-[1.5rem] break-inside-avoid w-full">
                           <div className="flex justify-between items-center">
                             <h4 className="text-base font-black text-slate-800">{toSentenceCase(sect.title || 'Rendimiento orgánico')}</h4>
                             <span className="text-[10px] font-bold text-[#144c8c] uppercase tracking-wider bg-[#8ab9ee]/20 px-2.5 py-0.5 rounded-full">{platformLabel}</span>
                           </div>
                           {sect.demographics ? (
                             <DemographicsChart demographics={sect.demographics} />
                           ) : (
                             <DynamicChartRenderer chartType={sect.chartType} dataset={sect.dataset} platform={chartPlatform} />
                           )}
                           <SectionInsight
                             sectionId={sect.sectionId}
                             comment={sect.narrativeComment}
                             onChange={handleSectionCommentChange}
                           />
                         </div>
                         );
                       })}

                       {/* Demographics stacked cleanly under formats */}
                       {report.normalizedMetrics?.demographics && (
                         <div className="space-y-4 pt-6 border-t border-slate-100/60 w-full">
                           <h4 className="text-sm font-black text-slate-800">{toSentenceCase("Distribución demográfica")}</h4>
                           <DemographicsChart demographics={report.normalizedMetrics.demographics} />
                           <GranularNarrativeBlock
                             sectionKey="demographics"
                             title={toSentenceCase("Análisis de distribución demográfica")}
                             comment={getGranularComment("demographics")}
                             onChange={handleGranularCommentChange}
                           />
                         </div>
                       )}
                     </div>}

                     {/* 6. Sección de Pauta Digital (Meta Ads): Tabla de Desempeño de Anuncios y Tendencias Temporales */}
                     {(report.sections?.some(s => s.sectionCategory === 'ADS') || Object.keys(report.normalizedMetrics?.adsSummary || {}).length > 0) && <div className="space-y-8 border-t border-slate-100 pt-8 w-full page-break-after">
                       <div className="space-y-1">
                         <h3 className="text-xl font-black tracking-tight text-slate-800">{toSentenceCase("Sección de pauta digital (Meta Ads)")}</h3>
                         <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{toSentenceCase("Inversión y retorno en pauta publicitaria")}</p>
                       </div>

                       {Object.keys(report.normalizedMetrics?.adsSummary || {}).length > 0 && (
                         <div className="space-y-4 break-inside-avoid">
                           <h3 className="text-xl font-black tracking-tight text-slate-800">Resultados generales — Desempeño de pauta</h3>
                           <MetricGrid metrics={report.normalizedMetrics.adsSummary} />
                         </div>
                       )}

                       {/* Performance trend chart stacked cleanly at the top of paid ads */}
                       {report.normalizedMetrics?.series && report.normalizedMetrics.series.length > 0 && (
                         <div className="space-y-4 pt-6 w-full">
                           <div className="space-y-1">
                             <h4 className="text-sm font-black text-slate-800">{toSentenceCase("Tendencia de desempeño")}</h4>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{toSentenceCase("Evolución de rendimiento en el periodo")}</p>
                           </div>
                           <PerformanceTrendChart data={report.normalizedMetrics.series} />
                           <GranularNarrativeBlock
                             sectionKey="macro_performance"
                             title={toSentenceCase("Análisis de rendimiento y tendencia")}
                             comment={getGranularComment("macro_performance")}
                             onChange={handleGranularCommentChange}
                           />
                         </div>
                       )}

                       {/* Top content table (creative names / Reels) for ads */}
                       {report.normalizedMetrics?.topContent && report.normalizedMetrics.topContent.length > 0 && (
                         <div className="space-y-4 pt-6 border-t border-slate-100/60 w-full">
                           <h4 className="text-sm font-black text-slate-800">{toSentenceCase("Desempeño de anuncios")}</h4>
                           <TopContentTable data={report.normalizedMetrics.topContent} />

                           {narrativeState?.contenidoTopAnalisis && (
                             <Card className="bg-[#f8fafc] border border-slate-100 p-6 rounded-3xl shadow-sm w-full">
                               <textarea
                                  rows={4}
                                  className="w-full bg-transparent border-none text-slate-700 leading-relaxed font-normal text-sm outline-none resize-none focus:ring-0 rounded-xl !h-auto !overflow-visible"
                                  style={{ height: 'auto', overflow: 'visible' }}
                                  value={narrativeState.contenidoTopAnalisis}
                                  onChange={(e) => setNarrativeState({ ...narrativeState, contenidoTopAnalisis: e.target.value })}
                               />
                             </Card>
                           )}
                         </div>
                       )}

                       {/* Paid Ads specific sections and charts */}
                       {report.sections && report.sections.filter(s => s.sectionCategory === 'ADS').map((sect, idx) => {
                         if (!sect.dataset || sect.dataset.length === 0 || sumDatasetValues(sect.dataset) === 0) return null;
                         return (
                         <div key={sect.sectionId || `ads-${idx}`} className="space-y-3 p-6 bg-slate-50/20 border border-slate-100 rounded-[1.5rem] break-inside-avoid w-full">
                           <div className="flex justify-between items-center">
                             <h4 className="text-base font-black text-slate-800">{toSentenceCase(sect.title || 'Performance ads')}</h4>
                             <span className="text-[10px] font-bold text-[#1f3c58] uppercase tracking-wider bg-[#d3cebe]/40 px-2.5 py-0.5 rounded-full">Meta Ads</span>
                           </div>
                           <DynamicChartRenderer chartType={sect.chartType} dataset={sect.dataset} platform={sect.platform || 'META_ADS'} />
                           <SectionInsight
                             sectionId={sect.sectionId}
                             comment={sect.narrativeComment}
                             onChange={handleSectionCommentChange}
                           />
                         </div>
                         );
                       })}
                     </div>}

                     {/* 7. Oportunidades & Aprendizajes */}
                     {Array.isArray(sanitizeNarrativeForReport(narrativeState)?.oportunidadesYAprendizajes) && sanitizeNarrativeForReport(narrativeState).oportunidadesYAprendizajes.length > 0 && (
                       <div className="space-y-3 pt-8 border-t border-slate-100 page-break-after w-full">
                         <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">{toSentenceCase("Oportunidades & aprendizajes")}</h4>
                         <div className="grid grid-cols-1 gap-6 w-full">
                           {sanitizeNarrativeForReport(narrativeState).oportunidadesYAprendizajes.map((item, idx) => {
                             const updateItem = (field, value) => {
                               const updated = [...narrativeState.oportunidadesYAprendizajes];
                               updated[idx] = { ...updated[idx], [field]: value };
                               setNarrativeState({ ...narrativeState, oportunidadesYAprendizajes: updated });
                             };
                             return (
                               <Card key={idx} className="bg-[#1c242c] border-[#1c242c] p-6 text-white rounded-[2rem] shadow-xl space-y-4 w-full">
                                 <div className="border-b border-white/10 pb-3 flex items-center justify-between">
                                   <input
                                     type="text"
                                     className="bg-transparent border-none text-white focus:ring-0 outline-none p-0 text-base font-black w-full"
                                     value={item.title || ''}
                                     onChange={(e) => updateItem('title', e.target.value)}
                                     placeholder="Título de la Oportunidad"
                                   />
                                   <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider bg-cyan-400/10 px-2.5 py-0.5 rounded-full shrink-0">Oportunidad</span>
                                 </div>
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm font-normal">
                                   <div className="space-y-1">
                                     <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Evidencia:</span>
                                     <textarea
                                       rows={2}
                                       className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none resize-none focus:ring-1 focus:ring-white/10 !h-auto"
                                       value={item.evidence || ''}
                                       onChange={(e) => updateItem('evidence', e.target.value)}
                                       placeholder="Evidencia observada..."
                                     />
                                   </div>
                                   <div className="space-y-1">
                                     <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Aprendizaje:</span>
                                     <textarea
                                       rows={2}
                                       className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none resize-none focus:ring-1 focus:ring-white/10 !h-auto"
                                       value={item.learning || ''}
                                       onChange={(e) => updateItem('learning', e.target.value)}
                                       placeholder="Aprendizaje clave..."
                                     />
                                   </div>
                                   <div className="space-y-1">
                                     <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Aplicación:</span>
                                     <textarea
                                       rows={2}
                                       className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white outline-none resize-none focus:ring-1 focus:ring-white/10 !h-auto"
                                       value={item.application || ''}
                                       onChange={(e) => updateItem('application', e.target.value)}
                                       placeholder="Aplicación táctica..."
                                     />
                                   </div>
                                 </div>
                               </Card>
                             );
                           })}
                         </div>
                       </div>
                     )}

                     {/* 8. Plan de Acción Sugerido */}
                     <div className="border-t border-slate-100 pt-8 w-full page-break-after">
                       <ActionPlan narrative={narrativeState} onUpdate={setNarrativeState} />
                     </div>

                     {/* 9. Recomendaciones Estratégicas */}
                     {Array.isArray(sanitizeNarrativeForReport(narrativeState)?.recomendacionesEstrategicas) && sanitizeNarrativeForReport(narrativeState).recomendacionesEstrategicas.length > 0 && (
                       <div className="space-y-4 pt-8 border-t border-slate-100 w-full">
                         <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">{toSentenceCase("Recomendaciones estratégicas")}</h4>
                         <div className="grid grid-cols-1 gap-6 w-full">
                           {sanitizeNarrativeForReport(narrativeState).recomendacionesEstrategicas.map((item, idx) => {
                             const updateItem = (field, value) => {
                               const updated = [...narrativeState.recomendacionesEstrategicas];
                               updated[idx] = { ...updated[idx], [field]: value };
                               setNarrativeState({ ...narrativeState, recomendacionesEstrategicas: updated });
                             };
                             return (
                               <Card key={idx} className="bg-[#144c8c] border-[#144c8c] p-6 text-white rounded-[2rem] shadow-xl space-y-4 w-full">
                                 <div className="border-b border-white/20 pb-3 flex items-center justify-between">
                                   <input
                                     type="text"
                                     className="bg-transparent border-none text-white focus:ring-0 outline-none p-0 text-base font-black w-full"
                                     value={item.action || ''}
                                     onChange={(e) => updateItem('action', e.target.value)}
                                     placeholder="Acción Recomendada"
                                   />
                                   <span className={cn(
                                     "text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shrink-0",
                                     item.priority === 'ALTA' ? "bg-red-500/20 text-red-200" : "bg-amber-500/20 text-amber-200"
                                   )}>
                                     Prioridad {item.priority || 'ALTA'}
                                   </span>
                                 </div>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-normal">
                                   <div className="space-y-1">
                                     <span className="text-[10px] font-bold uppercase tracking-widest text-white/60 block">Justificación Estratégica:</span>
                                     <textarea
                                       rows={2}
                                       className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-white outline-none resize-none focus:ring-1 focus:ring-white/20 !h-auto"
                                       value={item.rationale || ''}
                                       onChange={(e) => updateItem('rationale', e.target.value)}
                                       placeholder="Justificación de la recomendación..."
                                     />
                                   </div>
                                   <div className="space-y-1">
                                     <span className="text-[10px] font-bold uppercase tracking-widest text-white/60 block">KPI / Métrica de Éxito:</span>
                                     <textarea
                                       rows={2}
                                       className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-white outline-none resize-none focus:ring-1 focus:ring-white/20 !h-auto"
                                       value={item.kpi || ''}
                                       onChange={(e) => updateItem('kpi', e.target.value)}
                                       placeholder="KPI de éxito..."
                                     />
                                   </div>
                                 </div>
                               </Card>
                             );
                           })}
                         </div>
                       </div>
                     )}

                     <div className="pt-8 border-t border-slate-100 flex items-center justify-between text-slate-350 text-[10px] font-bold tracking-widest uppercase font-bold w-full">
                        <span>Creado por Brainstudio Agencia</span>
                        <span>Fecha de emisión: {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                     </div>
                   </div>

                </div>
              </motion.div>
            </div>
          )
        ) : (
          <div className="h-[500px] flex flex-col items-center justify-center space-y-8 bg-white border border-slate-200 border-dashed rounded-[3rem]">
             <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center shadow-inner">
                <Layout className="w-10 h-10 text-slate-200" />
             </div>
             <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-slate-400">Analizador Multimodal v7.0</h3>
                <p className="text-sm text-slate-400 max-w-xs font-medium">Sube los pantallazos de métricas para generar un informe de alto nivel.</p>
             </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reports;
