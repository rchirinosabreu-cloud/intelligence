import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { BookOpen, Check, Copy, Download, Edit, ExternalLink, FileText, Image, Loader2, Palette, Sparkles, Trash2, Type } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
import {
    BRAND_COLOR_ROLE_LABELS,
    BRAND_FILE_KIND_LABELS,
    BRAND_FONT_SOURCE_LABELS,
    BRAND_FONT_USE_LABELS,
    googleFontCssUrl,
    readableTextOn,
    rgbText
} from '@/lib/clientBrand';
import { brandFileUrl, brandFontUrl, useRemoveBrandFile } from './brandsApi';
import BrandFileUpload from './BrandFileUpload';

// La ficha de marca de un cliente, tal como la consulta el equipo: lo que más se pregunta (colores) arriba,
// con un toque para copiar el HEX. Sirve en la página de Marcas y dentro del espacio del cliente.

const isImage = (file) => /^image\/(png|jpe?g|webp|gif)$/i.test(file?.mimeType || '');

async function copy(text, what) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`${what} copiado: ${text}`);
    } catch {
        toast.error('No se pudo copiar. Selecciónalo y cópialo a mano.');
    }
}

/** Carga la familia desde Google Fonts para que la muestra se vea con la letra real. */
function useGoogleFont(family, enabled) {
    useEffect(() => {
        if (!enabled || !family) return undefined;
        const href = googleFontCssUrl(family);
        if (!href || document.querySelector(`link[data-brand-font="${CSS.escape(family)}"]`)) return undefined;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.brandFont = family;
        document.head.appendChild(link);
        return undefined;
    }, [family, enabled]);
}

function Section({ icon: Icon, title, children, action }) {
    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <h3 className="brain-type-section flex items-center gap-2 text-zinc-900 dark:text-white">
                    <Icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
                    {title}
                </h3>
                {action}
            </div>
            {children}
        </section>
    );
}

function Empty({ children }) {
    return <p className="brain-type-help rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-zinc-500 dark:border-white/10 dark:text-zinc-400">{children}</p>;
}

function ColorSwatch({ color }) {
    const [copied, setCopied] = useState(false);
    const ink = readableTextOn(color.hex);
    const handle = async () => {
        await copy(color.hex, 'HEX');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <li className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" data-brand-color={color.hex}>
            <button
                type="button"
                onClick={handle}
                className="flex h-20 w-full items-end justify-between p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{ backgroundColor: color.hex, color: ink }}
                aria-label={`Copiar ${color.hex}${color.name ? `, ${color.name}` : ''}`}
            >
                <span className="text-sm font-semibold">{color.hex}</span>
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4 opacity-70" aria-hidden="true" />}
            </button>
            <div className="space-y-0.5 px-3 py-2">
                <p className="brain-type-body truncate text-zinc-900 dark:text-white">{color.name || BRAND_COLOR_ROLE_LABELS[color.role] || 'Color'}</p>
                <button type="button" onClick={() => copy(rgbText(color.hex), 'RGB')} className="brain-type-label block text-left hover:underline">
                    RGB {rgbText(color.hex)}
                </button>
                {color.cmyk && <p className="brain-type-label">CMYK {color.cmyk}</p>}
                {color.name && <p className="brain-type-label">{BRAND_COLOR_ROLE_LABELS[color.role]}</p>}
            </div>
        </li>
    );
}

