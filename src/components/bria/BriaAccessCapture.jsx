import React, { useState } from 'react';
import { Key, Eye } from '@/components/ui/icons';
import { requestVault } from '@/lib/vaultRequest';

// El campo protegido que Bria deja bajo su respuesta para guardar o cambiar una contraseña (9 de octubre de
// 2026). Bria reunió cliente, plataforma y usuario conversando; la contraseña se escribe aquí y viaja directo
// a la bóveda: nunca entra al chat, al historial ni al modelo. Al guardar, el chat le avisa a Bria con un
// mensaje sin la clave, para que la conversación siga.
export default function BriaAccessCapture({ capture, active = false, onSaved, request = requestVault }) {
  const [secret, setSecret] = useState(''), [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  const updating = capture.mode === 'UPDATE';
  const save = async (event) => {
    event.preventDefault();
    if (!secret) return;
    setBusy(true); setError('');
    try {
      if (updating) {
        await request(`/credentials/${encodeURIComponent(capture.credentialId)}`, { method: 'PATCH', body: { expectedRevision: capture.revision, changes: { secret, ...(capture.username ? { username: capture.username } : {}), ...(capture.url ? { url: capture.url } : {}), ...(capture.notes ? { notes: capture.notes } : {}) } } });
      } else {
        await request('/credentials', { method: 'POST', body: { clientId: capture.clientId || null, platform: capture.platform, label: capture.label, url: capture.url, username: capture.username, secret, notes: capture.notes } });
      }
      setSecret(''); setDone(true);
      onSaved?.(`Listo, ya ${updating ? 'cambié' : 'guardé'} la contraseña de «${capture.label}» en la bóveda.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const summary = [capture.platform, capture.clientName, capture.username].filter(Boolean).join(' · ');
  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900" data-access-capture={capture.captureId}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan"><Key className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{updating ? 'Cambiar contraseña' : 'Guardar en la bóveda'}: {capture.label}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{summary}</p>
        </div>
      </div>
      {done ? (
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200" role="status">Guardada y cifrada. Bria no la vio.</p>
      ) : active ? (
        <form onSubmit={save} className="mt-3 space-y-2" autoComplete="off">
          <label className="block text-xs text-zinc-500 dark:text-zinc-400" htmlFor={`secreto-${capture.captureId}`}>Contraseña (va directo a la bóveda; no pasa por el chat)</label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input id={`secreto-${capture.captureId}`} type={visible ? 'text' : 'password'} value={secret} onChange={(event) => setSecret(event.target.value)} maxLength={4000} autoComplete="new-password" required className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 pr-11 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
              <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={visible ? 'Ocultar' : 'Mostrar'} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"><Eye className="h-4 w-4" /></button>
            </div>
            <button type="submit" disabled={busy || !secret} className="min-h-11 shrink-0 rounded-xl bg-[#009EB9] px-4 text-sm font-semibold text-white hover:bg-[#008CA4] disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar en la bóveda'}</button>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </form>
      ) : (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Este campo ya no está activo. Pídele a Bria que lo prepare de nuevo.</p>
      )}
    </div>
  );
}
