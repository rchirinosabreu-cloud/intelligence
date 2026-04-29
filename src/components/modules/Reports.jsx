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
  Instagram,
  Facebook,
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
      toast.error('Error al cargar clientes');
    }
  };

  const handleFilesChange = (type, e) => {
    const selectedFiles = Array.from(e.target.files);
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
      setReport(response.data);
      toast.success('Reporte generado');
    } catch (error) {
      toast.error('Error al generar');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const toastId = toast.loading('Preparando entrega...');
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`Reporte_${report.client.name}.pdf`);
      toast.success('Entregable PDF listo', { id: toastId });
    } catch (err) {
      toast.error('Error al exportar', { id: toastId });
    }
  };

  const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

  const Card = ({ children, className = "" }) => (
    <div className={cn("bg-white border border-slate-200 rounded-3xl shadow-sm p-6 overflow-hidden", className)}>
      {children}
    </div>
  );

  const SectionHeader = ({ title, clientLogo }) => (
    <div className="flex items-center justify-between mb-8">
       <h3 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h3>
       {clientLogo && <img src={clientLogo} className="h-8 w-auto object-contain opacity-40 grayscale" />}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-10 min-h-screen bg-[#fcfcfd] text-slate-900 font-sans">
      {/* Configuration Zone (Control Panel) */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm space-y-8 no-print">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reporte de desempeño digital</h1>
              <p className="text-sm text-slate-500 font-medium">Análisis estratégico potenciado por Gemini 2.5 Pro</p>
            </div>
            <div className="flex gap-3">
               {report && (
                 <button onClick={downloadPDF} className="px-6 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-xs font-bold transition-all">
                  Descargar PDF
                 </button>
               )}
               <button
                onClick={generateReport}
                disabled={isGenerating}
                className="px-8 py-2.5 bg-primary hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold rounded-2xl shadow-lg shadow-primary/10 transition-all flex items-center gap-2"
               >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isGenerating ? "Analizando..." : "Generar Auditoría"}
               </button>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Marca Selector */}
            <div className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Selección de marca</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="">Marca...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="relative group border border-dashed border-slate-200 rounded-2xl p-4 hover:bg-slate-50 transition-all cursor-pointer">
                 <input type="file" accept="image/*" onChange={(e) => handleFilesChange('logo', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center">
                       {logoFile ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Upload className="w-5 h-5 text-slate-300" />}
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 truncate">{logoFile ? logoFile.name : "Subir logo PNG"}</span>
                 </div>
              </div>
            </div>

            {/* Organic Files */}
            <div className="space-y-4">
               <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Datos orgánicos (RRSS)</label>
               <div className="relative group border border-dashed border-slate-200 rounded-2xl p-6 hover:bg-emerald-50/20 transition-all cursor-pointer text-center">
                 <input type="file" multiple accept=".csv, .xlsx" onChange={(e) => handleFilesChange('organic', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <Plus className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Añadir archivos RRSS</span>
               </div>
               <div className="flex flex-wrap gap-2">
                 {organicFiles.map((f, i) => (
                   <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold">
                      <span className="truncate max-w-[80px]">{f.name}</span>
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeFile('organic', i)} />
                   </div>
                 ))}
               </div>
            </div>

            {/* Ads Files */}
            <div className="space-y-4">
               <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Performance (Ads)</label>
               <div className="relative group border border-dashed border-slate-200 rounded-2xl p-6 hover:bg-cyan-50/20 transition-all cursor-pointer text-center">
                 <input type="file" multiple accept=".csv, .xlsx" onChange={(e) => handleFilesChange('ads', e)} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <Plus className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Añadir reportes Ads</span>
               </div>
               <div className="flex flex-wrap gap-2">
                 {adsFiles.map((f, i) => (
                   <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-cyan-50 border border-cyan-100 text-cyan-700 rounded-full text-[9px] font-bold">
                      <span className="truncate max-w-[80px]">{f.name}</span>
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white border border-slate-200 shadow-2xl rounded-[3rem] overflow-hidden overflow-x-hidden"
            ref={reportRef}
          >
            <div className="p-12 md:p-24 space-y-24">
               {/* Portada */}
               <div className="flex flex-col items-center text-center space-y-12 py-20 border-b border-slate-100">
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

               {/* Sección: Análisis orgánico (RRSS) */}
               <div className="space-y-12">
                  <SectionHeader title="Análisis orgánico (RRSS)" clientLogo={report.client.logoUrl} />

                  {/* Widgets Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     {report.analysis.organic.widgets.map((w, i) => (
                       <Card key={i} className="p-6">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{w.label}</span>
                          <p className="text-3xl font-black text-slate-900 tracking-tight mt-1">{w.value}</p>
                       </Card>
                     ))}
                  </div>

                  {/* Main Organic Content Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                     <div className="lg:col-span-8 space-y-8">
                        <Card className="h-full">
                           <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Logros y avances</h4>
                           <div className="text-lg text-slate-600 leading-relaxed font-normal whitespace-pre-wrap">
                              {report.analysis.organic.analysis}
                           </div>
                        </Card>
                     </div>
                     <div className="lg:col-span-4 space-y-6">
                        <Card>
                           <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Distribución de engagement</h4>
                           <div className="h-[250px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <RePieChart>
                                    <Pie
                                       data={report.analysis.organic.charts.engagementByFormat}
                                       cx="50%" cy="50%"
                                       innerRadius={60} outerRadius={80}
                                       paddingAngle={8}
                                       dataKey="value"
                                    >
                                       {report.analysis.organic.charts.engagementByFormat.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                       ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                 </RePieChart>
                              </ResponsiveContainer>
                           </div>
                           <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-widest mt-4">Interacción por tipo de contenido</p>
                        </Card>
                     </div>
                  </div>

                  {/* Secondary Organic Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                     <Card className="lg:col-span-1">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6 flex items-center gap-2">
                           <Monitor className="w-4 h-4 text-primary" /> Alcance por plataforma
                        </h4>
                        <div className="h-[220px]">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={report.analysis.organic.charts.platformReach} layout="vertical">
                                 <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                 <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} />
                                 <YAxis type="category" dataKey="name" fontSize={10} axisLine={false} tickLine={false} width={70} />
                                 <Tooltip />
                                 <Bar dataKey="value" fill="#8b5cf6" radius={[0, 10, 10, 0]} barSize={25} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </Card>
                     <Card className="lg:col-span-2">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Evolución diaria</h4>
                        <div className="h-[220px]">
                           <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={report.analysis.organic.charts.dailyEvolution}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                 <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                                 <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                 <Tooltip />
                                 <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                              </LineChart>
                           </ResponsiveContainer>
                        </div>
                     </Card>
                  </div>

                  {/* Top Content Table */}
                  <Card>
                     <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Contenido top</h4>
                     <div className="overflow-x-auto">
                        <table className="w-full text-left">
                           <thead className="bg-slate-50 border-y border-slate-100">
                              <tr>
                                 <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Pieza / Título</th>
                                 <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Tipo</th>
                                 <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Alcance</th>
                                 <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Interacción</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100">
                              {report.analysis.organic.topContent.map((c, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                                   <td className="px-6 py-5">
                                      <span className="font-bold text-slate-700 text-sm">{c.title}</span>
                                   </td>
                                   <td className="px-6 py-5">
                                      <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-wider">
                                         {c.type}
                                      </span>
                                   </td>
                                   <td className="px-6 py-5 text-right font-black text-slate-900 text-sm">{c.reach}</td>
                                   <td className="px-6 py-5 text-right font-bold text-primary text-sm">{c.engagement}</td>
                                </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </Card>
               </div>

               {/* Sección: Performance digital */}
               <div className="space-y-12 pt-24 border-t border-slate-100">
                  <SectionHeader title="Performance digital" clientLogo={report.client.logoUrl} />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     {report.analysis.performance.widgets.map((w, i) => (
                       <Card key={i} className="p-6">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{w.label}</span>
                          <p className="text-3xl font-black text-slate-900 tracking-tight mt-1">{w.value}</p>
                       </Card>
                     ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                     <div className="lg:col-span-8 space-y-6">
                        <Card>
                           <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Alcance acumulado vs impresiones</h4>
                           <div className="h-[300px]">
                              <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={report.analysis.performance.charts.accumulatedArea}>
                                    <defs>
                                       <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                       </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                                    <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="reach" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorReach)" strokeWidth={3} />
                                    <Area type="monotone" dataKey="impressions" stroke="#06b6d4" fill="none" strokeWidth={1} strokeDasharray="5 5" />
                                 </AreaChart>
                              </ResponsiveContainer>
                           </div>
                        </Card>
                     </div>
                     <div className="lg:col-span-4 h-full">
                        <Card className="h-full">
                           <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-6">Rendimiento y resultados</h4>
                           <div className="text-lg text-slate-600 leading-relaxed font-normal whitespace-pre-wrap">
                              {report.analysis.performance.analysis}
                           </div>
                        </Card>
                     </div>
                  </div>
               </div>

               {/* Sección: Hoja de ruta estratégica */}
               <div className="pt-24 border-t border-slate-100">
                  <div className="bg-slate-900 rounded-[3rem] p-12 md:p-20 space-y-12 relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
                     <div className="space-y-6 relative z-10">
                        <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Hoja de ruta estratégica</h3>
                        <div className="h-0.5 w-12 bg-primary" />
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                        {report.analysis.hoja_de_ruta.map((step, i) => (
                           <div key={i} className="space-y-4">
                              <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center font-black text-xl shadow-lg shadow-primary/20">
                                 {step.step}
                              </div>
                              <h4 className="text-xl font-bold text-white leading-tight">{step.title}</h4>
                              <p className="text-sm text-slate-400 font-medium leading-relaxed">{step.description}</p>
                           </div>
                        ))}
                     </div>

                     <div className="flex items-center gap-6 pt-10 relative z-10 opacity-30">
                        <img src="/brainstudio-logo.png" className="h-10 grayscale brightness-200" />
                        <div className="h-8 w-px bg-white/20" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-[0.5em]">Digital Strategy • 2026</span>
                     </div>
                  </div>
               </div>

               {/* Footer Minimalista */}
               <div className="pt-20 border-t border-slate-50 flex flex-col items-center gap-4 text-center">
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.5em]">
                     Brainstudio Intelligent Agency • Performance Team
                  </div>
               </div>
            </div>
          </motion.div>
        ) : (
          <div className="h-[400px] flex flex-col items-center justify-center space-y-8 bg-white border border-slate-200 border-dashed rounded-[3rem]">
             <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center shadow-inner">
                <Layout className="w-8 h-8 text-slate-200" />
             </div>
             <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-slate-400">Analizador de Performance</h3>
                <p className="text-sm text-slate-400 max-w-xs font-medium">Sube los archivos crudos para iniciar el análisis estratégico final.</p>
             </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reports;
