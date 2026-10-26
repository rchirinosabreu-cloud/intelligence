import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown, ChevronUp, Edit, Link2, Loader2, Plus, Search, Users } from '@/components/ui/icons';
import ClientProfileDialog from '@/components/modules/financial/ClientProfileDialog';
import { ThirdPartyDialog } from './ThirdParties';
import { FinancialSectionHeader, FinancialSummaryCard } from './FinancialSectionParts';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { partyDocumentType } from '@/lib/partyIdentity';
import { THIRD_PARTY_KINDS, thirdPartyKindLabel } from '@/lib/accountsPayable';
import { CRM_STAGES } from '@/lib/crmRules';
import { cn } from '@/lib/utils';
import { invalidateFinancialQueries } from '@/utils/financialQueryCache';
import {
    PARTY_ROLES, buildClientDirectoryRows, buildPartyRows, filterPartyRows, isClientDirectoryRowOpen,
    isPartyActive, partyContact, partyDocument, partyRoleLabel, summarizeParties
} from '@/lib/clientDirectoryRows';

/**
 * Terceros (Elisa, 23 de octubre de 2026: «el tema de terceros, nos gusta como lo hacen acá»): una
 * sola lista con todos los terceros de Brain Studio y sus roles —clientes, y a quienes se les paga:
 * proveedores, colaboradores, arrendador, socios—, con su documento, contacto y estado. Un tercero
 * que también es cliente es una sola fila con los dos roles. Sustituye al directorio de clientes de
 * Financiero y a la ventana «Terceros» de Por pagar: al desplegar una fila están su ficha de cliente
 * (la que va en la cuenta de cobro), su ficha de pago y, para lo que solo quedó en el Excel, la
 * vinculación de siempre.
 */
const authed = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const apiUrl = (path) => `${getApiBaseUrl()}/api/financials${path}`;

const ProfileLine = ({ label, value }) => (
    <div className="min-w-0">
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className={cn('break-words text-sm', value ? 'text-zinc-900 dark:text-white' : 'text-zinc-400')}>{value || 'Sin dato'}</dd>
    </div>
);

const RoleChip = ({ children, tone = 'neutral' }) => (
    <span className={cn('inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium',
        tone === 'client' ? 'bg-brand-green/10 text-brand-green-deep dark:text-brand-green'
            : tone === 'prospect' ? 'bg-brand-yellow/15 text-brand-yellow-deep dark:text-brand-yellow'
                : tone === 'muted' ? 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300'
                    : 'bg-brand-coral/10 text-brand-coral-deep dark:text-brand-coral')}>
        {children}
    </span>
);
const roleTone = (role) => (role === 'CLIENTE' ? 'client' : role === 'CLIENTE_POTENCIAL' ? 'prospect' : 'pay');

const QUOTATION_STATUS_LABELS = { BORRADOR: 'Borrador', ACTIVA: 'Enviada', APROBADA: 'Aprobada' };
const crmStageLabel = (value) => CRM_STAGES.find((stage) => stage.value === value)?.label || value;
const shortDate = (value) => (value ? new Date(value).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }) : '');

/** Las cotizaciones de un tercero, con su estado: lo que se le ha propuesto, de dónde viene la relación. */
const quotationAmount = (quotation) => (quotation.total
    ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: quotation.currency === 'USD' ? 'USD' : 'COP', maximumFractionDigits: quotation.currency === 'USD' ? 2 : 0 }).format(quotation.total)
    : 'Con opciones');

