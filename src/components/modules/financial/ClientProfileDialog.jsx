import React, { useState } from 'react';
import axios from 'axios';
import { Loader2 } from '@/components/ui/icons';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ClientProfileFields from '@/components/modules/Clients/ClientProfileFields';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { changedClientProfile, clientProfileFrom, emptyClientProfile, normalizeClientProfile } from '@/lib/clientProfile';

/**
 * Crear o editar la ficha de un cliente desde Financiero (Rodny, 30 de septiembre de
 * 2026: «desde aquí también poder añadir clientes nuevos»). Con `client` edita; sin él,
 * crea. Valida antes de enviar con la misma regla del servidor, y solo cierra y avisa
 * después de que el servidor confirma.
 */
export default function ClientProfileDialog({ client, initialName = '', open, onClose, onSaved }) {
    const editing = Boolean(client?.id);
    const [draft, setDraft] = useState(() => (editing ? clientProfileFrom(client) : { ...emptyClientProfile(), name: initialName }));
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [saving, setSaving] = useState(false);

    const original = editing ? clientProfileFrom(client) : emptyClientProfile();
    const changes = editing ? changedClientProfile(original, draft) : draft;
    const hasChanges = editing ? Object.keys(changes).length > 0 : Boolean(draft.name.trim());

    const update = (patch) => {
        setDraft((current) => ({ ...current, ...patch }));
        setErrors((current) => {
            const next = { ...current };
            for (const key of Object.keys(patch)) delete next[key];
            return next;
        });
        setServerError('');
    };

    const save = async (event) => {
        event.preventDefault();
        if (saving || !hasChanges) return;
        const check = normalizeClientProfile(changes, { requireName: !editing });
        if (!check.valid) { setErrors(check.errors); return; }
        setSaving(true);
        setServerError('');
        try {
            const baseUrl = getApiBaseUrl();
            const headers = { Authorization: `Bearer ${localStorage.getItem('authToken')}` };
            const { data } = editing
                ? await axios.patch(`${baseUrl}/api/financials/clients/${client.id}`, changes, { headers })
                : await axios.post(`${baseUrl}/api/financials/clients`, changes, { headers });
            await onSaved?.(data.client, data.message);
            onClose();
        } catch (error) {
            console.error('Error saving client profile:', error.response?.data || error);
            setServerError(error.response?.data?.message || 'No fue posible guardar la ficha del cliente.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>{editing ? `Ficha de ${client.name}` : 'Nuevo cliente'}</DialogTitle>
                    <DialogDescription>
                        {editing
                            ? 'Los cambios quedan registrados. Lo que se deje vacío se borra de la ficha.'
                            : 'Solo el nombre es obligatorio. El resto se puede completar después.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={save} className="space-y-5" aria-busy={saving} data-client-profile-dialog>
                    <ClientProfileFields value={draft} onChange={update} errors={errors} disabled={saving} nameAutoFocus={!editing} />
                    {serverError && <p role="alert" className="text-sm text-destructive brain-destructive-text">{serverError}</p>}
                    <DialogFooter>
                        <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-lg border border-zinc-200 px-4 text-sm dark:border-white/10">Cancelar</button>
                        <button type="submit" disabled={saving || !hasChanges} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? 'Guardar ficha' : 'Crear cliente'}
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
