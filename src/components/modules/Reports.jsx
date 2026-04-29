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
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  Zap,
  Info
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

  // Files State
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
    e.target.value = '';
  };

  const removeFile = (type, index) => {
    if (type === 'organic') setOrganicFiles(prev => prev.filter((_, i) => i !== index));
    else if (type === 'ads') setAdsFiles(prev => prev.filter((_, i) => i !== index));
    else if (type === 'logo') setLogoFile(null);
  };

  const generateReport = async () => {
    if (!selectedClientId) {
      toast.error('Selecciona un cliente');
      return;
    }
    if (organicFiles.length === 0 && adsFiles.length === 0) {
      toast.error('Carga archivos de datos');
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
      toast.success('Auditoría v2.0 lista');
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.error || 'Error al generar');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const toastId = toast.loading('Exportando PDF...');
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`Auditoria_${report.client.name}.pdf`);
      toast.success('PDF Exportado', { id: toastId });
    } catch (err) {
      toast.error('Fallo al exportar', { id: toastId });
    }
  };

  const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-10 min-h-screen bg-slate-50/50 text-slate-900">
      {/* Configuration Zone (Control Panel) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 no-print">
        <div className="lg:col-span-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              Auditoría Estratégica <span className="text-primary italic">v2.0</span>
            </h1>
            <p className="text-slate-500 font-medium">Consolidación Multi-fuente & IA Intelligence</p>
          </div>
          <div className="flex gap-3">
             {report && (
               <button
                onClick={downloadPDF}
                className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold shadow-sm transition-all"
               >
                <Download className="w-4 h-4" /> Exportar PDF
               </button>
             )}
             <button
               onClick={generateReport}
               disabled={isGenerating}
               className="flex items-center gap-2 px-8 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-black rounded-2xl shadow-lg shadow-primary/20 transition-all"
             >
               {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
               {isGenerating ? "Analizando..." : "Generar Auditoría"}
             </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
           <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Seleccionar Cliente</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 text-sm font-bold"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="">Marca...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
           </div>

           <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">Logo del Cliente</label>
              <div className="relative group border-2 border-dashed border-slate-100 rounded-xl p-4 hover:border-primary/50 transition-colors cursor-pointer">
                 <input type="file" accept="image/*" onChange={(e) => handleFilesChange('logo', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center">
                       {logoFile ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Upload className="w-5 h-5 text-slate-400" />}
                    </div>
                    <span className="text-xs font-bold text-slate-500 truncate">{logoFile ? logoFile.name : "Subir Logo PNG"}</span>
                 </div>
              </div>
           </div>
        </div>

        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
           {/* Organic Files */}
           <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                 <label className="text-xs font-black uppercase tracking-widest text-slate-400">Data Orgánica (RRSS)</label>
                 <Plus className="w-4 h-4 text-primary" />
              </div>
              <div className="relative group border-2 border-dashed border-slate-100 rounded-xl p-8 hover:border-emerald-500/50 transition-colors cursor-pointer text-center">
                 <input type="file" multiple accept=".csv, .xlsx" onChange={(e) => handleFilesChange('organic', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                 <span className="text-xs font-bold text-slate-400">Cargar reportes de Instagram / Facebook</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                 {organicFiles.map((f, i) => (
                   <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase">
                      <span className="truncate max-w-[100px]">{f.name}</span>
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeFile('organic', i)} />
                   </div>
                 ))}
              </div>
           </div>

           {/* Ads Files */}
           <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                 <label className="text-xs font-black uppercase tracking-widest text-slate-400">Data de Pauta (Ads)</label>
                 <Plus className="w-4 h-4 text-primary" />
              </div>
              <div className="relative group border-2 border-dashed border-slate-100 rounded-xl p-8 hover:border-cyan-500/50 transition-colors cursor-pointer text-center">
                 <input type="file" multiple accept=".csv, .xlsx" onChange={(e) => handleFilesChange('ads', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <Target className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                 <span className="text-xs font-bold text-slate-400">Cargar reportes de Meta Ads / Ads Manager</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                 {adsFiles.map((f, i) => (
                   <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-cyan-50 border border-cyan-100 text-cyan-700 rounded-full text-[10px] font-black uppercase">
                      <span className="truncate max-w-[100px]">{f.name}</span>
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeFile('ads', i)} />
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>

      {/* Main Report View */}
      <AnimatePresence mode="wait">
        {report ? (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="report-container"
            ref={reportRef}
          >
            <div className="bg-white border border-slate-200 rounded-[3rem] shadow-2xl overflow-hidden relative p-12 md:p-20 space-y-20">
               {/* Branding Strip */}
               <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-primary via-emerald-400 to-cyan-500" />

               {/* Cover Section */}
               <div className="flex flex-col items-center text-center space-y-10">
                  <div className="w-40 h-40 relative">
                     <div className="absolute inset-0 bg-primary/5 rounded-full blur-3xl" />
                     <img
                      src={report.client.logoUrl || '/brainstudio-logo.png'}
                      alt={report.client.name}
                      className="w-full h-full object-contain relative z-10"
                    />
                  </div>
                  <div className="space-y-4">
                     <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-slate-900 leading-none">
                        AUDITORÍA <br /> <span className="text-primary italic">ESTRATÉGICA</span>
                     </h2>
                     <div className="inline-flex items-center gap-3 px-8 py-2 bg-slate-100 rounded-full text-slate-500 text-sm font-black uppercase tracking-[0.3em]">
                        {report.client.name} • {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                     </div>
                  </div>
               </div>

               {/* Section 1: Organic Deep Dive */}
               <div className="space-y-10">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                           <Sparkles className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-2xl font-black uppercase italic tracking-tight">Rendimiento Orgánico</h3>
                     </div>
                     <img src={report.client.logoUrl || '/brainstudio-logo.png'} className="h-8 opacity-20 grayscale" />
                  </div>

                  {/* KPI Tiles Organic */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     {report.analysis.kpis.organic.map((kpi, i) => (
                       <div key={i} className="bg-slate-50/50 border border-slate-200 p-8 rounded-[2rem] space-y-3 relative group hover:bg-white hover:shadow-xl hover:shadow-primary/5 transition-all">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{kpi.label}</span>
                          <div className="flex items-end justify-between">
                             <span className="text-4xl font-black text-slate-900 tracking-tighter">{kpi.value}</span>
                             <div className={cn(
                                "flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg",
                                kpi.trend.includes('+') ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                             )}>
                                <ArrowUpRight className="w-3 h-3" /> {kpi.trend}
                             </div>
                          </div>
                       </div>
                     ))}
                  </div>

                  {/* Top Content Table */}
                  <div className="space-y-6">
                     <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" /> Top Performing Content
                     </h4>
                     <div className="border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                           <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                 <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Publicación / Reel</th>
                                 <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Métricas Clave</th>
                                 <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">¿Por qué funcionó?</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-50">
                              {report.analysis.topContent.map((content, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                                   <td className="px-8 py-6">
                                      <div className="flex items-center gap-4">
                                         <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400">{i+1}</div>
                                         <span className="font-bold text-slate-700">{content.title}</span>
                                      </div>
                                   </td>
                                   <td className="px-8 py-6">
                                      <span className="px-4 py-1.5 bg-primary/5 text-primary rounded-full text-[10px] font-black uppercase">
                                         {content.metrics}
                                      </span>
                                   </td>
                                   <td className="px-8 py-6">
                                      <p className="text-xs text-slate-500 font-medium leading-relaxed">{content.whyItWorked}</p>
                                   </td>
                                </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>

               {/* Section 2: Ads Intelligence */}
               <div className="space-y-10">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-cyan-500/10 rounded-2xl flex items-center justify-center">
                           <Target className="w-6 h-6 text-cyan-500" />
                        </div>
                        <h3 className="text-2xl font-black uppercase italic tracking-tight">Inteligencia de Pauta</h3>
                     </div>
                     <img src={report.client.logoUrl || '/brainstudio-logo.png'} className="h-8 opacity-20 grayscale" />
                  </div>

                  {/* KPI Tiles Ads */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     {report.analysis.kpis.ads.map((kpi, i) => (
                       <div key={i} className="bg-slate-50/50 border border-slate-200 p-8 rounded-[2rem] space-y-3 relative group hover:bg-white hover:shadow-xl hover:shadow-cyan-500/5 transition-all">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{kpi.label}</span>
                          <div className="flex items-end justify-between">
                             <span className="text-4xl font-black text-slate-900 tracking-tighter">{kpi.value}</span>
                             <div className={cn(
                                "flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg",
                                kpi.trend.includes('-') ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                             )}>
                                {kpi.trend}
                             </div>
                          </div>
                       </div>
                     ))}
                  </div>

                  <div className="bg-slate-900 rounded-[2.5rem] p-10 md:p-16 space-y-10 relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
                     <div className="space-y-6 relative z-10">
                        <h4 className="text-xs font-black uppercase tracking-[0.3em] text-cyan-400 flex items-center gap-3">
                           <Info className="w-4 h-4" /> Diagnóstico de Conversión
                        </h4>
                        <p className="text-2xl text-slate-300 font-medium leading-relaxed italic">
                           "{report.analysis.comparison}"
                        </p>
                     </div>
                  </div>
               </div>

               {/* Section 3: Roadmap 3 Pasos */}
               <div className="space-y-12">
                  <div className="flex flex-col items-center text-center space-y-4">
                     <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                        Hoja de Ruta Estratégica
                     </div>
                     <h3 className="text-4xl font-black tracking-tight">Próximos Pasos Maestro</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                     {report.analysis.roadmap.map((step, i) => (
                       <div key={i} className="relative group p-10 bg-white border border-slate-200 rounded-[3rem] shadow-sm hover:shadow-2xl hover:border-primary/20 transition-all">
                          <div className="absolute -top-4 -left-4 w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-lg shadow-primary/30 group-hover:scale-110 transition-transform">
                             {step.step}
                          </div>
                          <div className="space-y-4 pt-4">
                             <h4 className="text-xl font-black text-slate-900 leading-tight">{step.action}</h4>
                             <p className="text-sm text-slate-500 leading-relaxed font-medium">{step.reason}</p>
                          </div>
                          <div className="absolute bottom-6 right-8 opacity-0 group-hover:opacity-10 transition-opacity">
                             <ArrowUpRight className="w-12 h-12 text-primary" />
                          </div>
                       </div>
                     ))}
                  </div>
               </div>

                  {/* Charts Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-12 border-t border-slate-100">
                     <div className="space-y-6">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                           <BarChart3 className="w-4 h-4" /> Crecimiento Orgánico
                        </h4>
                        <div className="h-[300px] bg-slate-50/50 rounded-3xl p-6">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={report.analysis.charts.organicTrend}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                 <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                                 <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                 <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                 <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                     <div className="space-y-6">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                           <PieChart className="w-4 h-4" /> Distribución de Inversión
                        </h4>
                        <div className="h-[300px] bg-slate-50/50 rounded-3xl p-6">
                           <ResponsiveContainer width="100%" height="100%">
                              <RePieChart>
                                 <Pie
                                    data={report.analysis.charts.adsDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                 >
                                    {report.analysis.charts.adsDistribution.map((entry, index) => (
                                       <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                 </Pie>
                                 <Tooltip />
                                 <Legend iconType="circle" />
                              </RePieChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  </div>

               {/* Footer */}
               <div className="pt-20 border-t border-slate-100 flex flex-col items-center gap-6">
                  <img src="/brainstudio-logo.png" className="h-12 grayscale opacity-30" />
                  <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">
                     Brainstudio Intelligent Agency • 2026
                  </div>
               </div>
            </div>
          </motion.div>
        ) : (
          <div className="h-[500px] flex flex-col items-center justify-center space-y-6 text-center">
             <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center shadow-inner">
                <Sparkles className="w-12 h-12 text-slate-200" />
             </div>
             <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-400">Esperando Data Estratégica</h3>
                <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto">
                   Carga los reportes de redes y pauta para activar el análisis de Auditoría v2.0.
                </p>
             </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reports;
