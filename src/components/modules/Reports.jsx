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
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { cn } from '@/lib/utils';

// --- Error Boundary for Charts ---
class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="h-full flex items-center justify-center text-slate-300 text-xs italic">Gráfica no disponible</div>;
    return this.props.children;
  }
}

const Reports = () => {
  const { currentUser } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');

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
      setClients(response.data || []);
    } catch (error) {
      console.error('Fetch clients error');
    }
  };

  const handleFilesChange = (type, e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (type === 'organic') setOrganicFiles(prev => [...prev, ...selectedFiles]);
    else if (type === 'ads') setAdsFiles(prev => [...prev, ...selectedFiles]);
    else if (type === 'logo') setLogoFile(selectedFiles[0]);
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
      if (response.data?.analysis) {
        setReport(response.data);
        toast.success('Reporte final generado');
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      toast.error('Fallo en el análisis de IA. Reintenta.');
    } finally {
      setIsGenerating(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val) + ' COP';
  };

  const formatNumber = (val) => {
    return new Intl.NumberFormat('es-CO').format(val);
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const toastId = toast.loading('Generando documento...');
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`Reporte_Bonsai_${report.client.name}.pdf`);
      toast.success('Descarga lista', { id: toastId });
    } catch (err) {
      toast.error('Error al exportar PDF', { id: toastId });
    }
  };

  const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

  const Card = ({ children, className = "" }) => (
    <div className={cn("bg-white border border-[#e2e8f0] rounded-2xl shadow-sm p-6", className)}>
      {children}
    </div>
  );

  const SectionHeader = ({ title, clientLogo }) => (
    <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
       <h3 className="text-xl font-bold tracking-tight text-slate-800">{title}</h3>
       {clientLogo && <img src={clientLogo} className="h-10 w-auto object-contain" />}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-10 min-h-screen bg-[#f8fafc] text-slate-900 font-inter">
      {/* Control Panel */}
      <div className="bg-white border border-[#e2e8f0] rounded-[2rem] p-8 shadow-sm space-y-8 no-print">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reporte de desempeño digital</h1>
              <p className="text-sm text-slate-500 font-medium italic">Consolidación estratégica estable v6.0</p>
            </div>
            <div className="flex gap-3">
               {report && (
                 <button onClick={downloadPDF} className="px-6 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold transition-all">
                  PDF Final
                 </button>
               )}
               <button
                onClick={generateReport}
                disabled={isGenerating}
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
               <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Archivos Orgánicos</label>
               <div className="relative group border border-dashed border-slate-200 rounded-xl p-6 hover:bg-emerald-50/20 transition-all cursor-pointer text-center">
                 <input type="file" multiple accept=".csv, .xlsx" onChange={(e) => handleFilesChange('organic', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <Plus className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Añadir RRSS</span>
               </div>
               <div className="flex flex-wrap gap-2">
                 {organicFiles.map((f, i) => (
                   <div key={i} className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-100 text-slate-600 rounded-full text-[9px] font-bold">
                      <span className="truncate max-w-[80px]">{f.name}</span>
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeFile('organic', i)} />
                   </div>
                 ))}
               </div>
            </div>

            <div className="space-y-4">
               <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Archivos Pauta</label>
               <div className="relative group border border-dashed border-slate-200 rounded-xl p-6 hover:bg-cyan-50/20 transition-all cursor-pointer text-center">
                 <input type="file" multiple accept=".csv, .xlsx" onChange={(e) => handleFilesChange('ads', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <Plus className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Añadir Ads</span>
               </div>
               <div className="flex flex-wrap gap-2">
                 {adsFiles.map((f, i) => (
                   <div key={i} className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-100 text-slate-600 rounded-full text-[9px] font-bold">
                      <span className="truncate max-w-[80px]">{f.name}</span>
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeFile('ads', i)} />
                   </div>
                 ))}
               </div>
            </div>
         </div>
      </div>

      {/* Main Report Canvas */}
      <AnimatePresence mode="wait">
        {report ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-white border border-[#e2e8f0] shadow-2xl rounded-[2.5rem] overflow-hidden"
            ref={reportRef}
          >
            <div className="p-12 md:p-20 space-y-20">
               {/* Portada */}
               <div className="flex flex-col items-center text-center space-y-12 py-20 border-b border-slate-100 relative">
                  <div className="h-40 md:h-52 w-auto">
                     <img
                      src={report.client.logoUrl || '/brainstudio-logo.png'}
                      alt={report.client.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="space-y-6">
                     <h2 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight leading-tight">
                        Reporte de desempeño digital
                     </h2>
                     <div className="flex items-center justify-center gap-4 text-sm font-medium text-slate-400 uppercase tracking-widest">
                        <span>{report.client.name}</span>
                        <div className="w-1 h-1 rounded-full bg-slate-200" />
                        <span>{new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
                     </div>
                  </div>
               </div>

               {/* Sección: Auditoría de Datos */}
               <div className="space-y-4">
                  <div className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
                     <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                     </div>
                     <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumen de Auditoría</p>
                        <p className="text-sm font-medium text-slate-700">{report.transparencyLog}</p>
                     </div>
                  </div>

                  {report.sourcesAudit && report.sourcesAudit.length > 0 && (
                     <Card className="p-0 overflow-hidden border-slate-200">
                        <div className="bg-slate-50 px-6 py-3 border-b border-slate-100">
                           <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <FileText className="w-3 h-3" /> Fuentes de Datos Procesadas
                           </h4>
                        </div>
                        <div className="divide-y divide-slate-50">
                           {report.sourcesAudit.map((source, idx) => (
                              <div key={idx} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                 <div className="flex items-center gap-3">
                                    <div className={cn(
                                       "w-2 h-2 rounded-full",
                                       source.type === 'Ads' ? "bg-cyan-400" :
                                       source.type === 'Organic' ? "bg-emerald-400" : "bg-slate-300"
                                    )} />
                                    <span className="text-xs font-bold text-slate-700">{source.name}</span>
                                 </div>
                                 <span className={cn(
                                    "text-[10px] font-medium px-2 py-0.5 rounded-full",
                                    source.type === 'Desconocido' ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
                                 )}>
                                    {source.status}
                                 </span>
                              </div>
                           ))}
                        </div>
                     </Card>
                  )}
               </div>

               {/* Sección: Análisis orgánico (RRSS) */}
               <div className="space-y-12">
                  <SectionHeader title="Análisis orgánico (RRSS)" clientLogo={report.client.logoUrl} />

                  {/* Widgets */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     {(report.analysis.organic.widgets || []).map((w, i) => (
                       <Card key={i} className="p-6">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{w.label}</span>
                          <p className="text-3xl font-black text-slate-900 tracking-tight mt-1">
                            {typeof w.value === 'number' ? formatNumber(w.value) : w.value}
                          </p>
                       </Card>
                     ))}
                  </div>

                  {/* Narrativa Full Width */}
                  <Card className="bg-[#fcfcfd]">
                     <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">Logros y avances</h4>
                     <div className="text-lg text-slate-600 leading-relaxed font-normal whitespace-pre-wrap">
                        {report.analysis.organic.analysis}
                     </div>
                  </Card>

                  {/* Gráficas Advanced */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <Card>
                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-8">Alcance por plataforma</h4>
                        <div className="h-[250px]">
                           <ChartErrorBoundary>
                              <ResponsiveContainer width="100%" height="100%">
                                 <BarChart data={report.analysis.organic.charts.platformBar} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" fontSize={10} axisLine={false} tickLine={false} width={80} />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 10, 10, 0]} barSize={25} />
                                 </BarChart>
                              </ResponsiveContainer>
                           </ChartErrorBoundary>
                        </div>
                     </Card>
                     <Card>
                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-8">Distribución de engagement</h4>
                        <div className="h-[250px]">
                           <ChartErrorBoundary>
                              <ResponsiveContainer width="100%" height="100%">
                                 <RePieChart>
                                    <Pie
                                       data={report.analysis.organic.charts.engagementDonut}
                                       cx="50%" cy="50%"
                                       innerRadius={70} outerRadius={90}
                                       paddingAngle={10}
                                       dataKey="value"
                                    >
                                       {report.analysis.organic.charts.engagementDonut.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                       ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend iconType="circle" />
                                 </RePieChart>
                              </ResponsiveContainer>
                           </ChartErrorBoundary>
                        </div>
                     </Card>
                  </div>

                  {/* Top Content obligatorio 5 */}
                  {report.analysis.organic.topContent?.length > 0 && (
                     <Card>
                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-10 flex items-center gap-2">
                           <Trophy className="w-4 h-4 text-amber-400" /> Contenido top del periodo
                        </h4>
                        <div className="space-y-10">
                           {report.analysis.organic.topContent.map((item, i) => (
                              <div key={i} className="flex gap-8 items-start pb-8 border-b border-slate-50 last:border-0">
                                 <div className="w-24 h-24 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 shadow-inner">
                                    <Monitor className="w-8 h-8 text-slate-200" />
                                 </div>
                                 <div className="flex-1 space-y-4">
                                    <div className="flex items-center justify-between">
                                       <h5 className="font-bold text-slate-700 text-base">{item.title}</h5>
                                       <div className="flex gap-6">
                                          <div className="text-right">
                                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Alcance</p>
                                             <p className="text-sm font-black text-slate-900">{item.reach}</p>
                                          </div>
                                          <div className="text-right">
                                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Interacción</p>
                                             <p className="text-sm font-bold text-primary">{item.engagement}</p>
                                          </div>
                                       </div>
                                    </div>
                                    <div className="px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm text-slate-600 leading-relaxed">
                                       {item.aiComment}
                                    </div>
                                 </div>
                              </div>
                           ))}
                        </div>
                     </Card>
                  )}
               </div>

               {/* Sección: Performance digital */}
               <div className="space-y-12 pt-24 border-t border-slate-100">
                  <SectionHeader title="Performance digital" clientLogo={report.client.logoUrl} />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     {(report.analysis.performance.widgets || []).map((w, i) => (
                       <Card key={i} className="p-6">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{w.label}</span>
                          <p className="text-3xl font-black text-slate-900 tracking-tight mt-1">
                            {w.label.toLowerCase().includes('inversión') && typeof w.value === 'number'
                              ? formatCurrency(w.value)
                              : (typeof w.value === 'number' ? formatNumber(w.value) : w.value)}
                          </p>
                       </Card>
                     ))}
                  </div>

                  <Card className="bg-[#fcfcfd]">
                     <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">Rendimiento y resultados</h4>
                     <div className="text-lg text-slate-600 leading-relaxed font-normal whitespace-pre-wrap">
                        {report.analysis.performance.analysis}
                     </div>
                  </Card>

                  <Card>
                     <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-10">Alcance acumulado vs impresiones</h4>
                     <div className="h-[300px]">
                        <ChartErrorBoundary>
                           <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={report.analysis.performance.charts.accumulatedArea}>
                                 <defs>
                                    <linearGradient id="areaColorFin" x1="0" y1="0" x2="0" y2="1">
                                       <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                                       <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                    </linearGradient>
                                 </defs>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                 <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                                 <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                 <Tooltip />
                                 <Area type="monotone" dataKey="reach" stroke="#8b5cf6" fillOpacity={1} fill="url(#areaColorFin)" strokeWidth={4} />
                                 <Area type="monotone" dataKey="impressions" stroke="#06b6d4" fill="none" strokeWidth={1} strokeDasharray="5 5" />
                              </AreaChart>
                           </ResponsiveContainer>
                        </ChartErrorBoundary>
                     </div>
                  </Card>
               </div>

               {/* Sección: Hoja de ruta estratégica */}
               <div className="pt-24 border-t border-slate-100">
                  <div className="bg-slate-900 rounded-[3rem] p-12 md:p-20 space-y-12 relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
                     <div className="space-y-6 relative z-10">
                        <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Hoja de ruta estratégica</h3>
                        <div className="h-0.5 w-12 bg-primary" />
                     </div>

                     <div className="space-y-10 relative z-10">
                        {(report.analysis.hoja_de_ruta || []).map((step, i) => (
                           <div key={i} className="flex gap-8 items-start group">
                              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 text-white flex items-center justify-center shrink-0 font-black text-xl shadow-xl">
                                 {step.step || i+1}
                              </div>
                              <div className="space-y-2">
                                 <h4 className="text-xl font-bold text-white leading-tight">{step.title}</h4>
                                 <p className="text-lg text-slate-400 font-medium leading-relaxed">{step.description}</p>
                              </div>
                           </div>
                        ))}
                     </div>

                     <div className="flex items-center gap-6 pt-10 relative z-10 opacity-30">
                        <img src="/brainstudio-logo.png" className="h-10 grayscale brightness-200" />
                        <div className="h-8 w-px bg-white/20" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-[0.5em]">Digital Performance Strategy</span>
                     </div>
                  </div>
               </div>

               {/* Footer */}
               <div className="pt-20 border-t border-slate-50 flex flex-col items-center gap-4 text-center">
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.4em]">
                     Brainstudio Intelligent Agency • Estabilidad Final BS-REP-006
                  </div>
               </div>
            </div>
          </motion.div>
        ) : (
          <div className="h-[500px] flex flex-col items-center justify-center space-y-8 bg-white border border-slate-200 border-dashed rounded-[3rem]">
             <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center shadow-inner">
                <Layout className="w-10 h-10 text-slate-200" />
             </div>
             <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-slate-400">Analizador Maestro v6.0</h3>
                <p className="text-sm text-slate-400 max-w-xs font-medium">Sube los reportes para generar una auditoría de alto nivel estratégica.</p>
             </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reports;
