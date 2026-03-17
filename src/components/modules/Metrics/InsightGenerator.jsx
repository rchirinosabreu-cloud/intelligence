import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, RefreshCw, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const InsightGenerator = ({ clientId, metrics }) => {
    const [loading, setLoading] = useState(false);
    const [insight, setInsight] = useState('');

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
        <Card className="p-6 md:p-8 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
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
                    className="bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white gap-2 transition-all"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {insight ? 'Refrescar Análisis' : 'Generar con IA'}
                </Button>
            </div>

            {!insight && !loading && (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                    <div className="w-16 h-16 bg-white dark:bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-100 dark:border-zinc-800">
                        <Send className="w-6 h-6 text-indigo-400" />
                    </div>
                    <p className="text-sm text-zinc-500 max-w-xs">
                        Haz clic en el botón para que Bria analice el rendimiento del mes y genere conclusiones.
                    </p>
                </div>
            )}

            {loading && !insight && (
                <div className="py-20 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                    <p className="text-sm font-medium text-indigo-600 animate-pulse">Analizando métricas y detectando patrones...</p>
                </div>
            )}

            {insight && (
                <div className={`prose prose-zinc dark:prose-invert max-w-none transition-opacity duration-500 ${loading ? 'opacity-50' : 'opacity-100'}`}>
                    <ReactMarkdown>{insight}</ReactMarkdown>
                </div>
            )}
        </Card>
    );
};

export default InsightGenerator;
