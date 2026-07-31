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
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from 'recharts';

const TrendChart = ({ data }) => {
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
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
          <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold' }} />
          <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const DemographicsChart = ({ data }) => {
  if (!data || data.length === 0) return null;
  return (
    <div className="h-[280px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
          <YAxis dataKey="demographicGroup" type="category" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} />
          <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold' }} />
          <Bar dataKey="percentage" fill="#6366f1" radius={[0, 8, 8, 0]} barSize={16} />
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
            <th className="px-6 py-4 font-bold text-right">Visualizaciones</th>
            <th className="px-6 py-4 font-bold text-right">Interacciones</th>
            <th className="px-6 py-4 font-bold text-right">Clics</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 font-medium">
          {data.map((item, idx) => (
            <tr key={idx} className="hover:bg-slate-50/50 break-inside-avoid">
              <td className="px-6 py-4 font-bold text-slate-700">{item.title}</td>
              <td className="px-6 py-4 text-right text-slate-600 font-semibold">{item.views?.toLocaleString('es-ES') || 'N/A'}</td>
              <td className="px-6 py-4 text-right text-slate-600 font-semibold">{item.interactions?.toLocaleString('es-ES') || 'N/A'}</td>
              <td className="px-6 py-4 text-right text-primary font-bold">{item.clicks?.toLocaleString('es-ES') || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const GranularNarrativeBlock = ({ sectionKey, title, comment, onChange }) => {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 mt-4 space-y-2 break-inside-avoid shadow-sm no-print">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h5>
      </div>
      <textarea
        rows={3}
        className="w-full bg-transparent border-none text-xs text-slate-600 leading-relaxed font-semibold focus:ring-1 focus:ring-primary/10 rounded-xl resize-none outline-none"
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

  return (
    <div className="min-h-[80vh] flex flex-col justify-between py-20 border-b border-slate-100 relative print:min-h-screen">
      <div className="flex flex-col md:flex-row items-center justify-between gap-16">
          <div className="flex-1 space-y-8 text-center md:text-left">
             <div className="inline-block px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-bold text-primary uppercase tracking-widest">
                Reporte de Desempeño • {report.periodKind}
             </div>
             <h1 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-tight">
                Auditoría Digital de Performance
             </h1>
             <div className="flex items-center justify-center md:justify-start gap-6 text-xs font-bold text-slate-400 uppercase tracking-[0.3em]">
                <span>{report.client?.name || 'Cliente'}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
                <span>{formattedStart} — {formattedEnd}</span>
             </div>
          </div>
          <div className="h-24 w-auto flex items-center justify-center shrink-0">
             <img
              src={report.client?.logoUrl ? `${getApiBaseUrl()}${report.client.logoUrl.startsWith('/api') ? '' : '/api'}${report.client.logoUrl}` : '/brainstudio-logo.png'}
              alt={report.client?.name}
              className="h-full w-full object-contain opacity-85"
              onError={(e) => {
                e.target.src = '/brainstudio-logo.png';
              }}
            />
          </div>
      </div>
      <div className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.4em] text-center md:text-left border-t border-slate-50 pt-8">
         Brainstudio Agencia de Alto Rendimiento
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
          className="w-full bg-transparent border-none text-3xl font-black text-slate-800 leading-snug tracking-tight focus:ring-1 focus:ring-primary/10 rounded-xl py-2 outline-none resize-none"
          value={narrative.headline || ''}
          onChange={(e) => onUpdate({ ...narrative, headline: e.target.value })}
        />
        <div className="h-1 w-20 bg-primary/40 rounded-full" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(narrative.summaryPoints || []).map((point, idx) => (
          <Card key={idx} className="bg-slate-50 border-slate-100 p-6 flex gap-4 break-inside-avoid">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/10 text-primary flex items-center justify-center shrink-0 font-black text-sm">
              {idx + 1}
            </div>
            <textarea
              className="w-full bg-transparent border-none text-xs text-slate-600 leading-relaxed font-semibold focus:ring-1 focus:ring-primary/10 rounded-xl resize-none outline-none"
              rows={4}
              value={point}
              onChange={(e) => handlePointChange(idx, e.target.value)}
            />
          </Card>
        ))}
      </div>
    </div>
  );
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
                {metric.label || key}
                {metric.isManuallyEdited && (
                  <span className="ml-1 text-[9px] text-primary font-bold lowercase tracking-normal">(editado)</span>
                )}
              </span>
            </div>
            <div className="space-y-1">
              <h4 className="text-3xl font-black text-slate-800">
                {metric.value !== null && metric.value !== undefined ? (
                  key === 'spend' ? `${metric.unit} ${metric.value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` :
                  key === 'ctr' ? `${metric.value.toFixed(2)}${metric.unit || '%'}` :
                  metric.value.toLocaleString('es-ES')
                ) : 'N/A'}
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
  const [editedTexts, setEditedTexts] = useState({
    title: '',
    organic_analysis: [],
    performance_analysis: []
  });
  const [narrativeState, setNarrativeState] = useState(null);
  const reportRef = useRef(null);

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
    if (!selectedClientId) {
      toast.error('Selecciona un cliente');
      return;
    }
    if (organicFiles.length === 0 && adsFiles.length === 0) {
        toast.error('Sube al menos un pantallazo');
        return;
    }

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
    }
  };

  const handleApproveReview = async (reviewedMetrics) => {
    if (!report?.id) return;
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
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const toastId = toast.loading('Generando documento...');
    try {
      // Ensure fonts are loaded
      if (document.fonts) {
          await document.fonts.ready;
      }

      // Small delay to allow final paint
      await new Promise(resolve => setTimeout(resolve, 800));

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: true,
        imageTimeout: 15000,
        onclone: (clonedDoc) => {
          const noPrintElements = clonedDoc.querySelectorAll('.no-print');
          noPrintElements.forEach(el => el.style.display = 'none');

          const textareas = clonedDoc.querySelectorAll('textarea, input');
          textareas.forEach(ta => {
            const div = clonedDoc.createElement('div');
            div.innerText = ta.value;
            div.className = ta.className;
            div.style.height = 'auto';
            div.style.whiteSpace = 'pre-wrap';
            div.style.border = 'none';
            div.style.color = '#1e293b'; // slate-800
            ta.parentNode.replaceChild(div, ta);
          });

          // Force layout recalculation for cloned document
          const reportContainer = clonedDoc.getElementById('report-canvas');
          if (reportContainer) {
              reportContainer.style.transform = 'none';
              reportContainer.style.opacity = '1';
          }
        }
      });
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      const fileName = editedTexts.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      pdf.save(`${fileName}.pdf`);
      toast.success('Descarga lista', { id: toastId });
    } catch (err) {
      console.error('PDF Export Error:', err);
      toast.error('Error al exportar PDF', { id: toastId });
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
                 <button onClick={downloadPDF} className="px-6 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold transition-all">
                  PDF Final
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
            size: A4;
            margin: 20mm;
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
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-white border border-[#e2e8f0] shadow-2xl rounded-[2.5rem] overflow-hidden print:border-none print:shadow-none"
            >
              <div id="report-canvas" ref={reportRef} className="p-12 md:p-20 space-y-20 bg-white">
                 <ReportCover report={report} />

                 <ExecutiveSummary narrative={narrativeState} onUpdate={setNarrativeState} />

                 <div className="space-y-6 pt-12 border-t border-slate-100 break-inside-avoid">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400">Análisis Interpretativo de Logros</h4>
                    <Card className="bg-[#fcfcfd] border-slate-100 p-8">
                       <textarea
                          rows={6}
                          className="w-full bg-transparent border-none text-slate-600 leading-relaxed font-normal text-lg outline-none resize-none focus:ring-1 focus:ring-primary/10 rounded-xl"
                          value={narrativeState?.keyAchievements || ''}
                          onChange={(e) => setNarrativeState({ ...narrativeState, keyAchievements: e.target.value })}
                       />
                    </Card>
                 </div>

                 {report.normalizedMetrics && (
                   <div className="space-y-12 pt-12 border-t border-slate-100 break-inside-avoid">
                     <div className="space-y-2">
                       <h3 className="text-xl font-black tracking-tight text-slate-800">Desempeño Cuantitativo</h3>
                       <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Métricas Clave de Performance Meta Ads</p>
                     </div>
                     <MetricGrid metrics={report.normalizedMetrics} />

                     {/* 1. Trend and Macro Performance section */}
                     {report.normalizedMetrics.series && report.normalizedMetrics.series.length > 0 && (
                       <div className="space-y-4 pt-8 border-t border-slate-100/60 break-inside-avoid">
                         <div className="space-y-1">
                           <h4 className="text-base font-black text-slate-800">Tendencia de Desempeño</h4>
                           <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Evolución de Rendimiento en el Periodo</p>
                         </div>
                         <TrendChart data={report.normalizedMetrics.series} />
                         <GranularNarrativeBlock
                           sectionKey="macro_performance"
                           title="Análisis de Rendimiento y Tendencia"
                           comment={getGranularComment("macro_performance")}
                           onChange={handleGranularCommentChange}
                         />
                       </div>
                     )}

                     {/* 2. Demographics section */}
                     {report.normalizedMetrics.demographics && report.normalizedMetrics.demographics.length > 0 && (
                       <div className="space-y-4 pt-8 border-t border-slate-100/60 break-inside-avoid">
                         <div className="space-y-1">
                           <h4 className="text-base font-black text-slate-800">Distribución de Audiencia</h4>
                           <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Segmentación por Edad y Género</p>
                         </div>
                         <DemographicsChart data={report.normalizedMetrics.demographics} />
                         <GranularNarrativeBlock
                           sectionKey="demographics"
                           title="Análisis de Distribución Demográfica"
                           comment={getGranularComment("demographics")}
                           onChange={handleGranularCommentChange}
                         />
                       </div>
                     )}

                     {/* 3. Top performing content section */}
                     {report.normalizedMetrics.topContent && report.normalizedMetrics.topContent.length > 0 && (
                       <div className="space-y-4 pt-8 border-t border-slate-100/60 break-inside-avoid">
                         <div className="space-y-1">
                           <h4 className="text-base font-black text-slate-800">Rendimiento de Contenidos Destacados</h4>
                           <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Ranking de Mejores Creativos del Periodo</p>
                         </div>
                         <TopContentTable data={report.normalizedMetrics.topContent} />
                         <GranularNarrativeBlock
                           sectionKey="top_content"
                           title="Análisis de Contenidos Estrella"
                           comment={getGranularComment("top_content")}
                           onChange={handleGranularCommentChange}
                         />
                       </div>
                     )}
                   </div>
                 )}

                 <ActionPlan narrative={narrativeState} onUpdate={setNarrativeState} />

                 {/* Footer */}
                 <div className="pt-20 border-t border-slate-50 flex flex-col items-center gap-4 text-center">
                    <div className="text-[11px] font-bold text-slate-300 tracking-[0.2em]">
                       Brainstudio Agencia
                    </div>
                 </div>
              </div>
            </motion.div>
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
