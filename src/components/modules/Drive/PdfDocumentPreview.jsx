import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2 } from '@/components/ui/icons';

const PDF_WORKER_URL = '/pdf.worker.min.js';

const PdfPage = ({ document, pageNumber, name }) => {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let renderTask = null;

    const render = async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (!active || !canvasRef.current) return;

        const viewport = page.getViewport({ scale: 1.75 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (renderError) {
        if (active && renderError?.name !== 'RenderingCancelledException') {
          console.error('[Drive] Error renderizando página de PDF:', renderError);
          setError('No fue posible renderizar esta página.');
        }
      }
    };

    render();
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber]);

  if (error) {
    return <div className="flex min-h-64 items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>;
  }

  return (
    <figure className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700">
      <canvas
        ref={canvasRef}
        aria-label={`${name || 'Documento PDF'}, página ${pageNumber}`}
        className="block h-auto w-full bg-white"
      />
      <figcaption className="sr-only">Página {pageNumber} de {name || 'documento PDF'}</figcaption>
    </figure>
  );
};

const PdfDocumentPreview = ({ data, name }) => {
  const [document, setDocument] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let loadingTask = null;
    let loadedDocument = null;

    const load = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
        loadedDocument = await loadingTask.promise;
        if (active) setDocument(loadedDocument);
      } catch (loadError) {
        if (active && loadError?.name !== 'AbortException') {
          console.error('[Drive] Error cargando PDF:', loadError);
          setError({
            message: 'No fue posible visualizar este PDF. Puedes descargarlo para abrirlo en tu dispositivo.',
            technical: loadError?.message || String(loadError)
          });
        }
      }
    };

    setDocument(null);
    setError(null);
    load();

    return () => {
      active = false;
      if (loadedDocument) loadedDocument.destroy();
      else loadingTask?.destroy();
    };
  }, [data]);

  if (error) {
    return (
      <div role="alert" className="mx-auto flex min-h-72 max-w-2xl flex-col items-center justify-center rounded-2xl border border-red-200 bg-white p-6 text-center dark:border-red-900/60 dark:bg-zinc-950">
        <AlertCircle className="h-9 w-9 text-red-500" />
        <p className="mt-3 font-medium text-zinc-900 dark:text-zinc-100">Vista previa no disponible</p>
        <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{error.message}</p>
        {import.meta.env.DEV && <code className="mt-3 max-w-full break-words text-xs text-zinc-400">{error.technical}</code>}
      </div>
    );
  }

  if (!document) {
    return <div aria-live="polite" className="flex min-h-72 items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" /> Preparando PDF...</div>;
  }

  return (
    <section aria-label={`Vista previa de ${name || 'documento PDF'}`} className="mx-auto w-full max-w-5xl">
      <div aria-live="polite" className="sticky top-0 z-10 mb-4 flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-4 py-2 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/95 dark:text-zinc-300">
        <FileText className="h-4 w-4" /> {document.numPages} {document.numPages === 1 ? 'página' : 'páginas'}
      </div>
      <div className="space-y-4 sm:space-y-6">
        {Array.from({ length: document.numPages }, (_, index) => (
          <PdfPage key={index + 1} document={document} pageNumber={index + 1} name={name} />
        ))}
      </div>
    </section>
  );
};

export default PdfDocumentPreview;
