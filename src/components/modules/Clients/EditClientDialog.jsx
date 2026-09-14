import React, { useId, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { clientSlugPattern, clientSlugHelp } from '@/lib/clientEdit';

export default function EditClientDialog({ client, onSaved, onClose }) {
  const [name, setName] = useState(client.name);
  const [slug, setSlug] = useState(client.slug || '');
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
  const slugValid = !slugChanged || clientSlugPattern.test(trimmedSlug);
  const canSave = !!trimmedName && slugValid && (nameChanged || slugChanged);

  const save = async event => {
    event.preventDefault();
    if (saving || !canSave) return;
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
        body: JSON.stringify({ ...(nameChanged ? { name: trimmedName } : {}), ...(slugChanged ? { slug: trimmedSlug } : {}) }),
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
    <DialogContent className="max-w-md rounded-2xl" showCloseButton={!saving}>
      <DialogTitle className="pr-8">Editar cliente</DialogTitle>
      <DialogDescription>Cambiar el nombre no modifica automáticamente el slug.</DialogDescription>
      <form onSubmit={save} className="space-y-5" aria-busy={saving}>
        <div className="space-y-2">
          <label htmlFor={nameId} className="block text-sm font-medium">Nombre del cliente</label>
          <input id={nameId} type="text" required value={name} disabled={saving}
            aria-describedby={error ? errorId : undefined}
            onChange={event => { setName(event.target.value); setError(''); }}
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
        </div>
        <div className="space-y-2">
          <label htmlFor={slugId} className="block text-sm font-medium">URL (slug)</label>
          <input id={slugId} type="text" value={slug} disabled={saving} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            aria-invalid={!slugValid} aria-describedby={slugChanged ? `${slugWarningId} ${slugHelpId}` : slugHelpId}
            onChange={event => { setSlug(event.target.value); setError(''); }}
            className="min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
          <p id={slugHelpId} className="text-sm text-muted-foreground">{clientSlugHelp}</p>
          {slugChanged && <p id={slugWarningId} className="text-sm text-destructive brain-destructive-text">Esto podría afectar otros enlaces.</p>}
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
