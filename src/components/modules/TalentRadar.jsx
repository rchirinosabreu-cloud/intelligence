import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Card } from '@/components/ui/Card';
import { Users, Activity, Target, Zap, TrendingUp, AlertCircle, ChevronRight, X, Loader2, Sparkles, Filter, Calendar, BarChart3, LayoutGrid, FileText, Camera, Upload, Radar } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ScatterChart, Scatter, ZAxis, LabelList } from 'recharts';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import SlideOver from '@/components/ui/SlideOver';
import { useAuth } from '@/context/AuthContext';
import AvatarUploader from './Radar/AvatarUploader';
import ClientLogo from '@/components/ui/ClientLogo';

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
    const [hoveredMemberId, setHoveredMemberId] = useState(null);
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
        refetchInterval: localStorage.getItem("authToken") ? 30000 : false // Refetch live status every 30s
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

    // 3. Nine-Box Data Processing with Jitter
    const scatterData = useMemo(() => {
        if (!summary?.nineBox) return [];

        // Use a simple seeded-style jitter based on member ID to keep positions consistent
        const getJitter = (id) => {
            const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return (hash % 10 - 5) / 40; // Small offset between -0.125 and 0.125
        };

        return summary.nineBox.map(member => ({
            ...member,
            x: member.x + getJitter(member.id),
            y: member.y + getJitter(member.id + 'y'),
            z: member.count
        }));
    }, [summary?.nineBox]);

    // UI Loading State
    if (isLoadingSummary) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
                <p className="text-sm text-zinc-500 font-medium">Cargando Radar de Talento...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <PageHeader
                title="Radar de Talento & Operaciones"
                subtitle="Visualización estratégica del desempeño y carga de la agencia."

            >
                <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-white/5">
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest px-3 py-1.5 focus:ring-0 cursor-pointer"
                    >
                        {Array.from({ length: 12 }, (_, i) => (
                            <option key={i+1} value={i+1}>{format(new Date(2025, i, 1), 'MMMM', { locale: es }).toUpperCase()}</option>
                        ))}
                    </select>
                    <div className="w-px h-4 bg-zinc-200 dark:bg-white/10 mx-1" />
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest px-3 py-1.5 focus:ring-0 cursor-pointer"
                    >
                        {[2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </PageHeader>

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
                                className="p-4 bg-white/50 dark:bg-zinc-900/40 backdrop-blur-xl border-zinc-200 dark:border-white/5 hover:border-indigo-600/30 transition-all cursor-pointer group"
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
                                            <p className="text-[10px] text-indigo-600 font-medium mt-1">
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
                        <div className="p-2 bg-indigo-600/10 rounded-xl">
                            <BarChart3 className="w-4 h-4 text-indigo-600" />
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
                                        backgroundColor: '#fff',
                                        borderRadius: '16px',
                                        border: '1px solid #f4f4f5',
                                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        color: '#18181b'
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
                        <div className="absolute top-2 right-4 text-[8px] font-black text-indigo-600/40 uppercase tracking-[0.2em]">Súper Estrellas</div>
                        <div className="absolute top-2 left-4 text-[8px] font-black text-zinc-400/40 uppercase tracking-[0.2em]">Promesas</div>
                        <div className="absolute bottom-12 right-4 text-[8px] font-black text-zinc-400/40 uppercase tracking-[0.2em]">Ejecutores</div>
                        <div className="absolute bottom-12 left-4 text-[8px] font-black text-red-500/30 uppercase tracking-[0.2em]">En Riesgo</div>

                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                                <XAxis
                                    type="number"
                                    dataKey="x"
                                    name="Complejidad"
                                    domain={[0.5, 3.5]}
                                    ticks={[1, 2, 3]}
                                    label={{ value: 'Complejidad Promedio', position: 'insideBottom', offset: -10, fontSize: 9, fontWeight: 'bold', fill: '#94a3b8' }}
                                    fontSize={10}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="y"
                                    name="Calidad"
                                    unit=" dev."
                                    domain={[0, 'auto']}
                                    label={{ value: 'Prom. Devoluciones', angle: -90, position: 'insideLeft', fontSize: 9, fontWeight: 'bold', fill: '#94a3b8' }}
                                    fontSize={10}
                                />
                                <Tooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white/95 backdrop-blur-md border border-zinc-100 dark:border-white/10 p-4 rounded-2xl shadow-2xl">
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <TeamAvatar member={data} className="w-8 h-8" />
                                                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{data.name}</p>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Nivel de Desafío</span>
                                                            <span className="text-[10px] text-zinc-900 dark:text-zinc-100 font-black">{data.x.toFixed(1)}</span>
                                                        </div>
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Índice de Precisión</span>
                                                            <span className="text-[10px] text-zinc-900 dark:text-zinc-100 font-black">{data.y.toFixed(1)} dev.</span>
                                                        </div>
                                                        <div className="pt-2 border-t border-zinc-100 dark:border-white/5 mt-2">
                                                            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">
                                                                {data.count} tareas completadas este periodo
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                {/* Custom Grid Lines for 3x3 */}
                                <line x1="33.3%" y1="0" x2="33.3%" y2="100%" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                                <line x1="66.6%" y1="0" x2="66.6%" y2="100%" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                                <line x1="0" y1="33.3%" x2="100%" y2="33.3%" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />
                                <line x1="0" y1="66.6%" x2="100%" y2="66.6%" stroke="rgba(0,0,0,0.05)" strokeDasharray="3 3" />

                                <Scatter
                                    name="Equipo"
                                    data={scatterData}
                                    onMouseEnter={(data) => setHoveredMemberId(data.id)}
                                    onMouseLeave={() => setHoveredMemberId(null)}
                                    shape={(props) => {
                                        const { cx, cy, payload } = props;
                                        const isHovered = hoveredMemberId === payload.id;

                                        // Determine quadrant for glow color
                                        // x: 0.5-3.5 (mid 2.0), y: returns (mid depends on data, let's say 1.0)
                                        let glowColor = "rgba(99, 102, 241, 0.5)"; // Default Indigo
                                        if (payload.x > 2.0 && payload.y < 0.5) glowColor = "rgba(16, 185, 129, 0.6)"; // Super Star (Green)
                                        if (payload.y > 1.5) glowColor = "rgba(239, 68, 68, 0.5)"; // At Risk (Red)

                                        return (
                                            <g
                                                transform={`translate(${cx},${cy}) scale(${isHovered ? 1.2 : 1}) translate(-15,-15)`}
                                                style={{
                                                    transition: 'all 0.2s ease-out',
                                                    cursor: 'pointer',
                                                    filter: isHovered ? `drop-shadow(0 0 8px ${glowColor})` : 'none'
                                                }}
                                            >
                                                <defs>
                                                    <clipPath id={`clip-${payload.id}`}>
                                                        <circle cx="15" cy="15" r="15" />
                                                    </clipPath>
                                                </defs>
                                                <circle
                                                    cx="15" cy="15" r="16"
                                                    fill="#fff"
                                                    stroke={isHovered ? glowColor.replace('0.5', '1').replace('0.6', '1') : "#6366f1"}
                                                    strokeWidth={isHovered ? "3" : "2"}
                                                />
                                                {payload.avatarUrl ? (
                                                    <image
                                                        xlinkHref={payload.avatarUrl}
                                                        width="30"
                                                        height="30"
                                                        clipPath={`url(#clip-${payload.id})`}
                                                        preserveAspectRatio="xMidYMid slice"
                                                    />
                                                ) : (
                                                    <>
                                                        <circle cx="15" cy="15" r="15" fill="#6366f1" />
                                                        <text
                                                            x="15" y="15"
                                                            textAnchor="middle"
                                                            dominantBaseline="central"
                                                            fill="#fff"
                                                            fontSize="8"
                                                            fontWeight="bold"
                                                        >
                                                            {payload.name?.substring(0, 2).toUpperCase()}
                                                        </text>
                                                    </>
                                                )}
                                            </g>
                                        );
                                    }}
                                />
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
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.role === 'ADMIN';
    const [activeTab, setActiveTab] = useState('profile');
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiInsights, setAiInsights] = useState({}); // Isolate insights by member ID

    // Reset state on close/change
    useEffect(() => {
        setIsGenerating(false);
        setActiveTab('profile');
    }, [memberId]);

    const aiInsight = memberId ? aiInsights[memberId] : null;

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
        setAiInsights(prev => ({ ...prev, [memberId]: null }));

        try {
            const baseUrl = getApiBaseUrl();
            const token = localStorage.getItem('authToken');
            const res = await axios.post(`${baseUrl}/api/talent-radar/member/${memberId}/ai-insights`,
                { month, year },
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            setAiInsights(prev => ({ ...prev, [memberId]: res.data.insight }));
            toast.success("Análisis de IA completado");
        } catch (error) {
            console.error("AI Insight failed:", error);
            toast.error("Error al generar análisis con IA");
        } finally {
            setIsGenerating(false);
        }
    };

    const { heatmapData, topImpactTasks } = useMemo(() => {
        if (!member?.nativeTasks) return { heatmapData: [], topImpactTasks: [] };

        const stats = member.nativeTasks.reduce((acc, t) => {
            if (t.aiCategory) acc[t.aiCategory] = (acc[t.aiCategory] || 0) + 1;
            return acc;
        }, {});

        const heatmap = Object.entries(stats).map(([name, value]) => ({
            name, value, fill: CATEGORY_COLORS[name] || '#94a3b8'
        }));

        const complexityOrder = { 'ALTA': 3, 'MEDIA': 2, 'BAJA': 1 };
        const top5 = [...member.nativeTasks]
            .sort((a, b) => {
                const compA = complexityOrder[a.aiComplexity] || 0;
                const compB = complexityOrder[b.aiComplexity] || 0;
                if (compB !== compA) return compB - compA;
                return (b.returnCount || 0) - (a.returnCount || 0);
            })
            .slice(0, 5);

        return { heatmapData: heatmap, topImpactTasks: top5 };
    }, [member]);

    return (
        <SlideOver
            open={!!memberId}
            onOpenChange={(open) => !open && onClose()}
            title={member?.name || 'Cargando...'}
            description={member?.role || 'Perfil de Talento'}

            iconBgColor="bg-indigo-600/10"
        >
            <div className="flex flex-col h-full overflow-hidden">
                {/* Tabs Header */}
                {isAdmin && (
                    <div className="flex items-center px-6 border-b border-zinc-100 dark:border-white/5">
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={cn(
                                "py-3 px-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2",
                                activeTab === 'profile' ? "text-indigo-600 border-indigo-600" : "text-zinc-400 border-transparent hover:text-zinc-600"
                            )}
                        >
                            Info Pública
                        </button>
                        <button
                            onClick={() => setActiveTab('performance')}
                            className={cn(
                                "py-3 px-4 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2",
                                activeTab === 'performance' ? "text-indigo-600 border-indigo-600" : "text-zinc-400 border-transparent hover:text-zinc-600"
                            )}
                        >
                            Desempeño
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                        </div>
                    ) : activeTab === 'profile' ? (
                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                            <AvatarUploader member={member} memberId={memberId} />
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in slide-in-from-left-4 duration-300">
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
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: '#fff',
                                                    borderRadius: '12px',
                                                    border: '1px solid #f4f4f5',
                                                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    color: '#18181b'
                                                }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* AI INSIGHT SECTION */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                        Insights Ejecutivos (IA)
                                    </h4>
                                    <button
                                        onClick={generateInsight}
                                        disabled={isGenerating}
                                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-600 disabled:opacity-50 rounded-xl text-white text-[10px] font-bold transition-all shadow-lg flex items-center gap-2"
                                    >
                                        {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                        GENERAR ANÁLISIS
                                    </button>
                                </div>

                                {aiInsight ? (
                                    <div className="p-5 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Sparkles className="w-12 h-12 text-indigo-600" />
                                        </div>
                                        <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed italic">
                                            "{aiInsight}"
                                        </p>
                                        <div className="mt-4 flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white font-bold">B</div>
                                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-tighter">Brain Core Ops Director</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-10 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center opacity-50">
                                        <Sparkles className="w-8 h-8 text-zinc-300 mb-3" />
                                        <p className="text-[10px] max-w-[200px]">Haz clic en Generar para que Gemini analice las devoluciones del mes.</p>
                                    </div>
                                )}
                            </div>

                            {/* Top 5 Impact Tasks */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                        <FileText className="w-3.5 h-3.5" />
                                        Top 5 Impacto del Mes
                                    </h4>
                                    <span className="text-[10px] font-bold text-zinc-400 italic">Ordenado por relevancia</span>
                                </div>
                                <div className="space-y-3">
                                    {topImpactTasks?.map(task => (
                                        <div key={task.id} className="p-3 bg-white dark:bg-white/5 rounded-2xl border border-zinc-100 dark:border-white/5 shadow-sm">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <ClientLogo client={task.client} className="w-4 h-4 rounded" />
                                                    <span className="text-[10px] font-bold text-indigo-600">{task.client?.name}</span>
                                                </div>
                                                {task.returnCount > 0 && (
                                                    <span className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded-full font-bold">
                                                        {task.returnCount} DEVOLUCIONES
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs font-bold truncate">{task.title}</p>
                                            <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        task.aiComplexity === 'ALTA' ? 'bg-amber-500' : task.aiComplexity === 'MEDIA' ? 'bg-indigo-600' : 'bg-emerald-500'
                                                    )} />
                                                    <span>{task.aiComplexity}</span>
                                                </div>
                                                <span className="w-1 h-1 rounded-full bg-zinc-200" />
                                                <span className="capitalize">{task.aiCategory?.toLowerCase() || 'Sin clasificar'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </SlideOver>
    );
};


export default TalentRadar;
