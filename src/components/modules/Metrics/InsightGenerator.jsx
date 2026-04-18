import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, RefreshCw, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const InsightGenerator = ({ clientId, metrics }) => {
    const [loading, setLoading] = useState(false);
    const [insight, setInsight] = useState(null);

    const generateInsights = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/insights/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ clientId, metrics })
            });
            const data = await res.json();
            if (res.ok) {
                setInsight(data.insight);
                toast.success('Insights generados correctamente');
            } else {
                toast.error(data.error || 'Error al generar insights');
            }
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error de red al conectar con la IA');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="p-6 md:p-8 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-none">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-600/10 rounded-xl">
                            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Generador de Insights con IA</h3>
                            <p className="text-xs text-zinc-500">Bria analiza tus métricas y redacta recomendaciones estratégicas.</p>
                        </div>
                    </div>
                    <Button
                        onClick={generateInsights}
                        disabled={loading || !metrics}
                        className="bg-primary hover:bg-primary/90 text-white gap-2 transition-all shadow-sm"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {insight ? 'Refrescar Análisis' : 'Generar con IA'}
                    </Button>
                </div>

                {!insight && !loading && (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                        <div className="w-16 h-16 bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-100 dark:border-zinc-800">
                            <Send className="w-6 h-6 text-zinc-400" />
                        </div>
                        <p className="text-sm text-zinc-500 max-w-xs">
                            Haz clic en el botón para que Bria analice el rendimiento del mes y genere conclusiones.
                        </p>
                    </div>
                )}

                {loading && (
                    <div className="py-20 flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                        <p className="text-sm font-medium text-indigo-600 animate-pulse">Analizando métricas y detectando patrones...</p>
                    </div>
                )}
            </Card>

            {insight && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Logros y Avances */}
                    <Card className="p-6 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-none">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            🚀 Logros y Avances
                        </h4>
                        <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400">
                            <ReactMarkdown>{insight.logros}</ReactMarkdown>
                        </div>
                    </Card>

                    {/* Recomendaciones Estratégicas */}
                    <Card className="p-6 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-none">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                            💡 Recomendaciones Estratégicas
                        </h4>
                        <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400">
                            <ReactMarkdown>{insight.recomendaciones}</ReactMarkdown>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default InsightGenerator;