function FontCard({ font, files, clientId }) {
    const isGoogle = font.source === 'GOOGLE';
    useGoogleFont(font.family, isGoogle);
    const fontFile = files.find((file) => file.kind === 'FUENTE' && file.name.toLowerCase().includes(font.family.toLowerCase().split(' ')[0]));
    return (
        <li className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="brain-type-value truncate text-zinc-900 dark:text-white">{font.family}</p>
                    <p className="brain-type-label">{BRAND_FONT_USE_LABELS[font.use]}{font.weights ? ` · ${font.weights}` : ''} · {BRAND_FONT_SOURCE_LABELS[font.source]}</p>
                </div>
                <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="brain-button-quiet min-h-11" onClick={() => copy(font.family, 'Nombre')} aria-label={`Copiar el nombre ${font.family}`}>
                        <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    {fontFile ? (
                        <a href={brandFileUrl(clientId, fontFile.id, { download: true })} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10">
                            <Download className="h-4 w-4" aria-hidden="true" /> Descargar
                        </a>
                    ) : isGoogle ? (
                        <a href={brandFontUrl(clientId, font.family)} download className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10" aria-label={`Descargar la tipografía ${font.family}`}>
                            <Download className="h-4 w-4" aria-hidden="true" /> Descargar
                        </a>
                    ) : font.url ? (
                        <a href={font.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10">
                            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir
                        </a>
                    ) : null}
                </div>
            </div>
            <p className="mt-3 truncate text-2xl text-zinc-900 dark:text-white" style={isGoogle ? { fontFamily: `'${font.family}', sans-serif` } : undefined}>
                Aa Bb Cc 123
            </p>
            {!isGoogle && !fontFile && <p className="brain-type-help mt-1">La muestra usa la letra de la plataforma: esta fuente no es de Google. Sube el archivo (.ttf, .otf) para que el equipo la descargue.</p>}
        </li>
    );
}

function FileTile({ file, clientId, canEdit, onRemove, removing }) {
    return (
        <li className="group overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
            <div className="flex h-28 items-center justify-center bg-zinc-50 p-3 dark:bg-zinc-800/60">
                {isImage(file)
                    ? <img src={brandFileUrl(clientId, file.id)} alt={file.label || file.name} className="max-h-full max-w-full object-contain" loading="lazy" />
                    : <FileText className="h-10 w-10 text-zinc-400" aria-hidden="true" />}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                    <p className="brain-type-body truncate text-zinc-900 dark:text-white" title={file.name}>{file.label || file.name}</p>
                    <p className="brain-type-label">{BRAND_FILE_KIND_LABELS[file.kind]}</p>
                </div>
                <div className="flex shrink-0">
                    <a href={brandFileUrl(clientId, file.id, { download: true })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10" aria-label={`Descargar ${file.name}`}>
                        <Download className="h-4 w-4" aria-hidden="true" />
                    </a>
                    {canEdit && (
                        <button type="button" disabled={removing} onClick={() => onRemove(file)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50" aria-label={`Quitar ${file.name}`}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
}

function LinkPill({ href, children }) {
    return (
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-white/5">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> {children}
        </a>
    );
}

export default function BrandSheet({ data, canEdit, onEdit, compact = false }) {
    const confirm = useConfirmDialog();
    const remove = useRemoveBrandFile();
    const { client, brand, completeness } = data;
    const files = brand?.files || [];
    const logos = files.filter((file) => file.kind === 'LOGO');
    const otherFiles = files.filter((file) => file.kind !== 'LOGO' && file.kind !== 'FUENTE');
    const fontFiles = files.filter((file) => file.kind === 'FUENTE');
    const colors = brand?.colors || [];
    const fonts = brand?.fonts || [];
    const links = [
        brand?.manualUrl && { label: 'Manual de marca', url: brand.manualUrl },
        brand?.logosUrl && { label: 'Carpeta de logos', url: brand.logosUrl },
        brand?.canvaUrl && { label: 'Canva', url: brand.canvaUrl },
        ...(brand?.links || [])
    ].filter(Boolean);

    const removeFile = async (file) => {
        if (!(await confirm({ title: 'Quitar archivo', description: `«${file.name}» deja de verse en la marca de ${client.name}.`, confirmLabel: 'Quitar' }))) return;
        try {
            await remove.mutateAsync({ clientId: client.id, fileId: file.id });
            toast.success('Archivo quitado de la marca');
        } catch (error) {
            toast.error(error.message);
        }
    };

    return (
        <div className="space-y-8" data-brand-sheet={client.slug}>
            <div className={cn('flex flex-wrap items-start justify-between gap-4', !compact && 'sm:pr-10')}>
                <div className="flex min-w-0 items-center gap-4">
                    <ClientAvatar client={client} size={compact ? 40 : 56} />
                    <div className="min-w-0">
                        <h2 className={cn('truncate font-semibold text-zinc-900 dark:text-white', compact ? 'text-lg' : 'text-2xl')}>{client.name}</h2>
                        {brand?.tagline && <p className="brain-type-help truncate">{brand.tagline}</p>}
                        <p className="brain-type-label mt-1">
                            {completeness.done === completeness.total
                                ? 'Ficha completa'
                                : `${completeness.done} de ${completeness.total} · falta: ${completeness.missing.join(', ').toLowerCase()}`}
                        </p>
                    </div>
                </div>
                {canEdit && (
                    <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={onEdit}>
                        <Edit className="h-4 w-4" aria-hidden="true" /> Editar marca
                    </Button>
                )}
            </div>

            <Section icon={Palette} title="Colores">
                {colors.length
                    ? <ul className={cn('grid gap-3', compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5')}>{colors.map((color) => <ColorSwatch key={`${color.hex}-${color.role}`} color={color} />)}</ul>
                    : <Empty>Esta marca todavía no tiene colores cargados.</Empty>}
            </Section>

            <Section icon={Image} title="Logos" action={canEdit && <BrandFileUpload clientId={client.id} kind="LOGO" label="Subir logo" />}>
                {logos.length
                    ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{logos.map((file) => <FileTile key={file.id} file={file} clientId={client.id} canEdit={canEdit} onRemove={removeFile} removing={remove.isPending} />)}</ul>
                    : <Empty>{brand?.logosUrl ? 'Los logos están en la carpeta enlazada abajo; súbelos aquí para descargarlos directo.' : 'Todavía no hay logos en la ficha.'}</Empty>}
            </Section>

            <Section icon={Type} title="Tipografías" action={canEdit && <BrandFileUpload clientId={client.id} kind="FUENTE" label="Subir fuente" />}>
                {fonts.length
                    ? <ul className="grid gap-3 sm:grid-cols-2">{fonts.map((font) => <FontCard key={`${font.family}-${font.use}`} font={font} files={fontFiles} clientId={client.id} />)}</ul>
                    : <Empty>Esta marca todavía no tiene tipografías cargadas.</Empty>}
                {fontFiles.length > 0 && (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{fontFiles.map((file) => <FileTile key={file.id} file={file} clientId={client.id} canEdit={canEdit} onRemove={removeFile} removing={remove.isPending} />)}</ul>
                )}
            </Section>

            {(brand?.voice || brand?.usageNotes) && (
                <Section icon={Sparkles} title="Tono y reglas de uso">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {brand.voice && <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><p className="brain-type-label mb-1">Tono</p><p className="brain-type-body whitespace-pre-line text-zinc-800 dark:text-zinc-100">{brand.voice}</p></div>}
                        {brand.usageNotes && <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><p className="brain-type-label mb-1">Reglas de uso</p><p className="brain-type-body whitespace-pre-line text-zinc-800 dark:text-zinc-100">{brand.usageNotes}</p></div>}
                    </div>
                </Section>
            )}

            <Section icon={BookOpen} title="Manual y archivos" action={canEdit && <BrandFileUpload clientId={client.id} kind="MANUAL" label="Subir manual" />}>
                {links.length > 0 && <div className="flex flex-wrap gap-2">{links.map((link) => <LinkPill key={link.url} href={link.url}>{link.label}</LinkPill>)}</div>}
                {otherFiles.length > 0 && <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{otherFiles.map((file) => <FileTile key={file.id} file={file} clientId={client.id} canEdit={canEdit} onRemove={removeFile} removing={remove.isPending} />)}</ul>}
                {!links.length && !otherFiles.length && <Empty>Sin manual enlazado todavía.</Empty>}
            </Section>
        </div>
    );
}

export function BrandSheetSkeleton() {
    return <div className="flex items-center gap-2 py-10 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando la marca…</div>;
}

