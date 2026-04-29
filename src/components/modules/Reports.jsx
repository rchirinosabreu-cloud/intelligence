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
  Layout
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
      toast.success('Reporte maestro generado');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Fallo en generación');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const toastId = toast.loading('Exportando Reporte Digital...');
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
      pdf.save(`Reporte_Digital_${report.client.name}.pdf`);
      toast.success('Reporte PDF listo', { id: toastId });
    } catch (err) {
      toast.error('Error al exportar', { id: toastId });
    }
  };

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

  const StatWidget = ({ label, value }) => (
    <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold text-slate-900 tracking-tight">{value}</span>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-12 min-h-screen bg-[#fcfcfd] text-slate-900 font-inter">
      {/* Control Panel (Hidden on PDF) */}
      <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm space-y-8 no-print">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 pb-8">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reporte de desempeño digital</h1>
              <p className="text-sm text-slate-500">Configura las fuentes para la auditoría estratégica v3.0</p>
            </div>
            <div className="flex gap-3">
               {report && (
                 <button onClick={downloadPDF} className="px-6 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold transition-all">
                  Descargar PDF
                 </button>
               )}
               <button
                onClick={generateReport}
                disabled={isGenerating}
                className="px-8 py-2.5 bg-primary hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-2"
               >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isGenerating ? "Consolidando..." : "Generar reporte"}
               </button>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> Selección de marca
              </label>
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
                    <span className="text-[11px] font-medium text-slate-500 truncate">{logoFile ? logoFile.name : "Subir logo PNG"}</span>
                 </div>
              </div>
            </div>

            <div className="space-y-4">
               <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Datos orgánicos
               </label>
               <div className="relative group border border-dashed border-slate-200 rounded-xl p-6 hover:bg-emerald-50/30 transition-all cursor-pointer text-center">
                 <input type="file" multiple accept=".csv, .xlsx" onChange={(handleFilesChange.bind(null, 'organic'))} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <Plus className="w-5 h-5 text-slate-300 mx-auto mb-2" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase">Añadir archivos RRSS</span>
               </div>
               <div className="flex flex-wrap gap-2">
                 {organicFiles.map((f, i) => (
                   <div key={i} className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-100 text-slate-600 rounded-full text-[9px] font-bold">
                      <span className="truncate max-w-[80px]">{f.name}</span>
                      <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => removeFile('organic', i)} />
                   </div>
                 ))}
               </div>
            </div>

            <div className="space-y-4">
               <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> Performance (Ads)
               </label>
               <div className="relative group border border-dashed border-slate-200 rounded-xl p-6 hover:bg-cyan-50/30 transition-all cursor-pointer text-center">
                 <input type="file" multiple accept=".csv, .xlsx" onChange={(handleFilesChange.bind(null, 'ads'))} className="absolute inset-0 opacity-0 cursor-pointer" />
                 <Plus className="w-5 h-5 text-slate-300 mx-auto mb-2" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase">Añadir reportes pauta</span>
               </div>
               <div className="flex flex-wrap gap-2">
                 {adsFiles.map((f, i) => (
                   <div key={i} className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-100 text-slate-600 rounded-full text-[9px] font-bold">
                      <span className="truncate max-w-[80px]">{f.name}</span>
                      <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => removeFile('ads', i)} />
                   </div>
                 ))}
               </div>
            </div>
         </div>
      </div>

      {/* Final Report Canvas */}
      <AnimatePresence mode="wait">
        {report ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white border border-slate-200 shadow-2xl rounded-[1.5rem] md:rounded-[3rem] overflow-hidden"
            ref={reportRef}
          >
            {/* Page Padding Container */}
            <div className="p-12 md:p-24 space-y-24">

               {/* Portada */}
               <div className="flex flex-col items-center text-center space-y-12 py-20 border-b border-slate-100">
                  <div className="h-40 md:h-52 w-auto flex items-center justify-center">
                     <img
                      src={report.client.logoUrl || '/brainstudio-logo.png'}
                      alt={report.client.name}
                      className="h-full w-full object-contain"
                      style={{ imageRendering: 'auto' }}
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
               <div className="space-y-16">
                  <div className="space-y-4">
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Análisis orgánico (RRSS)</h3>
                    <div className="h-0.5 w-12 bg-primary" />
                  </div>

                  {/* 4 Widgets Organic */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                     {report.analysis.organic.widgets.map((w, i) => (
                       <StatWidget key={i} label={w.label} value={w.value} />
                     ))}
                  </div>

                  {/* Narrative Organic */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                     <div className="lg:col-span-7 space-y-8 text-slate-600 leading-relaxed font-normal">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Logros y avances</h4>
                        <div className="space-y-6 whitespace-pre-wrap text-lg">
                           {report.analysis.organic.analysis}
                        </div>
                     </div>
                     <div className="lg:col-span-5 space-y-8">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Distribución de engagement</h4>
                        <div className="h-[280px] bg-slate-50 border border-slate-100 rounded-3xl p-6">
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
                                 <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                              </RePieChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  </div>

                  {/* Top Content & Evolution */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                     <div className="space-y-6">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Evolución de seguidores</h4>
                        <div className="h-[250px] bg-white border border-slate-100 rounded-2xl p-4">
                           <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={report.analysis.organic.charts.followersEvolution}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                 <XAxis dataKey="date" fontSize={10} axisLine={false} tickLine={false} />
                                 <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                 <Tooltip />
                                 <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1' }} />
                              </LineChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                     <div className="space-y-6">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Contenido top</h4>
                        <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-slate-50/30">
                           <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-100">
                                 <tr>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Pieza</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Tipo</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Alcance</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                 {report.analysis.organic.topContent.map((c, i) => (
                                   <tr key={i} className="hover:bg-white transition-colors">
                                      <td className="px-6 py-4 text-[12px] font-medium text-slate-700 truncate max-w-[150px]">{c.title}</td>
                                      <td className="px-6 py-4 text-[10px] font-bold uppercase text-slate-400">{c.type}</td>
                                      <td className="px-6 py-4 text-right text-[12px] font-bold text-slate-900">{c.reach}</td>
                                   </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Sección: Performance digital */}
               <div className="space-y-16 pt-24 border-t border-slate-100">
                  <div className="space-y-4">
                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Performance digital</h3>
                    <div className="h-0.5 w-12 bg-cyan-500" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                     {report.analysis.performance.widgets.map((w, i) => (
                       <StatWidget key={i} label={w.label} value={w.value} />
                     ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                     <div className="lg:col-span-5 space-y-8">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Eficiencia por campaña</h4>
                        <div className="h-[300px] bg-slate-50 border border-slate-100 rounded-3xl p-6">
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={report.analysis.performance.charts.adsEfficiency} layout="vertical">
                                 <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                 <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} />
                                 <YAxis type="category" dataKey="campaign" fontSize={8} axisLine={false} tickLine={false} width={80} />
                                 <Tooltip />
                                 <Bar dataKey="cpr" fill="#06b6d4" radius={[0, 10, 10, 0]} barSize={20} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                        <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">Costo por resultado (Menor es mejor)</p>
                     </div>
                     <div className="lg:col-span-7 space-y-10">
                        <div className="space-y-4">
                           <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Rendimiento y resultados</h4>
                           <div className="text-lg text-slate-600 leading-relaxed font-normal whitespace-pre-wrap">
                              {report.analysis.performance.analysis}
                           </div>
                        </div>
                        <div className="space-y-4">
                           <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Estrategia de optimización</h4>
                           <div className="text-lg text-slate-600 leading-relaxed font-normal whitespace-pre-wrap">
                              {report.analysis.performance.strategy}
                           </div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Sección: Hoja de ruta estratégica */}
               <div className="pt-24 border-t border-slate-100">
                  <div className="bg-slate-900 rounded-[3rem] p-12 md:p-20 space-y-10 relative overflow-hidden text-center md:text-left">
                     <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
                     <div className="space-y-6 relative z-10">
                        <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Hoja de ruta estratégica</h3>
                        <div className="h-0.5 w-12 bg-primary mx-auto md:mx-0" />
                        <p className="text-xl text-slate-400 leading-relaxed max-w-3xl font-medium">
                           {report.roadmap}
                        </p>
                     </div>
                     <div className="flex items-center gap-6 pt-10 relative z-10 opacity-30 justify-center md:justify-start">
                        <img src="/brainstudio-logo.png" className="h-10 grayscale brightness-200" />
                        <div className="h-8 w-px bg-white/20" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-[0.5em]">Digital Strategy • 2026</span>
                     </div>
                  </div>
               </div>

               {/* Footer Minimalista */}
               <div className="pt-20 border-t border-slate-50 flex flex-col items-center gap-4 text-center">
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.4em]">
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
                <h3 className="text-lg font-bold text-slate-400">Analizador Inteligente</h3>
                <p className="text-sm text-slate-400 max-w-xs font-medium">Sube los archivos crudos para iniciar el análisis estratégico de Bonsai Style.</p>
             </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reports;
