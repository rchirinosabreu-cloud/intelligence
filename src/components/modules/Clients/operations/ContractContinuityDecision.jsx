import React, { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { shortDate } from '@/lib/clientOperations';

const BUTTON = 'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

export function ContractContinuitySummary({ client }) {
  const contract = client.contract;
  if (!contract || (contract.renewalDecision !== 'NO_RENOVAR' && !client.canDecideContinuity)) return null;
  return <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-white/10" data-contract-continuity>
    {contract.renewalDecision === 'NO_RENOVAR' && <>
      <p className="font-semibold">No renovará · {shortDate(contract.endDate, { year: true })}</p>
      <p className="mt-1 text-zinc-500">Registrado por {contract.renewalDecisionByName || 'el equipo'}{contract.renewalDecisionAt ? ` · ${new Date(contract.renewalDecisionAt).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })}` : ''}</p>
      {contract.renewalDecisionNote && <p className="mt-2 whitespace-pre-line">{contract.renewalDecisionNote}</p>}
      <p className="my-2 text-zinc-600 dark:text-zinc-300">Los pendientes del contrato se mantienen hasta resolverlos.</p>
    </>}
    {client.canDecideContinuity && contract.status === 'ACTIVO' && <ContractContinuityDecision clientId={client.id} clientName={client.name} contract={contract} />}
  </div>;
}

/** La misma confirmación desde la banda o la ficha; guardar nunca equivale a suspender o cerrar pendientes. */
export default function ContractContinuityDecision({ clientId, contract, clientName, onDecided, className = 'brain-notice-ghost' }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState('');
  const [review, setReview] = useState(null);
  const cancel = useRef(null);
  const noteId = useId();
  const correcting = review?.renewalDecision === 'NO_RENOVAR';
  if (!contract?.endDate || !contract.updatedAt) return null;
  const changeOpen = value => {
    if (busy) return;
    if (value) { setReview({ ...contract }); setNote(''); setFailure(''); }
    setOpen(value);
  };
  const save = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFailure('');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/client-operations/${encodeURIComponent(clientId)}/continuity`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: review.id, expectedUpdatedAt: review.updatedAt, endDate: review.endDate,
          decision: correcting ? 'PENDIENTE' : 'NO_RENOVAR', confirmed: true, note }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          queryClient.invalidateQueries({ queryKey: ['client-operations'] });
          queryClient.invalidateQueries({ queryKey: ['important-notice'] });
        }
        throw new Error(data.error || 'No pudimos guardar la decisión.');
      }
      setOpen(false);
      toast.success(correcting ? 'Continuidad pendiente de confirmar.' : 'Decisión de no renovar registrada.');
      for (const queryKey of [['client-operations'], ['important-notice'], ['notifications']]) queryClient.invalidateQueries({ queryKey });
      onDecided?.();
    } catch (error) { setFailure(error.message); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><button type="button" className={`${BUTTON} ${className}`}>
      {contract.renewalDecision === 'NO_RENOVAR' ? 'Corregir decisión' : 'El cliente no renovará'}
    </button></DialogTrigger>
    <DialogContent className="contract-continuity-dialog max-w-xl rounded-2xl p-6 sm:p-8" showCloseButton={false}
      onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }}
      onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <DialogTitle className="text-lg font-semibold pr-4">{correcting ? 'Corregir la decisión de continuidad' : 'Confirmar que el cliente no renovará'}</DialogTitle>
      <DialogDescription className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {clientName && <span className="mb-2 block font-semibold text-foreground">{clientName}</span>}
        {correcting ? 'La continuidad volverá a quedar pendiente y podrán aparecer sus avisos. Esto no renueva el contrato.' : <>
          El servicio finaliza el <strong className="text-foreground">{shortDate(review?.endDate, { year: true })}</strong>, al terminar el contrato vigente.
          <span className="mt-2 block">La decisión quedará registrada para todo el equipo. Dejarán de aparecer los avisos de continuidad y renovación de este contrato.</span>
          <span className="mt-2 block">Se conservan las publicaciones, entregas, informes y cobros pendientes, con sus responsables y permisos actuales.</span>
        </>}
      </DialogDescription>
      <form onSubmit={save} className="space-y-4">
        <div><label htmlFor={noteId} className="mb-2 block text-sm font-medium">{correcting ? 'Motivo de la corrección' : 'Nota del acuerdo (opcional)'}</label>
          <textarea id={noteId} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} required={correcting} disabled={busy}
            rows={2} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
        </div>
        {failure && <p role="alert" className="text-sm text-destructive">{failure} Si cambió la ficha, vuelve a abrir esta confirmación.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={cancel} type="button" disabled={busy} className={`${BUTTON} brain-notice-ghost`} onClick={() => changeOpen(false)}>Volver</button>
          <button type="submit" disabled={busy} className={`${BUTTON} brain-notice-primary`}>{busy ? 'Guardando…' : correcting ? 'Confirmar corrección' : 'Confirmar no renovación'}</button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
