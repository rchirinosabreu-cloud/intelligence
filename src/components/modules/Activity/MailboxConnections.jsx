import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, X } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';

// Buzones compartidos que lee Bria (Rodny, 11 de octubre de 2026): social.brainstudio@gmail.com y
// contacto@brainstudioagencia.com, conectados con una contraseña de aplicación que se pega una sola vez y viaja al
// servidor, donde se sella con la llave de la bóveda. Administradores y project managers ven la lista; conectar,
// probar y quitar es de administradores. El campo de la contraseña nunca se rellena desde el servidor.
const request = async (suffix = '', { method = 'GET', body } = {}) => {
  const token = globalThis.localStorage?.getItem('authToken');
  const response = await fetch(`${getApiBaseUrl()}/api/bria/mail${suffix}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { console.error('[MailboxConnections]', data); throw new Error(data.message || 'No se pudo completar la operación con el buzón.'); }
  return data;
};
const clock = (value) => { try { return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return ''; } };
const SUGGESTED = ['social.brainstudio@gmail.com', 'contacto@brainstudioagencia.com'];

export default function MailboxConnections({ isAdmin = false, className }) {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { data, isError } = useQuery({ queryKey: ['bria-mail-accounts'], queryFn: () => request('/accounts'), staleTime: 60_000 });
  const accounts = data?.accounts || [];
  const [open, setOpen] = useState(false), [email, setEmail] = useState(''), [label, setLabel] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bria-mail-accounts'] });
  const connect = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const saved = await request('/accounts', { method: 'POST', body: { email, label, appPassword: password } });
      toast.success(saved.replaced ? 'Contraseña del buzón actualizada' : 'Buzón conectado: Bria ya lo lee');
      setPassword(''); setEmail(''); setLabel(''); setOpen(false); refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const test = async (account) => {
    setBusy(true);
    try { await request(`/accounts/${account.id}/test`, { method: 'POST' }); toast.success(`Entró a ${account.email} sin problema`); refresh(); }
    catch (failure) { toast.error(failure.message); refresh(); }
    finally { setBusy(false); }
  };
  const remove = async (account) => {
    const ok = await confirm({ title: 'Quitar el buzón', description: `Bria dejará de leer ${account.email}. Lo ya avisado se conserva; la contraseña guardada se borra.`, confirmLabel: 'Quitar', destructive: true });
    if (!ok) return;
    setBusy(true);
    try { await request(`/accounts/${account.id}`, { method: 'DELETE' }); toast.success('Buzón quitado'); refresh(); }
    catch (failure) { toast.error(failure.message); }
    finally { setBusy(false); }
  };
  const status = (account) => !account.isActive ? { tone: 'bg-destructive', text: 'Pide reconectar' } : account.lastError ? { tone: 'bg-brand-yellow', text: 'Con error' } : account.lastReadAt ? { tone: 'bg-status-positive', text: `Leído ${clock(account.lastReadAt)}` } : { tone: 'bg-brand-cyan', text: 'Conectado' };
  const missing = SUGGESTED.filter((address) => !accounts.some((account) => account.email === address));

  return (
    <section className={cn('rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900', className)} aria-labelledby="mailbox-connections-title" data-mailbox-connections>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-cyan/10 text-brand-cyan-deep dark:text-brand-cyan"><Mail className="h-4 w-4" /></span>
          <div>
            <h3 id="mailbox-connections-title" className="text-sm font-semibold text-zinc-950 dark:text-white">Buzones que lee Bria</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Avisa de correos importantes de clientes; no envía ni guarda el contenido.</p>
          </div>
        </div>
        {isAdmin && !open && <button type="button" onClick={() => { setOpen(true); setEmail(missing[0] || ''); }} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:border-brand-cyan hover:text-brand-cyan-deep dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:text-brand-cyan">Conectar buzón</button>}
      </div>
      {isError && <p role="alert" className="mt-3 text-xs text-destructive">No se pudieron leer los buzones conectados.</p>}
      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/10">
        {accounts.map((account) => { const s = status(account); return (
          <li key={account.id} className="flex flex-wrap items-center gap-2 py-2" data-mailbox-account={account.email}>
            <span className={cn('h-2 w-2 shrink-0 rounded-full', s.tone)} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100" title={account.email}>{account.label ? `${account.label} · ` : ''}{account.email}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400" title={account.lastError || ''}>{s.text}</span>
            {isAdmin && <>
              <button type="button" disabled={busy} onClick={() => test(account)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 disabled:opacity-50 dark:text-brand-cyan">Probar</button>
              {!account.isActive && <button type="button" disabled={busy} onClick={() => { setOpen(true); setEmail(account.email); setLabel(account.label || ''); }} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep hover:bg-brand-cyan/10 disabled:opacity-50 dark:text-brand-cyan">Reconectar</button>}
              <button type="button" disabled={busy} onClick={() => remove(account)} aria-label={`Quitar ${account.email}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><X className="h-4 w-4" /></button>
            </>}
          </li>
        ); })}
        {!accounts.length && !isError && <li className="py-2 text-xs text-zinc-500 dark:text-zinc-400">Todavía no hay buzones conectados.</li>}
      </ul>
      {isAdmin && open && (
        <form onSubmit={connect} className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-zinc-950" data-mailbox-form>
          <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-300">En la cuenta de Google: Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones. Crea una para «Intelligence» y pégala aquí; se guarda cifrada y no vuelve a mostrarse.</p>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-200"><span className="block">Correo del buzón</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} list="mailbox-suggested" placeholder="social.brainstudio@gmail.com" className="mt-1 min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100" />
            <datalist id="mailbox-suggested">{SUGGESTED.map((address) => <option key={address} value={address} />)}</datalist>
          </label>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-200"><span className="block">Etiqueta (opcional)</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Social, Contacto…" className="mt-1 min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100" />
          </label>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-200"><span className="block">Contraseña de aplicación</span>
            <input type="password" required autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="16 caracteres" className="mt-1 min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-normal text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100" />
          </label>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="min-h-10 rounded-xl bg-primary px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Probando la entrada…' : 'Probar y conectar'}</button>
            <button type="button" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setError(''); }} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-white/10">Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}
