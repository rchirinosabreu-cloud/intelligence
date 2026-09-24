import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Select from '@/components/ui/Select';
import { BrainDateTimePicker } from '@/components/ui/BrainDatePicker';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { DATA_CLASSES, GOVERNANCE_FORMS, STATUS_LABELS } from '@/lib/aiGovernance';
import GovernanceRecords, { displayDate } from './GovernanceRecords';
import GovernanceDocuments from './GovernanceDocuments';

const inputStyle = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground';
const buttonStyle = 'min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50';
const labels = { PUBLIC: 'Públicos', INTERNAL: 'Internos', CONFIDENTIAL: 'Confidenciales', RESTRICTED: 'Restringidos / sensibles', GENERATIVE: 'IA generativa', ML: 'Aprendizaje automático', NEURAL: 'Red neuronal', LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' };
const localDate = value => value ? new Date(+new Date(value) - 5 * 3600000).toISOString().slice(0, 16) : '';
async function request(path, { method = 'GET', body, download = false, text = false, signal } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/ai-governance${path}`, {
    method, signal, headers: { Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    console.error('[Gobierno IA]', payload);
    throw new Error(payload.error || `No se pudo completar la solicitud (${response.status}).`);
  }
  return download ? response.blob() : text ? response.text() : response.json();
}

function RecordForm({ kind, record, options, onSaved, onClose }) {
  const form = GOVERNANCE_FORMS[kind];
  const revoking = kind === 'authorizations' && record?.status === 'APPROVED';
  const [body, setBody] = useState(() => ({
    name: record?.name || '', status: revoking ? 'REVOKED' : record?.status || form.statuses[0],
    clientId: record?.clientId || '', systemId: record?.systemId || '', riskId: record?.riskId || '',
    data: Object.fromEntries(form.fields.map(f => [f.key, f.type === 'datetime' ? localDate(record?.data[f.key]) : record?.data[f.key] ?? (f.type === 'classes' ? [] : f.key === 'useCase' ? 'parrillas.review' : '')])),
    reason: '', expectedVersion: record?.version
  }));
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const update = (key, value) => setBody(b => ({ ...b, [key]: value, ...(['clientId', 'systemId'].includes(key) ? { riskId: '' } : {}) }));
  const dataUpdate = (key, value) => setBody(b => ({ ...b, data: { ...b.data, [key]: value } }));
  const chooser = (key, label, choices, required = true) => <label className="block space-y-2" key={key} htmlFor={`gov-${key}`}><span className="block text-sm font-medium">{label}{required ? ' *' : ''}</span><Select id={`gov-${key}`} value={body[key]} onChange={e => update(key, e.target.value)} required={required}><option value="">Seleccionar</option>{choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>;
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try { await request(`/${kind}${record ? `/${record.id}` : ''}`, { method: record ? 'PATCH' : 'POST', body }); await onSaved(); }
    catch (e) { console.error('[Gobierno IA] Guardar:', e.message); setError(e.message); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-3xl">
    <DialogTitle>{revoking ? 'Revocar autorización' : `${record ? 'Editar' : 'Nuevo registro'} · ${form.label}`}</DialogTitle>
    <DialogDescription>{revoking ? 'La evidencia se conservará. El siguiente envío del flujo cubierto volverá a validar sus autorizaciones.' : 'Información privada. Guardar una referencia no envía un correo ni verifica la autenticidad del documento.'}</DialogDescription>
    <form onSubmit={submit} className="space-y-5">
      {!revoking && <>
        <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 sm:col-span-2"><span className="block text-sm font-medium">Nombre *</span><input className={inputStyle} value={body.name} onChange={e => update('name', e.target.value)} required maxLength={180} /></label>
          {chooser('status', 'Estado', form.statuses.filter(s => s !== 'REVOKED').map(id => ({ id, name: STATUS_LABELS[id] })))}
          {kind !== 'systems' && chooser('clientId', 'Empresa / cliente', options.clients, kind !== 'incidents')}
          {['risks', 'authorizations'].includes(kind) && chooser('systemId', 'Sistema de IA', options.systems)}
          {kind === 'authorizations' && chooser('riskId', 'Evaluación de riesgos', options.risks.filter(r => r.clientId === body.clientId && r.systemId === body.systemId))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">{form.fields.map(f => {
          const id = `gov-${f.key}`, value = body.data[f.key];
          if (f.type === 'classes') return <fieldset key={f.key} className="rounded-lg border p-3 sm:col-span-2"><legend className="px-1 text-sm font-medium">{f.label} *</legend><div className="flex flex-wrap gap-4">{DATA_CLASSES.map(c => <label key={c} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={value.includes(c)} onChange={e => dataUpdate(f.key, e.target.checked ? [...value, c] : value.filter(x => x !== c))} />{labels[c]}</label>)}</div></fieldset>;
          return <label key={f.key} htmlFor={id} className={`block space-y-2 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}><span className="block text-sm font-medium">{f.label}{f.required ? ' *' : ''}</span>
            {f.type === 'datetime' ? <BrainDateTimePicker id={id} value={value} onChange={v => dataUpdate(f.key, v)} ariaLabel={f.label} className={inputStyle} />
              : ['person', 'select'].includes(f.type) ? <Select id={id} value={value} required={f.required} onChange={e => dataUpdate(f.key, e.target.value)}><option value="">Seleccionar</option>{(f.type === 'person' ? options.people : f.options.map(id => ({ id, name: labels[id] || id }))).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                : f.type === 'textarea' ? <textarea id={id} rows={3} className={inputStyle} required={f.required} value={value} maxLength={6000} onChange={e => dataUpdate(f.key, e.target.value)} />
                  : <input id={id} className={inputStyle} type={f.type} value={value} required={f.required} min={f.type === 'number' ? 1 : undefined} max={f.type === 'number' ? 5 : undefined} step={f.type === 'number' ? 1 : undefined} onChange={e => dataUpdate(f.key, e.target.value)} />}
          </label>;
        })}</div>
      </>}
      {kind === 'authorizations' && !revoking && <p className="text-sm text-muted-foreground">Para aprobar: sistema aprobado, riesgo mitigado con puntuación residual ≤ 4/25, evidencia escrita y un mes calendario entre aviso e inicio. Un cambio en el sistema o el riesgo exige una nueva autorización.</p>}
      <label className="block space-y-2"><span className="block text-sm font-medium">Motivo del registro o cambio{record ? ' *' : ''}</span><textarea className={inputStyle} value={body.reason} maxLength={1000} required={Boolean(record)} onChange={e => update('reason', e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className={buttonStyle} disabled={saving} onClick={onClose}>Cancelar</button><button className={buttonStyle} disabled={saving}>{saving ? 'Guardando…' : revoking ? 'Confirmar revocación' : 'Guardar registro'}</button></div>
    </form>
  </DialogContent></Dialog>;
}

function ClientControl({ options, onSaved }) {
  const [clientId, setClientId] = useState(''); const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const policy = options.policies.find(p => p.clientId === clientId);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await request(`/policy/${clientId}`, { method: 'PUT', body: { enabled: !policy?.enabled, expectedVersion: policy?.version || 0, reason } }); await onSaved(); setReason(''); setMessage('Cambio guardado por el servidor.'); }
    catch (error) { console.error('[Gobierno IA] Control:', error.message); setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section className="max-w-2xl space-y-5"><h2 className="text-lg font-semibold">Control por empresa</h2><p className="text-sm">Las revisiones de parrillas de Bria (<code>parrillas.review</code>) exigen autorización vigente al activar el control para su cliente. La revisión protegida no consulta memoria histórica.</p><p className="text-sm text-muted-foreground">Mientras haya alguna empresa protegida, los flujos sin cliente identificado quedan bloqueados antes del envío a IA: minutas, reportes, memoria, Manager y proxies. Esto puede afectar funciones compartidas de otros clientes. Es un bloqueo preventivo, no una autorización para esos módulos.</p><p className="text-sm text-muted-foreground">No detiene solicitudes ya enviadas ni herramientas externas a la plataforma. Las invitaciones nuevas al bot de Fireflies también requieren control; las reuniones ya programadas deben revisarse manualmente. La comprobación técnica de disponibilidad usa únicamente un mensaje fijo, sin datos de clientes.</p>
    <form className="space-y-4" onSubmit={submit}><label className="block space-y-2" htmlFor="gov-policy-client"><span className="block text-sm font-medium">Empresa / cliente</span><Select id="gov-policy-client" required value={clientId} onChange={e => { setClientId(e.target.value); setMessage(''); }}><option value="">Seleccionar</option>{options.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
      {clientId && <p className="font-medium">{policy?.enabled ? 'Control activo para esta empresa' : 'Control de esta empresa sin activar; otros controles pueden bloquear funciones compartidas'}</p>}
      <label className="block space-y-2"><span className="block text-sm font-medium">Motivo y referencia de aprobación interna *</span><textarea required maxLength={1000} className={inputStyle} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className={buttonStyle} disabled={!clientId || busy}>{busy ? 'Guardando…' : policy?.enabled ? 'Desactivar control de IA' : 'Activar control de IA'}</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form></section>;
}

function History({ kind, record, onClose }) {
  const query = useQuery({ queryKey: ['governance', 'history', kind, record.id], queryFn: () => request(`/${kind}/${record.id}/history`), staleTime: 0 });
return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-w-3xl"><DialogTitle>Historial · {record.name}</DialogTitle><DialogDescription>Registro interno de cambios. No es una bitácora criptográficamente inmutable.</DialogDescription>{query.isLoading ? <p>Cargando…</p> : query.error ? <p role="alert" className="text-destructive">{query.error.message}</p> : <div className="space-y-3">{query.data.map(event => <article key={event.id} className="rounded-xl border p-3 text-sm"><p className="font-medium">{event.action} · {displayDate(event.createdAt)}</p><p>{event.reason}</p><p className="text-muted-foreground">Actor: {event.actorId || 'Sistema'}</p><details className="mt-2"><summary className="cursor-pointer">Ver evidencia del cambio</summary><pre className="mt-2 whitespace-pre-wrap break-all text-xs">{JSON.stringify({ antes: event.before, despues: event.after }, null, 2)}</pre></details></article>)}</div>}</DialogContent></Dialog>;
}

export default function GovernanceCenter() {
  const [tab, setTab] = useState('systems'); const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); const [history, setHistory] = useState(null); const [notice, setNotice] = useState('');
  const cache = useQueryClient();
  const options = useQuery({ queryKey: ['governance', 'options'], queryFn: () => request('/options'), staleTime: 60000 });
  const records = useQuery({ queryKey: ['governance', tab, page], queryFn: () => request(`/${tab}?page=${page}`), enabled: Boolean(GOVERNANCE_FORMS[tab]) && Boolean(options.data), staleTime: 60000, refetchInterval: tab === 'incidents' ? 30000 : false });
  const refresh = () => cache.invalidateQueries({ queryKey: ['governance'] });
  async function download(doc) {
    try {
      const blob = await request(`/documents/${doc.id}`, { download: true }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${doc.id}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { console.error('[Gobierno IA] Documento:', e.message); setNotice(e.message); }
  }
  return <div className="mx-auto max-w-6xl space-y-6 p-4 text-foreground sm:p-6">
    <header><p className="text-sm text-muted-foreground">Administración · Acceso privado</p><h1 className="mt-1 text-2xl font-semibold">Gobierno de IA y seguridad</h1><p className="mt-2 text-sm text-muted-foreground">Inventario, autorizaciones, riesgos y respuesta a incidentes.</p></header>
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-card-foreground"><p className="font-medium">Primera versión · Cobertura parcial</p><p className="mt-1">Este registro no certifica cumplimiento legal. Las evidencias deben revisarse y los responsables deben aprobar las políticas. Registrar una notificación no envía un correo.</p></div>
    <nav aria-label="Secciones de gobierno de IA" className="flex flex-wrap gap-2">{[...Object.entries(GOVERNANCE_FORMS).map(([id, f]) => [id, f.label]), ['control', 'Control por empresa'], ['documents', 'Documentos internos']].map(([id, label]) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} className={`${buttonStyle} ${tab === id ? 'bg-muted' : ''}`} onClick={() => { setTab(id); setPage(1); setNotice(''); }}>{label}</button>)}</nav>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {options.isLoading ? <p role="status">Cargando acceso y opciones…</p> : options.error ? <p role="alert" className="text-destructive">{options.error.message}</p> : <section className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6">
      {GOVERNANCE_FORMS[tab] ? <><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{GOVERNANCE_FORMS[tab].label}</h2><button className={buttonStyle} onClick={() => setEditing({})}>Nuevo registro</button></div>
        <GovernanceRecords kind={tab} items={records.data?.items} loading={records.isLoading} error={records.error} onEdit={setEditing} onHistory={setHistory} />
        <div className="mt-5 flex items-center justify-end gap-3 text-sm"><button className={buttonStyle} disabled={page === 1 || records.isFetching} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page}</span><button className={buttonStyle} disabled={!records.data?.hasMore || records.isFetching} onClick={() => setPage(p => p + 1)}>Siguiente</button></div></>
        : tab === 'control' ? <ClientControl options={options.data} onSaved={refresh} /> : <GovernanceDocuments loadDocument={(id, signal) => request(`/documents/${id}`, { text: true, signal })} onDownload={download} />}
    </section>}
    {editing && options.data && <RecordForm kind={tab} record={editing.id ? editing : null} options={options.data} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); setEditing(null); setNotice('Registro guardado por el servidor.'); }} />}
    {history && <History kind={tab} record={history} onClose={() => setHistory(null)} />}
  </div>;
}
