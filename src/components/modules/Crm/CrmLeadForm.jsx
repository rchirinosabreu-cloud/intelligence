import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import SlideOver from '@/components/ui/SlideOver';
import Select from '@/components/ui/Select';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Button } from '@/components/ui/button';
import { Target, Loader2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { useCreateLead, useUpdateLead } from './crmApi';
import { CRM_ORIGINS, CRM_PRIORITIES, inputClass, labelClass } from './crmPresentation';

const EMPTY = {
  company: '', contactName: '', jobTitle: '', origin: 'CONTACTO_DIRECTO', originDetail: '', priority: 'MEDIA', ownerId: '',
  serviceInterest: '', email: '', phone: '', linkedinUrl: '', language: 'Español', allowedContact: '',
  quotedValue: '', currency: 'COP', publishedAt: '', callDeadlineAt: '', nextAction: '', nextFollowUpAt: '', notes: ''
};

const fromLead = lead => Object.fromEntries(Object.keys(EMPTY).map(key => [key, lead?.[key] ?? EMPTY[key] ?? '']));

const Field = ({ label, children, className, hint }) => (
  <div className={cn('min-w-0', className)}>
    <label className={labelClass}>{label}</label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-zinc-400">{hint}</p>}
  </div>
);

/**
 * Create or edit the lead's own data. The stage and the milestone dates are never edited here:
 * they move through the log and the stage control on the detail page.
 */
const CrmLeadForm = ({ open, onOpenChange, lead = null, team = [], onSaved }) => {
  const editing = Boolean(lead?.id);
  const [form, setForm] = useState(() => fromLead(lead));
  const [showMore, setShowMore] = useState(editing);
  const create = useCreateLead();
  const update = useUpdateLead();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (open) { setForm(fromLead(lead)); setShowMore(Boolean(lead?.id)); }
  }, [open, lead]);

  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  const submit = async event => {
    event.preventDefault();
    if (!form.company.trim() && !form.contactName.trim()) {
      toast.error('Indica al menos la empresa o la persona de contacto.');
      return;
    }
    try {
      const payload = { ...form, quotedValue: form.quotedValue === '' ? null : form.quotedValue };
      const saved = editing ? await update.mutateAsync({ id: lead.id, ...payload }) : await create.mutateAsync(payload);
      toast.success(editing ? 'Oportunidad actualizada' : 'Oportunidad registrada');
      onSaved?.(saved);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Editar oportunidad' : 'Nueva oportunidad'}
      description={editing ? lead.code : 'Lo esencial ahora; el detalle se completa en la ficha.'}
      icon={<Target className="h-5 w-5" />}
      iconBgColor="brain-gradient-primary"
      iconColor="text-white"
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Empresa / cliente">
              <input value={form.company} onChange={set('company')} className={inputClass} placeholder="Ej. HDI Seguros" autoFocus={!editing} />
            </Field>
            <Field label="Persona de contacto">
              <input value={form.contactName} onChange={set('contactName')} className={inputClass} placeholder="Nombre y apellido" />
            </Field>
            <Field label="Origen">
              <Select value={form.origin} onChange={set('origin')} className={inputClass}>
                {CRM_ORIGINS.map(origin => <option key={origin.value} value={origin.value}>{origin.label}</option>)}
              </Select>
            </Field>
            <Field label="Detalle del origen" hint="Quién refirió, qué convocatoria, qué publicación…">
              <input value={form.originDetail} onChange={set('originDetail')} className={inputClass} placeholder="Opcional" />
            </Field>
            <Field label="Prioridad">
              <Select value={form.priority} onChange={set('priority')} className={inputClass}>
                {CRM_PRIORITIES.map(priority => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
              </Select>
            </Field>
            <Field label="Responsable">
              <Select value={form.ownerId} onChange={set('ownerId')} className={inputClass}>
                <option value="">Sin asignar</option>
                {team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
              </Select>
            </Field>
            <Field label="Servicio de interés" className="sm:col-span-2">
              <input value={form.serviceInterest} onChange={set('serviceInterest')} className={inputClass} placeholder="Ej. Marketing digital y administración de pauta" />
            </Field>
            <Field label="Correo">
              <input type="email" value={form.email} onChange={set('email')} className={inputClass} placeholder="nombre@empresa.com" />
            </Field>
            <Field label="Teléfono / WhatsApp">
              <input value={form.phone} onChange={set('phone')} className={inputClass} placeholder="+57 300 000 0000" />
            </Field>
            <Field label="Valor cotizado (COP)">
              <input inputMode="numeric" value={form.quotedValue} onChange={set('quotedValue')} className={inputClass} placeholder="0" />
            </Field>
            <Field label="Próximo seguimiento">
              <BrainDatePicker ariaLabel="Próximo seguimiento" value={form.nextFollowUpAt} onChange={value => setForm(current => ({ ...current, nextFollowUpAt: value }))} isClearable />
            </Field>
            <Field label="Próxima acción" className="sm:col-span-2">
              <input value={form.nextAction} onChange={set('nextAction')} className={inputClass} placeholder="Ej. Validar datos y hacer el primer contacto" />
            </Field>
          </div>

          <button type="button" onClick={() => setShowMore(value => !value)} className="text-xs font-semibold text-primary hover:underline">
            {showMore ? 'Ocultar detalle' : 'Más datos (cargo, LinkedIn, idioma, convocatoria, notas)'}
          </button>

          {showMore && (
            <div className="grid gap-4 border-t border-zinc-200 pt-5 dark:border-zinc-800 sm:grid-cols-2">
              <Field label="Cargo / rol">
                <input value={form.jobTitle} onChange={set('jobTitle')} className={inputClass} />
              </Field>
              <Field label="LinkedIn / URL">
                <input value={form.linkedinUrl} onChange={set('linkedinUrl')} className={inputClass} placeholder="https://" />
              </Field>
              <Field label="Idioma">
                <input value={form.language} onChange={set('language')} className={inputClass} />
              </Field>
              <Field label="Contacto permitido" hint="Por qué canal acepta que le escriban.">
                <input value={form.allowedContact} onChange={set('allowedContact')} className={inputClass} />
              </Field>
              <Field label="Publicación / emisión de la oportunidad">
                <BrainDatePicker ariaLabel="Publicación de la oportunidad" value={form.publishedAt} onChange={value => setForm(current => ({ ...current, publishedAt: value }))} isClearable />
              </Field>
              <Field label="Cierre de convocatoria">
                <BrainDatePicker ariaLabel="Cierre de convocatoria" value={form.callDeadlineAt} onChange={value => setForm(current => ({ ...current, callDeadlineAt: value }))} isClearable />
              </Field>
              <Field label="Observaciones" className="sm:col-span-2">
                <textarea rows={4} value={form.notes} onChange={set('notes')} className={cn(inputClass, 'resize-y')} placeholder="Contexto que no cabe en la bitácora." />
              </Field>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button type="submit" disabled={saving} className="min-w-32">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </div>
      </form>
    </SlideOver>
  );
};

export default CrmLeadForm;
