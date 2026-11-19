import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FileText, Plus, Trash2 } from '@/components/ui/icons';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import Select from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    BRAND_COLOR_ROLES,
    BRAND_COLOR_ROLE_LABELS,
    BRAND_FONT_SOURCES,
    BRAND_FONT_SOURCE_LABELS,
    BRAND_FONT_USES,
    BRAND_FONT_USE_LABELS,
    normalizeBrandInput,
    normalizeHex,
    BRAND_FILE_KIND_LABELS
} from '@/lib/clientBrand';
import { useRemoveBrandFile, useSaveBrand } from './brandsApi';
import BrandFileUpload from './BrandFileUpload';

// Editar la ficha de marca. Frena con la misma regla del servidor (`normalizeBrandInput`) y solo se cierra
// cuando el servidor respondió. Aquí también se suben y quitan logos, fuentes y manuales: la ficha es solo de
// lectura (Rodny, 18 de noviembre de 2026). Un archivo se guarda en cuanto se sube, sin esperar a «Guardar marca».

const field = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white';

function Label({ text, children }) {
    return <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200"><span className="block">{text}</span>{children}</label>;
}

const fromBrand = (brand) => ({
    tagline: brand?.tagline || '',
    voice: brand?.voice || '',
    usageNotes: brand?.usageNotes || '',
    manualUrl: brand?.manualUrl || '',
    canvaUrl: brand?.canvaUrl || '',
    logosUrl: brand?.logosUrl || '',
    colors: (brand?.colors || []).map((color) => ({ ...color, cmyk: color.cmyk || '' })),
    fonts: (brand?.fonts || []).map((font) => ({ ...font, weights: font.weights || '', url: font.source === 'GOOGLE' ? '' : (font.url || '') })),
    links: brand?.links || []
});

