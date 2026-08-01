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
  Monitor
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { cn } from '@/lib/utils';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { Card } from '@/components/ui/Card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, LabelList } from 'recharts';

const toSentenceCase = (str) => {
  if (typeof str !== 'string' || !str) return '';
  const trimmed = str.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

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
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
          <YAxis width={80} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
          <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold' }} />
          <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const DemographicsChart = ({ demographics }) => {
  if (!demographics) return null;

  const ageGenderData = demographics.ageGender || [];
  const citiesData = demographics.cities || [];
  const countriesData = demographics.countries || [];

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
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Rango de edad y género</h5>
          <DemographicsBarChart data={ageGenderData} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {citiesData.length > 0 && totalCities > 0 && (
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Principales ciudades</h5>
            <div className="space-y-4">
              {citiesData.map((city, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{city.label}</span>
                    <span>{city.value}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#009fb7] h-full rounded-full" style={{ width: `${city.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {countriesData.length > 0 && totalCountries > 0 && (
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Principales países</h5>
            <div className="space-y-4">
              {countriesData.map((country, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{country.label}</span>
                    <span>{country.value}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#e4405f] h-full rounded-full" style={{ width: `${country.value}%` }} />
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
  if (!dataset || dataset.length === 0) return null;

  // Intercept and sanitize labels for organic comparison chart and orthographic errors
  const sanitizedDataset = dataset.map(item => {
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
      stroke: '#1877F2',
      fill: '#1877F2',
      bg: 'bg-[#1877F2]'
    },
    INSTAGRAM: {
      stroke: '#E4405F',
      fill: '#E4405F',
      bg: 'bg-[#E4405F]'
    },
    META_ADS: {
      stroke: '#7C3AED',
      fill: '#10B981',
      bg: 'bg-[#7C3AED]'
    }
  };

  const currentTheme = colors[normalizedPlatform] || colors.META_ADS;

  const isFunnelDataset = sanitizedDataset.some(item => {
    const label = (item.label || '').toLowerCase();
    return label.includes('visua') || label.includes('alcan') || label.includes('interac') || label.includes('clic') || label.includes('visit') || label.includes('seguidor');
  });

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
              <LabelList dataKey="value" position="right" style={{ fill: '#334155', fontSize: 10, fontWeight: 'bold' }} formatter={(val) => `${val}%`} />
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
              <tr key={idx} className="hover:bg-slate-50/50 break-inside-avoid">
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
        className="w-full bg-transparent border-none text-sm text-[#0f172a] leading-relaxed font-bold focus:ring-1 focus:ring-primary/10 rounded-xl resize-none outline-none !h-auto !overflow-visible"
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
          <Bar dataKey="hombres" fill="#009fb7" radius={[0, 8, 8, 0]} barSize={12}>
            <LabelList dataKey="hombres" position="right" style={{ fill: '#334155', fontSize: 10, fontWeight: 'bold' }} formatter={(val) => `${val}%`} />
          </Bar>
          <Bar dataKey="mujeres" fill="#e4405f" radius={[0, 8, 8, 0]} barSize={12}>
            <LabelList dataKey="mujeres" position="right" style={{ fill: '#334155', fontSize: 10, fontWeight: 'bold' }} formatter={(val) => `${val}%`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const TopContentTable = ({ data }) => {
  if (!data || data.length === 0) return null;
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
          {data.map((item, idx) => (
            <tr key={idx} className="hover:bg-slate-50/50 break-inside-avoid">
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

const GranularNarrativeBlock = ({ sectionKey, title, comment, onChange }) => {
  return (
    <div className="bg-[#f9fafb] border border-slate-200 rounded-2xl p-6 mt-4 space-y-2 break-inside-avoid shadow-sm !h-auto !overflow-visible">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h5>
      </div>
      <textarea
        rows={4}
        className="w-full bg-transparent border-none text-sm text-[#0f172a] leading-relaxed font-bold focus:ring-1 focus:ring-primary/10 rounded-xl resize-none outline-none !h-auto !overflow-visible"
        style={{ height: 'auto', overflow: 'visible' }}
        value={comment || ''}
        onChange={(e) => onChange(sectionKey, e.target.value)}
        placeholder="Escribe un comentario consultivo para esta sección..."
      />
    </div>
  );
};

const ReportCover = ({ report }) => {
  const formattedStart = report.startDate ? new Date(report.startDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const formattedEnd = report.endDate ? new Date(report.endDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const yearStr = report.startDate ? new Date(report.startDate).getFullYear() : new Date().getFullYear();
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
         <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#009fb7]/10 text-[#009fb7] rounded-full text-xs font-extrabold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#009fb7]" />
            Reporte oficial
         </div>

         {/* Giant Title */}
         <h1 className="text-5xl md:text-6xl font-black text-[#0F172A] tracking-tight leading-none">
            Reporte de desempeño digital de {clientName}
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
        {(narrative.summaryPoints || []).map((point, idx) => (
          <Card key={idx} className="bg-[#009fb7] border-[#009fb7] p-6 flex gap-4 break-inside-avoid shadow-sm text-white">
            <div className="w-8 h-8 rounded-xl bg-white/20 border border-white/10 text-white flex items-center justify-center shrink-0 font-black text-sm">
              {idx + 1}
            </div>
            <textarea
              className="w-full bg-transparent border-none text-sm text-white leading-relaxed font-bold focus:ring-1 focus:ring-white/10 rounded-xl resize-none outline-none !h-auto !overflow-visible"
              rows={4}
              style={{ height: 'auto', overflow: 'visible', color: '#ffffff' }}
              value={toSentenceCase(point)}
              onChange={(e) => handlePointChange(idx, e.target.value)}
            />
          </Card>
        ))}
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
  results: "Resultados Totales"
};

const formatMetricValue = (key, metric) => {
  if (metric.value === null || metric.value === undefined) return 'N/A';

  if (key === 'spend') {
    const unit = metric.unit || 'COP';
    if (unit.toUpperCase() === 'COP') {
      return `COP $${Math.round(metric.value).toLocaleString('es-ES')}`;
    }
    return `${unit} $${metric.value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (key === 'ctr') {
    return `${parseFloat(metric.value).toFixed(2)}%`;
  }

  return Math.round(metric.value).toLocaleString('es-ES');
};

const MetricGrid = ({ metrics }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 break-inside-avoid">
      {Object.entries(metrics).map(([key, metric]) => {
        if (!metric || key === 'series' || key === 'demographics' || key === 'topContent') return null;
        return (
          <div key={key} className={cn(
            "border p-6 space-y-4 rounded-2xl transition-all break-inside-avoid shadow-sm",
            metric.isManuallyEdited
              ? "bg-slate-50 border-primary/40 shadow-sm shadow-primary/5"
              : "bg-slate-50 border-slate-100 hover:border-primary/20 shadow-sm"
          )}>
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {CANONICAL_METRICS[key] || metric.label || key}
                {metric.isManuallyEdited && (
                  <span className="ml-1 text-[9px] text-primary font-bold lowercase tracking-normal">(editado)</span>
                )}
              </span>
            </div>
            <div className="space-y-1">
              <h4 className="text-3xl font-black text-slate-800">
                {formatMetricValue(key, metric)}
              </h4>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ActionPlan = ({ narrative, onUpdate }) => {
  if (!narrative || !narrative.actionPlan) return null;

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
              <th className="px-6 py-4 font-bold">Responsable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium">
            {narrative.actionPlan.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 break-inside-avoid">
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
                <td className="px-6 py-4">
                  <input
                    type="text"
                    className="w-full bg-transparent border-none text-primary font-bold focus:ring-1 focus:ring-primary/10 rounded-lg outline-none"
                    value={item.suggestedAssignee}
                    onChange={(e) => handleChange(idx, 'suggestedAssignee', e.target.value)}
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
        <h3 className="text-xl font-black tracking-tight text-slate-800">Apéndice de Evidencias</h3>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Capturas Originales de Meta Ads Procesadas</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {sources.map((src, idx) => (
          <Card key={idx} className="overflow-hidden border-slate-100 hover:shadow-md transition-all p-4 bg-slate-50/50">
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

  const allWarnings = report.sources?.flatMap(s => s.warnings || []) || [];

  const hasWarning = (key) => {
    if (key === 'ctr' || key === 'clicks' || key === 'impressions') {
      return allWarnings.some(w => w.toLowerCase().includes('ctr') || w.toLowerCase().includes('matemática') || w.toLowerCase().includes('difiere'));
    }
    return false;
  };

  return (
    <div className="space-y-8 bg-white border border-[#e2e8f0] rounded-[2.5rem] p-10 shadow-lg no-print">
      <div className="border-b border-slate-100 pb-6 space-y-2">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Auditoría de Métricas Extraídas (Visión AI)
        </h2>
        <p className="text-sm text-slate-500 font-medium">
          Por favor, inspecciona y valida las cifras leídas automáticamente antes de proceder con el reporte ejecutivo.
        </p>
      </div>

      {allWarnings.length > 0 && (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(localMetrics).map(([key, metric]) => {
          if (!metric) return null;
          const warningActive = hasWarning(key) || (metric.confidence !== undefined && metric.confidence < 0.8);

          return (
            <div
              key={key}
              className={cn(
                "border rounded-2xl p-6 space-y-4 transition-all duration-300",
                warningActive
                  ? "bg-amber-50/40 border-amber-300 shadow-amber-100/50 hover:border-amber-400"
                  : "bg-slate-50/50 border-slate-200 hover:border-primary/20 shadow-sm"
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
                    value={metric.value === null ? '' : metric.value}
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
    if (report?.narrative && report.status === 'PUBLISHED') {
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
      console.error('[Reports Frontend] Extraction error:', error);
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
        toast.success('Métricas auditadas correctamente!');

        // 2. Trigger Narrative Generation
        setIsGeneratingNarrative(true);
        const narrativeResponse = await axios.post(`${getApiBaseUrl()}/api/reports/${report.id}/generate-narrative`, {}, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (narrativeResponse.data?.success && narrativeResponse.data?.report) {
          setReport(narrativeResponse.data.report);
          toast.success('Reporte narrativo editorial generado exitosamente!');
        } else {
          throw new Error('Fallo al generar la narrativa');
        }
      } else {
        throw new Error('Fallo al guardar la auditoría');
      }
    } catch (error) {
      const errMsg = error.response?.data?.error || 'Error en el proceso. Intenta de nuevo.';
      toast.error(errMsg);
      console.error('[Reports Frontend] Flow error:', error);
    } finally {
      setIsSubmittingReview(false);
      setIsGeneratingNarrative(false);
      isApprovingRef.current = false;
    }
  };

  const downloadHTML = () => {
    if (!reportRef.current) return;
    const toastId = toast.loading('Generando documento HTML...');
    try {
      // Clone report element
      const element = reportRef.current.cloneNode(true);

      // Hide no-print elements
      const noPrintElements = element.querySelectorAll('.no-print');
      noPrintElements.forEach(el => el.remove());

      // Replace textareas/inputs with static divs/spans
      const textareas = element.querySelectorAll('textarea, input');
      textareas.forEach(ta => {
        const div = document.createElement('div');
        div.innerText = ta.value;
        div.className = ta.className;
        div.style.height = 'auto';
        div.style.whiteSpace = 'pre-wrap';
        div.style.border = 'none';

        // Dynamic high contrast calculation
        let isDarkBg = false;
        let parent = ta.parentElement;
        while (parent) {
          const classes = parent.className || '';
          if (
            classes.includes('bg-[#009fb7]') ||
            classes.includes('bg-[#0F172A]') ||
            classes.includes('text-white') ||
            classes.includes('bg-primary')
          ) {
            isDarkBg = true;
            break;
          }
          parent = parent.parentElement;
        }

        if (isDarkBg) {
          div.style.color = '#ffffff';
        } else {
          div.style.color = '#1e293b'; // slate-800
        }

        ta.parentNode.replaceChild(div, ta);
      });

      // Construct a complete HTML file with Tailwind and fonts
      const htmlContentRaw = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${editedTexts.title || 'Reporte de Performance'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
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
    textarea, input, select, div, p, span, h1, h2, h3, h4, h5, h6 {
      outline: none;
      border: none;
      background: transparent;
      resize: none;
      height: auto !important;
      overflow: visible !important;
    }
    /* Enforce corporate and dark blue background & contrast styles */
    .bg-\\[\\#009fb7\\] {
      background-color: #009fb7 !important;
      color: #ffffff !important;
    }
    .bg-\\[\\#0F172A\\] {
      background-color: #0F172A !important;
      color: #ffffff !important;
    }
    .text-white {
      color: #ffffff !important;
    }
    .bg-white {
      background-color: #ffffff !important;
    }
    .bg-slate-50 {
      background-color: #f8fafc !important;
    }
    .border-slate-100 {
      border-color: #f1f5f9 !important;
    }
    .text-slate-800 {
      color: #1e293b !important;
    }
    .text-slate-700 {
      color: #334155 !important;
    }
    .text-slate-500 {
      color: #64748b !important;
    }
  </style>
</head>
<body>
  <div class="report-wrapper">
    ${element.innerHTML}
  </div>
</body>
</html>`;

      // Apply decimal formatting to percentages within the text to exactly 2 decimals (e.g., 0.8234% -> 0.82%)
      const htmlContent = htmlContentRaw.replace(/(\d+)\.(\d+)(%)/g, (match, integerPart, decimalPart, percentSign) => {
        if (decimalPart.length > 2) {
          const roundedDecimal = Math.round(parseFloat(`0.${decimalPart}`) * 100) / 100;
          const roundedStr = roundedDecimal.toFixed(2).split('.')[1] || '00';
          return `${integerPart}.${roundedStr}${percentSign}`;
        }
        return match;
      });

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = editedTexts.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      link.download = `${fileName}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Descarga HTML lista', { id: toastId });
    } catch (err) {
      console.error('HTML Export Error:', err);
      toast.error('Error al exportar HTML', { id: toastId });
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
    <div className="p-6 max-w-7xl mx-auto space-y-10 min-h-screen bg-[#f8fafc] text-slate-900 font-inter">
      {/* Control Panel */}
      <div className="bg-white border border-[#e2e8f0] rounded-[2rem] p-8 shadow-sm space-y-8 no-print">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reporte de desempeño digital</h1>
              <p className="text-sm text-slate-500 font-medium italic">Análisis Multimodal con IA v7.0</p>
            </div>
            <div className="flex gap-3">
               {report && (
                 <button onClick={downloadHTML} className="px-6 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold transition-all">
                  Descargar Reporte HTML
                 </button>
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
                     {/* 1. Portada Monumental */}
                     <div className="page-break-after">
                       <ReportCover report={report} />
                     </div>

                     {/* 2. Resumen Ejecutivo (Impact cards + full-width interpretive text) */}
                     <div className="border-t border-slate-100 pt-8 space-y-6 page-break-after">
                       <ExecutiveSummary narrative={narrativeState} onUpdate={setNarrativeState} />

                       <div className="space-y-4 pt-6 border-t border-slate-100/60 w-full">
                         <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">{toSentenceCase("Análisis interpretativo de logros")}</h4>
                         <Card className="bg-[#009fb7] border-[#009fb7] p-6 text-white shadow-sm w-full">
                            <textarea
                               rows={4}
                               className="w-full bg-transparent border-none text-white leading-relaxed font-bold text-base outline-none resize-none focus:ring-1 focus:ring-white/10 rounded-xl !h-auto !overflow-visible"
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
                         <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">Logros y avances</h4>
                         <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 w-full">
                           <ul className="list-disc pl-5 space-y-3 text-slate-700 text-sm font-semibold leading-relaxed w-full">
                             {narrativeState.logrosYAvances.map((bullet, idx) => (
                               <li key={idx} className="w-full">
                                 <input
                                   type="text"
                                   className="w-full bg-transparent border-none text-slate-700 focus:ring-0 outline-none p-0 font-bold"
                                   value={bullet}
                                   onChange={(e) => {
                                     const updated = [...narrativeState.logrosYAvances];
                                     updated[idx] = e.target.value;
                                     setNarrativeState({ ...narrativeState, logrosYAvances: updated });
                                   }}
                                 />
                               </li>
                             ))}
                           </ul>
                         </div>
                       </div>
                     )}

                     {/* 4. Secciones Gráficas Vectoriales (Recharts) */}
                     {report.normalizedMetrics && (
                       <div className="border-t border-slate-100 pt-8 space-y-8 page-break-after w-full">
                         <div className="space-y-4 w-full">
                           <h3 className="text-xl font-black tracking-tight text-slate-800">{toSentenceCase("Resultados generales")}</h3>
                           <MetricGrid metrics={report.normalizedMetrics} />
                         </div>

                         {report.normalizedMetrics.series && report.normalizedMetrics.series.length > 0 && (
                           <div className="space-y-4 pt-6 border-t border-slate-100/60 w-full">
                             <div className="space-y-1">
                               <h4 className="text-sm font-black text-slate-800">Tendencia de desempeño</h4>
                               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Evolución de rendimiento en el periodo</p>
                             </div>
                             <PerformanceTrendChart data={report.normalizedMetrics.series} />
                             <GranularNarrativeBlock
                               sectionKey="macro_performance"
                               title="Análisis de rendimiento y tendencia"
                               comment={getGranularComment("macro_performance")}
                               onChange={handleGranularCommentChange}
                             />
                           </div>
                         )}

                         {report.normalizedMetrics.demographics && (
                           <div className="space-y-4 pt-6 border-t border-slate-100/60 w-full">
                             <h3 className="text-xl font-black tracking-tight text-slate-800">Demografía de público</h3>
                             <DemographicsChart demographics={report.normalizedMetrics.demographics} />
                           </div>
                         )}
                       </div>
                     )}

                     {/* 5. Desempeño de Anuncios / Contenido Top */}
                     {report.normalizedMetrics?.topContent && report.normalizedMetrics.topContent.length > 0 && (
                       <div className="border-t border-slate-100 pt-8 space-y-4 page-break-after w-full">
                         <h3 className="text-xl font-black tracking-tight text-slate-800">Ranking de mejores creativos</h3>
                         <TopContentTable data={report.normalizedMetrics.topContent} />

                         {narrativeState?.contenidoTopAnalisis && (
                           <Card className="bg-[#f8fafc] border border-slate-100 p-6 rounded-3xl shadow-sm w-full">
                             <textarea
                                rows={4}
                                className="w-full bg-transparent border-none text-slate-700 leading-relaxed font-bold text-sm outline-none resize-none focus:ring-0 rounded-xl !h-auto !overflow-visible"
                                style={{ height: 'auto', overflow: 'visible' }}
                                value={narrativeState.contenidoTopAnalisis}
                                onChange={(e) => setNarrativeState({ ...narrativeState, contenidoTopAnalisis: e.target.value })}
                             />
                           </Card>
                         )}
                       </div>
                     )}

                     {/* 6. Bloque 1: Análisis Orgánico (RRSS) */}
                     {report.sections && report.sections.some(s => s.sectionCategory === 'ORGANIC') && (
                       <div className="space-y-8 border-t border-slate-100 pt-8 w-full page-break-after">
                         <div className="space-y-1">
                           <h3 className="text-xl font-black tracking-tight text-slate-800">{toSentenceCase("Análisis orgánico (RRSS)")}</h3>
                           <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{toSentenceCase("Evolución y rendimiento en redes sociales")}</p>
                         </div>

                         {/* Filter Facebook */}
                         {report.sections.filter(s => s.sectionCategory === 'ORGANIC' && s.platform === 'FACEBOOK').map((sect, idx) => {
                           if (!sect.dataset || sect.dataset.length === 0 || sumDatasetValues(sect.dataset) === 0) return null;
                           return (
                           <div key={sect.sectionId || `fb-org-${idx}`} className="space-y-3 p-6 bg-slate-50/20 border border-slate-100 rounded-[1.5rem] break-inside-avoid w-full">
                             <div className="flex justify-between items-center">
                               <h4 className="text-base font-black text-slate-800">{toSentenceCase(sect.title || 'Facebook orgánico')}</h4>
                               <span className="text-[10px] font-bold text-[#1877F2] uppercase tracking-wider bg-[#1877F2]/10 px-2.5 py-0.5 rounded-full">Facebook</span>
                             </div>
                             <DynamicChartRenderer chartType={sect.chartType} dataset={sect.dataset} platform="FACEBOOK" />
                             <SectionInsight
                               sectionId={sect.sectionId}
                               comment={sect.narrativeComment}
                               onChange={handleSectionCommentChange}
                             />
                           </div>
                           );
                         })}

                         {/* Filter Instagram */}
                         {report.sections.filter(s => s.sectionCategory === 'ORGANIC' && s.platform === 'INSTAGRAM').map((sect, idx) => {
                           if (!sect.dataset || sect.dataset.length === 0 || sumDatasetValues(sect.dataset) === 0) return null;
                           return (
                           <div key={sect.sectionId || `ig-org-${idx}`} className="space-y-3 p-6 bg-slate-50/20 border border-slate-100 rounded-[1.5rem] break-inside-avoid w-full">
                             <div className="flex justify-between items-center">
                               <h4 className="text-base font-black text-slate-800">{toSentenceCase(sect.title || 'Instagram orgánico')}</h4>
                               <span className="text-[10px] font-bold text-[#E4405F] uppercase tracking-wider bg-[#E4405F]/10 px-2.5 py-0.5 rounded-full">Instagram</span>
                             </div>
                             <DynamicChartRenderer chartType={sect.chartType} dataset={sect.dataset} platform="INSTAGRAM" />
                             <SectionInsight
                               sectionId={sect.sectionId}
                               comment={sect.narrativeComment}
                               onChange={handleSectionCommentChange}
                             />
                           </div>
                           );
                         })}
                       </div>
                     )}

                     {/* Bloque 2: Performance Digital (ADS) */}
                     {report.sections && report.sections.some(s => s.sectionCategory === 'ADS') && (
                       <div className="space-y-8 border-t border-slate-100 pt-8 w-full page-break-after">
                         <div className="space-y-1">
                           <h3 className="text-xl font-black tracking-tight text-slate-800">{toSentenceCase("Performance digital (ADS)")}</h3>
                           <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{toSentenceCase("Inversión y retorno en pauta publicitaria")}</p>
                         </div>

                         {report.sections.filter(s => s.sectionCategory === 'ADS').map((sect, idx) => {
                           if (!sect.dataset || sect.dataset.length === 0 || sumDatasetValues(sect.dataset) === 0) return null;
                           return (
                           <div key={sect.sectionId || `ads-${idx}`} className="space-y-3 p-6 bg-slate-50/20 border border-slate-100 rounded-[1.5rem] break-inside-avoid w-full">
                             <div className="flex justify-between items-center">
                               <h4 className="text-base font-black text-slate-800">{toSentenceCase(sect.title || 'Performance ads')}</h4>
                               <span className="text-[10px] font-bold text-[#7C3AED] uppercase tracking-wider bg-[#7C3AED]/10 px-2.5 py-0.5 rounded-full">Meta Ads</span>
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
                       </div>
                     )}

                     {/* 7. Oportunidades & Aprendizajes */}
                     {narrativeState?.oportunidadesYAprendizajes && (
                       <div className="space-y-3 pt-8 border-t border-slate-100 page-break-after w-full">
                         <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">Oportunidades & aprendizajes</h4>
                         <Card className="bg-[#0F172A] border-[#0F172A] p-8 text-white rounded-[2rem] shadow-xl space-y-4 w-full">
                           <textarea
                              rows={5}
                              className="w-full bg-transparent border-none text-white leading-relaxed font-bold text-base outline-none resize-none focus:ring-0 rounded-xl !h-auto !overflow-visible"
                              style={{ height: 'auto', overflow: 'visible', color: '#ffffff' }}
                              value={narrativeState.oportunidadesYAprendizajes}
                              onChange={(e) => setNarrativeState({ ...narrativeState, oportunidadesYAprendizajes: e.target.value })}
                           />
                         </Card>
                       </div>
                     )}

                     {/* 8. Plan de Acción Sugerido */}
                     <div className="border-t border-slate-100 pt-8 w-full page-break-after">
                       <ActionPlan narrative={narrativeState} onUpdate={setNarrativeState} />
                     </div>

                     {/* 9. Recomendaciones Estratégicas */}
                     {narrativeState?.recomendacionesEstrategicas && (
                       <div className="space-y-4 pt-8 border-t border-slate-100 w-full">
                         <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">Recomendaciones estratégicas</h4>
                         <div className="bg-[#009fb7] text-white rounded-[2rem] p-8 shadow-lg w-full">
                           <textarea
                              rows={6}
                              className="w-full bg-transparent border-none text-white leading-relaxed font-bold text-base outline-none resize-none focus:ring-0 rounded-xl !h-auto !overflow-visible"
                              style={{ height: 'auto', overflow: 'visible', color: '#ffffff' }}
                              value={narrativeState.recomendacionesEstrategicas}
                              onChange={(e) => setNarrativeState({ ...narrativeState, recomendacionesEstrategicas: e.target.value })}
                           />
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
