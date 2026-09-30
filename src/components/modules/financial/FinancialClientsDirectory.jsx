import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { ChevronDown, ChevronUp, Edit, Link2, Loader2, Plus, Search, Users } from '@/components/ui/icons';
import ClientProfileDialog from '@/components/modules/financial/ClientProfileDialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { formatPartyDocument, partyDocumentType } from '@/lib/partyIdentity';
import { cn } from '@/lib/utils';
import { invalidateFinancialQueries } from '@/utils/financialQueryCache';
import { buildClientDirectoryRows, filterClientDirectoryRows } from '@/lib/clientDirectoryRows';

/**
 * La pestaña Clientes de Financiero como directorio (Rodny, 30 de septiembre de 2026:
 * «aquí debería esto rediagramarse … para que aparezca también la ficha de cada cliente
 * cuando lo despliego. Y desde aquí también poder añadir clientes nuevos»).
 *
 * Une dos listas: el directorio —todas las fichas, con o sin movimientos, archivadas
 * incluidas— y la conciliación —lo que suma cada cliente y las etiquetas que solo existen
 * en el Excel—. Al desplegar un cliente se ven su ficha, sus cifras y la conexión con
 * otra ficha, como antes.
 */
const ProfileLine = ({ label, value }) => (
    <div className="min-w-0">
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className={cn('break-words text-sm', value ? 'text-zinc-900 dark:text-white' : 'text-zinc-400')}>{value || 'Sin dato'}</dd>
    </div>
);

