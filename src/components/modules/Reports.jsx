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
  AlertCircle,
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
  ArrowUpRight
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, Legend
} from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { cn } from '@/lib/utils';

const Reports = () => {
  const { currentUser } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');

  // Multiple Files State
  const [organicFiles, setOrganicFiles] = useState([]);
  const [adsFiles, setAdsFiles] = useState([]);
  const [logoFile, setLogoFile] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState(null);
  const reportRef = useRef(null);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${getApiBaseUrl()}/api/db/clients`);
      setClients(response.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Error al cargar clientes');
    }
  };

  const handleFilesChange = (type, e) => {
    const selectedFiles = Array.from(e.target.files);
    if (type === 'organic') {
      setOrganicFiles(prev => [...prev, ...selectedFiles]);
    } else if (type === 'ads') {
      setAdsFiles(prev => [...prev, ...selectedFiles]);
    } else if (type === 'logo') {
      setLogoFile(selectedFiles[0]);
    }
    // Clear input
    e.target.value = '';
  };

  const removeFile = (type, index) => {
    if (type === 'organic') {
      setOrganicFiles(prev => prev.filter((_, i) => i !== index));
    } else if (type === 'ads') {
      setAdsFiles(prev => prev.filter((_, i) => i !== index));
    } else if (type === 'logo') {
      setLogoFile(null);
    }
  };

  const generateReport = async () => {
    if (!selectedClientId) {
      toast.error('Por favor selecciona un cliente');
      return;
    }
    if (organicFiles.length === 0 && adsFiles.length === 0) {
      toast.error('Carga al menos un archivo de datos');
      return;
    }

    setIsGenerating(true);
    setReport(null);

    const formData = new FormData();
    formData.append('clientId', selectedClientId);
    organicFiles.forEach(file => formData.append('organic', file));
    adsFiles.forEach(file => formData.append('ads', file));
    if (logoFile) formData.append('logo', logoFile);

    try {
      const response = await axios.post(`${getApiBaseUrl()}/api/reports/generate`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      setReport(response.data);
      toast.success('Reporte "Deep Analysis" generado');
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error(error.response?.data?.error || 'Error al generar el reporte');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;

    const toastId = toast.loading('Preparando PDF...');
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f8fafc' // slate-50
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`Reporte_DeepAnalysis_${report.client.name}.pdf`);
      toast.success('PDF descargado', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar PDF', { id: toastId });
    }
  };

  const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

  const FileList = ({ files, type }) => (
    <div className="space-y-2 mt-3">
      {files.map((file, i) => (
        <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm shadow-sm group animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2 text-slate-600">
            <FileText className="w-4 h-4 text-primary" />
            <span className="truncate max-w-[150px]">{file.name}</span>
          </div>
          <button
            onClick={() => removeFile(type, i)}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 min-h-screen bg-slate-50 text-slate-900">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Smart Reports <span className="text-primary">Deep Analysis</span>
          </h1>
          <p className="text-slate-500 mt-1">Consolidación multi-fuente potenciada por Gemini 2.5 Pro</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-slate-600 text-sm font-medium shadow-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Analista Senior de Brainstudio</span>
        </div>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Config */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-sm">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
              <User className="w-5 h-5 text-primary" />
              Configuración
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Cliente</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-slate-700 font-medium"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  <option value="">Seleccionar marca...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Logo de Portada</label>
                <div className="relative group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFilesChange('logo', e)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 border-dashed rounded-2xl px-4 py-3 group-hover:border-primary transition-all">
                    <span className="text-sm text-slate-500 truncate">
                      {logoFile ? logoFile.name : 'Actualizar logo del cliente'}
                    </span>
                    <Upload className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-sm">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
              <FileBarChart className="w-5 h-5 text-primary" />
              Carga Multi-Archivo
            </h2>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Datos Orgánicos</label>
                <div className="relative group">
                  <input
                    type="file"
                    multiple
                    accept=".csv, .xlsx, .xls"
                    onChange={(e) => handleFilesChange('organic', e)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-4 text-emerald-600 hover:bg-emerald-100 transition-all border-dashed">
                    <Plus className="w-5 h-5" />
                    <span className="text-sm font-bold">Añadir Archivos RRSS</span>
                  </div>
                </div>
                <FileList files={organicFiles} type="organic" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Datos de Pauta (Ads)</label>
                <div className="relative group">
                  <input
                    type="file"
                    multiple
                    accept=".csv, .xlsx, .xls"
                    onChange={(e) => handleFilesChange('ads', e)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className="flex items-center justify-center gap-2 bg-cyan-50 border border-cyan-100 rounded-2xl px-4 py-4 text-cyan-600 hover:bg-cyan-100 transition-all border-dashed">
                    <Plus className="w-5 h-5" />
                    <span className="text-sm font-bold">Añadir Archivos Ads</span>
                  </div>
                </div>
                <FileList files={adsFiles} type="ads" />
              </div>

              <button
                onClick={generateReport}
                disabled={isGenerating}
                className="w-full bg-slate-900 hover:bg-black disabled:opacity-50 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Consolidando Data...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Generar Reporte Maestro</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {report ? (
              <motion.div
                key="report-view"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* PDF Toolbar */}
                <div className="flex justify-end">
                  <button
                    onClick={downloadPDF}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 transition-all shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Exportar PDF Profesional
                  </button>
                </div>

                {/* Report Content */}
                <div
                  ref={reportRef}
                  className="bg-white border border-slate-200 rounded-[2.5rem] p-8 md:p-16 space-y-16 shadow-xl relative overflow-hidden"
                >
                  {/* Decorative backgrounds */}
                  <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-primary via-cyan-500 to-emerald-500" />

                  {/* Header Seccional con Logo */}
                  <div className="flex flex-col items-center text-center space-y-8 relative">
                    <img
                      src={report.client.logoUrl || '/brainstudio-logo.png'}
                      alt={report.client.name}
                      className="h-24 md:h-32 object-contain"
                    />
                    <div className="space-y-4">
                      <h2 className="text-4xl md:text-6xl font-black tracking-tight text-slate-900 leading-none">
                        DEEP <span className="text-primary italic">ANALYSIS</span>
                      </h2>
                      <div className="inline-flex items-center gap-3 px-6 py-2 bg-slate-100 rounded-full text-slate-500 text-sm font-bold uppercase tracking-[0.2em]">
                        {report.client.name} • {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  {/* KPI Tiles Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {report.analysis.kpis.map((kpi, i) => (
                      <div key={i} className="bg-slate-50 border border-slate-200 p-6 rounded-3xl space-y-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{kpi.label}</span>
                        <div className="flex items-end justify-between">
                          <span className="text-3xl font-black text-slate-900">{kpi.value}</span>
                          <span className={cn(
                            "text-xs font-bold px-2 py-1 rounded-lg",
                            kpi.trend.startsWith('+') ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          )}>
                            {kpi.trend}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Narrativa Estratégica */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pt-8 border-t border-slate-100">
                    <div className="lg:col-span-8 space-y-8">
                       <div className="flex items-center gap-4">
                          <img src={report.client.logoUrl || '/brainstudio-logo.png'} className="w-8 h-8 opacity-40 grayscale" />
                          <h3 className="text-2xl font-black uppercase italic tracking-tight">Perspectiva Estratégica</h3>
                       </div>
                       <p className="text-xl text-slate-600 leading-relaxed font-medium">
                        {report.analysis.narrative}
                      </p>
                    </div>

                    <div className="lg:col-span-4 bg-slate-50 border border-slate-100 p-8 rounded-[2rem] space-y-6">
                      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Hallazgos Maestros</h3>
                      <ul className="space-y-6">
                        {report.analysis.keyTakeaways.map((item, i) => (
                          <li key={i} className="flex gap-4 group">
                            <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm text-primary font-bold text-xs">
                              {i+1}
                            </div>
                            <span className="text-sm font-bold text-slate-500 leading-snug">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Comparison Tables (Top Performers) */}
                  <div className="space-y-8 pt-12 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                          <img src={report.client.logoUrl || '/brainstudio-logo.png'} className="w-8 h-8 opacity-40 grayscale" />
                          <h3 className="text-2xl font-black uppercase italic tracking-tight">Top Performers by Source</h3>
                       </div>
                       <Trophy className="w-8 h-8 text-amber-400" />
                    </div>
                    <div className="overflow-hidden border border-slate-200 rounded-3xl">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Fuente / Archivo</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400">Métrica Líder</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-slate-400 text-right">Resultado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {report.analysis.topPerformers.map((item, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-bold text-slate-700">{item.source}</td>
                              <td className="px-6 py-4">
                                <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-black uppercase">
                                  {item.metric}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right font-black text-slate-900">{item.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Gráficas Consolidadas */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-12 border-t border-slate-100">
                    {/* Organic Distribution */}
                    <div className="space-y-6">
                       <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <PieChart className="w-4 h-4" />
                        Alcance por Red Social
                       </h4>
                       <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={report.analysis.metrics.organic.distributionBySource}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {report.analysis.metrics.organic.distributionBySource.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </RePieChart>
                        </ResponsiveContainer>
                       </div>
                    </div>

                    {/* Ads Consolidation */}
                    <div className="space-y-6">
                       <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Inversión Consolidada
                       </h4>
                       <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={report.analysis.metrics.ads.distributionBySource}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Bar dataKey="value" fill="#6366f1" radius={[10, 10, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                       </div>
                    </div>
                  </div>

                  {/* Próximos Pasos - Estilo Light */}
                  <div className="pt-12 border-t border-slate-100">
                    <div className="bg-slate-900 rounded-[3rem] p-10 md:p-16 space-y-8 relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[80px] rounded-full translate-x-1/2 -translate-y-1/2" />
                       <div className="space-y-4 relative z-10">
                          <h3 className="text-3xl font-black text-white italic uppercase flex items-center gap-3">
                            <ArrowUpRight className="w-8 h-8 text-primary" />
                            Próxima Estación
                          </h3>
                          <p className="text-lg text-slate-400 leading-relaxed max-w-3xl">
                            {report.analysis.nextSteps}
                          </p>
                       </div>
                       <div className="flex items-center gap-6 pt-4 relative z-10">
                          <img src="/brainstudio-logo.png" className="w-12 h-12 grayscale brightness-200 opacity-20" />
                          <div className="h-8 w-px bg-white/10" />
                          <span className="text-xs font-bold text-white/30 uppercase tracking-[0.4em]">Propuesta de Optimización 2026</span>
                       </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-[600px] bg-white border border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-center p-12 space-y-6">
                <div className="w-24 h-24 rounded-full bg-slate-50 flex items-center justify-center shadow-inner">
                  <Sparkles className="w-12 h-12 text-slate-200" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-400">Deep Analysis Engine</h3>
                  <p className="text-slate-500 max-w-sm mx-auto font-medium">
                    Carga los reportes crudos de tus campañas. Gemini consolidará y redactará el informe estratégico final.
                  </p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Reports;
