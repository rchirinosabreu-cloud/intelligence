import React, { useState } from 'react';
import { Brain, Loader2, AlertTriangle, CheckCircle, ExternalLink } from '@/components/ui/icons';
import { Button } from './ui/button';
import frontendApiService from '../../../services/frontendApiService';
import { downloadHTML } from '../../../utils/downloadUtils';
import { generateAnalysisPDF } from '../../../utils/pdfExport';
import { generateAnalysisHTML } from '../../../utils/htmlExport';
import { toast } from 'react-hot-toast';
import { ANALYSIS_PROMPT_TEMPLATE } from '../../../utils/promptTemplates';
import { parseJsonFromAiResponse } from '../../../utils/jsonParser';

const CompleteAnalysis = ({ files, content, reportMeta }) => {
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [htmlLoading, setHtmlLoading] = useState(false);
  const sourceTitle = reportMeta?.title || files?.[0]?.title || 'Minuta de reunión';

  const handleGenerate = async () => {
    if ((!files || files.length === 0) && !content) return;
    setLoading(true);
    setError(null);

    try {
       let combinedPrompt = "";

       if (files && files.length > 0) {
           combinedPrompt = await frontendApiService.generateBatchAnalysis(files);
       } else {
           combinedPrompt = content;
       }

       // Use the template from utils
       const prompt = ANALYSIS_PROMPT_TEMPLATE.replace('{{CONTENT}}', combinedPrompt);

      console.log(`[CompleteAnalysis] Sending prompt to OpenAI. Total length: ${prompt.length}`);

      const systemPrompt = `Actúa como un Consultor Estratégico Senior de Brainstudio. Transforma la transcripción en un Análisis Estratégico de alta fidelidad.
Es obligatorio responder en JSON siguiendo estrictamente la estructura solicitada, profundizando en:

1. Temas Clave: Explica el dolor mencionado tras cada punto.
2. Insights Consultivos: Analiza raíces (estrategia vs. ejecución, sobrecarga del dueño, falta de procesos).
3. Observaciones: Detalles sobre la marca, el equipo y la comunicación.
4. Recomendaciones Tácticas: Por cada una (Marca, Operación, Contenido) incluir: Objetivo, Prioridad y Pasos Tácticos numerados.
5. Oportunidades: Qué ganará el negocio con estos cambios.
6. Matriz de Acciones: En el campo action_items, genera una lista detallada con Tarea, Prioridad y Responsable.

REGLA DE ORO: No resumas de forma perezosa. Si se discutieron ejemplos específicos (como el caso "dulce vs salado") o nombres de clientes previos, inclúyelos para dar contexto real.
IMPORTANTE: Respeta exactamente los nombres de campos y la estructura JSON solicitada, incluyendo los objetos dentro de recommendations y opportunities. No devuelvas datos como texto etiquetado. Responde SIEMPRE en Español.`;

      const resultString = await frontendApiService.generateCompletion(prompt, systemPrompt);
      const result = parseJsonFromAiResponse(resultString);
      setAnalysisData(result);

      toast.success("✅ Análisis unificado listo");

    } catch (err) {
      setError(err.message);
      console.error(err);
      toast.error("Error al generar el análisis");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadHTML = async () => {
    if (!analysisData) return;
    const toastId = toast.loading("Preparando reporte HTML...");
    setHtmlLoading(true);
    try {
      const htmlContent = generateAnalysisHTML(analysisData, sourceTitle, reportMeta);
      const filename = `Analisis_BrainStudio_${Date.now()}.html`;
      downloadHTML(htmlContent, filename);
      toast.success("Descargando reporte HTML...", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error al generar el HTML", { id: toastId });
    } finally {
      setHtmlLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!analysisData) return;
    try {
      await generateAnalysisPDF(analysisData, sourceTitle, reportMeta);
      toast.success("Descargando PDF...");
    } catch (err) {
      console.error(err);
      toast.error("Error al generar el PDF");
    }
  };

  return (
    <div className="space-y-4">
      {!analysisData && !loading && (
        <Button
          onClick={handleGenerate}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium h-12 shadow-sm"
        >
          <Brain className="w-4 h-4 mr-2" />
          Generar análisis completo (unificado)
        </Button>
      )}

      {loading && (
        <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-xl border border-border">
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Realizando análisis cruzado de fuentes...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-200 flex items-start gap-3">
           <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
           <div>
             <p className="font-semibold">Error al generar análisis</p>
             <p className="text-sm opacity-80">{error}</p>
             <Button variant="link" onClick={handleGenerate} className="text-red-300 p-0 h-auto mt-2 underline">Reintentar</Button>
           </div>
        </div>
      )}

      {analysisData && !loading && (
         <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-border shadow-md space-y-4">
          <div className="flex flex-col items-center gap-4 text-center pb-4 border-b border-border">
            <div className="bg-muted/50 p-3 rounded-full">
              <CheckCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Análisis estratégico unificado</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Recomendaciones basadas en todas las fuentes.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
               <Button
                onClick={handleDownloadHTML}
                disabled={htmlLoading || loading || !analysisData}
                className="flex-1 bg-muted hover:bg-muted/80 text-foreground border border-border"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {htmlLoading ? 'Generando HTML...' : 'Descargar HTML'}
              </Button>
            </div>
          </div>

          <div className="text-left text-sm text-zinc-700 dark:text-zinc-300 space-y-2">
             <p>
               <strong className="text-primary">Insight:</strong>
               {typeof analysisData?.consulting_insights?.[0] === 'string'
                 ? analysisData.consulting_insights[0].substring(0, 100)
                 : 'Análisis generado'}...
             </p>
            <p><strong className="text-primary">Recomendaciones:</strong> {analysisData?.recommendations?.length || 0} generadas</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompleteAnalysis;
