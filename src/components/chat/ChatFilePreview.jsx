import React, { lazy, Suspense, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download } from "@/components/ui/icons";

const PdfDocumentPreview = lazy(
  () => import("@/components/modules/Drive/PdfDocumentPreview"),
);

export default function ChatFilePreview({
  file,
  url,
  onClose,
  onDownload,
  downloading,
}) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      setPreview(null);
      setError("");
      try {
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
  }, [url, file.id, file.name, file.mimeType, file.size]);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="z-[111] flex max-h-[calc(100dvh-2rem)] max-w-4xl flex-col overflow-hidden p-4 text-foreground"
        overlayClassName="z-[110]"
        closeLabel="Cerrar vista previa"
      >
        <DialogTitle className="pr-12 text-base leading-6 break-words">
          {file.name}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Vista previa del archivo adjunto.
        </DialogDescription>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg px-3 text-sm hover:bg-muted disabled:opacity-50"
          aria-label={`Descargar ${file.name} desde el visor`}
        >
          <Download className="h-4 w-4" /> Descargar
        </button>
        <div className="min-h-40 min-w-0 overflow-auto">
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
