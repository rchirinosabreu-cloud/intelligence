import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import Select from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ArrowLeft, Pencil, Archive, Mail, Smartphone, Link2, ExternalLink, AlertCircle, ChevronDown, CalendarClock, Loader2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { useCrmLead, useCrmTeam, useChangeStage, useSetTrafficLight, useArchiveLead, useUpdateLead } from './crmApi';
import CrmLeadForm from './CrmLeadForm';
import CrmActivityForm from './CrmActivityForm';
import CrmActivityTimeline from './CrmActivityTimeline';
import {
  CRM_STAGES, CRM_TRAFFIC_LIGHTS, TrafficLightBadge, TrafficLightDot, PriorityBadge, OriginBadge, FollowUpLabel,
  formatDate, formatDateTime, formatCurrency, originLabel, trafficLightLabel, leadTitle, leadSubtitle, inputClass, labelClass
} from './crmPresentation';

const Panel = ({ title, children, className, action }) => (
  <section className={cn('rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950', className)}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

const Row = ({ label, children, icon: Icon }) => (
  <div className="flex items-start justify-between gap-4 py-2 text-sm">
    <dt className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</dt>
    <dd className="min-w-0 text-right text-zinc-800 dark:text-zinc-100">{children ?? '—'}</dd>
  </div>
);

const ExternalText = ({ href, children }) => href
  ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-primary hover:underline">{children} <ExternalLink className="h-3 w-3 shrink-0" /></a>
  : <span className="text-zinc-400">—</span>;

const StageControl = ({ lead, onChange, pending }) => (
  <div className="relative">
    <Select
      aria-label="Etapa comercial"
      value={lead.stage}
      onChange={event => onChange(event.target.value)}
      disabled={pending}
      className="rounded-xl border border-zinc-200 bg-white py-2 pl-3 pr-8 text-sm font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
    >
      {CRM_STAGES.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
    </Select>
  </div>
);

const CrmLeadDetail = () => {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirmDialog();
  const { data: lead, isLoading, error } = useCrmLead(leadId);
  const { data: team = [] } = useCrmTeam();
  const changeStage = useChangeStage();
  const setLight = useSetTrafficLight();
  const archive = useArchiveLead();
  const update = useUpdateLead();
  const [editing, setEditing] = useState(false);
  const [losing, setLosing] = useState(null);       // { stage, lostReason }
  const [manualLight, setManualLight] = useState(null); // { value, reason }
  const [nextStep, setNextStep] = useState(null);   // { nextAction, nextFollowUpAt }

  const applyStage = async stage => {
    if (!lead || stage === lead.stage) return;
    if (stage === 'PERDIDO') { setLosing({ stage, lostReason: '' }); return; }
    try {
      await changeStage.mutateAsync({ id: lead.id, stage });
      toast.success('Etapa actualizada');
    } catch (mutationError) {
      toast.error(mutationError.message);
    }
  };

  const confirmLost = async () => {
    try {
      await changeStage.mutateAsync({ id: lead.id, stage: losing.stage, lostReason: losing.lostReason });
      toast.success('Oportunidad cerrada como perdida');
      setLosing(null);
    } catch (mutationError) {
      toast.error(mutationError.message);
    }
  };

  const applyLight = async (value, reason) => {
    try {
      await setLight.mutateAsync({ id: lead.id, value, reason });
      toast.success(value ? 'Semáforo fijado a mano' : 'Semáforo automático');
      setManualLight(null);
    } catch (mutationError) {
      toast.error(mutationError.message);
    }
  };

  const saveNextStep = async () => {
    try {
      await update.mutateAsync({ id: lead.id, nextAction: nextStep.nextAction, nextFollowUpAt: nextStep.nextFollowUpAt });
      toast.success('Siguiente paso actualizado');
      setNextStep(null);
    } catch (mutationError) {
      toast.error(mutationError.message);
    }
  };

  const archiveLead = async () => {
    const accepted = await confirm({
      title: 'Archivar oportunidad',
      description: 'Sale de las listas y de las métricas, pero su historial se conserva. No se elimina nada.',
      confirmLabel: 'Archivar',
      tone: 'neutral'
    });
    if (!accepted) return;
    try {
      await archive.mutateAsync({ id: lead.id });
      toast.success('Oportunidad archivada');
      navigate('/crm?tab=oportunidades');
    } catch (mutationError) {
      toast.error(mutationError.message);
    }
  };

  if (isLoading) {
    return <div className="space-y-4 pt-8"><div className="h-10 w-2/3 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-900" /><div className="h-64 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-900" /></div>;
  }
  if (error || !lead) {
    return (
      <div className="space-y-4 pt-8">
        <Link to="/crm?tab=oportunidades" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-primary"><ArrowLeft className="h-4 w-4" /> Volver al CRM</Link>
        <div className="brain-alert-surface rounded-2xl p-4 text-sm"><div className="flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> {error?.message || 'Oportunidad no encontrada.'}</div></div>
      </div>
    );
  }

  const pending = changeStage.isPending || setLight.isPending;

  return (
    <div className="space-y-6" data-crm-lead={lead.id}>
      <PageHeader
        title={leadTitle(lead)}
        subtitle={leadSubtitle(lead) || lead.serviceInterest || 'Oportunidad comercial'}
        breadcrumbs={[{ label: 'CRM', href: '/crm' }, { label: 'Oportunidades', href: '/crm?tab=oportunidades' }, { label: lead.code }]}
        className="pt-4"
        layout="stacked"
      >
        <div className="flex flex-wrap items-center gap-2">
        <StageControl lead={lead} onChange={applyStage} pending={pending} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-zinc-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-950" aria-label="Cambiar semáforo">
              <TrafficLightBadge light={lead.trafficLight} className="border-0 bg-transparent px-1" />
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs font-normal text-zinc-500">{lead.trafficLight.reason}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => applyLight(null)} disabled={lead.trafficLight.mode === 'AUTO'}>Automático (según reglas)</DropdownMenuItem>
            {CRM_TRAFFIC_LIGHTS.map(light => (
              <DropdownMenuItem key={light.value} onSelect={() => setManualLight({ value: light.value, reason: '' })} className="gap-2">
                <TrafficLightDot value={light.value} /> Fijar en {light.label.toLowerCase()}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" onClick={() => setEditing(true)} className="gap-2"><Pencil className="h-4 w-4" /> Editar</Button>
        <Button variant="ghost" onClick={archiveLead} className="gap-2 text-zinc-500"><Archive className="h-4 w-4" /> Archivar</Button>
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200">{lead.code}</span>
        {lead.legacyCode && <span className="font-mono">({lead.legacyCode})</span>}
        <OriginBadge origin={lead.origin} />
        <PriorityBadge priority={lead.priority} />
        <span>Ingresó {formatDate(lead.enteredAt)}{lead.enteredAtEstimated ? ' (estimado)' : ''}</span>
        {lead.owner && <span className="inline-flex items-center gap-1.5"><TeamAvatar member={lead.owner} className="h-5 w-5" size={20} /> {lead.owner.name}</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel title="Siguiente paso" className="border-brand-cyan/30 bg-brand-cyan/[0.04] dark:bg-brand-cyan/[0.06]" action={
            !nextStep && <button type="button" onClick={() => setNextStep({ nextAction: lead.nextAction || '', nextFollowUpAt: lead.nextFollowUpAt || '' })} className="text-xs font-semibold text-primary hover:underline">Editar</button>
          }>
            {nextStep ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div>
                  <label className={labelClass} htmlFor="crm-next-action">Próxima acción</label>
                  <input id="crm-next-action" value={nextStep.nextAction} onChange={event => setNextStep({ ...nextStep, nextAction: event.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="crm-next-date">Fecha</label>
                  <input id="crm-next-date" type="date" value={nextStep.nextFollowUpAt} onChange={event => setNextStep({ ...nextStep, nextFollowUpAt: event.target.value })} className={inputClass} />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => setNextStep(null)}>Cancelar</Button>
                  <Button type="button" onClick={saveNextStep} disabled={update.isPending}>{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <p className={cn('text-base font-medium', lead.nextAction ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400')}>{lead.nextAction || 'Sin próxima acción. Defínela para que no se pierda.'}</p>
                <div className="flex items-center gap-2 text-sm"><CalendarClock className="h-4 w-4 text-zinc-400" /><FollowUpLabel lead={lead} /></div>
              </div>
            )}
          </Panel>

          <Panel title="Registrar gestión">
            <CrmActivityForm leadId={lead.id} />
          </Panel>

          <Panel title={`Bitácora · ${lead.activityCount} ${lead.activityCount === 1 ? 'registro' : 'registros'}`}>
            <CrmActivityTimeline activities={lead.activities} />
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Contacto">
            <dl className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              <Row label="Persona">{lead.contactName}</Row>
              <Row label="Cargo">{lead.jobTitle}</Row>
              <Row label="Correo" icon={Mail}><ExternalText href={lead.email ? `mailto:${lead.email}` : null}>{lead.email}</ExternalText></Row>
              <Row label="Teléfono" icon={Smartphone}><ExternalText href={lead.phone ? `tel:${lead.phone.replace(/\s+/g, '')}` : null}>{lead.phone}</ExternalText></Row>
              <Row label="LinkedIn" icon={Link2}><ExternalText href={lead.linkedinUrl}>{lead.linkedinUrl ? 'Abrir perfil' : null}</ExternalText></Row>
              <Row label="Idioma">{lead.language}</Row>
              <Row label="Contacto permitido">{lead.allowedContact}</Row>
            </dl>
          </Panel>

          <Panel title="Oportunidad">
            <dl className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              <Row label="Origen">{originLabel(lead.origin)}{lead.originDetail ? ` · ${lead.originDetail}` : ''}</Row>
              <Row label="Servicio">{lead.serviceInterest}</Row>
              <Row label="Valor cotizado"><span className="font-semibold">{formatCurrency(lead.quotedValue, lead.currency)}</span></Row>
              <Row label="Publicación">{lead.publishedAt ? formatDate(lead.publishedAt) : null}</Row>
              <Row label="Cierre convocatoria">{lead.callDeadlineAt ? formatDate(lead.callDeadlineAt) : null}</Row>
              <Row label="Primer contacto">{lead.firstContactAt ? formatDate(lead.firstContactAt) : null}</Row>
              <Row label="Propuesta enviada">{lead.proposalSentAt ? formatDate(lead.proposalSentAt) : null}</Row>
              <Row label="Última gestión">{lead.lastActivityAt ? formatDateTime(lead.lastActivityAt) : null}</Row>
              <Row label="Cierre">{lead.closedAt ? formatDate(lead.closedAt) : null}</Row>
              {lead.lostReason && <Row label="Motivo de pérdida">{lead.lostReason}</Row>}
              <Row label="Cotización">{lead.quotationId ? <Link to={`/cotizaciones/editar/${lead.quotationId}`} className="text-primary hover:underline">Ver cotización</Link> : null}</Row>
            </dl>
          </Panel>

          {lead.notes && (
            <Panel title="Observaciones">
              <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-200">{lead.notes}</p>
            </Panel>
          )}
        </div>
      </div>

      <CrmLeadForm open={editing} onOpenChange={setEditing} lead={lead} team={team} onSaved={() => setEditing(false)} />

      <Dialog open={Boolean(losing)} onOpenChange={open => { if (!open) setLosing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar como perdida</DialogTitle>
            <DialogDescription>El motivo queda en la bitácora y sirve para medir por qué se pierden oportunidades.</DialogDescription>
          </DialogHeader>
          <div>
            <label className={labelClass} htmlFor="crm-lost-reason">Motivo de pérdida</label>
            <textarea id="crm-lost-reason" rows={3} autoFocus value={losing?.lostReason || ''} onChange={event => setLosing({ ...losing, lostReason: event.target.value })} className={cn(inputClass, 'resize-y')} placeholder="Ej. Eligieron otra agencia por precio." />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setLosing(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmLost} disabled={!losing?.lostReason?.trim() || changeStage.isPending}>Cerrar como perdida</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(manualLight)} onOpenChange={open => { if (!open) setManualLight(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TrafficLightDot value={manualLight?.value} /> Fijar semáforo en {trafficLightLabel(manualLight?.value).toLowerCase()}</DialogTitle>
            <DialogDescription>Se mantiene hasta que lo devuelvas a automático. Explica por qué para que el equipo lo entienda.</DialogDescription>
          </DialogHeader>
          <div>
            <label className={labelClass} htmlFor="crm-light-reason">Motivo</label>
            <input id="crm-light-reason" autoFocus value={manualLight?.reason || ''} onChange={event => setManualLight({ ...manualLight, reason: event.target.value })} className={inputClass} placeholder="Ej. Confirmó por teléfono que firma la próxima semana." />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setManualLight(null)}>Cancelar</Button>
            <Button onClick={() => applyLight(manualLight.value, manualLight.reason)} disabled={!manualLight?.reason?.trim() || setLight.isPending}>Fijar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CrmLeadDetail;
