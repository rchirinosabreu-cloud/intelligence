import React, { lazy, Suspense, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Download } from "@/components/ui/icons";

const PdfDocumentPreview = lazy(
  () => import("@/components/modules/Drive/PdfDocumentPreview"),
);

export default function ChatFilePreview({
  file,
  url,
  data: providedData,
  onClose,
  onDownload,
  downloading,
  // Optional navigation between sibling files (e.g. the evidences of one movement).
  onPrevious,
  onNext,
  position,
}) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      setPreview(null);
      setError("");
      try {
        // The thumbnail already resolved this attachment's ticket, so the
        // viewer shows that same image instead of requesting it again.
        if (file.mimeType.startsWith("image/")) {
          setPreview({ type: "image" });
          return;
        }
        const pdf = file.mimeType === "application/pdf";
        const text = /\.(txt|md|csv|tsv|json|log|xml|yaml|yml)$/i.test(
          file.name,
        );
        if (!pdf && !text) {
          setPreview({ type: "unsupported" });
          return;
        }
        if (file.size > (pdf ? 25 : 2) * 1024 * 1024) {
          setPreview({ type: "large" });
          return;
        }
        // A caller that already holds the bytes (an authenticated download kept
        // in memory) hands them over: no second request, and no blob: fetch,
        // which the production Content-Security-Policy does not allow.
        if (providedData) {
          if (pdf) setPreview({ type: "pdf", data: providedData });
          else
            setPreview({
              type: "text",
              text: new TextDecoder("utf-8").decode(providedData),
            });
          return;
        }
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) {
          const result = await response.json();
          console.error("[TeamChat preview]", result);
          throw new Error(result.error || "No se pudo abrir el archivo.");
        }
        const data = await response.arrayBuffer();
        if (abort.signal.aborted) return;
        if (pdf) setPreview({ type: "pdf", data });
        else
          setPreview({
            type: "text",
            text: new TextDecoder("utf-8").decode(data),
          });
      } catch (e) {
        if (!abort.signal.aborted) {
          console.error("[TeamChat preview]", e.response?.data || e.message);
          setError(e.message);
        }
      }
    };
    load();
    return () => abort.abort();
  }, [url, providedData, file.id, file.name, file.mimeType, file.size]);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="z-[111] flex max-h-[calc(100dvh-2rem)] max-w-4xl flex-col overflow-hidden p-4 text-foreground"
        overlayClassName="z-[110]"
        closeLabel="Cerrar vista previa"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" && onPrevious) onPrevious();
          if (event.key === "ArrowRight" && onNext) onNext();
        }}
      >
        <DialogTitle className="pr-12 text-base leading-6 break-words">
          {file.name}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Vista previa del archivo adjunto.
        </DialogDescription>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted disabled:opacity-50"
            aria-label={`Descargar ${file.name} desde el visor`}
          >
            <Download className="h-4 w-4" /> Descargar
          </button>
          {(onPrevious || onNext) && (
            <div className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
              <button
                type="button"
                onClick={onPrevious}
                disabled={!onPrevious}
                aria-label="Evidencia anterior"
                className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {position && (
                <span aria-live="polite" className="min-w-[4.5rem] text-center tabular-nums">
                  {position.index + 1} de {position.total}
                </span>
              )}
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                aria-label="Evidencia siguiente"
                className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {/* The stage keeps one size whatever the file is; the file fits inside it (Rodny, 2026-09-24). */}
        <div className="flex h-[min(70vh,720px)] min-w-0 flex-col overflow-auto">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!error && !preview && (
            <p role="status" className="text-sm text-muted-foreground">
              Preparando vista previa…
            </p>
          )}
          {preview?.type === "image" && (
            <img
              src={url}
              alt={file.name}
              className="m-auto max-h-full max-w-full rounded object-contain"
            />
          )}
          {preview?.type === "pdf" && (
            <Suspense fallback={<p role="status">Preparando PDF…</p>}>
              <PdfDocumentPreview data={preview.data} name={file.name} />
            </Suspense>
          )}
          {preview?.type === "text" && (
            <pre className="whitespace-pre-wrap break-words text-sm">
              {preview.text}
            </pre>
          )}
          {["unsupported", "large"].includes(preview?.type) && (
            <p className="text-sm text-muted-foreground">
              {preview.type === "large"
                ? "Este archivo es demasiado grande para la vista previa."
                : "Este formato no tiene vista previa en el navegador."}{" "}
              Puedes descargarlo para abrirlo en tu dispositivo.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
