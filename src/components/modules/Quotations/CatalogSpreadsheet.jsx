// El catálogo de servicios en Excel (Elisa y Rodny, 20 de noviembre de 2026): descargarlo entero, corregirlo
// en la hoja y volver a subirlo. Al subir, primero se ve servicio por servicio lo que cambiaría; nada se guarda
// sin «Guardar cambios».
import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from '@/components/ui/icons';

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const readError = async res => { try { return (await res.json()).error; } catch { return null; } };

export function useCatalogDownload() {
    const [busy, setBusy] = useState(false);
    const download = async () => {
        setBusy(true);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/services/export`, { headers: auth() });
            if (!res.ok) throw new Error(await readError(res) || 'No se pudo descargar el catálogo');
            const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'catalogo-de-servicios.xlsx';
            const url = URL.createObjectURL(await res.blob());
            const link = document.createElement('a');
            link.href = url; link.download = name; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setBusy(false);
        }
    };
    return { download, busy };
}

export function CatalogUploadButton() {
    const input = useRef(null);
    const [file, setFile] = useState(null);
    return <>
        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label="Archivo de Excel del catálogo" onChange={event => { setFile(event.target.files?.[0] || null); event.target.value = ''; }} />
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => input.current?.click()}>Subir Excel</Button>
        {file && <CatalogImportDialog file={file} onClose={() => setFile(null)} />}
    </>;
}

function CatalogImportDialog({ file, onClose }) {
    const queryClient = useQueryClient();
    const [plan, setPlan] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const send = async path => {
        const body = new FormData();
        body.append('file', file);
        if (plan) body.append('expectedRevision', plan.revision);
        const res = await fetch(`${getApiBaseUrl()}/api/services/${path}`, { method: 'POST', headers: auth(), body });
        if (!res.ok) throw Object.assign(new Error(await readError(res) || 'No se pudo leer el archivo'), { status: res.status });
        return res.json();
    };

    // Leer el archivo una vez al abrir; quien sube otro archivo abre otra revisión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { send('import/preview').then(setPlan).catch(err => setError(err.message)); }, [file]);

    const save = async () => {
        setSaving(true); setError('');
        try {
            const result = await send('import');
            await queryClient.invalidateQueries({ queryKey: ['services-catalog'] });
            toast.success(`Catálogo actualizado: ${result.updated} cambiados, ${result.created} nuevos`);
            onClose();
        } catch (err) {
            setError(err.message);
            if (err.status === 409) { setPlan(null); send('import/preview').then(setPlan).catch(e => setError(e.message)); }
        } finally {
            setSaving(false);
        }
    };

    const nothing = plan && !plan.changes.length && !plan.errors.length;
    return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl dark:bg-zinc-900">
            <DialogHeader>
                <DialogTitle>Revisar el catálogo antes de guardar</DialogTitle>
                <DialogDescription>{file.name}. Esto es lo que cambiaría; nada se guarda hasta que confirmes. Las cotizaciones ya hechas no cambian.</DialogDescription>
            </DialogHeader>
            {!plan && !error && <p className="brain-type-body inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Leyendo el archivo…</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {plan && <div className="space-y-5">
                <p className="brain-type-body">{plan.counts.updates} servicios cambian · {plan.counts.creates} nuevos · {plan.counts.unchanged} sin cambios{plan.errors.length ? ` · ${plan.errors.length} filas por corregir` : ''}</p>
                {plan.errors.length > 0 && <section className="space-y-2">
                    <h3 className="brain-type-section">Filas por corregir en el Excel</h3>
                    <p className="brain-type-help">Mientras haya filas por corregir no se guarda nada. Corrígelas en el archivo y súbelo otra vez.</p>
                    {plan.errors.map(item => <article key={item.row} className="rounded-lg border border-destructive/30 p-3">
                        <p className="brain-type-value">Fila {item.row} · {item.name}</p>
                        <ul className="mt-1 list-disc pl-5 text-sm text-destructive">{item.problems.map(problem => <li key={problem}>{problem}</li>)}</ul>
                    </article>)}
                </section>}
                {plan.changes.length > 0 && <section className="space-y-2">
                    <h3 className="brain-type-section">Cambios</h3>
                    {plan.changes.map(change => <article key={`${change.kind}:${change.id || change.row}`} className="rounded-lg border border-zinc-200 p-3 dark:border-white/10">
                        <p className="brain-type-value">{change.name} <span className="brain-type-help">· {change.kind === 'CREATE' ? 'Servicio nuevo' : `Fila ${change.row}`}</span></p>
                        <dl className="mt-2 space-y-2">{change.fields.map(field => <div key={field.field}>
                            <dt className="brain-type-label">{field.label}</dt>
                            {field.field === 'description'
                                ? <dd className="mt-1 whitespace-pre-line rounded-md bg-zinc-50 p-2 text-sm text-zinc-800 dark:bg-white/5 dark:text-zinc-100">{field.after || '—'}</dd>
                                : <dd className="text-sm text-zinc-800 dark:text-zinc-100">{field.before !== null && <><span className="text-zinc-500 line-through dark:text-zinc-400">{field.before}</span> → </>}{field.after}</dd>}
                        </div>)}</dl>
                    </article>)}
                </section>}
                {nothing && <p className="brain-type-body">El archivo es igual al catálogo actual. No hay nada que guardar.</p>}
            </div>}
            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" className="rounded-xl" disabled={saving} onClick={onClose}>Cancelar</Button>
                {plan && plan.changes.length > 0 && !plan.errors.length && <Button type="button" className="rounded-xl" disabled={saving} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar cambios</Button>}
            </div>
        </DialogContent>
    </Dialog>;
}
