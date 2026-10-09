import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import Select from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Key, Eye, Edit, Trash2, History, Plus, Search } from '@/components/ui/icons';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { requestVault, VAULT_REVEAL_MS } from '@/lib/vaultRequest';
import RevealedAccess from '@/components/vault/RevealedAccess';
import { cn } from '@/lib/utils';

// Bóveda de accesos (9 de octubre de 2026). Las contraseñas se guardan cifradas y solo se descifran al pulsar
// «Ver», que deja registro. Un administrador ve todas; un project manager, las de sus clientes y las que le
// compartan. La regla vive en el servidor: esta pantalla solo la muestra.

const FIELD = 'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';
const AREA = 'min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';
const AGENCY = 'Brain Studio';
const EMPTY = { clientId: '', platform: '', label: '', url: '', username: '', secret: '', notes: '', sharedUserIds: [] };

const fetchJson = async (path) => {
  const token = globalThis.localStorage?.getItem('authToken');
  const response = await fetch(`${getApiBaseUrl()}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('No se pudo cargar la lista.');
  return response.json();
};
const bogota = (value) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

function CredentialForm({ open, initial, clients, managers, isAdmin, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState(EMPTY), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (open) { setForm(editing ? { ...EMPTY, clientId: initial.clientId || '', platform: initial.platform || '', label: initial.label || '', url: initial.url || '', sharedUserIds: initial.sharedUserIds || [] } : EMPTY); setError(''); } }, [open, editing, initial]);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const toggleShare = (userId) => setForm((prev) => ({ ...prev, sharedUserIds: prev.sharedUserIds.includes(userId) ? prev.sharedUserIds.filter((id) => id !== userId) : [...prev.sharedUserIds, userId] }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    const body = { clientId: form.clientId || null, platform: form.platform, label: form.label, url: form.url, ...(isAdmin ? { sharedUserIds: form.sharedUserIds } : {}) };
    // Al editar, usuario, contraseña y notas solo viajan si se escribieron: en blanco se conservan.
    for (const key of ['username', 'secret', 'notes']) if (!editing || form[key]) body[key] = form[key];
    try {
      const saved = editing
        ? await requestVault(`/credentials/${encodeURIComponent(initial.id)}`, { method: 'PATCH', body: { expectedRevision: initial.revision, changes: body } })
        : await requestVault('/credentials', { method: 'POST', body });
      toast.success(editing ? 'Acceso actualizado' : 'Acceso guardado');
      onSaved(saved);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar acceso' : 'Nuevo acceso'}</DialogTitle>
          <DialogDescription>Se guarda cifrado. Nunca lo pegues en el chat de Bria.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <label className="block text-sm"><span className="mb-1 block font-medium">Cliente</span>
            <Select value={form.clientId} onChange={set('clientId')} aria-label="Cliente">
              <option value="">{AGENCY} (cuentas de la agencia)</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </Select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm"><span className="mb-1 block font-medium">Plataforma</span><input required maxLength={60} className={FIELD} value={form.platform} onChange={set('platform')} placeholder="Instagram, Hostinger, Canva…" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Nombre</span><input maxLength={120} className={FIELD} value={form.label} onChange={set('label')} placeholder="Cuenta principal" /></label>
          </div>
          <label className="block text-sm"><span className="mb-1 block font-medium">Enlace</span><input type="url" maxLength={500} className={FIELD} value={form.url} onChange={set('url')} placeholder="https://" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm"><span className="mb-1 block font-medium">Usuario</span><input maxLength={300} className={FIELD} value={form.username} onChange={set('username')} autoComplete="off" placeholder={editing ? 'Sin cambios' : ''} /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Contraseña</span><input type="password" required={!editing} maxLength={4000} className={FIELD} value={form.secret} onChange={set('secret')} autoComplete="new-password" placeholder={editing ? 'Sin cambios' : ''} /></label>
          </div>
          <label className="block text-sm"><span className="mb-1 block font-medium">Notas</span><textarea maxLength={4000} className={AREA} value={form.notes} onChange={set('notes')} placeholder={editing ? 'Sin cambios' : 'Doble factor, correo de recuperación…'} /></label>
          {isAdmin && managers.length > 0 && (
            <fieldset className="text-sm"><legend className="mb-1 font-medium">Compartir con</legend>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">El PM de la cuenta ya lo ve. Marca a quien más deba verlo.</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {managers.map((member) => (
                  <label key={member.userId} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <input type="checkbox" checked={form.sharedUserIds.includes(member.userId)} onChange={() => toggleShare(member.userId)} className="h-4 w-4 accent-[#009EB9]" />
                    <span>{member.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevealHistory({ credential, onClose }) {
  const [rows, setRows] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    if (!credential) return undefined;
    let alive = true;
    requestVault(`/credentials/${encodeURIComponent(credential.id)}/reveals`).then((data) => { if (alive) setRows(data); }).catch((failure) => { if (alive) setError(failure.message); });
    return () => { alive = false; };
  }, [credential]);
  return (
    <Dialog open={Boolean(credential)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Quién lo vio</DialogTitle><DialogDescription>{credential?.label || credential?.platform}</DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!rows && !error && <p className="text-sm text-zinc-500">Cargando…</p>}
        {rows?.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">Nadie lo ha visto todavía.</p>}
        {rows?.length > 0 && <ul className="max-h-80 space-y-2 overflow-y-auto">{rows.map((row, index) => <li key={index} className="flex justify-between gap-3 border-b border-zinc-100 pb-2 text-sm dark:border-zinc-800"><span>{row.persona}</span><span className="text-zinc-500 dark:text-zinc-400">{bogota(row.fecha)} · {row.via === 'BRIA' ? 'desde Bria' : 'en la bóveda'}</span></li>)}</ul>}
      </DialogContent>
    </Dialog>
  );
}

function CredentialRow({ credential, isAdmin, onEdit, onRetire, onHistory }) {
  const [shown, setShown] = useState(null), [busy, setBusy] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const toggle = async () => {
    if (shown) { clearTimeout(timer.current); setShown(null); return; }
    setBusy(true);
    try {
      setShown(await requestVault(`/credentials/${encodeURIComponent(credential.id)}/reveal`, { method: 'POST', body: { via: 'BOVEDA' } }));
      timer.current = setTimeout(() => setShown(null), VAULT_REVEAL_MS);
    } catch (failure) { toast.error(failure.message); }
    finally { setBusy(false); }
  };
  const iconButton = 'flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800';
  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900" data-vault-row={credential.id}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan"><Key className="h-4 w-4" /></span>
        {/* En celular el nombre se queda con la línea y las acciones bajan a la siguiente. */}
        <div className="min-w-0 grow basis-[calc(100%-3.25rem)] sm:basis-0">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{credential.label || credential.platform}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {credential.platform}{credential.kind === 'BLOQUE' ? ' · varias cuentas, del Drive' : ''}
            {credential.url && <> · <a href={credential.url} target="_blank" rel="noopener noreferrer" className="underline">abrir</a></>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={toggle} disabled={busy} className="min-h-11 rounded-xl border border-zinc-200 px-3 text-sm text-zinc-700 hover:border-primary hover:text-brand-cyan-deep disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-brand-cyan">
            <span className="inline-flex items-center gap-2"><Eye className="h-4 w-4" />{busy ? 'Abriendo…' : shown ? 'Ocultar' : 'Ver'}</span>
          </button>
          {credential.canEdit && <button type="button" onClick={() => onEdit(credential)} aria-label={`Editar ${credential.label || credential.platform}`} title="Editar" className={iconButton}><Edit className="h-4 w-4" /></button>}
          {isAdmin && <button type="button" onClick={() => onHistory(credential)} aria-label={`Quién vio ${credential.label || credential.platform}`} title="Quién lo vio" className={iconButton}><History className="h-4 w-4" /></button>}
          {credential.canEdit && <button type="button" onClick={() => onRetire(credential)} aria-label={`Retirar ${credential.label || credential.platform}`} title="Retirar" className={cn(iconButton, 'text-destructive hover:bg-destructive/10 dark:text-destructive')}><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>
      {shown && <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"><RevealedAccess access={shown} /><p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Se oculta en un minuto. Quedó registrado que lo viste.</p></div>}
    </li>
  );
}

export default function VaultPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const confirm = useConfirmDialog();
  const [rows, setRows] = useState([]), [clients, setClients] = useState([]), [managers, setManagers] = useState([]);
  const [clientId, setClientId] = useState(''), [query, setQuery] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [editing, setEditing] = useState(null), [history, setHistory] = useState(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ ...(clientId ? { clientId } : {}), ...(query.trim() ? { q: query.trim() } : {}) });
      setRows(await requestVault(`/credentials${params.toString() ? `?${params}` : ''}`));
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchJson('/api/clients').then((data) => setClients((Array.isArray(data) ? data : data.clients || []).map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name, 'es')))).catch((failure) => console.error('[Vault] clientes', failure.message));
    if (isAdmin) fetchJson('/api/team').then((data) => setManagers((data || []).filter((m) => m.userId && m.user?.role === 'PROJECT_MANAGER').map((m) => ({ userId: m.userId, name: m.name })))).catch((failure) => console.error('[Vault] equipo', failure.message));
  }, [isAdmin]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const row of rows) { const name = row.clientName || AGENCY; map.set(name, [...(map.get(name) || []), row]); }
    return [...map.entries()];
  }, [rows]);

  const retire = async (credential) => {
    const ok = await confirm({ title: 'Retirar acceso', description: 'Deja de verse en la bóveda y en Bria. Queda en el historial; no se borra.', confirmLabel: 'Retirar' });
    if (!ok) return;
    try {
      await requestVault(`/credentials/${encodeURIComponent(credential.id)}/retire`, { method: 'POST', body: { expectedRevision: credential.revision } });
      toast.success('Acceso retirado');
      await load();
    } catch (failure) { toast.error(failure.message); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <PageHeader title="Bóveda" subtitle="Los accesos de cada cliente, cifrados. Cada vez que alguien ve uno, queda registrado.">
        <Button onClick={() => setEditing({})}><Plus className="mr-2 h-4 w-4" />Nuevo acceso</Button>
      </PageHeader>
      <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr]">
        <Select value={clientId} onChange={(event) => setClientId(event.target.value)} aria-label="Filtrar por cliente">
          <option value="">Todos los clientes</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </Select>
        <form onSubmit={(event) => { event.preventDefault(); load(); }} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input type="search" aria-label="Buscar acceso" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por plataforma, nombre o cliente" className={cn(FIELD, 'pl-9')} />
        </form>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando accesos…</p>}
      {!loading && !error && rows.length === 0 && <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">No hay accesos que puedas ver con este filtro.</p>}
      <div className="space-y-8">
        {groups.map(([name, list]) => (
          <section key={name} aria-label={name}>
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{name} <span className="font-normal text-zinc-400">· {list.length}</span></h2>
            <ul className="space-y-2">{list.map((row) => <CredentialRow key={row.id} credential={row} isAdmin={isAdmin} onEdit={setEditing} onRetire={retire} onHistory={setHistory} />)}</ul>
          </section>
        ))}
      </div>
      <CredentialForm open={Boolean(editing)} initial={editing} clients={clients} managers={managers} isAdmin={isAdmin} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />
      <RevealHistory credential={history} onClose={() => setHistory(null)} />
    </div>
  );
}
