import React, { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertCircle, Loader2, Plus, Search, Share2, Trash2 } from '@/components/ui/icons';
import { FacebookLogo, InstagramLogo, LinkedinLogo, SOCIAL_BRAND_LOGOS } from '@/components/ui/SocialBrandLogos';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { SOCIAL_PLATFORM_LABELS, filterSocialPages, socialPagesOf, standaloneAccountsOf } from '@/lib/socialPublishing';
import { linkedinAuthorizationState } from '@/lib/linkedinPublishing';

/**
 * Redes conectadas de un cliente (Rodny, 29 de septiembre de 2026). Un administrador elige aquí cuál
 * de las páginas que administra la cuenta de Meta de la agencia es la de este cliente. Nadie pega
 * tokens: el servidor lista las páginas y guarda el token de la página cifrado.
 */
const PLATFORM_ICON = SOCIAL_BRAND_LOGOS;
/** A dónde volver después de autorizar en LinkedIn: la ficha desde la que se salió. */
export const LINKEDIN_RETURN_KEY = 'linkedinConnectReturnTo';

/**
 * Lo que hay que saber de la autorización de una página de LinkedIn (23 de noviembre de 2026). LinkedIn la
 * da por 60 días; si la plataforma la puede renovar sola no se dice nada hasta que de verdad haga falta.
 */
const linkedinNote = (account) => {
  if (account.platform !== 'LINKEDIN' || !account.isActive) return null;
  const state = linkedinAuthorizationState(account.authorization || {});
  if (state.expired) return 'La autorización venció: vuelve a conectarla.';
  if (state.expiringSoon) return state.daysLeft <= 0 ? 'La autorización vence hoy: vuelve a conectarla.' : `La autorización vence en ${state.daysLeft} ${state.daysLeft === 1 ? 'día' : 'días'}: vuelve a conectarla.`;
  return null;
};
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