export default function BrandEditorDialog({ open, onClose, data }) {
    const save = useSaveBrand();
    const [form, setForm] = useState(() => fromBrand(data?.brand));
    const [error, setError] = useState(null);

    // Se rellena al abrir, no cada vez que cambia la marca: subir un archivo refresca `data` y no puede borrar
    // lo que la persona lleva escrito.
    useEffect(() => {
        if (open) { setForm(fromBrand(data?.brand)); setError(null); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const setItem = (list, index, patch) => setForm((current) => ({ ...current, [list]: current[list].map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
    const removeItem = (list, index) => setForm((current) => ({ ...current, [list]: current[list].filter((_, i) => i !== index) }));

    const submit = async (event) => {
        event.preventDefault();
        const { problems } = normalizeBrandInput(form);
        if (problems.length) { setError(problems[0]); return; }
        try {
            await save.mutateAsync({ clientId: data.client.id, input: { ...form, revision: data.brand?.revision ?? null } });
            toast.success('Marca guardada');
            onClose();
        } catch (failure) {
            setError(failure.message);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !save.isPending && onClose()}>
            <DialogContent data-brand-editor="" overlayClassName="z-[80]" className="z-[81] max-h-[90vh] overflow-y-auto dark:bg-zinc-900 sm:max-w-2xl" onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}>
                <DialogHeader>
                    <DialogTitle>Marca de {data?.client?.name}</DialogTitle>
                    <DialogDescription>Lo que el equipo necesita para diseñar sin preguntar.</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-6">
                    <fieldset className="space-y-3">
                        <legend className="brain-type-section mb-2 text-zinc-900 dark:text-white">Colores</legend>
                        {form.colors.map((color, index) => {
                            const hex = normalizeHex(color.hex);
                            return (
                                <div key={index} className="grid grid-cols-[2.75rem_1fr_1fr_auto] items-end gap-2 sm:grid-cols-[2.75rem_7rem_1fr_9rem_auto]">
                                    <span className="mb-0.5 h-11 w-11 rounded-lg border border-zinc-200 dark:border-white/10" style={{ backgroundColor: hex || 'transparent' }} aria-hidden="true" />
                                    <Label text="HEX"><input className={field} value={color.hex} onChange={(e) => setItem('colors', index, { hex: e.target.value })} placeholder="#009BBF" required /></Label>
                                    <Label text="Nombre"><input className={field} value={color.name || ''} onChange={(e) => setItem('colors', index, { name: e.target.value })} placeholder="Azul profundo" /></Label>
                                    <Label text="Papel">
                                        <Select className={field} value={color.role} onChange={(e) => setItem('colors', index, { role: e.target.value })}>
                                            {BRAND_COLOR_ROLES.map((role) => <option key={role} value={role}>{BRAND_COLOR_ROLE_LABELS[role]}</option>)}
                                        </Select>
                                    </Label>
                                    <button type="button" onClick={() => removeItem('colors', index)} className="mb-0.5 inline-flex h-11 w-11 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10" aria-label={`Quitar el color ${index + 1}`}>
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                            );
                        })}
                        <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => set('colors', [...form.colors, { hex: '', name: '', role: form.colors.length ? 'SECUNDARIO' : 'PRINCIPAL' }])}>
                            <Plus className="h-4 w-4" aria-hidden="true" /> Añadir color
                        </Button>
                    </fieldset>

                    <fieldset className="space-y-3">
                        <legend className="brain-type-section mb-2 text-zinc-900 dark:text-white">Tipografías</legend>
                        {form.fonts.map((font, index) => (
                            <div key={index} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_8rem_10rem_auto]">
                                <Label text="Familia"><input className={field} value={font.family} onChange={(e) => setItem('fonts', index, { family: e.target.value })} placeholder="Montserrat" required /></Label>
                                <Label text="Uso">
                                    <Select className={field} value={font.use} onChange={(e) => setItem('fonts', index, { use: e.target.value })}>
                                        {BRAND_FONT_USES.map((use) => <option key={use} value={use}>{BRAND_FONT_USE_LABELS[use]}</option>)}
                                    </Select>
                                </Label>
                                <Label text="Origen">
                                    <Select className={field} value={font.source} onChange={(e) => setItem('fonts', index, { source: e.target.value })}>
                                        {BRAND_FONT_SOURCES.map((source) => <option key={source} value={source}>{BRAND_FONT_SOURCE_LABELS[source]}</option>)}
                                    </Select>
                                </Label>
                                <button type="button" onClick={() => removeItem('fonts', index)} className="mb-0.5 inline-flex h-11 w-11 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10" aria-label={`Quitar la tipografía ${index + 1}`}>
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <div className="col-span-2 sm:col-span-4">
                                    <Label text="Pesos o notas (opcional)"><input className={field} value={font.weights} onChange={(e) => setItem('fonts', index, { weights: e.target.value })} placeholder="Light, Regular y Bold" /></Label>
                                </div>
                            </div>
                        ))}
                        <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => set('fonts', [...form.fonts, { family: '', use: form.fonts.length ? 'TEXTOS' : 'TITULOS', source: 'GOOGLE', weights: '' }])}>
                            <Plus className="h-4 w-4" aria-hidden="true" /> Añadir tipografía
                        </Button>
                    </fieldset>

                    <fieldset className="space-y-3">
                        <legend className="brain-type-section mb-2 text-zinc-900 dark:text-white">Tono y reglas</legend>
                        <Label text="Frase o lema (opcional)"><input className={field} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Creamos valor sostenible" /></Label>
                        <Label text="Tono de comunicación (opcional)"><textarea className={`${field} min-h-24`} value={form.voice} onChange={(e) => set('voice', e.target.value)} placeholder="Cercano, experto, sin tecnicismos…" /></Label>
                        <Label text="Reglas de uso (opcional)"><textarea className={`${field} min-h-24`} value={form.usageNotes} onChange={(e) => set('usageNotes', e.target.value)} placeholder="El logo siempre con «IPS»; no usar el verde de fondo…" /></Label>
                    </fieldset>

                    <fieldset className="space-y-3">
                        <legend className="brain-type-section mb-2 text-zinc-900 dark:text-white">Enlaces</legend>
                        <Label text="Manual de marca (Drive, opcional)"><input className={field} type="url" value={form.manualUrl} onChange={(e) => set('manualUrl', e.target.value)} placeholder="https://drive.google.com/…" /></Label>
                        <Label text="Carpeta de logos (opcional)"><input className={field} type="url" value={form.logosUrl} onChange={(e) => set('logosUrl', e.target.value)} placeholder="https://drive.google.com/drive/folders/…" /></Label>
                        <Label text="Canva del cliente (opcional)"><input className={field} type="url" value={form.canvaUrl} onChange={(e) => set('canvaUrl', e.target.value)} placeholder="https://www.canva.com/…" /></Label>
                    </fieldset>

                    <BrandFilesEditor data={data} />

                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="ghost" className="min-h-11" onClick={onClose} disabled={save.isPending}>Cancelar</Button>
                        <Button type="submit" className="min-h-11" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar marca'}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function BrandFilesEditor({ data }) {
    const confirm = useConfirmDialog();
    const remove = useRemoveBrandFile();
    const client = data?.client;
    const files = data?.brand?.files || [];
    if (!client) return null;
    const removeFile = async (file) => {
        if (!(await confirm({ title: 'Quitar archivo', description: `«${file.name}» deja de verse en la marca de ${client.name}.`, confirmLabel: 'Quitar' }))) return;
        try {
            await remove.mutateAsync({ clientId: client.id, fileId: file.id });
            toast.success('Archivo quitado de la marca');
        } catch (failure) {
            toast.error(failure.message);
        }
    };
    return (
        <fieldset className="space-y-3" data-brand-files-editor="">
            <legend className="brain-type-section mb-2 text-zinc-900 dark:text-white">Archivos</legend>
            <p className="brain-type-help">Se guardan en cuanto se suben.</p>
            <div className="flex flex-wrap gap-2">
                <BrandFileUpload clientId={client.id} kind="LOGO" label="Subir logo" />
                <BrandFileUpload clientId={client.id} kind="FUENTE" label="Subir fuente" />
                <BrandFileUpload clientId={client.id} kind="MANUAL" label="Subir manual" />
            </div>
            {files.length > 0 && (
                <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/5 dark:border-white/10">
                    {files.map((file) => (
                        <li key={file.id} className="flex items-center justify-between gap-2 px-3 py-1">
                            <span className="flex min-w-0 items-center gap-2">
                                <FileText className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                                <span className="brain-type-body truncate text-zinc-900 dark:text-white" title={file.name}>{file.label || file.name}</span>
                                <span className="brain-type-label shrink-0">{BRAND_FILE_KIND_LABELS[file.kind]}</span>
                            </span>
                            <button type="button" disabled={remove.isPending} onClick={() => removeFile(file)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50" aria-label={`Quitar ${file.name}`}>
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </fieldset>
    );
}
