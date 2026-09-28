import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Select from '@/components/ui/Select';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DATA_REQUEST_CHANNELS, DATA_REQUEST_REASONS, DATA_REQUEST_STATUSES, DATA_REQUEST_TYPES, displayDay } from '@/lib/dataSubjectRequests';

// Consultas y reclamos de titulares (Ley 1581), 27 de septiembre de 2026. Los plazos los
// calcula el servidor en días hábiles de Colombia; la pantalla solo los muestra.

const inputStyle = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground';
const buttonStyle = 'min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50';
const statusLabel = Object.fromEntries(DATA_REQUEST_STATUSES);
const reasonLabel = Object.fromEntries(Object.values(DATA_REQUEST_REASONS).flat());
const EMPTY = {
  type: 'CONSULTA', reason: 'CONOCER', channel: 'EMAIL', status: 'RECIBIDA', requesterName: '', requesterDocument: '', contactEmail: '', contactPhone: '',
  description: '', receivedOn: '', extendedOn: '', extensionReason: '', incompleteRequestedOn: '', completedOn: '', legendAddedOn: '',
  respondedOn: '', responseSummary: '', responseEvidence: '', notes: ''
};
const formatDay = displayDay;

const Text = ({ id, label, value, onChange, required, area, type = 'text', max }) => (
  <label className="block space-y-1" htmlFor={id}>
    <span className="block text-sm font-medium">{label}{required ? ' *' : ''}</span>
    {area
      ? <textarea id={id} rows={3} className={inputStyle} value={value} required={required} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      : <input id={id} type={type} className={inputStyle} value={value} required={required} maxLength={max} onChange={(e) => onChange(e.target.value)} />}
  </label>
);

const Day = ({ id, label, value, onChange, required, max }) => (
  <label className="block space-y-1" htmlFor={id}>
    <span className="block text-sm font-medium">{label}{required ? ' *' : ''}</span>
    <BrainDatePicker id={id} value={value} onChange={onChange} className={inputStyle} isClearable={!required} required={required} max={max} ariaLabel={label} />
  </label>
);

