import React, { useId, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { clientSlugPattern, clientSlugHelp } from '@/lib/clientEdit';
import { changedClientProfile, clientProfileFrom, normalizeClientProfile } from '@/lib/clientProfile';
import ClientProfileFields from './ClientProfileFields';

const PLATFORM_FIELD = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export default function EditClientDialog({ client, onSaved, onClose }) {
  const [name, setName] = useState(client.name);
  const [slug, setSlug] = useState(client.slug || '');
  // La ficha completa (30 de septiembre de 2026): identidad para la cuenta de cobro,
  // contacto y ubicación. La misma que en Financiero y en la cuenta por cobrar.
  const original = clientProfileFrom(client);
  const [profile, setProfile] = useState(original);
  const [profileErrors, setProfileErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameId = useId();
  const slugId = useId();
  const slugWarningId = useId();
  const slugHelpId = useId();
  const errorId = useId();
  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  const nameChanged = trimmedName !== client.name;
  const slugChanged = trimmedSlug !== (client.slug || '');
  // El nombre tiene su propio campo arriba; de la ficha viaja solo lo demás que cambió.
  const { name: _name, ...profileChanges } = changedClientProfile(original, { ...profile, name: original.name });
  const profileChanged = Object.keys(profileChanges).length > 0;
  const slugValid = !slugChanged || clientSlugPattern.test(trimmedSlug);
  const canSave = !!trimmedName && slugValid && (nameChanged || slugChanged || profileChanged);

  const save = async event => {
    event.preventDefault();
    if (saving || !canSave) return;
    const check = normalizeClientProfile(profileChanges);
    if (!check.valid) { setProfileErrors(check.errors); return; }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        // Only explicitly edited fields are sent; renaming never regenerates a slug.
        body: JSON.stringify({
          ...(nameChanged ? { name: trimmedName } : {}),
          ...(slugChanged ? { slug: trimmedSlug } : {}),
          ...profileChanges
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('[EditClientDialog] Server rejected client update:', result);
        throw new Error(result.error || 'No se pudieron guardar los cambios del cliente. Inténtalo nuevamente.');
      }
      if (result.id !== client.id || typeof result.name !== 'string' || (slugChanged && result.slug !== trimmedSlug)) {
        throw new Error('No se pudo confirmar el cambio. Actualiza la página para comprobar los datos.');
      }
      onSaved(result);
      onClose();
      toast.success('Cliente actualizado');
    } catch (err) {
      console.error('[EditClientDialog] Failed to update client:', err.response?.data || err.message || err);
      setError(err.message || 'No se pudieron guardar los cambios del cliente. Inténtalo nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl" showCloseButton={!saving}>
      <DialogTitle className="pr-8">Editar cliente</DialogTitle>
      <DialogDescription>Cambiar el nombre no modifica automáticamente el slug.</DialogDescription>
      <form onSubmit={save} className="space-y-5" aria-busy={saving}>
        <div className="space-y-2">
          <label htmlFor={nameId} className="block text-sm font-medium">Nombre del cliente</label>
          <input id={nameId} type="text" required value={name} disabled={saving}
            aria-describedby={error ? errorId : undefined}
            onChange={event => { setName(event.target.value); setError(''); }}
            className={PLATFORM_FIELD} />
        </div>
        <div className="space-y-2">
          <label htmlFor={slugId} className="block text-sm font-medium">URL (slug)</label>
          <input id={slugId} type="text" value={slug} disabled={saving} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            aria-invalid={!slugValid} aria-describedby={slugChanged ? `${slugWarningId} ${slugHelpId}` : slugHelpId}
            onChange={event => { setSlug(event.target.value); setError(''); }}
            className={PLATFORM_FIELD} />
          <p id={slugHelpId} className="text-sm text-muted-foreground">{clientSlugHelp}</p>
          {slugChanged && <p id={slugWarningId} className="text-sm text-destructive brain-destructive-text">Esto podría afectar otros enlaces.</p>}
        </div>
        <div className="border-t border-zinc-200 pt-4 dark:border-white/10">
          <ClientProfileFields showName={false} value={profile} errors={profileErrors} disabled={saving} fieldClassName={PLATFORM_FIELD}
            onChange={patch => {
              setProfileErrors(current => { const next = { ...current }; for (const key of Object.keys(patch)) delete next[key]; return next; });
              setProfile(current => ({ ...current, ...patch }));
              setError('');
            }} />
        </div>
        {error && <p id={errorId} role="alert" className="text-sm text-destructive brain-destructive-text">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="min-h-11" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="min-h-11" disabled={saving || !canSave}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
