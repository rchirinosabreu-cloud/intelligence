import React, { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import Select from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { useAddActivity } from './crmApi';
import { CRM_ACTIVITY_TYPES, inputClass, labelClass } from './crmPresentation';

const bogotaNowLocal = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
};

const newRequestId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const SUGGESTIONS = {
  LLAMADA: 'Enviar resumen y proponer fecha de reunión.',
  CORREO: 'Confirmar recepción y agendar llamada.',
  WHATSAPP: 'Esperar respuesta y llamar si no contesta.',
  MENSAJE_LINKEDIN: 'Validar datos y proponer conversación.',
  REUNION: 'Preparar y enviar propuesta.',
  PROPUESTA_ENVIADA: 'Hacer seguimiento y buscar fecha de decisión.',
  RESPUESTA_CLIENTE: 'Responder y definir siguiente paso.',
  NOTA: ''
};

/**
 * "Registrar gestión": the daily action. Every entry asks for the next step so no lead is left without one.
 * Compact mode is used inside the follow-ups dialog.
 */
const CrmActivityForm = ({ leadId, defaultNextAction = '', compact = false, onSaved }) => {
  const [form, setForm] = useState(() => ({ type: 'LLAMADA', occurredAt: bogotaNowLocal(), note: '', result: '', nextAction: defaultNextAction, nextFollowUpAt: '' }));
  const [requestId, setRequestId] = useState(newRequestId);
  const add = useAddActivity();
  const types = useMemo(() => CRM_ACTIVITY_TYPES.filter(type => type.value !== 'CAMBIO_ETAPA'), []);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  const submit = async event => {
    event.preventDefault();
    if (!form.note.trim() && !form.result.trim()) {
      toast.error('Escribe qué se hizo o qué respondió el cliente.');
      return;
    }
    try {
      const occurredAt = form.occurredAt ? new Date(`${form.occurredAt}:00-05:00`).toISOString() : undefined;
      const saved = await add.mutateAsync({ id: leadId, ...form, occurredAt, requestId });
      toast.success('Gestión registrada');
      setForm({ type: form.type, occurredAt: bogotaNowLocal(), note: '', result: '', nextAction: '', nextFollowUpAt: '' });
      setRequestId(newRequestId());
      onSaved?.(saved);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-crm-activity-form>
      <div className={cn('grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
        <div>
          <label className={labelClass} htmlFor={`crm-type-${leadId}`}>Tipo de gestión</label>
          <Select id={`crm-type-${leadId}`} value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value, nextAction: current.nextAction || SUGGESTIONS[event.target.value] || '' }))} className={inputClass}>
            {types.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
          </Select>
        </div>
        <div>
          <label className={labelClass} htmlFor={`crm-when-${leadId}`}>Fecha y hora</label>
          <input id={`crm-when-${leadId}`} type="datetime-local" value={form.occurredAt} onChange={set('occurredAt')} className={inputClass} />
        </div>
        {!compact && (
          <div>
            <label className={labelClass} htmlFor={`crm-follow-${leadId}`}>Próximo seguimiento</label>
            <input id={`crm-follow-${leadId}`} type="date" value={form.nextFollowUpAt} onChange={set('nextFollowUpAt')} className={inputClass} />
          </div>
        )}
      </div>
      <div className={cn('grid gap-3', compact ? '' : 'sm:grid-cols-2')}>
        <div>
          <label className={labelClass} htmlFor={`crm-note-${leadId}`}>Qué se hizo</label>
          <textarea id={`crm-note-${leadId}`} rows={compact ? 2 : 3} value={form.note} onChange={set('note')} className={cn(inputClass, 'resize-y')} placeholder="Ej. Llamé a Catalina, revisamos el alcance del RFP." />
        </div>
        <div>
          <label className={labelClass} htmlFor={`crm-result-${leadId}`}>Resultado / respuesta</label>
          <textarea id={`crm-result-${leadId}`} rows={compact ? 2 : 3} value={form.result} onChange={set('result')} className={cn(inputClass, 'resize-y')} placeholder="Ej. Enviará el RFP esta semana." />
        </div>
      </div>
      <div className={cn('grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-[1fr_auto]')}>
        <div>
          <label className={labelClass} htmlFor={`crm-next-${leadId}`}>Próxima acción</label>
          <input id={`crm-next-${leadId}`} value={form.nextAction} onChange={set('nextAction')} className={inputClass} placeholder="Qué toca hacer después" />
        </div>
        {compact ? (
          <div>
            <label className={labelClass} htmlFor={`crm-follow-${leadId}`}>Próximo seguimiento</label>
            <input id={`crm-follow-${leadId}`} type="date" value={form.nextFollowUpAt} onChange={set('nextFollowUpAt')} className={inputClass} />
          </div>
        ) : null}
        <div className={cn('flex items-end', compact && 'sm:col-span-2 justify-end')}>
          <Button type="submit" disabled={add.isPending} className="min-h-10 gap-2">
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Registrar gestión
          </Button>
        </div>
      </div>
    </form>
  );
};

export default CrmActivityForm;
