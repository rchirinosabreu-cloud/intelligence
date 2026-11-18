import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Loader2, Search } from '@/components/ui/icons';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { brandSearchKey } from '@/lib/clientBrand';
import BrandSheet, { BrandSheetSkeleton } from './BrandSheet';
import BrandEditorDialog from './BrandEditorDialog';
import BrandImportDialog from './BrandImportDialog';
import { Button } from '@/components/ui/button';
import { useBrand, useBrands } from './brandsApi';

// Marcas (Rodny, 18 de noviembre de 2026): la pestaña «Marcas» del módulo de Clientes, con la ficha de marca
// de cada cliente. Al ver la primera versión como módulo propio: «no quiero un módulo de marcas, puede ser
// mejor una pestaña que diga "marcas" en el módulo del cliente». Mirar no es viajar: la ficha se abre encima
// y la dirección guarda cuál (`?tab=marcas&cliente=slug`), para poder mandar el enlace a alguien del equipo.

function BrandCard({ item, onOpen }) {
    const colors = item.brand?.colors || [];
    const fonts = item.brand?.fonts || [];
    return (
        <li>
            <button
                type="button"
                onClick={() => onOpen(item.client.slug)}
                data-brand-card={item.client.slug}
                className="flex h-full w-full flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20 dark:hover:bg-white/5"
            >
                <div className="flex min-w-0 items-center gap-3">
                    <ClientAvatar client={item.client} size={40} />
                    <div className="min-w-0">
                        <p className="brain-type-value truncate text-zinc-900 dark:text-white">{item.client.name}</p>
                        <p className="brain-type-label truncate">{fonts.length ? [...new Set(fonts.map((font) => font.family))].join(' · ') : 'Sin tipografías'}</p>
                    </div>
                </div>
                {colors.length ? (
                    <div className="flex h-10 overflow-hidden rounded-lg border border-zinc-200 dark:border-white/10" aria-label={`Colores: ${colors.map((c) => c.hex).join(', ')}`}>
                        {colors.slice(0, 8).map((color) => <span key={`${color.hex}-${color.role}`} className="flex-1" style={{ backgroundColor: color.hex }} />)}
                    </div>
                ) : (
                    <div className="flex h-10 items-center rounded-lg border border-dashed border-zinc-200 px-3 dark:border-white/10"><span className="brain-type-help">Sin colores todavía</span></div>
                )}
                <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-white/10" aria-hidden="true">
                        <div className="h-1.5 rounded-full bg-brand-green" style={{ width: `${(item.completeness.done / item.completeness.total) * 100}%` }} />
                    </div>
                    <span className="brain-type-label">{item.completeness.done}/{item.completeness.total}</span>
                </div>
            </button>
        </li>
    );
}

function BrandDialog({ slug, clientId, onClose }) {
    const detail = useBrand(clientId);
    const [editing, setEditing] = useState(false);
    return (
        <>
            <Dialog open={Boolean(slug)} onOpenChange={(next) => !next && onClose()}>
                <DialogContent data-brand-dialog="" className="max-h-[90vh] overflow-y-auto dark:bg-zinc-900 sm:max-w-4xl">
                    <DialogTitle className="sr-only">{detail.data?.client?.name ? `Marca de ${detail.data.client.name}` : 'Marca'}</DialogTitle>
                    <DialogDescription className="sr-only">Colores, logos, tipografías y manual de la marca.</DialogDescription>
                    {detail.isLoading || !detail.data
                        ? <BrandSheetSkeleton />
                        : detail.isError
                            ? <p className="text-sm text-destructive">{detail.error.message}</p>
                            : <BrandSheet data={detail.data} canEdit={detail.data.canEdit} onEdit={() => setEditing(true)} />}
                </DialogContent>
            </Dialog>
            {detail.data && <BrandEditorDialog open={editing} onClose={() => setEditing(false)} data={detail.data} />}
        </>
    );
}

export default function BrandsBoard() {
    const { data, isLoading, isError, error } = useBrands();
    const [params, setParams] = useSearchParams();
    const [query, setQuery] = useState('');
    const [importing, setImporting] = useState(false);
    const openSlug = params.get('cliente');
    const showArchived = params.get('marcasArchivadas') === '1';

    // Igual que el Directorio: los activos al frente y los archivados aparte, plegados.
    const { active, archived } = useMemo(() => {
        const key = brandSearchKey(query);
        const found = (data?.brands || [])
            .filter((item) => !key || brandSearchKey(item.client.name).includes(key))
            .sort((a, b) => b.completeness.done - a.completeness.done || a.client.name.localeCompare(b.client.name, 'es'));
        return { active: found.filter((item) => !item.client.isArchived), archived: found.filter((item) => item.client.isArchived) };
    }, [data, query]);
    const toggleArchived = () => setParams((current) => {
        const next = new URLSearchParams(current);
        if (showArchived) next.delete('marcasArchivadas'); else next.set('marcasArchivadas', '1');
        return next;
    }, { replace: true });

    const openClient = (data?.brands || []).find((item) => item.client.slug === openSlug)?.client;
    const open = (slug) => setParams((current) => { const next = new URLSearchParams(current); next.set('cliente', slug); return next; });
    const close = () => setParams((current) => { const next = new URLSearchParams(current); next.delete('cliente'); return next; }, { replace: true });

    return (
        <div className="space-y-6" data-brands-board="">
            <p className="brain-type-help">Colores, logos, tipografías y manual de cada cliente. Toca un color para copiar su código.</p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="relative block w-full sm:max-w-sm">
                    <span className="sr-only">Buscar cliente</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Buscar cliente"
                        className="min-h-11 w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                    />
                </label>
                {data?.canImport && (
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => setImporting(true)}>
                        Cargar fichas de los manuales
                    </Button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center gap-2 py-10 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando marcas…</div>
            ) : isError ? (
                <p className="text-sm text-destructive">{error.message}</p>
            ) : (
                <>
                    {active.length ? (
                        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {active.map((item) => <BrandCard key={item.client.id} item={item} onOpen={open} />)}
                        </ul>
                    ) : (
                        <p className="brain-type-help py-10 text-center">{query ? 'Ningún cliente activo coincide con la búsqueda.' : 'No hay clientes activos.'}</p>
                    )}

                    {archived.length > 0 && (
                        <div className="border-t border-zinc-200 pt-6 dark:border-white/5">
                            <button type="button" onClick={toggleArchived} aria-expanded={showArchived}
                                className="flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
                                {showArchived ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                                Clientes inactivos ({archived.length})
                            </button>
                            {showArchived && (
                                <ul className="mt-4 grid gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Marcas de clientes inactivos">
                                    {archived.map((item) => <BrandCard key={item.client.id} item={item} onOpen={open} />)}
                                </ul>
                            )}
                        </div>
                    )}
                </>
            )}

            {importing && <BrandImportDialog open={importing} onClose={() => setImporting(false)} />}
            {openSlug && <BrandDialog slug={openSlug} clientId={openClient?.id} onClose={close} />}
        </div>
    );
}
