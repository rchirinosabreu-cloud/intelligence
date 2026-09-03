import React, { useState } from 'react';
import { FileText, Loader2, AlertTriangle, CheckCircle, ExternalLink, Download } from '@/components/ui/icons';
import { Button } from './ui/button';
import frontendApiService from '../../../services/frontendApiService';
import { downloadHTML } from '../../../utils/downloadUtils';
import { generateSummaryPDF } from '../../../utils/pdfExport';
import { generateSummaryHTML } from '../../../utils/htmlExport';
import { toast } from 'react-hot-toast';
import { SUMMARY_PROMPT_TEMPLATE } from '../../../utils/promptTemplates';
import { parseJsonFromAiResponse } from '../../../utils/jsonParser';
import { getReportedMeetingDuration } from '../../../utils/meetingDuration';

const GeneralSummary = ({ files, content, reportMeta }) => {
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [htmlLoading, setHtmlLoading] = useState(false);
  const sourceTitle = reportMeta?.title || files?.[0]?.title || 'Minuta de reunión';

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

      console.log(`[GeneralSummary] Sending prompt to OpenAI. Total length: ${prompt.length}`);

      const systemPrompt = `Actúa como un Secretario Ejecutivo de Alta Gerencia. Sintetiza la reunión con foco en ejecución.
Es obligatorio responder en JSON siguiendo estrictamente la estructura solicitada, profundizando en:

1. Participantes: Nombres y roles.
2. Temas Tratados: Lista de puntos de la agenda.
3. Detalles de la Discusión: Puntos de dolor y debates clave (ej. falta de manual de marca o problemas con el equipo).
4. Acuerdos: Decisiones en firme.
5. Acciones: En el campo action_items, genera una lista detallada con Tarea, Prioridad y Responsable.

REGLA DE ORO: No resumas de forma perezosa. Si se discutieron ejemplos específicos (como el caso "dulce vs salado") o nombres de clientes previos, inclúyelos para dar contexto real.
IMPORTANTE: Respeta exactamente los nombres de campos y la estructura JSON solicitada, incluyendo los objetos dentro de action_items. No devuelvas datos como texto etiquetado. Responde SIEMPRE en Español.`;

      const resultString = await frontendApiService.generateCompletion(prompt, systemPrompt);
      const result = parseJsonFromAiResponse(resultString);
      const reportedDuration = getReportedMeetingDuration(files);
      setSummaryData(reportedDuration ? { ...result, meeting_duration: reportedDuration } : result);

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
    const toastId = toast.loading("Preparando reporte HTML...");
    setHtmlLoading(true);
    try {
      const htmlContent = generateSummaryHTML(summaryData, sourceTitle, reportMeta);
      const filename = `Resumen_BrainStudio_${Date.now()}.html`;
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
    if (!summaryData) return;
    try {
      await generateSummaryPDF(summaryData, sourceTitle, reportMeta);
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
        <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-xl border border-border">
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Analizando múltiples fuentes...</p>
        </div>
      )}

      {error && (
        <div className="brain-alert-surface flex items-start gap-3 rounded-xl p-4">
           <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
           <div>
             <p className="font-semibold">Error al generar resumen</p>
             <p className="text-sm opacity-80">{error}</p>
             <Button variant="link" onClick={handleGenerate} className="mt-2 h-auto p-0 text-destructive underline">Reintentar</Button>
           </div>
        </div>
      )}

      {summaryData && !loading && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 border border-border shadow-md space-y-4">
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
              <Button onClick={handleDownloadPDF} disabled={htmlLoading || loading || !summaryData} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground border border-primary">
                <Download className="w-4 h-4 mr-2" />
                Descargar PDF
              </Button>
            </div>
          </div>

          <div className="text-left text-sm text-zinc-700 dark:text-zinc-300 space-y-2">
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
