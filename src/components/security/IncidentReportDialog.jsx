import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Select from '@/components/ui/Select';
import { BrainDateTimePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Loader2 } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { INCIDENT_REPORT_LIMITS } from '@/lib/aiGovernance';

const FIELD = 'w-full rounded-lg border border-zinc-200/70 bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 dark:border-zinc-800/70 dark:text-zinc-100 dark:placeholder:text-zinc-500';
const LABEL = 'block text-xs font-medium text-zinc-500 dark:text-zinc-400';
const EMPTY = { description: '', occurredAt: '', affectsClient: '', clientId: '' };
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` });

/**
 * Reportar un incidente de seguridad (12 de octubre de 2026). Cualquier persona del equipo deja constancia
 * en el momento: qué pasó, cuándo, si tiene que ver con un cliente y cuál. El servidor pone la hora, la
 * identidad y avisa a administración; quien reporta no gana acceso al registro de incidentes.
 */
export default function IncidentReportDialog({ open, onOpenChange }) {
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value, ...(key === 'affectsClient' && value === 'NO' ? { clientId: '' } : {}) }));
  const description = form.description.trim();
  const askClient = form.affectsClient === 'SI' || form.affectsClient === 'NO_SE';

  const clients = useQuery({
    queryKey: ['incident-report', 'clients'],
    queryFn: async () => {
      const response = await fetch(`${getApiBaseUrl()}/api/clients`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`No se pudieron cargar los clientes (${response.status}).`);
      const list = await response.json();
      return (Array.isArray(list) ? list : []).map((client) => ({ id: client.id, name: client.name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    },
    enabled: open && askClient,
    staleTime: 5 * 60 * 1000
  });

  const close = (next) => {
    if (sending) return;
    if (!next) { setForm(EMPTY); setError(''); }
    onOpenChange(next);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!description || !form.affectsClient || sending) return;
    setSending(true); setError('');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/incident-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ description, affectsClient: form.affectsClient, ...(form.occurredAt ? { occurredAt: form.occurredAt } : {}), ...(askClient && form.clientId ? { clientId: form.clientId } : {}) })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('[Reportar incidente]', payload);
        throw new Error(payload.error || `No se pudo enviar el reporte (${response.status}).`);
      }
      toast.success('Reporte enviado. Administración ya fue avisada.');
      setForm(EMPTY);
      onOpenChange(false);
    } catch (submitError) {
      console.error('[Reportar incidente] Enviar:', submitError.message);
      setError(submitError.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" data-incident-report-dialog>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-white">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              Reportar un incidente
            </DialogTitle>
            <DialogDescription>
              Un equipo perdido, un correo sospechoso, algo enviado a quien no era. Cuéntalo ahora, aunque no tengas todos los detalles: administración lo revisa.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="incident-report-description" className={LABEL}>¿Qué pasó? *</label>
              <textarea
                id="incident-report-description"
                value={form.description}
                onChange={(event) => set('description', event.target.value.slice(0, INCIDENT_REPORT_LIMITS.description))}
                required
                rows={4}
                maxLength={INCIDENT_REPORT_LIMITS.description}
                placeholder="Ej.: me llegó un correo que parecía del banco pidiendo la clave de la cuenta."
                className={`${FIELD} resize-none`}
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">No escribas contraseñas ni datos completos de tarjetas o documentos.</p>
            </div>
            <div className="space-y-1.5">
              <span className={LABEL} id="incident-report-when-label">¿Cuándo pasó? (si lo sabes)</span>
              <BrainDateTimePicker id="incident-report-when" value={form.occurredAt} onChange={(value) => set('occurredAt', value)} ariaLabel="¿Cuándo pasó?" className={FIELD} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="incident-report-client-answer" className={LABEL}>¿Tiene que ver con un cliente? *</label>
              <Select id="incident-report-client-answer" value={form.affectsClient} required onChange={(event) => set('affectsClient', event.target.value)} className={FIELD}>
                <option value="">Seleccionar</option>
                <option value="SI">Sí</option>
                <option value="NO">No</option>
                <option value="NO_SE">No sé</option>
              </Select>
            </div>
            {askClient && (
              <div className="space-y-1.5">
                <label htmlFor="incident-report-client" className={LABEL}>¿Qué cliente? (opcional)</label>
                <Select id="incident-report-client" value={form.clientId} onChange={(event) => set('clientId', event.target.value)} className={FIELD} disabled={clients.isLoading}>
                  <option value="">{clients.isLoading ? 'Cargando clientes…' : 'No estoy seguro'}</option>
                  {(clients.data || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </Select>
                {clients.error && <p className="text-xs text-zinc-500 dark:text-zinc-400">No se pudo cargar la lista. Puedes nombrar al cliente en la descripción.</p>}
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="mt-5 gap-3 sm:justify-between">
            <button type="button" onClick={() => close(false)} disabled={sending} className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Cancelar
            </button>
            <button type="submit" disabled={!description || !form.affectsClient || sending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">
              {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Enviar reporte
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
