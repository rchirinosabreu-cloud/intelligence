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
  const [report, setReport] = useState(null);
  const [editedTexts, setEditedTexts] = useState({
    title: '',
    organic: {
        avance: '',
        radiografia: '',
        resumen: ''
    },
    performance: {
        macro: '',
        micro: ''
    }
  });
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

  const handleTextEdit = (section, field, value) => {
    if (section === 'title') {
        setEditedTexts(prev => ({ ...prev, title: value }));
        return;
    }
    setEditedTexts(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
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
        organic: { avance: '', radiografia: '', resumen: '' },
        performance: { macro: '', micro: '' }
    });

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
        setEditedTexts({
            title: `Reporte de Desempeño Digital de ${response.data.client.name} - 2026`,
            organic: {
                avance: response.data.analysis.organic?.avance?.texto_analisis || '',
                radiografia: response.data.analysis.organic?.radiografia?.texto_analisis || '',
                resumen: response.data.analysis.organic?.resumen?.texto_analisis || ''
            },
            performance: {
                macro: response.data.analysis.performance?.macro?.texto_analisis || '',
                micro: response.data.analysis.performance?.micro?.texto_analisis || ''
            }
        });
        toast.success('Reporte final generado');
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      toast.error('Fallo en el análisis de IA. Reintenta.');
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const toastId = toast.loading('Generando documento...');
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: true,
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
            ta.parentNode.replaceChild(div, ta);
          });
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
      toast.error('Error al exportar PDF', { id: toastId });
    }
  };

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
                  <div className="space-y-6 w-full max-w-4xl">
                     <textarea
                        className="w-full bg-transparent border-none text-4xl md:text-5xl font-light text-slate-900 tracking-tight leading-tight text-center resize-none outline-none focus:ring-1 focus:ring-primary/10 rounded-xl py-2 px-4"
                        rows={2}
                        value={editedTexts.title}
                        onChange={(e) => handleTextEdit('title', null, e.target.value)}
                     />
                     <div className="flex items-center justify-center gap-4 text-sm font-medium text-slate-400 uppercase tracking-widest">
                        <span>Brainstudio Agency</span>
                        <div className="w-1 h-1 rounded-full bg-slate-200" />
                        <span>{new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
                     </div>
                  </div>
               </div>

               {/* Sección: Análisis orgánico (RRSS) */}
               {report.analysis.organic && (
               <div className="space-y-12">
                  <SectionHeader title="Análisis orgánico (RRSS)" clientLogo={report.client.logoUrl} />

                  {/* Avance General */}
                  <div className="space-y-6">
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" /> Avance General
                    </h4>
                    {report.analysis.organic.avance?.imagen_url && (
                        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm max-w-3xl mx-auto">
                            <img
                              src={report.analysis.organic.avance.imagen_url}
                              className="w-full h-auto"
                              alt="Avance General"
                              onError={(e) => console.error("Error loading image:", report.analysis.organic.avance.imagen_url)}
                            />
                        </div>
                    )}
                    <Card className="bg-[#fcfcfd]">
                        <textarea
                           className="w-full bg-transparent border-none text-lg text-slate-600 leading-relaxed font-normal resize-none outline-none focus:ring-1 focus:ring-primary/10 rounded-xl min-h-[120px]"
                           value={editedTexts.organic.avance}
                           onChange={(e) => handleTextEdit('organic', 'avance', e.target.value)}
                        />
                    </Card>
                  </div>

                  {/* Radiografía del Público */}
                  <div className="space-y-6 pt-12">
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-500" /> Radiografía del Público
                    </h4>
                    {report.analysis.organic.radiografia?.imagen_url && (
                        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm max-w-3xl mx-auto">
                            <img
                              src={report.analysis.organic.radiografia.imagen_url}
                              className="w-full h-auto"
                              alt="Radiografía del Público"
                              onError={(e) => console.error("Error loading image:", report.analysis.organic.radiografia.imagen_url)}
                            />
                        </div>
                    )}
                    <Card className="bg-[#fcfcfd]">
                        <textarea
                           className="w-full bg-transparent border-none text-lg text-slate-600 leading-relaxed font-normal resize-none outline-none focus:ring-1 focus:ring-primary/10 rounded-xl min-h-[120px]"
                           value={editedTexts.organic.radiografia}
                           onChange={(e) => handleTextEdit('organic', 'radiografia', e.target.value)}
                        />
                    </Card>
                  </div>

                  {/* Resumen de Contenido */}
                  <div className="space-y-6 pt-12">
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-500" /> Resumen de Contenido
                    </h4>
                    {report.analysis.organic.resumen?.imagen_url && (
                        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm max-w-3xl mx-auto">
                            <img
                              src={report.analysis.organic.resumen.imagen_url}
                              className="w-full h-auto"
                              alt="Resumen de Contenido"
                              onError={(e) => console.error("Error loading image:", report.analysis.organic.resumen.imagen_url)}
                            />
                        </div>
                    )}
                    <Card className="bg-[#fcfcfd]">
                        <textarea
                           className="w-full bg-transparent border-none text-lg text-slate-600 leading-relaxed font-normal resize-none outline-none focus:ring-1 focus:ring-primary/10 rounded-xl min-h-[120px]"
                           value={editedTexts.organic.resumen}
                           onChange={(e) => handleTextEdit('organic', 'resumen', e.target.value)}
                        />
                    </Card>
                  </div>
               </div>
               )}

               {/* Sección: Performance digital */}
               {report.analysis.performance && (
               <div className="space-y-12 pt-24 border-t border-slate-100">
                  <SectionHeader title="Performance digital (Pauta ADS)" clientLogo={report.client.logoUrl} />

                  {/* Fase 1: Análisis Macro */}
                  <div className="space-y-6">
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Zap className="w-4 h-4 text-cyan-500" /> Rendimiento Macro (Campaña)
                    </h4>
                    {report.analysis.performance.macro?.imagen_url && (
                        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm max-w-4xl mx-auto">
                            <img
                              src={report.analysis.performance.macro.imagen_url}
                              className="w-full h-auto"
                              alt="Rendimiento Macro"
                              onError={(e) => console.error("Error loading image:", report.analysis.performance.macro.imagen_url)}
                            />
                        </div>
                    )}
                    <Card className="bg-[#fcfcfd]">
                        <textarea
                           className="w-full bg-transparent border-none text-lg text-slate-600 leading-relaxed font-normal resize-none outline-none focus:ring-1 focus:ring-primary/10 rounded-xl min-h-[120px]"
                           value={editedTexts.performance.macro}
                           onChange={(e) => handleTextEdit('performance', 'macro', e.target.value)}
                        />
                    </Card>
                  </div>

                  {/* Fase 2: Desglose Micro */}
                  <div className="space-y-6 pt-12">
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Target className="w-4 h-4 text-purple-500" /> Desglose Micro (Anuncios)
                    </h4>
                    {report.analysis.performance.micro?.imagen_url && (
                        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm max-w-4xl mx-auto">
                            <img
                              src={report.analysis.performance.micro.imagen_url}
                              className="w-full h-auto"
                              alt="Desglose Micro"
                              onError={(e) => console.error("Error loading image:", report.analysis.performance.micro.imagen_url)}
                            />
                        </div>
                    )}
                    <Card className="bg-[#fcfcfd]">
                        <textarea
                           className="w-full bg-transparent border-none text-lg text-slate-600 leading-relaxed font-normal resize-none outline-none focus:ring-1 focus:ring-primary/10 rounded-xl min-h-[120px]"
                           value={editedTexts.performance.micro}
                           onChange={(e) => handleTextEdit('performance', 'micro', e.target.value)}
                        />
                    </Card>
                  </div>
               </div>
               )}

               {/* Sección: Hoja de ruta estratégica */}
               {report.analysis.hoja_de_ruta && (
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
               )}

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
