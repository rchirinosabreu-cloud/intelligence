import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Edit, ExternalLink, Loader2, Palette } from '@/components/ui/icons';
import { readableTextOn } from '@/lib/clientBrand';
import { useBrand } from './Brands/brandsApi';
import BrandEditorDialog from './Brands/BrandEditorDialog';

// Identidad digital del espacio del cliente (18 de noviembre de 2026): antes eran cuatro botones sin
// función. Ahora muestra lo que más se pregunta —los colores, con un toque para copiar— y las tipografías,
// y lleva a la ficha completa en la pestaña «Marcas» de Clientes.

const DigitalIdentityWidget = ({ client }) => {
    const { data, isLoading } = useBrand(client?.id);
    const [editing, setEditing] = useState(false);
    const colors = data?.brand?.colors || [];
    const fonts = data?.brand?.fonts || [];

    const copy = async (hex) => {
        try { await navigator.clipboard.writeText(hex); toast.success(`HEX copiado: ${hex}`); }
        catch { toast.error('No se pudo copiar. Selecciónalo y cópialo a mano.'); }
    };

    return (
        <Card className="w-full p-6" data-brand-widget="">
            <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="brain-type-section flex items-center gap-2 text-zinc-900 dark:text-white">
                    <Palette className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" /> Identidad de marca
                </h3>
                {data?.canEdit && (
                    <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10" aria-label="Editar marca">
                        <Edit className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…</div>
            ) : (
                <div className="space-y-4">
                    {colors.length ? (
                        <ul className="grid grid-cols-4 gap-2">
                            {colors.slice(0, 8).map((color) => (
                                <li key={`${color.hex}-${color.role}`}>
                                    <button type="button" onClick={() => copy(color.hex)} className="flex h-14 w-full items-end rounded-lg border border-zinc-200 p-1.5 text-xs font-medium dark:border-white/10" style={{ backgroundColor: color.hex, color: readableTextOn(color.hex) }} aria-label={`Copiar ${color.hex}`}>
                                        {color.hex}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="brain-type-help">Esta marca todavía no tiene colores cargados.</p>
                    )}
                    {fonts.length > 0 && (
                        <p className="brain-type-body text-zinc-700 dark:text-zinc-200">{[...new Set(fonts.map((font) => font.family))].join(' · ')}</p>
                    )}
                    {client?.slug && (
                        <Link to={`/clientes?tab=marcas&cliente=${encodeURIComponent(client.slug)}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver logos, tipografías y manual
                        </Link>
                    )}
                </div>
            )}
            {data && <BrandEditorDialog open={editing} onClose={() => setEditing(false)} data={data} />}
        </Card>
    );
};

export default DigitalIdentityWidget;