const PartyQuotations = ({ quotations }) => (
    <section className="min-w-0 space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900 lg:col-span-2" data-party-quotations>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Cotizaciones</h3>
        <ul className="divide-y divide-zinc-100 dark:divide-white/5">
            {quotations.map((quotation) => (
                <li key={quotation.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                    <a href={`/cotizaciones/editar/${quotation.id}`} className="font-medium text-primary underline-offset-2 hover:underline">{quotation.code}</a>
                    <span className="text-zinc-500">{QUOTATION_STATUS_LABELS[quotation.status] || quotation.status} · {shortDate(quotation.acceptedAt || quotation.createdAt)}</span>
                    <span className="ml-auto tabular-nums text-zinc-900 dark:text-white">{quotationAmount(quotation)}</span>
                </li>
            ))}
        </ul>
    </section>
);

// Proveedores cuenta a quienes se les paga un servicio; contratistas y outsourcing se dicen aparte.
const providerHint = ({ contractors = 0, outsourcing = 0 }) => {
    const parts = [
        contractors ? `${contractors} contratista${contractors === 1 ? '' : 's'}` : null,
        outsourcing ? `${outsourcing} outsourcing` : null
    ].filter(Boolean);
    return parts.length ? `Incluye ${parts.join(' y ')}` : 'Se les paga';
};

const ROW_GRID ='md:grid md:grid-cols-[9rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.4fr)_5.5rem_1.25rem] md:items-center md:gap-4';

export default function FinancialPartiesDirectory({
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
    const [role, setRole] = useState('');
    const [status, setStatus] = useState('');
    // { kind: 'client', client, initialName, initialProfile, linkThirdPartyId, prospect } | { kind: 'third-party', thirdParty }
    const [dialog, setDialog] = useState(null);
    const [saving, setSaving] = useState(false);
    const [dialogError, setDialogError] = useState('');

    const { data: directory = [], isLoading: isDirectoryLoading, error: directoryError } = useQuery({
        queryKey: ['financial-client-directory'],
        queryFn: async () => {
            const { data } = await axios.get(apiUrl('/clients'), authed());
            return Array.isArray(data?.clients) ? data.clients : [];
        },
        staleTime: 30000
    });
    // La misma consulta y la misma forma que Por pagar: comparten la caché, así que guardan lo mismo
    // (la respuesta entera). Con formas distintas, pasar de una pestaña a la otra tumbaba la pantalla.
    const { data: thirdPartiesData, isLoading: isThirdPartiesLoading, error: thirdPartiesError } = useQuery({
        queryKey: ['financial-third-parties'],
        queryFn: async () => (await axios.get(apiUrl('/third-parties'), { ...authed(), params: { includeInactive: true } })).data,
        staleTime: 30000
    });
    const thirdParties = useMemo(() => (Array.isArray(thirdPartiesData?.thirdParties) ? thirdPartiesData.thirdParties : []), [thirdPartiesData]);
    // Lo comercial: los clientes potenciales que dejó cada cotización y las cotizaciones de cada cliente.
    const { data: commercial, isLoading: isCommercialLoading, error: commercialError } = useQuery({
        queryKey: ['financial-party-commercial'],
        queryFn: async () => (await axios.get(apiUrl('/parties/commercial'), authed())).data,
        staleTime: 30000
    });

    // El equipo activo de Equipo: cada persona es un tercero con el rol Colaborador, sin registrarla a mano.
    const { data: teamData, isLoading: isTeamLoading, error: teamError } = useQuery({
        queryKey: ['financial-party-team'],
        queryFn: async () => (await axios.get(apiUrl('/parties/team'), authed())).data,
        staleTime: 30000
    });
    const team = useMemo(() => (Array.isArray(teamData?.team) ? teamData.team : []), [teamData]);

    const rows = useMemo(() => buildPartyRows(buildClientDirectoryRows(directory, reconciliation?.clients || []), thirdParties, commercial, team), [directory, reconciliation, thirdParties, commercial, team]);
    const summary = useMemo(() => summarizeParties(rows), [rows]);
    const visible = useMemo(() => filterPartyRows(rows, { search, role, status }), [rows, search, role, status]);

    const closeDialog = () => { setDialog(null); setDialogError(''); };
    const afterSave = async (openId, message) => {
        await invalidateFinancialQueries(queryClient);
        if (openId) setExpanded(openId);
        onNotice?.(message);
    };

    const handleClientSaved = async (client, message) => {
        // «También es cliente» desde una ficha de pago: el tercero queda ligado a la ficha recién creada.
        if (client?.id && dialog?.linkThirdPartyId) {
            try {
                await axios.patch(apiUrl(`/third-parties/${dialog.linkThirdPartyId}`), { clientId: client.id }, authed());
            } catch (linkError) {
                console.error('[Terceros] Vínculo con el cliente no guardado:', linkError.response?.data || linkError);
                onNotice?.(linkError.response?.data?.message || 'La ficha del cliente quedó, pero no se pudo unir con su ficha de pago.');
                await invalidateFinancialQueries(queryClient);
                return;
            }
        }
        await afterSave(client?.id, message || 'Ficha del cliente guardada.');
    };

    const saveThirdParty = async (form) => {
        setSaving(true); setDialogError('');
        try {
            const { data } = form.id
                ? await axios.patch(apiUrl(`/third-parties/${form.id}`), form, authed())
                : await axios.post(apiUrl('/third-parties'), form, authed());
            const saved = data?.thirdParty;
            closeDialog();
            await afterSave(saved?.clientId || (saved?.id ? `tercero:${saved.id}` : null), data?.message || 'Tercero guardado.');
        } catch (saveError) {
            console.error('[Terceros] Ficha de pago no guardada:', saveError.response?.data || saveError);
            setDialogError(saveError.response?.data?.message || 'No fue posible guardar el tercero.');
        } finally { setSaving(false); }
    };

    const toggleThirdParty = async (thirdParty) => {
        try {
            const { data } = await axios.patch(apiUrl(`/third-parties/${thirdParty.id}`), { isActive: thirdParty.isActive === false }, authed());
            await afterSave(null, data?.message || (thirdParty.isActive === false ? 'Tercero activado.' : 'Tercero desactivado. Conserva sus cuentas.'));
        } catch (toggleError) {
            console.error('[Terceros] Estado no cambiado:', toggleError.response?.data || toggleError);
            onNotice?.(toggleError.response?.data?.message || 'No fue posible cambiar el estado del tercero.');
        }
    };

    // «Ya es cliente»: se crea su ficha con lo que ya se sabe de él, y su oportunidad queda apuntando a ella.
    const handleProspectClientSaved = async (client, message) => {
        const prospect = dialog?.prospect;
        if (client?.id && prospect?.id) {
            try {
                await axios.post(apiUrl(`/parties/prospects/${prospect.id}/client`), { clientId: client.id }, authed());
            } catch (linkError) {
                console.error('[Terceros] Cliente potencial no unido a su ficha:', linkError.response?.data || linkError);
                onNotice?.(linkError.response?.data?.message || 'La ficha del cliente quedó, pero no se pudo unir con su oportunidad.');
                await invalidateFinancialQueries(queryClient);
                return;
            }
        }
        await afterSave(client?.id, message || 'Ficha del cliente creada. Sus cotizaciones quedaron con ella.');
    };

    const isLoading = isDirectoryLoading || isReconciliationLoading || isThirdPartiesLoading || isCommercialLoading || isTeamLoading;
    const filtersActive = Boolean(search.trim() || role || status);

    return (
        <div className="space-y-4 animate-in fade-in duration-200" data-financial-parties>
            <FinancialSectionHeader title="Terceros"
                description="Todos los terceros de Brain Studio con sus roles: los clientes, quienes recibieron una cotización y a quienes se les paga. Una sola ficha por tercero; despliega uno para ver su ficha de cobro, su ficha de pago o vincularlo.">
                {canWriteFinancials && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button type="button" data-party-new className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                                <Plus className="h-4 w-4" />Nuevo tercero
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>¿Qué es?</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => setDialog({ kind: 'client', client: null })}>Cliente</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* A quienes se les paga: un cliente potencial nace de una cotización, no se crea aquí. */}
                            {THIRD_PARTY_KINDS.map((item) => (
                                <DropdownMenuItem key={item.value} onSelect={() => setDialog({ kind: 'third-party', thirdParty: { kind: item.value } })}>{item.role || item.label}</DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </FinancialSectionHeader>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-party-summary>
                <FinancialSummaryCard label="Total" value={summary.total} hint={summary.unlinked ? `${summary.unlinked} nombre${summary.unlinked === 1 ? '' : 's'} solo en el Excel` : 'Con ficha'} />
                <FinancialSummaryCard label="Clientes" value={summary.clients} hint={summary.prospects ? `Y ${summary.prospects} potencial${summary.prospects === 1 ? '' : 'es'}` : 'Se les cobra'} />
                <FinancialSummaryCard label="Proveedores" value={summary.suppliers} hint={providerHint(summary)} />
                <FinancialSummaryCard label="Colaboradores" value={summary.team} hint={summary.others ? `Y ${summary.others} arrendador, socio u otro` : 'Del equipo'} />
                <FinancialSummaryCard label="Activos" value={summary.active} hint={`${summary.total - summary.active} inactivo${summary.total - summary.active === 1 ? '' : 's'}`} />
            </div>

            <Card className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
                <label className="relative min-w-0">
                    <span className="sr-only">Buscar tercero</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, documento, correo o teléfono"
                        className="min-h-11 w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white" />
                </label>
                <Select aria-label="Rol" value={role} onChange={(event) => setRole(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white">
                    <option value="">Todos los roles</option>
                    {PARTY_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    <option value="SIN_FICHA">Solo en el Excel</option>
                </Select>
                <Select aria-label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-white">
                    <option value="">Activos e inactivos</option>
                    <option value="ACTIVO">Activos</option>
                    <option value="INACTIVO">Inactivos</option>
                </Select>
            </Card>

            <Card className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
                {(directoryError || thirdPartiesError || commercialError || teamError) && <p role="alert" className="border-b border-zinc-200 px-4 py-3 text-sm text-destructive brain-destructive-text dark:border-white/10">No fue posible cargar todas las fichas. Lo que sí cargó sigue abajo.</p>}
                <div className={cn('hidden border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 text-xs font-medium text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400', ROW_GRID)} aria-hidden="true">
                    <span>NIT / CC</span><span>Nombre</span><span>Roles</span><span>Contacto</span><span>Estado</span><span />
                </div>
                {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />Cargando terceros…
                    </div>
                ) : visible.length > 0 ? (
                    <ul className="divide-y divide-zinc-200 dark:divide-white/10">
                        {visible.map((row) => {
                            const isOpen = isClientDirectoryRowOpen(row, expanded);
                            const targetId = clientLinkTargets[row.sourceId] || '';
                            const isSaving = savingClientLinkId === row.sourceId;
                            const profile = row.profile;
                            const thirdParty = row.thirdParty;
                            const legalName = profile?.legalName || thirdParty?.legalName;
                            const active = isPartyActive(row);
                            return (
                                <li key={row.sourceId} className="min-w-0" data-party-row={row.clientId || row.sourceId} data-client-row={row.clientId || row.sourceId}>
                                    <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : row.sourceId)}
                                        className={cn('flex min-h-11 w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5', ROW_GRID)}>
                                        <span className="order-3 text-xs tabular-nums text-zinc-500 md:order-none md:text-sm md:text-zinc-700 md:dark:text-zinc-200">{partyDocument(row) || '—'}</span>
                                        <span className="order-1 min-w-0 md:order-none">
                                            <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">{row.name}</span>
                                            {row.unlinked
                                                ? <span className="block truncate text-xs text-zinc-500">Solo en el Excel · sin ficha{row.recordCount ? ` · ${row.recordCount} ${row.recordCount === 1 ? 'registro' : 'registros'}` : ''}</span>
                                                : row.teamMember?.role ? <span className="block truncate text-xs text-zinc-500">{row.teamMember.role}</span>
                                                    : legalName && legalName !== row.name ? <span className="block truncate text-xs text-zinc-500">{legalName}</span> : null}
                                        </span>
                                        <span className="order-2 flex flex-wrap gap-1 md:order-none" data-party-roles>
                                            {row.unlinked ? <RoleChip tone="muted">Sin ficha</RoleChip>
                                                : row.roles.map((item) => <RoleChip key={item} tone={roleTone(item)}>{partyRoleLabel(item)}</RoleChip>)}
                                        </span>
                                        <span className="order-4 hidden truncate text-sm text-zinc-600 dark:text-zinc-300 md:order-none md:block">{partyContact(row) || '—'}</span>
                                        <span className="order-5 hidden md:order-none md:block">
                                            {!row.unlinked && <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', active ? 'bg-brand-cyan/10 text-brand-cyan-deep dark:text-brand-cyan' : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300')}>{active ? 'Activo' : 'Inactivo'}</span>}
                                        </span>
                                        <span className="hidden md:block">{isOpen ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}</span>
                                    </button>
                                    {isOpen && (
                                        <div className="grid gap-4 border-t border-zinc-200 bg-zinc-50/60 px-4 py-4 dark:border-white/10 dark:bg-white/5 lg:grid-cols-2">
                                            {/* La ficha de cliente: lo que va en la cuenta de cobro. */}
                                            {(row.clientId || row.unlinked) && (
                                                <section className="min-w-0 space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900" data-client-profile-card>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Ficha del cliente</h3>
                                                            <p className="text-xs text-zinc-500">Lo que va en la cuenta de cobro y a quién se le cobra.</p>
                                                        </div>
                                                        {profile && canWriteFinancials && (
                                                            <button type="button" onClick={() => setDialog({ kind: 'client', client: profile })}
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
                                                                <button type="button" onClick={() => setDialog({ kind: 'client', client: null, initialName: row.name })}
                                                                    className="min-h-11 text-sm font-medium text-primary underline underline-offset-2">
                                                                    Crear una ficha con este nombre
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-3 gap-3 border-t border-zinc-100 pt-3 text-xs dark:border-white/5">
                                                        <p className="text-zinc-500">Ingresos <span className="block text-sm tabular-nums text-zinc-900 dark:text-white">{formatCurrency(row.income || 0)}</span></p>
                                                        <p className="text-zinc-500">Por cobrar <span className="block text-sm tabular-nums text-zinc-900 dark:text-white">{formatCurrency(row.receivable || 0)}</span></p>
                                                        <p className="text-zinc-500">Registros <span className="block text-sm tabular-nums text-zinc-900 dark:text-white">{row.recordCount}</span></p>
                                                    </div>
                                                    {row.clientId && (
                                                        <button type="button" className="min-h-11 text-sm font-medium text-primary underline underline-offset-2"
                                                            onClick={() => onOpenStatement({ id: row.clientId, name: row.name })}>
                                                            Ver estado de cuenta
                                                        </button>
                                                    )}
                                                </section>
                                            )}

                                            {/* Cliente potencial: nació de una cotización y vive como oportunidad en el CRM. */}
                                            {row.prospect && (
                                                <section className="min-w-0 space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900" data-prospect-card>
                                                    <div className="min-w-0">
                                                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Cliente potencial</h3>
                                                        <p className="text-xs text-zinc-500">Recibió una cotización y todavía no tiene ficha de cliente. Su seguimiento está en el CRM.</p>
                                                    </div>
                                                    <dl className="grid gap-3 sm:grid-cols-2">
                                                        <ProfileLine label="Persona de contacto" value={row.prospect.contactName} />
                                                        <ProfileLine label="Correo" value={row.prospect.email} />
                                                        <ProfileLine label="Teléfono" value={row.prospect.phone} />
                                                        <ProfileLine label="En el CRM" value={`${row.prospect.code} · ${crmStageLabel(row.prospect.stage)}`} />
                                                        <ProfileLine label="Responsable comercial" value={row.prospect.owner?.name} />
                                                    </dl>
                                                    <div className="flex flex-wrap gap-x-4">
                                                        <a href={`/crm/oportunidades/${row.prospect.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2">Ver en el CRM</a>
                                                        {canWriteFinancials && (
                                                            <button type="button" data-prospect-make-client
                                                                onClick={() => setDialog({ kind: 'client', client: null, initialName: row.name, initialProfile: { contactName: row.prospect.contactName || '', email: row.prospect.email || '', phone: row.prospect.phone || '' }, prospect: row.prospect })}
                                                                className="min-h-11 text-sm font-medium text-primary underline underline-offset-2">
                                                                Ya es cliente: crear su ficha
                                                            </button>
                                                        )}
                                                    </div>
                                                </section>
                                            )}

                                            {/* La ficha de pago: a quién y cómo se le paga. */}
                                            {thirdParty ? (
                                                <section className="min-w-0 space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900" data-third-party-card>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Ficha de pago</h3>
                                                            <p className="text-xs text-zinc-500">{row.teamMember ? `${thirdPartyKindLabel(thirdParty.kind)} · del equipo` : thirdPartyKindLabel(thirdParty.kind)}: a quién y cómo le paga Brain Studio.</p>
                                                        </div>
                                                        {canWriteFinancials && (
                                                            <button type="button" onClick={() => setDialog({ kind: 'third-party', thirdParty })}
                                                                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/5">
                                                                <Edit className="h-3.5 w-3.5" />Editar
                                                            </button>
                                                        )}
                                                    </div>
                                                    <dl className="grid gap-3 sm:grid-cols-2">
                                                        <ProfileLine label="Razón social" value={thirdParty.legalName} />
                                                        <ProfileLine label="Documento" value={thirdParty.documentNumber ? `${thirdParty.documentType || ''} ${thirdParty.documentNumber}`.trim() : null} />
                                                        <ProfileLine label="Correo" value={thirdParty.email} />
                                                        <ProfileLine label="Teléfono" value={thirdParty.phone} />
                                                        <ProfileLine label="Banco" value={thirdParty.bankName ? `${thirdParty.bankName}${thirdParty.bankAccountType ? ` · ${thirdParty.bankAccountType.toLowerCase()}` : ''}` : null} />
                                                        <ProfileLine label="Número de cuenta" value={thirdParty.bankAccountNumber} />
                                                    </dl>
                                                    {thirdParty.notes && <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">{thirdParty.notes}</p>}
                                                    {canWriteFinancials && (
                                                        <button type="button" data-third-party-toggle onClick={() => toggleThirdParty(thirdParty)}
                                                            className={cn('min-h-11 text-sm font-medium underline underline-offset-2', thirdParty.isActive === false ? 'text-primary' : 'text-zinc-500 hover:text-destructive')}>
                                                            {thirdParty.isActive === false ? 'Activar' : 'Desactivar'}
                                                        </button>
                                                    )}
                                                </section>
                                            ) : row.clientId && canWriteFinancials ? (
                                                <section className="min-w-0 space-y-2 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-300">
                                                    <p>Si Brain Studio también le paga a este cliente, guárdale aquí su ficha de pago: queda en la misma fila, con los dos roles.</p>
                                                    <button type="button" data-party-add-payment onClick={() => setDialog({ kind: 'third-party', thirdParty: { kind: 'PROVEEDOR', name: row.name, legalName: profile?.legalName || '', documentType: profile?.documentType || '', documentNumber: profile?.documentNumber || '', email: profile?.email || '', phone: profile?.phone || '', clientId: row.clientId } })}
                                                        className="min-h-11 font-medium text-primary underline underline-offset-2">
                                                        También se le paga
                                                    </button>
                                                </section>
                                            ) : row.teamMember ? (
                                                // Alguien del equipo sin ficha de pago: está en Terceros por ser del equipo; sus datos de pago se completan una vez.
                                                <section className="min-w-0 space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900 lg:col-span-2" data-team-member-card>
                                                    <div className="min-w-0">
                                                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Del equipo</h3>
                                                        <p className="text-xs text-zinc-500">Está en Terceros por ser parte del equipo. Sus tareas y permisos siguen en Equipo; aquí va lo de dinero: documento, banco, préstamos y lo que se le paga.</p>
                                                    </div>
                                                    <dl className="grid gap-3 sm:grid-cols-2">
                                                        <ProfileLine label="Cargo" value={row.teamMember.role} />
                                                        <ProfileLine label="Correo" value={row.teamMember.email} />
                                                    </dl>
                                                    {canWriteFinancials && (
                                                        <button type="button" data-team-member-add-payment
                                                            onClick={() => setDialog({ kind: 'third-party', thirdParty: { kind: 'COLABORADOR', name: row.teamMember.name, email: row.teamMember.email || '', teamMemberId: row.teamMember.id } })}
                                                            className="min-h-11 text-sm font-medium text-primary underline underline-offset-2">
                                                            Completar datos de pago
                                                        </button>
                                                    )}
                                                </section>
                                            ) : null}

                                            {thirdParty && !row.clientId && !row.teamMember && canWriteFinancials && (
                                                <section className="min-w-0 space-y-2 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-300">
                                                    <p>Si además es cliente, créale su ficha de cobro: queda unida a esta.</p>
                                                    <button type="button" data-party-add-client onClick={() => setDialog({ kind: 'client', client: null, initialName: row.name, linkThirdPartyId: thirdParty.id })}
                                                        className="min-h-11 font-medium text-primary underline underline-offset-2">
                                                        También es cliente
                                                    </button>
                                                </section>
                                            )}

                                            {row.quotations?.length > 0 && <PartyQuotations quotations={row.quotations} />}

                                            {/* La vinculación de siempre: pasar movimientos y cartera a otra ficha. */}
                                            {(row.clientId || row.unlinked) && (
                                                <section className="min-w-0 space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-900 lg:col-span-2">
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
                                                </section>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="py-16 text-center">
                        <Users className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{filtersActive ? 'Ningún tercero coincide con estos filtros' : 'Todavía no hay terceros'}</p>
                        <p className="mt-1 text-xs text-zinc-500">{filtersActive ? 'Prueba con el nombre, el documento o el correo, o quita un filtro.' : 'Crea el primero con «Nuevo tercero».'}</p>
                    </div>
                )}
            </Card>

            {dialog?.kind === 'client' && (
                <ClientProfileDialog open client={dialog.client} initialName={dialog.initialName} initialProfile={dialog.initialProfile}
                    onClose={closeDialog} onSaved={dialog.prospect ? handleProspectClientSaved : handleClientSaved} />
            )}
            {dialog?.kind === 'third-party' && (
                <ThirdPartyDialog open thirdParty={dialog.thirdParty} saving={saving} error={dialogError} onClose={closeDialog} onSubmit={saveThirdParty} />
            )}
        </div>
    );
}