function RequestForm({ record, request, today, onClose, onSaved }) {
  const [body, setBody] = useState(() => ({ ...EMPTY, ...(record ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, record[k] ?? ''])) : { receivedOn: today }) }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setBody((b) => ({ ...b, [key]: value, ...(key === 'type' ? { reason: DATA_REQUEST_REASONS[value][0][0] } : {}) }));
  const isClaim = body.type === 'RECLAMO';

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== ''));
    try {
      await request(record ? `/data-requests/${record.id}` : '/data-requests', { method: record ? 'PATCH' : 'POST', body: payload });
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}>
        <DialogTitle>{record ? `${record.reference} · ${record.requesterName}` : 'Nueva solicitud de titular'}</DialogTitle>
        <DialogDescription>Registra lo que pidió el titular y cada paso del trámite. Los plazos se calculan en días hábiles de Colombia.</DialogDescription>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1" htmlFor="dsr-type"><span className="block text-sm font-medium">Tipo *</span>
              <Select id="dsr-type" value={body.type} onChange={(e) => set('type')(e.target.value)}>{Object.entries(DATA_REQUEST_TYPES).map(([id, t]) => <option key={id} value={id}>{t.label} ({t.days} días hábiles)</option>)}</Select></label>
            <label className="block space-y-1" htmlFor="dsr-reason"><span className="block text-sm font-medium">Motivo *</span>
              <Select id="dsr-reason" value={body.reason} onChange={(e) => set('reason')(e.target.value)}>{DATA_REQUEST_REASONS[body.type].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></label>
            <Text id="dsr-name" label="Titular o quien actúa por él" value={body.requesterName} onChange={set('requesterName')} required max={180} />
            <Text id="dsr-doc" label="Documento de identidad" value={body.requesterDocument} onChange={set('requesterDocument')} max={40} />
            <Text id="dsr-email" label="Correo de contacto" type="email" value={body.contactEmail} onChange={set('contactEmail')} max={180} />
            <Text id="dsr-phone" label="Teléfono de contacto" value={body.contactPhone} onChange={set('contactPhone')} max={40} />
            <label className="block space-y-1" htmlFor="dsr-channel"><span className="block text-sm font-medium">Canal *</span>
              <Select id="dsr-channel" value={body.channel} onChange={(e) => set('channel')(e.target.value)}>{DATA_REQUEST_CHANNELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></label>
            <Day id="dsr-received" label="Recibida el" value={body.receivedOn} onChange={set('receivedOn')} required max={today} />
          </div>
          <Text id="dsr-description" label="Qué pide el titular" area value={body.description} onChange={set('description')} required max={4000} />

          <fieldset className="space-y-4 rounded-xl border border-border p-4">
            <legend className="px-1 text-sm font-semibold">Trámite</legend>
            <label className="block space-y-1" htmlFor="dsr-status"><span className="block text-sm font-medium">Estado *</span>
              <Select id="dsr-status" value={body.status} onChange={(e) => set('status')(e.target.value)}>{DATA_REQUEST_STATUSES.filter(([id]) => isClaim || !['INCOMPLETA', 'DESISTIDA'].includes(id)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></label>
            <div className="grid gap-4 sm:grid-cols-2">
              {isClaim && <Day id="dsr-legend" label="Leyenda «reclamo en trámite» puesta el" value={body.legendAddedOn} onChange={set('legendAddedOn')} max={today} />}
              <Day id="dsr-extended" label="Prórroga informada el" value={body.extendedOn} onChange={set('extendedOn')} max={today} />
              {isClaim && <Day id="dsr-incomplete" label="Se pidió completar el reclamo el" value={body.incompleteRequestedOn} onChange={set('incompleteRequestedOn')} max={today} />}
              {isClaim && <Day id="dsr-completed" label="El titular lo completó el" value={body.completedOn} onChange={set('completedOn')} max={today} />}
            </div>
            {body.extendedOn && <Text id="dsr-ext-reason" label="Motivo de la prórroga informado al titular" area value={body.extensionReason} onChange={set('extensionReason')} required max={1000} />}
          </fieldset>

          <fieldset className="space-y-4 rounded-xl border border-border p-4">
            <legend className="px-1 text-sm font-semibold">Respuesta</legend>
            <Day id="dsr-responded" label="Respondida el" value={body.respondedOn} onChange={set('respondedOn')} max={today} />
            <Text id="dsr-response" label="Resumen de la respuesta" area value={body.responseSummary} onChange={set('responseSummary')} max={4000} />
            <Text id="dsr-evidence" label="Evidencia del envío (correo, radicado, guía)" value={body.responseEvidence} onChange={set('responseEvidence')} max={1000} />
          </fieldset>
          <Text id="dsr-notes" label="Notas internas" area value={body.notes} onChange={set('notes')} max={4000} />

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonStyle} onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DeadlineLine = ({ item }) => {
  const d = item.deadlines;
  if (!d.open) return <p className="text-sm text-muted-foreground">{statusLabel[item.status]}{item.respondedOn ? ` el ${formatDay(item.respondedOn)}` : ''}{d.answeredLate ? ' · fuera de plazo' : ''}</p>;
  if (!d.dueOn) return <p className="text-sm text-muted-foreground">Plazo detenido: esperando que el titular complete el reclamo (desiste el {formatDay(d.desistOn)}).</p>;
  return <p className={`text-sm ${d.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>Vence el {formatDay(d.dueOn)} · {d.overdue ? `vencida hace ${-d.daysLeft} día(s) hábil(es)` : `${d.daysLeft} día(s) hábil(es)`}{item.extendedOn ? ' · con prórroga' : ''}</p>;
};

export default function GovernanceDataRequests({ request }) {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['governance', 'data-requests', onlyOpen, page], queryFn: () => request(`/data-requests?open=${onlyOpen}&page=${page}`), staleTime: 30000 });
  const today = query.data?.today || new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Solicitudes de titulares</h2>
          <p className="text-sm text-muted-foreground">Consultas (10 días hábiles, prorrogables 5) y reclamos (15, prorrogables 8) de la Ley 1581.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonStyle} aria-pressed={onlyOpen} onClick={() => { setOnlyOpen((v) => !v); setPage(1); }}>{onlyOpen ? 'Ver también cerradas' : 'Solo abiertas'}</button>
          <button type="button" className={buttonStyle} onClick={() => setEditing({})}>Nueva solicitud</button>
        </div>
      </div>

      {query.isLoading ? <p role="status">Cargando solicitudes…</p> : query.error ? <p role="alert" className="text-destructive">{query.error.message}</p> : !query.data.items.length
        ? <p className="py-10 text-center text-muted-foreground">{onlyOpen ? 'No hay solicitudes abiertas.' : 'Aún no se ha registrado ninguna solicitud.'}</p>
        : <div className="space-y-3">{query.data.items.map((item) => (
          <article key={item.id} className="rounded-xl border border-border bg-card p-4 text-card-foreground">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="break-words font-semibold">{item.reference} · {item.requesterName}</h3>
                <p className="text-sm text-muted-foreground">{DATA_REQUEST_TYPES[item.type].label} · {reasonLabel[item.reason]} · recibida el {formatDay(item.receivedOn)} · {statusLabel[item.status]}</p>
                <DeadlineLine item={item} />
                {item.deadlines.alerts.map((alert) => <p key={alert} className="text-sm font-medium text-destructive">{alert}</p>)}
              </div>
              <button type="button" className={`${buttonStyle} self-start`} onClick={() => setEditing(item)}>Ver / actualizar</button>
            </div>
          </article>
        ))}</div>}

      <div className="flex items-center justify-end gap-3 text-sm">
        <button type="button" className={buttonStyle} disabled={page === 1 || query.isFetching} onClick={() => setPage((p) => p - 1)}>Anterior</button>
        <span>Página {page}</span>
        <button type="button" className={buttonStyle} disabled={!query.data?.hasMore || query.isFetching} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
      </div>

      {editing && <RequestForm record={editing.id ? editing : null} request={request} today={today} onClose={() => setEditing(null)} onSaved={async () => { await cache.invalidateQueries({ queryKey: ['governance', 'data-requests'] }); setEditing(null); }} />}
    </div>
  );
}
