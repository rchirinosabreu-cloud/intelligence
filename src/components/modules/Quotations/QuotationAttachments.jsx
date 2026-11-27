import React, { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Download, Loader2, Paperclip, Trash2, Upload } from '@/components/ui/icons';
import { MAX_QUOTATION_FILES, MAX_QUOTATION_FILE_BYTES, QUOTATION_EMAIL_LIMIT_LABEL, formatFileSize, splitEmailAttachments } from '@/lib/quotationAttachments';

// Adjuntos de la propuesta (Rodny, 27 de noviembre de 2026): se suben aquí, salen en el correo al emitir o reenviar y
// el cliente los baja desde el enlace. Lo que no cabe en el correo va como enlace de descarga, con un aviso sencillo:
// es información, no una confirmación.

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

const uploadOne = async (file) => {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`${getApiBaseUrl()}/api/quotations/files`, { method: 'POST', headers: authHeaders(), body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `No se pudo subir «${file.name}».`);
    return data;
};

const downloadFile = async (file) => {
    try {
        const res = await fetch(`${getApiBaseUrl()}${file.url}`, { headers: authHeaders() });
        if (!res.ok) throw new Error();
        const url = URL.createObjectURL(await res.blob());
        const link = document.createElement('a');
        link.href = url; link.download = file.name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
        toast.error(`No se pudo descargar «${file.name}».`);
    }
};

export default function QuotationAttachments({ value = [], onChange, onBusyChange }) {
    const input = useRef(null);
    const [uploading, setUploading] = useState([]);
    const files = Array.isArray(value) ? value : [];
    const { linked } = splitEmailAttachments(files);
    const room = MAX_QUOTATION_FILES - files.length - uploading.length;

    const pick = async (event) => {
        const chosen = [...(event.target.files || [])];
        event.target.value = '';
        if (!chosen.length) return;
        const accepted = chosen.slice(0, Math.max(0, room));
        if (accepted.length < chosen.length) toast.error(`Una propuesta lleva hasta ${MAX_QUOTATION_FILES} adjuntos.`);
        const tooBig = accepted.filter(file => file.size > MAX_QUOTATION_FILE_BYTES);
        tooBig.forEach(file => toast.error(`«${file.name}» pesa más de ${formatFileSize(MAX_QUOTATION_FILE_BYTES)}. Compártelo por Drive.`, { duration: 8000 }));
        const queue = accepted.filter(file => file.size <= MAX_QUOTATION_FILE_BYTES);
        if (!queue.length) return;
        setUploading(current => [...current, ...queue.map(file => file.name)]);
        onBusyChange?.(true);
        const added = [];
        for (const file of queue) {
            try { added.push(await uploadOne(file)); } catch (error) { toast.error(error.message, { duration: 8000 }); }
            setUploading(current => { const next = [...current]; next.splice(next.indexOf(file.name), 1); return next; });
        }
        onBusyChange?.(false);
        if (added.length) onChange(current => [...(Array.isArray(current) ? current : []), ...added]);
    };

    return (
        <section className="space-y-4" aria-labelledby="quotation-attachments-title" data-quotation-attachments>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 id="quotation-attachments-title" className="text-base font-semibold">Adjuntos</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Portafolio, fichas o casos. Salen en el correo con la propuesta y el cliente también los descarga desde el enlace.</p>
                </div>
                <button type="button" onClick={() => input.current?.click()} disabled={room <= 0} data-quotation-attach
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950">
                    <Upload className="h-4 w-4" />Adjuntar archivos
                </button>
                <input ref={input} type="file" multiple hidden onChange={pick} aria-label="Elegir archivos para adjuntar" />
            </div>

            {(files.length > 0 || uploading.length > 0) && (
                <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                    {files.map(file => {
                        const asLink = linked.some(row => row.id === file.id);
                        return (
                            <li key={file.id} className="flex items-center gap-3 px-4 py-3" data-quotation-attachment={file.id}>
                                <Paperclip className="h-4 w-4 shrink-0 text-zinc-400" />
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-medium text-zinc-900 dark:text-zinc-100">{file.name}</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatFileSize(file.size)}{asLink ? ' · irá como enlace de descarga' : ''}</p>
                                </div>
                                {file.url && <button type="button" onClick={() => downloadFile(file)} aria-label={`Descargar ${file.name}`} title="Descargar"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"><Download className="h-4 w-4" /></button>}
                                <button type="button" onClick={() => onChange(current => (Array.isArray(current) ? current : []).filter(row => row.id !== file.id))} aria-label={`Quitar ${file.name}`} title="Quitar"
                                    className="brain-destructive-text flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                            </li>
                        );
                    })}
                    {uploading.map((name, index) => (
                        <li key={`subiendo-${index}`} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" /><span className="min-w-0 truncate">Subiendo {name}…</span>
                        </li>
                    ))}
                </ul>
            )}

            {linked.length > 0 && (
                <div role="status" data-quotation-attachments-warning className="rounded-xl border border-brand-yellow/40 bg-brand-yellow/10 px-4 py-3 text-sm leading-6 text-zinc-800 dark:text-zinc-100">
                    <p><strong className="font-semibold">{linked.length === 1 ? 'Este archivo supera' : 'Estos archivos superan'} los {QUOTATION_EMAIL_LIMIT_LABEL} que caben en el correo.</strong> El cliente {linked.length === 1 ? 'lo' : 'los'} recibirá como enlace de descarga:</p>
                    <ul className="mt-1 list-disc pl-5">
                        {linked.map(file => <li key={file.id} className="break-words">{file.name} ({formatFileSize(file.size)})</li>)}
                    </ul>
                </div>
            )}

            <p className="text-xs text-zinc-500 dark:text-zinc-400">Hasta {MAX_QUOTATION_FILES} archivos de {formatFileSize(MAX_QUOTATION_FILE_BYTES)} cada uno.</p>
        </section>
    );
}
