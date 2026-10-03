import React, { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Facebook, Instagram, Loader2, Megaphone, Plus, Search, X } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { filterAdAccounts, insightWindows, splitCampaigns } from '@/lib/metaReportSources';

/**
 * Cifras de Meta para un informe (Rodny, 2 de octubre de 2026: «¿no podríamos hacer eso consultando
 * directamente el Meta Business del cliente?»). Instagram sale de la cuenta que el cliente ya tiene
 * conectada para publicar; la pauta, de una cuenta publicitaria que se elige una vez por cliente.
 * Subir capturas sigue al lado, igual que siempre, y se puede combinar.
 *
 * Facebook llegó el mismo día: la página que el cliente ya tiene conectada.
 *
 * Nada viene marcado: la persona elige qué trae (misma regla que las cuentas de una pieza). Un informe
 * lleva **una** cuenta de Instagram, **una** página y **una** de pauta: dos del mismo tipo darían dos cifras
 * distintas para el mismo indicador y el informe las marcaría como conflicto.
 */
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const chipClass = (active) => `inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${active
  ? 'border-brand-cyan bg-brand-cyan-soft/40 text-slate-900 dark:bg-brand-cyan/10 dark:text-slate-50'
  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`;

const LinkAdAccountDialog = ({ clientId, open, onClose, onLinked }) => {
  const [accountId, setAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const listId = useId();
  const filterId = useId();
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-meta-ad-accounts'],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/reports/meta/ad-accounts/available`, { headers: authHeaders() })).data
  });
  const close = () => {
    setSearch('');
    setAccountId('');
    setCampaignFilter('');
    onClose();
  };
  const link = useMutation({
    mutationFn: async () => (await axios.post(`${getApiBaseUrl()}/api/reports/meta/ad-accounts`, { clientId, adAccountId: chosenId, campaignFilter }, { headers: authHeaders() })).data,
    onSuccess: (row) => {
      onLinked(row);
      toast.success('Cuenta publicitaria vinculada');
      close();
    },
    onError: (err) => {
      console.error('[ReportMeta] No se pudo vincular la cuenta publicitaria:', err.response?.data || err.message || err);
      toast.error(err.response?.data?.error || 'No se pudo vincular la cuenta publicitaria.');
    }
  });
  const accounts = data?.accounts || [];
  const unavailable = error?.response?.data?.error;
  // Solo se vincula una cuenta que está a la vista: si la búsqueda la esconde, «Vincular» se apaga.
  const visible = filterAdAccounts(accounts, search);
  const chosenId = visible.some((account) => account.id === accountId) ? accountId : '';
  // Las campañas de la cuenta elegida (últimos 90 días), una sola vez por cuenta; la palabra se compara
  // aquí mismo con la misma regla del servidor, así lo que se ve es lo que entraría al informe.
  const campaignsQuery = useQuery({
    queryKey: ['report-meta-campaigns', chosenId],
    enabled: open && Boolean(chosenId),
    staleTime: 60_000,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/reports/meta/ad-accounts/${encodeURIComponent(chosenId)}/campaigns`, { headers: authHeaders() })).data
  });
  const campaigns = [...(campaignsQuery.data?.matching || []), ...(campaignsQuery.data?.others || [])];
  const preview = splitCampaigns(campaigns, campaignFilter);
  const names = (rows, max = 6) => `${rows.slice(0, max).map((row) => `«${row.name}»`).join(', ')}${rows.length > max ? ` y ${rows.length - max} más` : ''}`;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle>Cuenta publicitaria del cliente</DialogTitle>
        <DialogDescription>Elige de qué cuenta publicitaria de Meta sale la pauta de este cliente. Se elige una vez y queda guardada.</DialogDescription>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Consultando las cuentas publicitarias en Meta…</div>
        ) : unavailable ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{unavailable}</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">La llave de Meta de la agencia todavía no ve ninguna cuenta publicitaria.</p>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre o número de cuenta"
                aria-label="Buscar cuenta publicitaria"
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-brand-cyan dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
            </div>
            {visible.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Ninguna cuenta coincide con «{search.trim()}».</p>
            ) : (
              <fieldset className="max-h-[40vh] space-y-2 overflow-y-auto pr-1" aria-labelledby={listId}>
                <legend id={listId} className="sr-only">Cuentas publicitarias disponibles</legend>
                {visible.map((account) => (
                  <label key={account.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${chosenId === account.id ? 'border-brand-cyan bg-brand-cyan-soft/40 dark:bg-brand-cyan/10' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                    <input type="radio" name="report-ad-account" value={account.id} checked={chosenId === account.id} onChange={() => setAccountId(account.id)} className="accent-brand-cyan" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-slate-900 dark:text-slate-50">{account.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {[account.currency, `Cuenta ${account.id}`, account.isActive === false ? 'Inactiva' : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {/* Una cuenta publicitaria no es un cliente: la de la agencia lleva campañas de varios. */}
            <label htmlFor={filterId} className="block space-y-1.5">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Solo las campañas cuyo nombre contiene (opcional)</span>
              <input
                id={filterId}
                value={campaignFilter}
                maxLength={80}
                onChange={(event) => setCampaignFilter(event.target.value)}
                placeholder="Ej. Titanes"
                autoComplete="off"
                data-report-campaign-filter
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-cyan dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
              <span className="block text-xs leading-relaxed text-slate-500 dark:text-slate-400">Si en esta cuenta corren campañas de varios clientes, escribe la palabra que distingue las de este. Vacío cuenta la cuenta entera.</span>
            </label>
            {chosenId && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" aria-live="polite" data-report-campaign-preview>
                {campaignsQuery.isLoading ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando las campañas de los últimos 90 días…</span>
                ) : campaignsQuery.error ? (
                  <span className="text-destructive">{campaignsQuery.error.response?.data?.error || 'No se pudieron consultar las campañas de esta cuenta.'}</span>
                ) : campaigns.length === 0 ? (
                  <span>Esta cuenta no tuvo campañas con actividad en los últimos 90 días.</span>
                ) : !campaignFilter.trim() ? (
                  <span>Sin palabra entran las <strong>{campaigns.length}</strong> campañas de los últimos 90 días: {names(campaigns)}.</span>
                ) : preview.matching.length === 0 ? (
                  <span className="text-destructive">Ninguna de las {campaigns.length} campañas de los últimos 90 días lleva «{campaignFilter.trim()}»: con esa palabra el informe saldría sin pauta. Están: {names(preview.others)}.</span>
                ) : (
                  <span>
                    Entran <strong>{preview.matching.length}</strong> de {campaigns.length}: {names(preview.matching)}.
                    {preview.others.length > 0 && <> Quedan fuera: {names(preview.others)}.</>}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>Cancelar</Button>
          <Button type="button" onClick={() => link.mutate()} disabled={!chosenId || link.isPending}>
            {link.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Vincular
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ReportMetaSources = ({ clientId, canManage = false, disabled = false, period, instagramAccountId = '', facebookAccountId = '', adAccountId = '', onInstagramChange, onFacebookChange, onAdAccountChange }) => {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-meta-sources', clientId],
    enabled: Boolean(clientId),
    staleTime: 30_000,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/reports/meta/sources`, { params: { clientId }, headers: authHeaders() })).data
  });
  const unlink = useMutation({
    mutationFn: async (id) => (await axios.delete(`${getApiBaseUrl()}/api/reports/meta/ad-accounts/${id}`, { headers: authHeaders() })).data,
    onSuccess: (_row, id) => {
      if (adAccountId === id) onAdAccountChange('');
      queryClient.invalidateQueries({ queryKey: ['report-meta-sources', clientId] });
      toast.success('Cuenta publicitaria desvinculada');
    },
    onError: (err) => {
      console.error('[ReportMeta] No se pudo desvincular la cuenta publicitaria:', err.response?.data || err.message || err);
      toast.error(err.response?.data?.error || 'No se pudo desvincular la cuenta publicitaria.');
    }
  });

  if (!clientId) return null;
  const instagram = data?.instagram || [];
  const adAccounts = data?.adAccounts || [];
  // Lo elegido solo vale si sigue en la lista: una cuenta desconectada entretanto no se manda.
  const facebook = data?.facebook || [];
  const chosenInstagram = instagram.some((account) => account.id === instagramAccountId) ? instagramAccountId : '';
  const chosenFacebook = facebook.some((account) => account.id === facebookAccountId) ? facebookAccountId : '';
  const chosenAds = adAccounts.some((account) => account.id === adAccountId) ? adAccountId : '';
  const longPeriod = Boolean(chosenInstagram) && insightWindows(period?.start, period?.end).length > 1;

  const handleUnlink = async (account) => {
    const ok = await confirm({
      title: 'Desvincular la cuenta publicitaria',
      description: `«${account.name}» deja de ofrecerse para los informes de este cliente. Los informes ya hechos no cambian.`,
      confirmLabel: 'Desvincular',
      tone: 'danger'
    });
    if (ok) unlink.mutate(account.id);
  };

  return (
    <section className="border-t border-slate-200 pt-6 dark:border-slate-700" aria-labelledby="report-meta-title" data-report-meta-sources>
      <h2 id="report-meta-title" className="text-sm font-semibold text-slate-900 dark:text-slate-50">Cifras de Meta</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Instagram, Facebook y la pauta llegan directo de Meta, sin capturas. Marca lo que quieras traer; también puedes sumar capturas.</p>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando las cuentas del cliente…</div>
      ) : error ? (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error.response?.data?.error || 'No se pudieron cargar las cuentas de Meta de este cliente.'}</p>
      ) : data?.configured === false ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">La conexión con Meta no está configurada en el servidor. Por ahora el informe se arma con capturas.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 space-y-2" role="group" aria-labelledby="report-meta-instagram">
            <h3 id="report-meta-instagram" className="flex min-h-9 items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><Instagram className="h-4 w-4" aria-hidden="true" /> Instagram</h3>
            {instagram.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Este cliente no tiene Instagram conectado. Se conecta en su ficha, en «Redes conectadas».</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {instagram.map((account) => {
                  const active = chosenInstagram === account.id;
                  return (
                    <button key={account.id} type="button" disabled={disabled} aria-pressed={active} data-report-meta-instagram={account.id}
                      onClick={() => onInstagramChange(active ? '' : account.id)} className={chipClass(active)}>
                      <span className="truncate font-medium">{account.displayName}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {longPeriod && (
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400" data-report-meta-long-period>Este período pasa de 30 días: Meta no entrega el alcance de un período así, y el informe saldrá sin él. Lo demás sí llega.</p>
            )}
          </div>

          {/* Facebook (2 de octubre de 2026): la página que el cliente ya tiene conectada para publicar. */}
          <div className="min-w-0 space-y-2" role="group" aria-labelledby="report-meta-facebook">
            <h3 id="report-meta-facebook" className="flex min-h-9 items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><Facebook className="h-4 w-4" aria-hidden="true" /> Facebook</h3>
            {facebook.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Este cliente no tiene página de Facebook conectada. Se conecta en su ficha, en «Redes conectadas».</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {facebook.map((account) => {
                  const active = chosenFacebook === account.id;
                  return (
                    <button key={account.id} type="button" disabled={disabled} aria-pressed={active} data-report-meta-facebook={account.id}
                      onClick={() => onFacebookChange(active ? '' : account.id)} className={chipClass(active)}>
                      <span className="truncate font-medium">{account.displayName}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {Boolean(chosenFacebook) && (
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400" data-report-meta-facebook-note>De la página llegan visualizaciones, espectadores, interacciones, visitas, seguidores y cada publicación del período.</p>
            )}
          </div>

          <div className="min-w-0 space-y-2" role="group" aria-labelledby="report-meta-ads">
            <div className="flex min-h-9 items-center justify-between gap-2">
              <h3 id="report-meta-ads" className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><Megaphone className="h-4 w-4" aria-hidden="true" /> Pauta</h3>
              {canManage && (
                <button type="button" disabled={disabled} onClick={() => setDialogOpen(true)} aria-label="Vincular cuenta publicitaria" title="Vincular cuenta publicitaria"
                  className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 ${adAccounts.length ? 'w-9' : 'px-3'}`}>
                  <Plus className="h-4 w-4" />
                  {!adAccounts.length && <span>Vincular cuenta publicitaria</span>}
                </button>
              )}
            </div>
            {adAccounts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Este cliente todavía no tiene cuenta publicitaria vinculada. {canManage ? 'Vincúlala una vez y queda para todos sus informes.' : 'La vincula un administrador o project manager.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {adAccounts.map((account) => {
                  const active = chosenAds === account.id;
                  return (
                    <span key={account.id} className="inline-flex min-w-0 max-w-full items-center gap-1">
                      <button type="button" disabled={disabled} aria-pressed={active} data-report-meta-ad-account={account.id}
                        onClick={() => onAdAccountChange(active ? '' : account.id)} className={chipClass(active)}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{account.name}</span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{account.campaignFilter ? `Campañas con «${account.campaignFilter}»` : 'Toda la cuenta'}{account.currency ? ` · ${account.currency}` : ''}</span>
                        </span>
                      </button>
                      {canManage && (
                        <button type="button" disabled={disabled || unlink.isPending} onClick={() => handleUnlink(account)} aria-label={`Desvincular ${account.name}`}
                          className="brain-danger-button-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {canManage && (
        <LinkAdAccountDialog
          clientId={clientId}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          // Vincular no es elegir: la cuenta aparece en la lista sin marcar, como todo lo demás.
          onLinked={() => queryClient.invalidateQueries({ queryKey: ['report-meta-sources', clientId] })}
        />
      )}
    </section>
  );
};

export default ReportMetaSources;
