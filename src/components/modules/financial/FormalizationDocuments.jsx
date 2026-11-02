import React, { useRef, useState } from 'react';
import ChatFilePreview from '@/components/chat/ChatFilePreview';
import Select from '@/components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Paperclip } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import {
    FINANCIAL_DOCUMENT_ACCEPT, fetchFormalizationContractBlob, financialDocumentProblem, uploadFormalizationDocument, voidFormalizationDocument
} from '@/lib/financialDocumentsClient';
import {
    FORMALIZATION_DOCUMENT_KINDS, FORMALIZATION_NOTE_MAX, FORMALIZATION_REASON_MAX, documentUploadProblem, documentVoidProblem,
    formalizationDocumentKindLabel
} from '@/lib/projectFormalization';

// Los documentos de una formalización (Rodny, 29 de octubre de 2026): el contrato, los otrosí y los anexos, cada uno con
// su tipo, su fecha y su nota. Nada se borra: un archivo subido por error se anula con motivo y queda aparte.
const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';
const day = (value) => (value ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' }) : '');

function UploadDialog({ formalizationId, defaultKind, onClose, onSaved }) {
    const [form, setForm] = useState({ kind: defaultKind, note: '' });
    const [file, setFile] = useState(null);
    const [problem, setProblem] = useState('');
    const [saving, setSaving] = useState(false);
    const input = useRef(null);
    const save = async () => {
        const invalid = documentUploadProblem(form) || (file ? financialDocumentProblem(file) : 'Elige el archivo: PDF, JPG o PNG.');
        if (invalid) { setProblem(invalid); return; }
        setSaving(true);
        try {
            await uploadFormalizationDocument(formalizationId, file, form);
            await onSaved(`${formalizationDocumentKindLabel(form.kind)} guardado`);
        } catch (error) {
            console.error('[Formalización] Documento no guardado:', error.response?.data || error.message);
            setProblem(error.response?.data?.error || 'No pudimos guardar el documento.');
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
            <DialogContent data-formalization-upload className="sm:max-w-md dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Subir documento</DialogTitle>
                    <DialogDescription>El contrato firmado, un otrosí o un anexo. Solo el contrato habilita el proyecto.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <label className="block space-y-1.5 text-sm"><span className="block">Tipo</span>
                        <Select className={field} value={form.kind} onChange={(event) => { setForm((current) => ({ ...current, kind: event.target.value })); setProblem(''); }} aria-label="Tipo de documento">
                            {FORMALIZATION_DOCUMENT_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                        </Select>
                    </label>
                    <label className="block space-y-1.5 text-sm"><span className="block">Nota <span className="text-zinc-400">(opcional)</span></span>
                        <input className={field} maxLength={FORMALIZATION_NOTE_MAX} value={form.note} data-formalization-note
                            placeholder="Por ejemplo: otrosí 1, se suman 4 reels al mes"
                            onChange={(event) => { setForm((current) => ({ ...current, note: event.target.value })); setProblem(''); }} />
                    </label>
                    <div className="space-y-1.5 text-sm">
                        <span className="block">Archivo</span>
                        <input ref={input} type="file" className="sr-only" accept={FINANCIAL_DOCUMENT_ACCEPT} data-formalization-file
                            onChange={(event) => { setFile(event.target.files?.[0] || null); setProblem(''); }} />
                        <button type="button" onClick={() => input.current?.click()}
                            className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5">
                            <Paperclip className="h-4 w-4 shrink-0" /><span className="truncate">{file ? file.name : 'Elegir PDF, JPG o PNG'}</span>
                        </button>
                    </div>
                    {problem && <p role="alert" className="brain-destructive-text text-destructive text-sm">{problem}</p>}
                </div>
                <DialogFooter>
                    <button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" onClick={save} disabled={saving} data-formalization-upload-save
                        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function VoidDialog({ formalizationId, document, onClose, onSaved }) {
    const [reason, setReason] = useState('');
    const [problem, setProblem] = useState('');
    const [saving, setSaving] = useState(false);
    const save = async () => {
        const invalid = documentVoidProblem(reason);
        if (invalid) { setProblem(invalid); return; }
        setSaving(true);
        try {
            await voidFormalizationDocument(formalizationId, document.id, reason);
            await onSaved('Documento anulado');
        } catch (error) {
            console.error('[Formalización] Documento no anulado:', error.response?.data || error.message);
            setProblem(error.response?.data?.error || 'No pudimos anular el documento.');
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
            <DialogContent data-formalization-void className="sm:max-w-md dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Anular documento</DialogTitle>
                    <DialogDescription>{formalizationDocumentKindLabel(document.kind)} · {document.name}. El archivo se conserva y deja de contar.</DialogDescription>
                </DialogHeader>
                <label className="block space-y-1.5 text-sm"><span className="block">Motivo</span>
                    <textarea className={cn(field, 'min-h-20')} maxLength={FORMALIZATION_REASON_MAX} value={reason} data-formalization-void-reason
                        onChange={(event) => { setReason(event.target.value); setProblem(''); }} />
                </label>
                {problem && <p role="alert" className="brain-destructive-text text-destructive text-sm">{problem}</p>}
                <DialogFooter>
                    <button type="button" className="min-h-11 rounded-lg px-4 text-sm" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button type="button" onClick={save} disabled={saving} data-formalization-void-save
                        className="min-h-11 rounded-lg bg-destructive px-4 text-sm font-semibold text-white disabled:opacity-50">
                        {saving ? 'Anulando…' : 'Anular'}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function FormalizationDocuments({ formalizationId, documents = [], onSaved, onError }) {
    const [uploading, setUploading] = useState(false);
    const [voiding, setVoiding] = useState(null);
    const [preview, setPreview] = useState(null);
    const [showVoided, setShowVoided] = useState(false);
    const current = documents.filter((document) => !document.voidedAt);
    const voided = documents.filter((document) => document.voidedAt);
    const hasContract = current.some((document) => document.kind === 'CONTRATO');

    const closePreview = () => setPreview((open) => { if (open?.url) URL.revokeObjectURL(open.url); return null; });
    const open = async (document, download = false) => {
        try {
            const blob = await fetchFormalizationContractBlob(formalizationId, document);
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
        } catch (error) {
            console.error('[Formalización] Documento no abierto:', error.response?.data || error);
            onError?.(error.response?.data?.error || 'No fue posible abrir el documento.');
        }
    };
    const saved = async (message) => { setUploading(false); setVoiding(null); await onSaved?.(message); };

    return (
        <div className="space-y-2" data-formalization-documents>
            {current.length > 0 && (
                <ul className="space-y-1.5">
                    {current.map((document) => (
                        <li key={document.id} data-formalization-document={document.kind} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-700 dark:bg-white/5 dark:text-zinc-200">{formalizationDocumentKindLabel(document.kind)}</span>
                            <button type="button" onClick={() => open(document)} title={`Ver ${document.name}`}
                                className="inline-flex min-h-8 max-w-[16rem] items-center gap-1 rounded-md text-zinc-700 hover:text-primary dark:text-zinc-200">
                                <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{document.name}</span>
                            </button>
                            <span className="text-zinc-500 dark:text-zinc-400">{day(document.uploadedAt)}</span>
                            <button type="button" onClick={() => setVoiding(document)} data-formalization-void-open
                                className="brain-destructive-text min-h-8 rounded-md px-1 font-medium text-destructive">Anular</button>
                            {document.note && <p className="basis-full text-zinc-600 dark:text-zinc-300">{document.note}</p>}
                        </li>
                    ))}
                </ul>
            )}
            <button type="button" onClick={() => setUploading(true)} data-formalization-upload-open
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10">
                <Paperclip className="h-3.5 w-3.5" />{hasContract ? 'Subir otrosí o anexo' : 'Subir documento'}
            </button>
            {voided.length > 0 && (
                <div>
                    <button type="button" onClick={() => setShowVoided((value) => !value)} aria-expanded={showVoided} data-formalization-voided-toggle
                        className="min-h-8 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                        {showVoided ? 'Ocultar anulados' : `Ver ${voided.length} ${voided.length === 1 ? 'anulado' : 'anulados'}`}
                    </button>
                    {showVoided && (
                        <ul className="mt-1 space-y-1">
                            {voided.map((document) => (
                                <li key={document.id} data-formalization-voided className="text-xs text-zinc-500 dark:text-zinc-400">
                                    <span className="line-through">{formalizationDocumentKindLabel(document.kind)} · {document.name}</span> · anulado el {day(document.voidedAt)}: {document.voidReason}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {uploading && <UploadDialog formalizationId={formalizationId} defaultKind={hasContract ? 'OTROSI' : 'CONTRATO'} onClose={() => setUploading(false)} onSaved={saved} />}
            {voiding && <VoidDialog formalizationId={formalizationId} document={voiding} onClose={() => setVoiding(null)} onSaved={saved} />}
            {preview && <ChatFilePreview file={preview.file} url={preview.url} data={preview.data} onClose={closePreview} onDownload={() => open(preview.document, true)} />}
        </div>
    );
}
