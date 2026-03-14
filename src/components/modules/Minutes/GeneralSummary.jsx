import React, { useState } from 'react';
import { FileText, Loader2, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import frontendApiService from '../../../services/frontendApiService';
import { buildSummaryReportContent } from '../../../utils/reportContent';
import { downloadHTML } from '../../../utils/downloadUtils';
import { generateSummaryPDF } from '../../../utils/pdfExport';
import { toast } from 'react-hot-toast';
import { GEMINI_BENTO_PROMPT_TEMPLATE, SUMMARY_PROMPT_TEMPLATE } from '../../../utils/promptTemplates';
import { parseJsonFromAiResponse } from '../../../utils/jsonParser';

const GeneralSummary = ({ files, content, reportMeta }) => {
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [htmlLoading, setHtmlLoading] = useState(false);

  const handleGenerate = async () => {
    // Check inputs
    if ((!files || files.length === 0) && !content) return;

    setLoading(true);
    setError(null);

    try {
      let combinedPrompt = "";

      if (files && files.length > 0) {
          // Use batch helper
          combinedPrompt = await frontendApiService.generateBatchAnalysis(files);
      } else {
          // Fallback to legacy single content string
          combinedPrompt = content;
      }

      // Use the template from utils
      const prompt = SUMMARY_PROMPT_TEMPLATE.replace('{{CONTENT}}', combinedPrompt);

      console.log(`[GeneralSummary] Sending prompt to Gemini. Total length: ${prompt.length}`);

      const systemPrompt = `Actúa como un Secretario Ejecutivo de Alta Gerencia. Sintetiza la reunión con foco en ejecución.
Es obligatorio responder en JSON siguiendo estrictamente la estructura solicitada, profundizando en:

1. Participantes: Nombres y roles.
2. Temas Tratados: Lista de puntos de la agenda.
3. Detalles de la Discusión: Puntos de dolor y debates clave (ej. falta de manual de marca o problemas con el equipo).
4. Acuerdos: Decisiones en firme.
5. Acciones: En el campo action_items, genera una lista detallada con Tarea, Prioridad y Responsable.

REGLA DE ORO: No resumas de forma perezosa. Si se discutieron ejemplos específicos (como el caso "dulce vs salado") o nombres de clientes previos, inclúyelos para dar contexto real.
IMPORTANTE: Todos los valores de los campos JSON deben ser Strings o Arrays de Strings. Prohibido usar objetos anidados dentro de los campos. Responde SIEMPRE en Español.`;

      const resultString = await frontendApiService.generateGeminiCompletion(prompt, systemPrompt);
      const result = parseJsonFromAiResponse(resultString);
      setSummaryData(result);

      toast.success("✅ Resumen unificado listo");

    } catch (err) {
      setError(err.message);
      console.error(err);
      toast.error("Error al generar el resumen");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadHTML = async () => {
    if (!summaryData) return;
    const toastId = toast.loading("Generando HTML con Gemini...");
    setHtmlLoading(true);
    try {
      const reportContent = buildSummaryReportContent(summaryData, reportMeta);
      const prompt = GEMINI_BENTO_PROMPT_TEMPLATE.replace('{{CONTENT}}', reportContent);
      const htmlContent = await frontendApiService.generateGeminiHtmlReport(prompt);
      const filename = `Resumen_BrainStudio_${Date.now()}.html`;
      downloadHTML(htmlContent, filename);
      toast.success("Descargando reporte HTML...", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error al generar el HTML con Gemini", { id: toastId });
    } finally {
      setHtmlLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!summaryData) return;
    try {
      generateSummaryPDF(summaryData, sourceTitle, reportMeta);
      toast.success("Descargando PDF...");
    } catch (err) {
      console.error(err);
      toast.error("Error al generar el PDF");
    }
  };

  return (
    <div className="space-y-4">
      {!summaryData && !loading && (
        <Button
          onClick={handleGenerate}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium h-12 shadow-sm"
        >
          <FileText className="w-4 h-4 mr-2" />
          Generar resumen general (unificado)
        </Button>
      )}

      {loading && (
        <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-lg border border-border">
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Analizando múltiples fuentes...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-200 flex items-start gap-3">
           <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
           <div>
             <p className="font-semibold">Error al generar resumen</p>
             <p className="text-sm opacity-80">{error}</p>
             <Button variant="link" onClick={handleGenerate} className="text-red-300 p-0 h-auto mt-2 underline">Reintentar</Button>
           </div>
        </div>
      )}

      {summaryData && !loading && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg p-6 border border-border shadow-md space-y-4">
          <div className="flex flex-col items-center gap-4 text-center pb-4 border-b border-border">
            <div className="bg-green-500/10 p-3 rounded-full">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Resumen unificado</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Datos integrados correctamente.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
               <Button
                onClick={handleDownloadHTML}
                disabled={htmlLoading || loading || !summaryData}
                className="flex-1 bg-muted hover:bg-muted/80 text-foreground border border-border"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {htmlLoading ? 'Generando HTML...' : 'Descargar HTML'}
              </Button>
            </div>
          </div>

          <div className="text-left text-sm text-gray-300 space-y-2">
            <p><strong className="text-muted-foreground">Temas:</strong> {summaryData.meeting_topics?.join(", ")}</p>
            {summaryData.participants?.length > 0 && (
                 <p><strong className="text-muted-foreground">Participantes:</strong> {summaryData.participants.length}</p>
            )}
            {summaryData.meeting_duration && (
                 <p><strong className="text-muted-foreground">Duración:</strong> {summaryData.meeting_duration}</p>
            )}
            {summaryData.agreements?.length > 0 && (
                 <p><strong className="text-muted-foreground">Acuerdos:</strong> {summaryData.agreements.length} identificados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneralSummary;
