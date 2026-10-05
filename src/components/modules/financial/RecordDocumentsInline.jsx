import React, { useRef, useState } from 'react';
import ChatFilePreview from '@/components/chat/ChatFilePreview';
import { FileText, Loader2, Paperclip } from '@/components/ui/icons';
import { FINANCIAL_DOCUMENT_ACCEPT, fetchRecordDocumentBlob, financialDocumentProblem, uploadRecordDocument } from '@/lib/financialDocumentsClient';

/**
 * Los comprobantes de un movimiento, en una línea: cada uno se abre con el visor de la
 * plataforma y «Subir comprobante» añade otro. Lo usan Nómina, Cartera y Movimientos (Elisa, 5 de
 * octubre de 2026: «registré un ingreso de SunPartners desde cartera pero no se puede adjuntar el
 * comprobante»). `onChanged` recibe el mensaje después de que el servidor confirme la subida.
 */
export default function RecordDocumentsInline({ recordId, documents = [], canWrite, onChanged, onError, className = '' }) {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState(null);
    const input = useRef(null);
    if (!recordId) return null;

    const closePreview = () => setPreview((current) => { if (current?.url) URL.revokeObjectURL(current.url); return null; });

    const open = async (document, download = false) => {
        try {
            const blob = await fetchRecordDocumentBlob(recordId, document);
            const url = URL.createObjectURL(blob);
            if (download) {
                const anchor = window.document.createElement('a');
                anchor.href = url;
                anchor.download = document.name;
                window.document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 60000);
                return;
            }
            // El visor recibe los bytes de un PDF: la política de la página no le deja leer un `blob:`.
            const data = document.mimeType === 'application/pdf' ? await blob.arrayBuffer() : undefined;
            closePreview();
            setPreview({ file: { id: document.id, name: document.name, mimeType: document.mimeType, size: Number(document.size) }, url, data, document });
        } catch (requestError) {
            console.error('Error opening financial document:', requestError.response?.data || requestError);
            onError?.(requestError.response?.data?.message || 'No fue posible abrir el comprobante.');
        }
    };

    const upload = async (file) => {
        const problem = financialDocumentProblem(file);
        if (problem) { onError?.(problem); return; }
        setUploading(true);
        try {
            await uploadRecordDocument(recordId, file);
            await onChanged?.('Comprobante guardado.');
        } catch (requestError) {
            console.error('Error uploading financial document:', requestError.response?.data || requestError);
            onError?.(requestError.response?.data?.message || 'No fue posible subir el comprobante.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className={`flex min-w-0 flex-wrap items-center gap-1.5 ${className}`} data-record-documents>
            {documents.map((document) => (
                <button key={document.id} type="button" onClick={() => open(document)} title={`Ver ${document.name}`}
                    className="inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5">
                    <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{document.name}</span>
                </button>
            ))}
            {canWrite && (
                <>
                    <input ref={input} type="file" className="sr-only" accept={FINANCIAL_DOCUMENT_ACCEPT}
                        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload(file); }} />
                    <button type="button" disabled={uploading} onClick={() => input.current?.click()}
                        className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50">
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}Subir comprobante
                    </button>
                </>
            )}
            {preview && (
                <ChatFilePreview file={preview.file} url={preview.url} data={preview.data} onClose={closePreview}
                    onDownload={() => open(preview.document, true)} />
            )}
        </div>
    );
}
