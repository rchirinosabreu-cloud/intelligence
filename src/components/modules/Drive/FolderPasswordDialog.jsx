import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import frontendApiService from '../../../services/frontendApiService';

const inputClass = 'mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-zinc-900 outline-none focus:border-brand-cyan dark:border-zinc-800 dark:bg-zinc-900 dark:text-white';

export default function FolderPasswordDialog({ target, onClose, onSuccess }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const unlock = target.mode === 'unlock';
  const submit = async (event, remove = false) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!unlock && !remove && password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try {
      if (unlock) await frontendApiService.unlockDriveFolder(target.id, password);
      else await frontendApiService.setDriveFolderPassword(target.id, { password: remove ? null : password, currentPassword });
      setPassword(''); setConfirmation(''); setCurrentPassword('');
      await onSuccess(target);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent overlayClassName="z-[80]" className="z-[81] max-w-md rounded-2xl border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
      <form onSubmit={submit}>
        <DialogTitle>{unlock ? 'Desbloquear carpeta' : target.passwordProtected ? 'Administrar contraseña' : 'Proteger carpeta'}</DialogTitle>
        <DialogDescription className="mt-2">{unlock ? 'El acceso se habilita durante 30 minutos solo para tu sesión.' : 'La contraseña protege esta carpeta, sus archivos y subcarpetas dentro de la plataforma.'}</DialogDescription>
        {target.name && <p className="mt-3 break-words text-sm font-medium">{target.name}</p>}
        {!unlock && target.passwordProtected && <label className="mt-4 block text-sm">Contraseña actual<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} maxLength={128} className={inputClass} /></label>}
        <label className="mt-4 block text-sm">{unlock ? 'Contraseña' : 'Nueva contraseña'}<input autoFocus type="password" autoComplete={unlock ? 'current-password' : 'new-password'} required minLength={unlock ? undefined : 12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} /></label>
        {!unlock && <><label className="mt-4 block text-sm">Repetir contraseña<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} className={inputClass} /></label><p className="mt-2 text-xs text-muted-foreground">Entre 12 y 128 caracteres. Guarda la clave: cambiarla o quitarla requiere conocer la actual.</p></>}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {!unlock && target.passwordProtected && <button type="button" disabled={busy || !currentPassword} onClick={e => submit(e, true)} className="brain-danger-button min-h-11 rounded-xl px-3 text-sm">Quitar contraseña</button>}
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl px-3 text-sm hover:bg-muted">Cancelar</button>
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60">{busy ? 'Comprobando…' : unlock ? 'Desbloquear' : 'Guardar contraseña'}</button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
