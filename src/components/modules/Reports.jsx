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
  Sparkles
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
  const [files, setFiles] = useState({
    organic: null,
    ads: null,
    logo: null
  });
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

  const handleFileChange = (type, e) => {
    const file = e.target.files[0];
    if (file) {
      setFiles(prev => ({ ...prev, [type]: file }));
    }
  };

  const generateReport = async () => {
    if (!selectedClientId) {
      toast.error('Por favor selecciona un cliente');
      return;
    }
    if (!files.organic && !files.ads) {
      toast.error('Carga al menos un archivo de datos (Orgánico o Ads)');
      return;
    }

    setIsGenerating(true);
    setReport(null);

    const formData = new FormData();
    formData.append('clientId', selectedClientId);
    if (files.organic) formData.append('organic', files.organic);
    if (files.ads) formData.append('ads', files.ads);
    if (files.logo) formData.append('logo', files.logo);

    try {
      const response = await axios.post(`${getApiBaseUrl()}/api/reports/generate`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      setReport(response.data);
      toast.success('Reporte generado con éxito');
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
        backgroundColor: '#09090b' // zinc-950
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`Reporte_Estrategico_${report.client.name}_${new Date().toLocaleDateString()}.pdf`);
      toast.success('PDF descargado', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar PDF', { id: toastId });
    }
  };

  const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Reportes Inteligentes
          </h1>
          <p className="text-zinc-400 mt-1">Analítica estratégica potenciada por Gemini 2.5 Pro</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-primary text-sm font-medium">
          <TrendingUp className="w-4 h-4" />
          <span>Analista Senior Activo</span>
        </div>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Config */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Configuración
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Cliente</label>
                <select
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/50 transition-all text-zinc-100"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  <option value="">Selecciona un cliente</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Logo del Cliente (Opcional)</label>
                <div className="relative group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange('logo', e)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className="flex items-center justify-between bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 group-hover:border-primary/50 transition-all">
                    <span className="text-sm truncate">
                      {files.logo ? files.logo.name : 'Subir nuevo logo'}
                    </span>
                    <Upload className="w-4 h-4 text-zinc-400 group-hover:text-primary" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileBarChart className="w-5 h-5 text-primary" />
              Fuentes de Datos
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Datos Orgánicos (RRSS)</label>
                <div className="relative group">
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={(e) => handleFileChange('organic', e)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className={cn(
                    "flex items-center justify-between border rounded-xl px-4 py-3 transition-all",
                    files.organic ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-zinc-800 border-white/10 text-zinc-100 group-hover:border-primary/50"
                  )}>
                    <span className="text-sm truncate">
                      {files.organic ? files.organic.name : 'Cargar .csv o .xlsx'}
                    </span>
                    {files.organic ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4 text-zinc-400 group-hover:text-primary" />}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Datos de Pauta (Ads)</label>
                <div className="relative group">
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={(e) => handleFileChange('ads', e)}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  <div className={cn(
                    "flex items-center justify-between border rounded-xl px-4 py-3 transition-all",
                    files.ads ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400" : "bg-zinc-800 border-white/10 text-zinc-100 group-hover:border-primary/50"
                  )}>
                    <span className="text-sm truncate">
                      {files.ads ? files.ads.name : 'Cargar .csv o .xlsx'}
                    </span>
                    {files.ads ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4 text-zinc-400 group-hover:text-primary" />}
                  </div>
                </div>
              </div>

              <button
                onClick={generateReport}
                disabled={isGenerating}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Analizando Datos...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Generar Reporte Estratégico</span>
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
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6"
              >
                {/* PDF Toolbar */}
                <div className="flex justify-end">
                  <button
                    onClick={downloadPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-xl text-sm font-medium transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Descargar PDF
                  </button>
                </div>

                {/* Report Content */}
                <div
                  ref={reportRef}
                  className="bg-zinc-900 border border-white/10 rounded-3xl p-8 md:p-12 space-y-12 shadow-2xl relative overflow-hidden"
                >
                  {/* Decorative backgrounds */}
                  <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />

                  {/* Portada */}
                  <div className="flex flex-col items-center text-center space-y-8 relative py-12">
                    <div className="w-32 h-32 md:w-48 md:h-48 relative group">
                      <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                      <img
                        src={report.client.logoUrl || '/brainstudio-logo.png'}
                        alt={report.client.name}
                        className="w-full h-full object-contain relative z-10"
                      />
                    </div>
                    <div className="space-y-4">
                      <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
                        Reporte <span className="text-primary">Estratégico</span>
                      </h2>
                      <div className="flex items-center justify-center gap-3 text-zinc-400 font-medium">
                        <span className="uppercase tracking-widest">{report.client.name}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                        <span className="uppercase tracking-widest">{new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Narrativa Estratégica */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
                    <div className="md:col-span-2 space-y-6">
                      <h3 className="text-2xl font-bold flex items-center gap-3 text-zinc-100">
                        <Sparkles className="w-6 h-6 text-primary" />
                        Análisis del Director
                      </h3>
                      <p className="text-lg text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {report.analysis.narrative}
                      </p>
                    </div>

                    <div className="space-y-6">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Hallazgos Clave</h3>
                      <ul className="space-y-4">
                        {report.analysis.keyTakeaways.map((item, i) => (
                          <li key={i} className="flex gap-3 text-zinc-400 group">
                            <ArrowRight className="w-5 h-5 text-primary shrink-0 group-hover:translate-x-1 transition-transform" />
                            <span className="text-sm leading-snug">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Gráficas de Orgánico */}
                  {report.analysis.metrics.organic && (
                    <div className="space-y-8 pt-12 border-t border-white/5">
                      <h3 className="text-xl font-bold flex items-center gap-3">
                        <BarChart3 className="w-5 h-5 text-emerald-400" />
                        Rendimiento Orgánico
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-zinc-800/30 border border-white/5 rounded-2xl p-6 h-[300px]">
                          <p className="text-sm text-zinc-500 mb-4 uppercase tracking-wider font-bold">Crecimiento de Seguidores</p>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={report.analysis.metrics.organic.followers}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                itemStyle={{ color: '#8b5cf6' }}
                              />
                              <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="bg-zinc-800/30 border border-white/5 rounded-2xl p-6 h-[300px]">
                          <p className="text-sm text-zinc-500 mb-4 uppercase tracking-wider font-bold">Interacciones Totales</p>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={report.analysis.metrics.organic.interactions}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                itemStyle={{ color: '#10b981' }}
                              />
                              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Gráficas de Ads */}
                  {report.analysis.metrics.ads && (
                    <div className="space-y-8 pt-12 border-t border-white/5">
                      <h3 className="text-xl font-bold flex items-center gap-3">
                        <PieChart className="w-5 h-5 text-cyan-400" />
                        Inversión y Resultados (Ads)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-zinc-800/30 border border-white/5 rounded-2xl p-6 h-[300px]">
                          <p className="text-sm text-zinc-500 mb-4 uppercase tracking-wider font-bold">Distribución de Inversión</p>
                          <ResponsiveContainer width="100%" height="100%">
                            <RePieChart>
                              <Pie
                                data={report.analysis.metrics.ads.distribution}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {report.analysis.metrics.ads.distribution.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                              />
                              <Legend />
                            </RePieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="bg-zinc-800/30 border border-white/5 rounded-2xl p-6 h-[300px] flex flex-col">
                          <p className="text-sm text-zinc-500 mb-6 uppercase tracking-wider font-bold">Embudo de Conversión</p>
                          <div className="flex-1 flex flex-col justify-center space-y-4">
                            {report.analysis.metrics.ads.funnel.map((step, i) => (
                              <div key={i} className="space-y-1">
                                <div className="flex justify-between text-xs text-zinc-400 px-1">
                                  <span>{step.stage}</span>
                                  <span>{step.value.toLocaleString()}</span>
                                </div>
                                <div className="h-4 w-full bg-zinc-800 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(step.value / report.analysis.metrics.ads.funnel[0].value) * 100}%` }}
                                    className="h-full bg-gradient-to-r from-cyan-500 to-primary rounded-full"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Próximos Pasos */}
                  <div className="pt-12 border-t border-white/5">
                    <div className="bg-primary/10 border border-primary/20 rounded-3xl p-8 space-y-4">
                      <h3 className="text-xl font-bold text-primary flex items-center gap-2">
                        <TrendingUp className="w-6 h-6" />
                        Estrategia del Próximo Mes
                      </h3>
                      <p className="text-zinc-300 leading-relaxed">
                        {report.analysis.nextSteps}
                      </p>
                    </div>
                  </div>

                  {/* Footer Logo */}
                  <div className="flex justify-center pt-12 border-t border-white/5">
                    <img src="/brainstudio-logo.png" alt="Brainstudio" className="w-8 opacity-30 grayscale" />
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-[600px] bg-zinc-900/30 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center text-center p-12 space-y-4">
                <div className="w-20 h-20 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4">
                  <BarChart3 className="w-10 h-10 text-zinc-700" />
                </div>
                <h3 className="text-xl font-semibold text-zinc-400">Esperando Datos de Análisis</h3>
                <p className="text-zinc-500 max-w-sm">
                  Configura el cliente y carga los archivos de métricas para que Gemini 2.5 Pro genere el reporte estratégico.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Reports;