export default function FinancialClientsDirectory({
    reconciliation,
    isReconciliationLoading,
    clientTargetChoices,
    canWriteFinancials,
    clientLinkTargets,
    setClientLinkTargets,
    savingClientLinkId,
    onLinkClient,
    onOpenStatement,
    formatCurrency,
    onNotice
}) {
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(null);
    const [search, setSearch] = useState('');
    const [dialog, setDialog] = useState(null);

    const { data: directory = [], isLoading: isDirectoryLoading, error: directoryError } = useQuery({
        queryKey: ['financial-client-directory'],
        queryFn: async () => {
            const { data } = await axios.get(`${getApiBaseUrl()}/api/financials/clients`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
            });
            return Array.isArray(data?.clients) ? data.clients : [];
        },
        staleTime: 30000
    });

    const rows = useMemo(() => buildClientDirectoryRows(directory, reconciliation?.clients || []), [directory, reconciliation]);
    const visible = useMemo(() => filterClientDirectoryRows(rows, search), [rows, search]);

    const handleSaved = async (client, message) => {
        await invalidateFinancialQueries(queryClient);
        if (client?.id) setExpanded(client.id);
        onNotice?.(message || 'Ficha del cliente guardada.');
    };

    const isLoading = isDirectoryLoading || isReconciliationLoading;

    return (
        <div className="space-y-4 animate-in fade-in duration-200" data-financial-clients-directory>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Clientes</h2>
                    <p className="mt-1 text-xs text-zinc-500">
                        El directorio de clientes: su ficha para la cuenta de cobro y lo que suman en el financiero. Abre uno para ver su ficha o conectarlo con otro.
                    </p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                        <span className="sr-only">Buscar cliente</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, documento o correo"
                            className="min-h-11 w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white" />
                    </label>
                    {canWriteFinancials && (
                        <button type="button" onClick={() => setDialog({ client: null })}
                            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                            <Plus className="h-4 w-4" />Nuevo cliente
                        </button>
                    )}
                </div>
            </div>

            <Card className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
                {directoryError && <p role="alert" className="border-b border-zinc-200 px-4 py-3 text-sm text-destructive brain-destructive-text dark:border-white/10">No fue posible cargar las fichas de los clientes. Lo que suman sigue abajo.</p>}
                {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />Cargando clientes...
                    </div>
                ) : visible.length > 0 ? (
                    <ul className="divide-y divide-zinc-200 dark:divide-white/10">
                        {visible.map((row) => {
                            const isOpen = expanded === row.sourceId || expanded === row.clientId;
                            const targetId = clientLinkTargets[row.sourceId] || '';
                            const isSaving = savingClientLinkId === row.sourceId;
                            const profile = row.profile;
                            const identity = profile
                                ? [profile.legalName, formatPartyDocument(profile)].filter(Boolean).join(' · ')
                                : null;
                            return (
                                <li key={row.sourceId} className="min-w-0" data-client-row={row.clientId || row.sourceId}>
                                    <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : row.sourceId)}
                                        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5">
                                        {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />}
                                        <div className="min-w-0 flex-1">
                                            <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white">
                                                <span className="truncate">{row.name}</span>
                                                {profile?.isArchived && <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-300">Archivado</span>}
                                            </p>
                                            <p className="truncate text-xs text-zinc-500">
                                                {!row.clientId
                                                    ? 'Solo en el Excel · sin ficha'
                                                    : identity || 'Ficha sin datos de cobro'}
                                                {row.recordCount ? ` · ${row.recordCount} ${row.recordCount === 1 ? 'registro' : 'registros'}` : ''}
                                            </p>
                                        </div>
                                        <div className="hidden shrink-0 text-right sm:block">
                                            <p className="text-sm tabular-nums text-zinc-900 dark:text-white">{formatCurrency(row.income || 0)}</p>
                                            <p className="text-xs text-zinc-500">ingresos</p>
                                        </div>
                                        <div className="w-28 shrink-0 text-right sm:w-32">
                                            <p className={cn('text-sm tabular-nums', row.receivable > 0 ? 'font-semibold text-zinc-900 dark:text-white' : 'text-zinc-500')}>{formatCurrency(row.receivable || 0)}</p>
                                            <p className="text-xs text-zinc-500">cartera</p>
                                        </div>
                                    </button>
                                    {isOpen && (
                                        <div className="grid gap-4 border-t border-zinc-200 bg-zinc-50/60 px-4 py-4 dark:border-white/10 dark:bg-white/5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                                            <section className="min-w-0 space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900" data-client-profile-card>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Ficha del cliente</h3>
                                                        <p className="text-xs text-zinc-500">Lo que va en la cuenta de cobro y a quién se le cobra.</p>
                                                    </div>
                                                    {profile && canWriteFinancials && (
                                                        <button type="button" onClick={() => setDialog({ client: profile })}
                                                            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/5">
                                                            <Edit className="h-3.5 w-3.5" />Editar ficha
                                                        </button>
                                                    )}
                                                </div>
                                                {profile ? (
                                                    <dl className="grid gap-3 sm:grid-cols-2">
                                                        <ProfileLine label="Nombre completo o razón social" value={profile.legalName} />
                                                        <ProfileLine label="Documento" value={profile.documentNumber ? `${partyDocumentType(profile.documentType)?.name || profile.documentType} ${profile.documentNumber}` : null} />
                                                        <ProfileLine label="Persona de contacto" value={profile.contactName} />
                                                        <ProfileLine label="Correo" value={profile.email} />
                                                        <ProfileLine label="Teléfono" value={profile.phone} />
                                                        <ProfileLine label="Dirección" value={profile.address} />
                                                        <ProfileLine label="Ciudad" value={profile.city} />
                                                        <ProfileLine label="País" value={profile.country} />
                                                    </dl>
                                                ) : (
                                                    <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                                                        <p>Este nombre solo existe en el Excel: no tiene ficha. Conéctalo con la ficha del cliente real, o créale una.</p>
                                                        {canWriteFinancials && (
                                                            <button type="button" onClick={() => setDialog({ client: null, initialName: row.name })}
                                                                className="min-h-11 text-sm font-medium text-primary underline underline-offset-2">
                                                                Crear una ficha con este nombre
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </section>
                                            <section className="min-w-0 space-y-3">
                                                <div className="grid grid-cols-3 gap-3 text-xs">
                                                    <p className="text-zinc-500">Ingresos <span className="block text-sm tabular-nums text-zinc-900 dark:text-white">{formatCurrency(row.income || 0)}</span></p>
                                                    <p className="text-zinc-500">Cartera <span className="block text-sm tabular-nums text-zinc-900 dark:text-white">{formatCurrency(row.receivable || 0)}</span></p>
                                                    <p className="text-zinc-500">Registros <span className="block text-sm tabular-nums text-zinc-900 dark:text-white">{row.recordCount}</span></p>
                                                </div>
                                                <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
                                                    <div>
                                                        <p className="text-sm font-medium text-zinc-900 dark:text-white">Conexión con otra ficha</p>
                                                        <p className="text-xs text-zinc-500">Sus movimientos y su cartera pasan a la ficha que elijas. Los archivados también aparecen, marcados.</p>
                                                    </div>
                                                    <div className="flex flex-col gap-2 sm:flex-row">
                                                        <Select value={targetId} disabled={isSaving || !canWriteFinancials} aria-label={`Cliente real para ${row.name}`}
                                                            onChange={(event) => setClientLinkTargets((prev) => ({ ...prev, [row.sourceId]: event.target.value }))}
                                                            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white">
                                                            <option value="">Seleccionar cliente...</option>
                                                            {clientTargetChoices.filter((target) => target.id !== row.clientId).map((target) => (
                                                                <option key={target.id} value={target.id}>{target.label}</option>
                                                            ))}
                                                        </Select>
                                                        {canWriteFinancials && (
                                                            <button type="button" disabled={!targetId || isSaving} onClick={() => onLinkClient(row.sourceId)}
                                                                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                                                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Vincular
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {row.clientId && (
                                                    <button type="button" className="min-h-11 text-sm font-medium text-primary underline underline-offset-2"
                                                        onClick={() => onOpenStatement({ id: row.clientId, name: row.name })}>
                                                        Ver estado de cuenta
                                                    </button>
                                                )}
                                            </section>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="py-16 text-center">
                        <Users className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{search ? 'Ningún cliente coincide con la búsqueda' : 'Todavía no hay clientes'}</p>
                        <p className="mt-1 text-xs text-zinc-500">{search ? 'Prueba con el nombre, el documento o el correo.' : 'Crea el primero con «Nuevo cliente».'}</p>
                    </div>
                )}
            </Card>

            {dialog && (
                <ClientProfileDialog
                    open
                    client={dialog.client}
                    initialName={dialog.initialName}
                    onClose={() => setDialog(null)}
                    onSaved={handleSaved}
                />
            )}
        </div>
    );
}
