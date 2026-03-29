import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Card } from '@/components/ui/Card';
import { Users, Activity, Target, Zap, TrendingUp, AlertCircle, ChevronRight, X, Loader2, Sparkles, Filter, Calendar, BarChart3, LayoutGrid, FileText } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ScatterChart, Scatter, ZAxis, LabelList } from 'recharts';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import SlideOver from '@/components/ui/SlideOver';

const CATEGORY_COLORS = {
    'CREATIVO': '#6366f1', // Indigo
    'ESTRATÉGICO': '#8b5cf6', // Violet
    'ADMINISTRATIVO': '#71717a', // Zinc
    'BOMBERO': '#ef4444' // Red
};

const TalentRadar = () => {
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMember, setSelectedMember] = useState(null);
    const queryClient = useQueryClient();

    // 1. Fetch Summary Data
    const { data: summary, isLoading: isLoadingSummary } = useQuery({
        queryKey: ['talent-radar-summary', selectedMonth, selectedYear],
        queryFn: async () => {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.get(`${baseUrl}/api/talent-radar/summary?month=${selectedMonth}&year=${selectedYear}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return res.data;
        },
        refetchInterval: 30000 // Refetch live status every 30s
    });

    // 2. Heatmap Data Processing
    const heatmapData = useMemo(() => {
        if (!summary?.heatmap) return [];
        return Object.entries(summary.heatmap).map(([name, value]) => ({
            name,
            value,
            fill: CATEGORY_COLORS[name] || '#94a3b8'
        }));
    }, [summary?.heatmap]);

    // 3. Nine-Box Data Processing
    const scatterData = useMemo(() => {
        if (!summary?.nineBox) return [];
        return summary.nineBox.map(member => ({
            ...member,
            // X-axis: Velocity (Lower hours is better, so we invert or just plot normally)
            // Y-axis: Quality (Lower returns is better)
            // We'll plot X=Hours, Y=Returns. Best performers are in Bottom-Left.
            // OR: We can normalize to a 1-10 scale for a classic matrix feel.
            x: member.x,
            y: member.y,
            z: member.count // Bubble size
        }));
    }, [summary?.nineBox]);

    // UI Loading State
    if (isLoadingSummary) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
                <p className="text-sm text-zinc-500 font-medium">Cargando Radar de Talento...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 rounded-xl">
                            <Target className="w-5 h-5 text-indigo-500" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                            Radar de Talento & Operaciones
                        </h1>
                    </div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Visualización estratégica del desempeño y carga de la agencia.
                    </p>
                </div>

                <div className="flex items-center gap-2 p-1 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/5 rounded-2xl">
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="bg-transparent border-none text-xs font-bold px-3 py-1.5 focus:ring-0 cursor-pointer"
                    >
                        {Array.from({ length: 12 }, (_, i) => (
                            <option key={i+1} value={i+1}>{format(new Date(2025, i, 1), 'MMMM', { locale: es }).toUpperCase()}</option>
                        ))}
                    </select>
                    <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="bg-transparent border-none text-xs font-bold px-3 py-1.5 focus:ring-0 cursor-pointer"
                    >
                        {[2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {/* --- LIVE STATUS SECTION --- */}
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Equipo en Tiempo Real</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {summary?.liveStatus?.map((member) => {
                        const activeTask = member.nativeTasks?.[0];
                        return (
                            <Card
                                key={member.id}
                                onClick={() => setSelectedMember(member.id)}
                                className="p-4 bg-white/50 dark:bg-zinc-900/40 backdrop-blur-xl border-zinc-200 dark:border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer group"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <TeamAvatar member={member} className="w-10 h-10 border-2 border-white dark:border-zinc-800" />
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm font-bold truncate">{member.name}</span>
                                        <span className="text-[10px] text-zinc-500 truncate">{member.role}</span>
                                    </div>
                                    <div className="ml-auto">
                                        <div className={cn(
                                            "w-2 h-2 rounded-full",
                                            activeTask ? "bg-emerald-500 animate-pulse" : "bg-zinc-300 dark:bg-zinc-700"
                                        )} />
                                    </div>
                                </div>

                                {activeTask ? (
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter flex items-center gap-1">
                                            <Zap className="w-3 h-3 text-amber-500" />
                                            En Curso Ahora:
                                        </p>
                                        <div className="p-2.5 bg-zinc-100 dark:bg-white/5 rounded-xl border border-zinc-200 dark:border-white/5">
                                            <p className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-tight">
                                                {activeTask.title}
                                            </p>
                                            <p className="text-[10px] text-indigo-500 font-medium mt-1">
                                                {activeTask.client?.name}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-[64px] flex items-center justify-center opacity-30">
                                        <p className="text-[10px] italic">Sin tareas activas</p>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            </section>

            {/* --- ANALYTICS GRID --- */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* 1. Heatmap: Agency Capacity */}
                <Card className="lg:col-span-5 p-6 bg-white/50 dark:bg-zinc-900/40 backdrop-blur-xl border-zinc-200 dark:border-white/5">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-sm font-bold">Distribución de Capacidad</h3>
                            <p className="text-[10px] text-zinc-500">¿En qué gasta su tiempo la agencia?</p>
                        </div>
                        <div className="p-2 bg-indigo-500/10 rounded-lg">
                            <BarChart3 className="w-4 h-4 text-indigo-500" />
                        </div>
                    </div>

                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={heatmapData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {heatmapData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} stroke="transparent" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(24, 24, 27, 0.8)',
                                        borderRadius: '12px',
                                        border: 'none',
                                        backdropBlur: '12px',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        color: '#fff'
                                    }}
                                />
                                <Legend
                                    verticalAlign="bottom"
                                    height={36}
                                    iconType="circle"
                                    formatter={(value) => <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* 2. Nine-Box Matrix */}
                <Card className="lg:col-span-7 p-6 bg-white/50 dark:bg-zinc-900/40 backdrop-blur-xl border-zinc-200 dark:border-white/5">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-sm font-bold">Matriz de Desempeño (Nine-Box)</h3>
                            <p className="text-[10px] text-zinc-500">Velocidad (X) vs. Calidad/Devoluciones (Y)</p>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded text-[10px] font-bold">
                            <TrendingUp className="w-3 h-3" />
                            CALIDAD ALTA
                        </div>
                    </div>

                    <div className="h-[280px] w-full relative">
                        {/* Matrix Labels */}
                        <div className="absolute top-0 left-0 text-[9px] font-bold text-zinc-400 opacity-50 uppercase tracking-widest">Estrellas</div>
                        <div className="absolute bottom-10 right-0 text-[9px] font-bold text-zinc-400 opacity-50 uppercase tracking-widest">En Mejora</div>

                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                                <XAxis
                                    type="number"
                                    dataKey="x"
                                    name="Velocidad"
                                    unit="h"
                                    label={{ value: 'Horas Promedio', position: 'insideBottom', offset: -10, fontSize: 9, fontWeight: 'bold', fill: '#94a3b8' }}
                                    fontSize={10}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="y"
                                    name="Calidad"
                                    unit=" dev."
                                    label={{ value: 'Prom. Devoluciones', angle: -90, position: 'insideLeft', fontSize: 9, fontWeight: 'bold', fill: '#94a3b8' }}
                                    fontSize={10}
                                />
                                <Tooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-zinc-900 border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                                                    <p className="text-xs font-bold text-white mb-1">{data.name}</p>
                                                    <p className="text-[10px] text-zinc-400">Velocidad: {data.x.toFixed(1)}h</p>
                                                    <p className="text-[10px] text-zinc-400">Calidad: {data.y.toFixed(1)} dev./tarea</p>
                                                    <p className="text-[10px] text-indigo-400 font-bold mt-1">{data.count} tareas completadas</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Scatter name="Equipo" data={scatterData}>
                                    {scatterData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill="#6366f1" />
                                    ))}
                                    <LabelList dataKey="name" position="top" style={{ fontSize: 9, fill: '#6366f1', fontWeight: 'bold' }} />
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

            </div>

            {/* Member Profile Detail */}
            <MemberRadarDetail
                memberId={selectedMember}
                month={selectedMonth}
                year={selectedYear}
                onClose={() => setSelectedMember(null)}
            />
        </div>
    );
};

const MemberRadarDetail = ({ memberId, month, year, onClose }) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiInsight, setAiInsight] = useState(null);

    const { data: member, isLoading } = useQuery({
        queryKey: ['member-radar-detail', memberId, month, year],
        queryFn: async () => {
            if (!memberId) return null;
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.get(`${baseUrl}/api/talent-radar/member/${memberId}?month=${month}&year=${year}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return res.data;
        },
        enabled: !!memberId
    });

    const generateInsight = async () => {
        setIsGenerating(true);
        setAiInsight(null);
        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.post(`${baseUrl}/api/talent-radar/member/${memberId}/ai-insights`,
                { month, year },
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            setAiInsight(res.data.insight);
            toast.success("Análisis de IA completado");
        } catch (error) {
            console.error("AI Insight failed:", error);
            toast.error("Error al generar análisis con IA");
        } finally {
            setIsGenerating(false);
        }
    };

    const heatmapData = useMemo(() => {
        if (!member?.nativeTasks) return [];
        const stats = member.nativeTasks.reduce((acc, t) => {
            if (t.aiCategory) acc[t.aiCategory] = (acc[t.aiCategory] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(stats).map(([name, value]) => ({
            name, value, fill: CATEGORY_COLORS[name] || '#94a3b8'
        }));
    }, [member]);

    return (
        <SlideOver
            open={!!memberId}
            onOpenChange={(open) => !open && onClose()}
            title={member?.name || 'Cargando...'}
            description={member?.role || 'Perfil de Desempeño'}
            icon={<Users className="w-5 h-5 text-indigo-500" />}
            iconBgColor="bg-indigo-500/10"
        >
            <div className="flex-1 p-6 space-y-8 overflow-y-auto custom-scrollbar">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                ) : (
                    <>
                        {/* Member Stats Overview */}
                        <div className="grid grid-cols-2 gap-4">
                            <Card className="p-4 bg-zinc-50 dark:bg-white/5 border-none">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tareas Completadas</span>
                                <p className="text-2xl font-bold mt-1">{member?.nativeTasks?.length || 0}</p>
                            </Card>
                            <Card className="p-4 bg-zinc-50 dark:bg-white/5 border-none">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Retrabajo Acumulado</span>
                                <p className="text-2xl font-bold mt-1 text-red-500">
                                    {member?.nativeTasks?.reduce((sum, t) => sum + (t.returnCount || 0), 0) || 0}
                                </p>
                            </Card>
                        </div>

                        {/* Personal Capacity Chart */}
                        <div className="space-y-4">
                             <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                <LayoutGrid className="w-3.5 h-3.5" />
                                Mapa de Carga Personal
                             </h4>
                             <div className="h-[200px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={heatmapData}
                                            innerRadius={50}
                                            outerRadius={70}
                                            paddingAngle={4}
                                            dataKey="value"
                                        >
                                            {heatmapData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} stroke="transparent" />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                             </div>
                        </div>

                        {/* AI INSIGHT SECTION */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                                    Insights Ejecutivos (IA)
                                </h4>
                                <button
                                    onClick={generateInsight}
                                    disabled={isGenerating}
                                    className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 rounded-lg text-white text-[10px] font-bold transition-all shadow-lg flex items-center gap-2"
                                >
                                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                    GENERAR ANÁLISIS
                                </button>
                            </div>

                            {aiInsight ? (
                                <div className="p-5 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Sparkles className="w-12 h-12 text-indigo-500" />
                                    </div>
                                    <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed italic">
                                        "{aiInsight}"
                                    </p>
                                    <div className="mt-4 flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] text-white font-bold">B</div>
                                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter">Bria Ops Director</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-10 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center opacity-50">
                                    <Sparkles className="w-8 h-8 text-zinc-300 mb-3" />
                                    <p className="text-[10px] max-w-[200px]">Haz clic en Generar para que Gemini analice las devoluciones del mes.</p>
                                </div>
                            )}
                        </div>

                        {/* Task History List */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" />
                                Historial de Tareas
                            </h4>
                            <div className="space-y-3">
                                {member?.nativeTasks?.map(task => (
                                    <div key={task.id} className="p-3 bg-zinc-50 dark:bg-white/5 rounded-xl border border-zinc-100 dark:border-white/5">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-bold text-indigo-500">{task.client?.name}</span>
                                            {task.returnCount > 0 && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded-full font-bold">
                                                    {task.returnCount} DEVOLUCIONES
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs font-bold truncate">{task.title}</p>
                                        <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
                                            <span className="capitalize">{task.aiCategory || 'Sin clasificar'}</span>
                                            <span className="w-1 h-1 rounded-full bg-zinc-300" />
                                            <span>Complejidad: {task.aiComplexity || '--'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </SlideOver>
    );
};

export default TalentRadar;
