import React, { Suspense, lazy, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { BookOpen, Check, Copy, Download, Edit, ExternalLink, FileText, Image, Loader2, Palette, Sparkles, Type } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import ClientAvatar from '@/components/ui/ClientAvatar';
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { brandFileUrl, brandFontUrl, downloadBrandFile, loadBrandBytes, useBrandImage } from './brandsApi';

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

// Botón de descarga de la ficha: el mismo en logos, fuentes y archivos (solo el icono, con su nombre para el lector).
function DownloadIcon({ label, onClick }) {
    return (
        <button type="button" onClick={onClick} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10" aria-label={label} title={label}>
            <Download className="h-4 w-4" aria-hidden="true" />
        </button>
    );
}

const fontFileFor = (font, files) => files.find((file) => file.kind === 'FUENTE' && file.name.toLowerCase().includes(font.family.toLowerCase().split(' ')[0]));

// Vista de lectura (Rodny, 18 de noviembre de 2026): sin copiar el nombre y con la descarga siempre en el mismo
// sitio, a la derecha del nombre. Si no hay de dónde descargarla, no se pinta nada.
function FontCard({ font, files, clientId }) {
    const isGoogle = font.source === 'GOOGLE';
    useGoogleFont(font.family, isGoogle);
    const fontFile = fontFileFor(font, files);
    const download = fontFile
        ? () => downloadBrandFile(brandFileUrl(clientId, fontFile.id, { download: true }), fontFile.name).catch((e) => toast.error(e.message))
        : isGoogle ? () => downloadFont(clientId, font.family) : null;
    return (
        <li className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900" data-brand-font={font.family}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="brain-type-value truncate text-zinc-900 dark:text-white">{font.family}</p>
                    <p className="brain-type-label">{BRAND_FONT_USE_LABELS[font.use]}{font.weights ? ` · ${font.weights}` : ''} · {BRAND_FONT_SOURCE_LABELS[font.source]}</p>
                </div>
                {download && <DownloadIcon label={`Descargar la tipografía ${font.family}`} onClick={download} />}
            </div>
            <p className="mt-3 truncate text-2xl text-zinc-900 dark:text-white" style={isGoogle ? { fontFamily: `'${font.family}', sans-serif` } : undefined}>
                Aa Bb Cc 123
            </p>
            {!isGoogle && !fontFile && <p className="brain-type-help mt-1">Fuente comercial: todavía no hay archivo para descargar. Se sube desde «Editar marca».</p>}
        </li>
    );
}

// Cuadritos detrás de un logo, como en un editor de imagen: así se ve igual la versión blanca que la negra.
const TRANSPARENCY_GRID = { backgroundColor: '#b4b4bb', backgroundImage: 'repeating-conic-gradient(#9c9ca5 0% 25%, transparent 0% 50%)', backgroundSize: '16px 16px' };

async function downloadFont(clientId, family) {
    const pending = toast.loading(`Preparando ${family}…`);
    try {
        await downloadBrandFile(brandFontUrl(clientId, family), `${family}.zip`);
        toast.success(`${family} descargada`, { id: pending });
    } catch (error) {
        toast.error(error.message, { id: pending });
    }
}

function LogoThumb({ clientId, file }) {
    const src = useBrandImage(brandFileUrl(clientId, file.id, { thumb: true }));
    return src
        ? <img src={src} alt={file.label || file.name} className="max-h-full max-w-full object-contain" decoding="async" />
        : <span className="h-12 w-20 animate-pulse rounded bg-zinc-300/60 dark:bg-white/10" aria-hidden="true" />;
}

function FileTile({ file, clientId }) {
    return (
        <li className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
            <div className="flex h-28 items-center justify-center bg-zinc-50 p-3 dark:bg-zinc-800/60" style={isImage(file) ? TRANSPARENCY_GRID : undefined}>
                {isImage(file)
                    ? <LogoThumb clientId={clientId} file={file} />
                    : <FileText className="h-10 w-10 text-zinc-400" aria-hidden="true" />}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                    <p className="brain-type-body truncate text-zinc-900 dark:text-white" title={file.name}>{file.label || file.name}</p>
                    <p className="brain-type-label">{BRAND_FILE_KIND_LABELS[file.kind]}</p>
                </div>
                <DownloadIcon label={`Descargar ${file.name}`} onClick={() => downloadBrandFile(brandFileUrl(clientId, file.id, { download: true }), file.name).catch((e) => toast.error(e.message))} />
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

// La ficha es de lectura (Rodny, 18 de noviembre de 2026: «necesito hacer una distinción entre el formato de
// visión … y el formato de edición»): aquí solo se mira, se copia un color y se descarga. Subir y quitar logos,
// fuentes y manuales vive en «Editar marca» (`BrandEditorDialog`).
export default function BrandSheet({ data, canEdit, onEdit, compact = false }) {
    const { client, brand, completeness } = data;
    const files = brand?.files || [];
    const logos = files.filter((file) => file.kind === 'LOGO');
    const manuals = files.filter((file) => file.kind === 'MANUAL' && /pdf$/i.test(file.mimeType || file.name || ''));
    const otherFiles = files.filter((file) => file.kind !== 'LOGO' && file.kind !== 'FUENTE' && !manuals.includes(file));
    const [reading, setReading] = useState(null);
    const fontFiles = files.filter((file) => file.kind === 'FUENTE');
    const colors = brand?.colors || [];
    const fonts = brand?.fonts || [];
    // Un archivo de fuente que ya descarga una tarjeta no se repite abajo.
    const looseFontFiles = fontFiles.filter((file) => !fonts.some((font) => fontFileFor(font, [file])));
    const links = [
        brand?.manualUrl && { label: 'Manual en Drive', url: brand.manualUrl },
        brand?.logosUrl && { label: 'Carpeta de logos', url: brand.logosUrl },
        brand?.canvaUrl && { label: 'Canva', url: brand.canvaUrl },
        ...(brand?.links || [])
    ].filter(Boolean);

    return (
        <div className="space-y-8" data-brand-sheet={client.slug}>
            <div className={cn('flex flex-wrap items-start justify-between gap-4', canEdit ? 'pr-24' : 'pr-12')}>
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
                {/* Editar es un icono en la misma fila que la X del diálogo, como en el panel de una tarea (Rodny, 18 de
                    noviembre de 2026: «que sea solo un símbolo al lado de la X … organizado en la misma línea»). */}
                {canEdit && (
                    <button type="button" onClick={onEdit} aria-label="Editar marca" title="Editar marca" data-brand-edit
                        className="absolute right-[3.25rem] top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-zinc-600 opacity-70 transition-opacity hover:bg-zinc-100 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-zinc-300 dark:hover:bg-zinc-800 sm:right-[3.75rem] sm:top-3">
                        <Edit className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
            </div>

            <Section icon={Palette} title="Colores">
                {colors.length
                    ? <ul className={cn('grid gap-3', compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5')}>{colors.map((color) => <ColorSwatch key={`${color.hex}-${color.role}`} color={color} />)}</ul>
                    : <Empty>Esta marca todavía no tiene colores cargados.</Empty>}
            </Section>

            <Section icon={Image} title="Logos">
                {logos.length
                    ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{logos.map((file) => <FileTile key={file.id} file={file} clientId={client.id} />)}</ul>
                    : <Empty>{brand?.logosUrl ? 'Los logos están en la carpeta enlazada abajo.' : 'Todavía no hay logos en la ficha.'}</Empty>}
            </Section>

            <Section icon={Type} title="Tipografías">
                {fonts.length
                    ? <ul className="grid gap-3 sm:grid-cols-2">{fonts.map((font) => <FontCard key={`${font.family}-${font.use}`} font={font} files={fontFiles} clientId={client.id} />)}</ul>
                    : <Empty>Esta marca todavía no tiene tipografías cargadas.</Empty>}
                {looseFontFiles.length > 0 && (
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{looseFontFiles.map((file) => <FileTile key={file.id} file={file} clientId={client.id} />)}</ul>
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

            <Section icon={BookOpen} title="Manual y archivos">
                {(manuals.length > 0 || links.length > 0) && (
                    <div className="flex flex-wrap items-center gap-2" data-brand-manual-row="">
                        {manuals.map((file) => (
                            <Button key={file.id} type="button" className="min-h-11 gap-2" onClick={() => setReading(file)}>
                                <BookOpen className="h-4 w-4" aria-hidden="true" /> Ver {manuals.length > 1 ? `«${file.label || file.name}»` : 'el manual'}
                            </Button>
                        ))}
                        {links.map((link) => <LinkPill key={link.url} href={link.url}>{link.label}</LinkPill>)}
                    </div>
                )}
                {reading && <ManualViewer file={reading} clientId={client.id} onClose={() => setReading(null)} />}
                {otherFiles.length > 0 && <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{otherFiles.map((file) => <FileTile key={file.id} file={file} clientId={client.id} />)}</ul>}
                {!links.length && !manuals.length && !otherFiles.length && <Empty>Todavía no hay manual.</Empty>}
            </Section>
        </div>
    );
}

// El manual vive en la plataforma y se lee con el mismo visor de PDF de Drive y del chat (Rodny: «prefiero que
// los manuales de marca estén arriba directamente … con el visor que ya la plataforma tiene»). Se baja al
// pedirlo: un manual pesa y la mayoría de las consultas son solo un color.
const PdfDocumentPreview = lazy(() => import('@/components/modules/Drive/PdfDocumentPreview'));

function ManualViewer({ file, clientId, onClose }) {
    const [state, setState] = useState({ data: null, error: null });
    useEffect(() => {
        let active = true;
        loadBrandBytes(brandFileUrl(clientId, file.id))
            .then((data) => active && setState({ data, error: null }))
            .catch(() => active && setState({ data: null, error: 'No se pudo abrir el manual. Inténtalo de nuevo.' }));
        return () => { active = false; };
    }, [clientId, file.id]);
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto bg-white dark:bg-zinc-950 sm:max-w-5xl">
                <DialogTitle>{file.label || 'Manual de marca'}</DialogTitle>
                <DialogDescription>{file.name}</DialogDescription>
                {state.error
                    ? <p className="text-sm text-destructive">{state.error}</p>
                    : !state.data
                        ? <p className="flex items-center gap-2 py-10 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Abriendo el manual…</p>
                        : <Suspense fallback={<BrandSheetSkeleton />}><PdfDocumentPreview data={state.data} name={file.name} /></Suspense>}
            </DialogContent>
        </Dialog>
    );
}

export function BrandSheetSkeleton() {
    return <div className="flex items-center gap-2 py-10 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando la marca…</div>;
}

