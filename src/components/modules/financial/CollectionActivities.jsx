import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { COLLECTION_CHANNELS, collectionActivityLine } from '@/lib/collectionActivities';
import { ChevronDown } from '@/components/ui/icons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// Gestiones de cobro en Cuentas por cobrar (Rodny, 28 de octubre de 2026: «eso debe quedar guardado en algún lugar,
// esas elecciones de gestión. Debe haber un registro»). Lo que se registró desde la banda («Ya le escribí») y lo que
// se registra aquí a mano, en la tarjeta de cada cliente. Una gestión a mano también saca su aviso de la banda.
const KEY = ['financial-collection-activities'];
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const VISIBLE = 4;

/** Las gestiones de todos los clientes, agrupadas por cliente, de la más reciente a la más vieja. */
export function useCollectionActivities(enabled) {
    const { data } = useQuery({
        queryKey: KEY,
        enabled,
        staleTime: 30_000,
        queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/financials/collection-activities`, auth())).data
    });
    return useMemo(() => {
        const byClient = new Map();
        for (const item of data?.items || []) {
            if (!byClient.has(item.clientId)) byClient.set(item.clientId, []);
            byClient.get(item.clientId).push(item);
        }
        return byClient;
    }, [data]);
}

export function CollectionActivityPanel({ clientId, items = [], canWrite }) {
    const queryClient = useQueryClient();
    const [showAll, setShowAll] = useState(false);
    const save = useMutation({
        mutationFn: async (channel) => (await axios.post(`${getApiBaseUrl()}/api/financials/collection-activities`, { clientId, channel }, auth())).data,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: KEY });
            queryClient.invalidateQueries({ queryKey: ['important-notice'] });
            toast.success('Gestión de cobro registrada');
        },
        onError: (error) => {
            console.error('[Cartera] Gestión no guardada:', error.response?.data || error.message);
            toast.error(error.response?.data?.error || 'No pudimos guardar la gestión de cobro.');
        }
    });
    const shown = showAll ? items : items.slice(0, VISIBLE);
    return (
        <div data-collection-activities className="rounded-xl border border-zinc-100 p-3 dark:border-white/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">Gestiones de cobro</p>
                {/* Un menú pequeño, como «Recordarme» en la banda (Rodny, 28 de octubre de 2026): la tarjeta no se ensancha. */}
                {canWrite && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button type="button" data-collection-activity-add disabled={save.isPending}
                                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-50">
                                {save.isPending ? 'Guardando…' : 'Registrar gestión'} <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                            <DropdownMenuLabel className="text-xs font-medium text-zinc-500 dark:text-zinc-400">¿Cómo fue?</DropdownMenuLabel>
                            {COLLECTION_CHANNELS.map((channel) => (
                                <DropdownMenuItem key={channel.value} data-collection-channel={channel.value} onSelect={() => save.mutate(channel.value)} className="min-h-11 cursor-pointer text-sm">
                                    {channel.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            {items.length === 0
                ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Todavía no hay gestiones registradas.</p>
                : (
                    <ul className="mt-1 space-y-1">
                        {shown.map((item) => (
                            <li key={item.id} data-collection-activity={item.channel} className="text-xs text-zinc-700 dark:text-zinc-300">
                                {collectionActivityLine(item)}
                                {item.source === 'AVISO' && <span className="text-zinc-500 dark:text-zinc-400"> · desde el aviso</span>}
                            </li>
                        ))}
                    </ul>
                )}
            {items.length > VISIBLE && (
                <button type="button" onClick={() => setShowAll((open) => !open)} className="mt-1 min-h-11 text-xs font-semibold text-primary">
                    {showAll ? 'Ver menos' : `Ver las ${items.length} gestiones`}
                </button>
            )}
        </div>
    );
}