const ConnectPageDialog = ({ clientId, open, onClose, onLinked }) => {
  const [pageId, setPageId] = useState('');
  const [search, setSearch] = useState('');
  const listId = useId();
  const { data, isLoading, error } = useQuery({
    queryKey: ['social-available-pages'],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/social/accounts/available`, { headers: authHeaders() })).data
  });
  // Al cerrar se olvida la búsqueda y la elección: el diálogo se queda montado y la próxima vez
  // abriría con la página de antes marcada.
  const close = () => {
    setSearch('');
    setPageId('');
    onClose();
  };
  const link = useMutation({
    mutationFn: async (selectedPageId) => (await axios.post(`${getApiBaseUrl()}/api/social/accounts/link`, { clientId, pageId: selectedPageId }, { headers: authHeaders() })).data,
    onSuccess: (rows) => {
      onLinked(rows);
      toast.success(rows.length > 1 ? 'Facebook e Instagram conectados' : 'Facebook conectado');
      close();
    },
    onError: (err) => {
      console.error('[SocialAccounts] No se pudo conectar la página:', err.response?.data || err.message || err);
      toast.error(err.response?.data?.error || 'No se pudo conectar la página.');
    }
  });
  const pages = data?.pages || [];
  const unavailable = error?.response?.data?.error;
  // Con la llave del CEO la lista pasó de una página a 69 (Rodny, 1 de octubre de 2026): se busca y
  // se ordena. Solo se conecta una página que está a la vista: si la búsqueda esconde la elegida,
  // «Conectar» se apaga, para que nunca se enlace por error la página de otro cliente.
  const visible = filterSocialPages(pages, search);
  const chosenId = visible.some((page) => page.pageId === pageId) ? pageId : '';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle>Conectar una página</DialogTitle>
        <DialogDescription>Elige la página de Facebook del cliente. Si tiene un Instagram profesional vinculado, se conecta también.</DialogDescription>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Consultando las páginas en Meta…</div>
        ) : unavailable ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{unavailable}</p>
        ) : pages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">La cuenta de Meta de la agencia todavía no administra ninguna página. Hay que darle acceso a la página del cliente en Meta Business.</p>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre o usuario de Instagram"
                aria-label="Buscar página"
                autoComplete="off"
                className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 outline-none transition focus:border-brand-cyan dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite" data-social-pages-count>
              {search.trim() ? `${visible.length} de ${pages.length} páginas` : `${pages.length} páginas`}
            </p>
            {visible.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Ninguna página coincide con «{search.trim()}».
              </p>
            ) : (
              <fieldset className="max-h-[50vh] space-y-2 overflow-y-auto pr-1" aria-labelledby={listId}>
                <legend id={listId} className="sr-only">Páginas disponibles</legend>
                {visible.map((page) => (
                  <label key={page.pageId} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${chosenId === page.pageId ? 'border-brand-cyan bg-brand-cyan-soft/40 dark:bg-brand-cyan/10' : 'border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5'}`}>
                    <input type="radio" name="social-page" value={page.pageId} checked={chosenId === page.pageId} onChange={() => setPageId(page.pageId)} className="accent-brand-cyan" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-zinc-900 dark:text-zinc-50">{page.pageName}</span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {page.instagram ? `Instagram: @${page.instagram.username || page.instagram.id}` : 'Sin Instagram profesional vinculado'}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>Cancelar</Button>
          <Button type="button" onClick={() => link.mutate(chosenId)} disabled={!chosenId || link.isPending}>
            {link.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Conectar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const SocialAccountsWidget = ({ clientId, canManage = false }) => {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['social-accounts', clientId],
    enabled: Boolean(clientId),
    staleTime: 30_000,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/social/accounts`, { params: { clientId }, headers: authHeaders() })).data
  });
  const disconnect = useMutation({
    mutationFn: async (accountId) => (await axios.delete(`${getApiBaseUrl()}/api/social/accounts/${accountId}`, { headers: authHeaders() })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-accounts', clientId] });
      toast.success('Cuenta desconectada');
    },
    onError: (err) => {
      console.error('[SocialAccounts] No se pudo desconectar:', err.response?.data || err.message || err);
      toast.error(err.response?.data?.error || 'No se pudo desconectar la cuenta.');
    }
  });

  const pages = socialPagesOf(accounts);
  // LinkedIn no cuelga de una página de Facebook: cada página de empresa conectada va en su propia fila.
  const standalone = standaloneAccountsOf(accounts);
  const connectLabel = accounts.length ? 'Conectar otra página' : 'Conectar página';

  // LinkedIn se conecta saliendo a LinkedIn: su administrador inicia sesión, autoriza y vuelve a esta ficha.
  const connectLinkedIn = useMutation({
    mutationFn: async () => (await axios.post(`${getApiBaseUrl()}/api/social/linkedin/start`, { clientId }, { headers: authHeaders() })).data,
    onSuccess: ({ url }) => {
      try {
        sessionStorage.setItem(LINKEDIN_RETURN_KEY, `${window.location.pathname}${window.location.search}`);
      } catch {
        // Sin almacenamiento de sesión se vuelve a la ficha del cliente por su identificador.
      }
      window.location.assign(url);
    },
    onError: (err) => {
      console.error('[SocialAccounts] No se pudo empezar la conexión con LinkedIn:', err.response?.data || err.message || err);
      toast.error(err.response?.data?.error || 'No se pudo empezar la conexión con LinkedIn.');
    }
  });

  const handleDisconnect = async (account) => {
    const ok = await confirm({
      title: `Desconectar ${SOCIAL_PLATFORM_LABELS[account.platform] || account.platform}`,
      description: `Las publicaciones programadas en ${account.displayName} se cancelan. Lo ya publicado no se toca.`,
      confirmLabel: 'Desconectar',
      tone: 'danger'
    });
    if (ok) disconnect.mutate(account.id);
  };

  const renderAccount = (account) => {
                    const Icon = PLATFORM_ICON[account.platform] || Share2;
                    const note = linkedinNote(account);
                    return (
                      <li key={account.id} className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${account.isActive ? 'border-zinc-200 dark:border-white/10' : 'border-destructive/30 bg-destructive/5'}`}>
                        <Icon className={`h-4 w-4 shrink-0 ${account.isActive ? 'text-zinc-500 dark:text-zinc-400' : 'text-destructive'}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-zinc-900 dark:text-zinc-50">{account.displayName}</span>
                          <span className={`block truncate text-xs ${account.isActive ? 'text-zinc-500 dark:text-zinc-400' : 'text-destructive'}`}>
                            {account.isActive ? SOCIAL_PLATFORM_LABELS[account.platform] || account.platform : `Desconectada${account.lastError ? ` · ${account.lastError}` : ''}`}
                          </span>
                          {note && <span className="mt-0.5 block break-words text-xs text-amber-700 dark:text-amber-400" data-social-authorization-note>{note}</span>}
                        </span>
                        {!account.isActive && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />}
                        {canManage && account.isActive && (
                          <button
                            type="button"
                            onClick={() => handleDisconnect(account)}
                            aria-label={`Desconectar ${account.displayName}`}
                            className="brain-danger-button-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
  };

  return (
    <Card className="flex w-full flex-col p-6" data-social-accounts-widget>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-brand-cyan-soft p-1.5 dark:bg-brand-cyan/15">
            <Share2 className="h-4 w-4 text-brand-cyan-deep dark:text-brand-cyan" />
          </div>
          <h3 className="font-semibold text-zinc-900 dark:text-white">Redes conectadas</h3>
        </div>
        {canManage && (
          /* Con cuentas ya conectadas el botón es solo el «+» (Rodny, 2 de octubre de 2026: «ese botón
             está muy largo… solo deja el icono de +»): con el texto partía el título de la tarjeta en
             dos líneas. Lo que hace se dice al pasar el cursor y a un lector de pantalla. Sin ninguna
             cuenta todavía sí lleva el texto, porque ahí es la única acción de la tarjeta. */
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={connectLabel}
                title={connectLabel}
                disabled={connectLinkedIn.isPending}
                data-social-connect
                className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 ${accounts.length ? 'w-9' : 'px-3'}`}
              >
                {connectLinkedIn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {!accounts.length && <span>Conectar página</span>}
              </button>
            </DropdownMenuTrigger>
            {/* Dos redes, dos maneras de conectar (23 de noviembre de 2026): en Meta se elige la página de
                una lista; en LinkedIn su administrador inicia sesión y autoriza. */}
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => setDialogOpen(true)} className="gap-2" data-social-connect-meta>
                <FacebookLogo className="h-4 w-4 shrink-0" aria-hidden="true" /><InstagramLogo className="h-4 w-4 shrink-0" aria-hidden="true" /> Facebook e Instagram
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => connectLinkedIn.mutate()} className="gap-2" data-social-connect-linkedin>
                <LinkedinLogo className="h-4 w-4 shrink-0" aria-hidden="true" /> Página de LinkedIn
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
      ) : accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Sin redes conectadas. {canManage ? 'Conecta la página de Facebook o de LinkedIn del cliente para programar sus publicaciones desde la parrilla.' : 'Un administrador puede conectar la página del cliente.'}
        </p>
      ) : (
        <>
          {/* Un cliente puede tener varias cuentas (Rodny, 2 de octubre de 2026): cada una es una página
              de Facebook con su Instagram. Con más de una se agrupan por página; con una sola la tarjeta
              se ve como siempre. Ninguna es «la principal»: en la parrilla cada pieza marca a cuál va. */}
          <ul className="space-y-3">
            {pages.map((page) => (
              <li key={page.pageId} data-social-page={page.pageId}>
                {pages.length > 1 && (
                  <span className="mb-1.5 block truncate text-xs font-bold text-zinc-700 dark:text-zinc-200">{page.name}</span>
                )}
                <ul className="space-y-2">
                  {page.accounts.map(renderAccount)}
                </ul>
              </li>
            ))}
            {standalone.length > 0 && (
              <li data-social-standalone>
                {pages.length > 1 && <span className="mb-1.5 block truncate text-xs font-bold text-zinc-700 dark:text-zinc-200">LinkedIn</span>}
                <ul className="space-y-2">{standalone.map(renderAccount)}</ul>
              </li>
            )}
          </ul>
          {pages.length > 1 && (
            <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              En la parrilla, cada pieza marca a cuál de estas cuentas va.
            </p>
          )}
        </>
      )}

      {canManage && (
        <ConnectPageDialog
          clientId={clientId}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onLinked={() => queryClient.invalidateQueries({ queryKey: ['social-accounts', clientId] })}
        />
      )}
    </Card>
  );
};

export default SocialAccountsWidget;
