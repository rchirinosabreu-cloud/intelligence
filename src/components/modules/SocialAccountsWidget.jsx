import React, { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AlertCircle, Facebook, Instagram, Loader2, Plus, Share2, Trash2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { SOCIAL_PLATFORM_LABELS } from '@/lib/socialPublishing';

/**
 * Redes conectadas de un cliente (Rodny, 29 de septiembre de 2026). El «robot» que publica es el
 * usuario del sistema de Meta de Brain Studio; un administrador elige aquí qué página administra ese
 * usuario para este cliente. Nadie pega tokens: el servidor lista las páginas y guarda el token cifrado.
 */
const PLATFORM_ICON = { INSTAGRAM: Instagram, FACEBOOK: Facebook };
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

const ConnectPageDialog = ({ clientId, open, onClose, onLinked }) => {
  const [pageId, setPageId] = useState('');
  const listId = useId();
  const { data, isLoading, error } = useQuery({
    queryKey: ['social-available-pages'],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/social/accounts/available`, { headers: authHeaders() })).data
  });
  const link = useMutation({
    mutationFn: async () => (await axios.post(`${getApiBaseUrl()}/api/social/accounts/link`, { clientId, pageId }, { headers: authHeaders() })).data,
    onSuccess: (rows) => {
      onLinked(rows);
      toast.success(rows.length > 1 ? 'Facebook e Instagram conectados' : 'Facebook conectado');
      onClose();
    },
    onError: (err) => {
      console.error('[SocialAccounts] No se pudo conectar la página:', err.response?.data || err.message || err);
      toast.error(err.response?.data?.error || 'No se pudo conectar la página.');
    }
  });
  const pages = data?.pages || [];
  const unavailable = error?.response?.data?.error;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle>Conectar una página</DialogTitle>
        <DialogDescription>Elige la página de Facebook del cliente. Si tiene un Instagram profesional vinculado, se conecta también.</DialogDescription>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Consultando las páginas en Meta…</div>
        ) : unavailable ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{unavailable}</p>
        ) : pages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">El usuario del sistema de Meta todavía no administra ninguna página. Dale acceso a la página del cliente desde el Business Manager.</p>
        ) : (
          <fieldset className="space-y-2" aria-labelledby={listId}>
            <legend id={listId} className="sr-only">Páginas disponibles</legend>
            {pages.map((page) => (
              <label key={page.pageId} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${pageId === page.pageId ? 'border-brand-cyan bg-brand-cyan-soft/40 dark:bg-brand-cyan/10' : 'border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5'}`}>
                <input type="radio" name="social-page" value={page.pageId} checked={pageId === page.pageId} onChange={() => setPageId(page.pageId)} className="accent-brand-cyan" />
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
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={() => link.mutate()} disabled={!pageId || link.isPending}>
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

  const handleDisconnect = async (account) => {
    const ok = await confirm({
      title: `Desconectar ${SOCIAL_PLATFORM_LABELS[account.platform] || account.platform}`,
      description: `Las publicaciones programadas en ${account.displayName} se cancelan. Lo ya publicado no se toca.`,
      confirmLabel: 'Desconectar',
      tone: 'danger'
    });
    if (ok) disconnect.mutate(account.id);
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
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[13px] font-bold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" /> Conectar página
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
      ) : accounts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 p-4 text-[13px] text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          Sin redes conectadas. {canManage ? 'Conecta la página de Facebook del cliente para programar sus publicaciones desde la parrilla.' : 'Un administrador puede conectar la página del cliente.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((account) => {
            const Icon = PLATFORM_ICON[account.platform] || Share2;
            return (
              <li key={account.id} className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] ${account.isActive ? 'border-zinc-200 dark:border-white/10' : 'border-destructive/30 bg-destructive/5'}`}>
                <Icon className={`h-4 w-4 shrink-0 ${account.isActive ? 'text-zinc-500 dark:text-zinc-400' : 'text-destructive'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-zinc-900 dark:text-zinc-50">{account.displayName}</span>
                  <span className={`block truncate text-xs ${account.isActive ? 'text-zinc-500 dark:text-zinc-400' : 'text-destructive'}`}>
                    {account.isActive ? SOCIAL_PLATFORM_LABELS[account.platform] || account.platform : `Desconectada${account.lastError ? ` · ${account.lastError}` : ''}`}
                  </span>
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
          })}
        </ul>
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
