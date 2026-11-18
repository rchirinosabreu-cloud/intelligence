import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Plus, Trash2 } from '@/components/ui/icons';
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
    normalizeHex
} from '@/lib/clientBrand';
import { useSaveBrand } from './brandsApi';

// Editar la ficha de marca. Frena con la misma regla del servidor (`normalizeBrandInput`) y solo se cierra
// cuando el servidor respondió. Los archivos (logos, fuentes, manual) se suben desde la ficha, no aquí.

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

    useEffect(() => {
        if (open) { setForm(fromBrand(data?.brand)); setError(null); }
    }, [open, data?.brand]);

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
                    <DialogDescription>Lo que el equipo necesita para diseñar sin preguntar. Logos, fuentes y manual se suben desde la ficha.</DialogDescription>
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
