import React, { useLayoutEffect } from 'react';
import { CalendarDays, CheckCircle2, CheckSquare, Edit, ExternalLink, FileBarChart, Instagram, LayoutGrid, Plus, Video } from '@/components/ui/icons';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import ClientAvatar from '@/components/ui/ClientAvatar';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import {
  CLIENT_AGENCIES, CLIENT_COMPLEXITY, CONTRACT_STATUSES, OPERATION_STAGES, SERVICE_TYPES, STORY_FREQUENCIES,
  contractQuota, isMeasured, labelOf, shortDate,
} from '@/lib/clientOperations';
import { LEVEL_META, PIECE_STATUS, STAGE_TONE } from './operationTones';
import CycleBar from './CycleBar';
import ClientObservations from './ClientObservations';

// Página completa de un cliente en «Operación» (borrador del 2 de octubre de 2026). Todo lo que la fila
// del Excel tenía de ese cliente, más lo que se trabaja desde aquí: marcar lo publicado por fuera,
// entregar el informe del mes y abrir tareas.

const CARD = 'min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900';
const CARD_TITLE = 'text-sm font-semibold text-zinc-900 dark:text-zinc-50';
const LABEL = 'text-xs text-zinc-500 dark:text-zinc-400';
const TEXT_ACTION = 'inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan';

function Field({ label, children }) {
  return <div className="min-w-0"><p className={LABEL}>{label}</p><div className="mt-0.5 text-sm font-medium text-zinc-800 dark:text-zinc-100">{children || <span className="font-normal text-zinc-400">Sin definir</span>}</div></div>;
}

function Person({ role, member }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {member ? <TeamAvatar member={member} size={28} /> : <span className="h-7 w-7 shrink-0 rounded-full border border-dashed border-zinc-300 dark:border-white/15" />}
      <div className="min-w-0"><p className={LABEL}>{role}</p><p className="truncate text-sm font-medium">{member?.name || 'Sin asignar'}</p></div>
    </div>
  );
}

function Attention({ evaluation }) {
  const meta = LEVEL_META[evaluation.level];
  return (
    <section className={cn('rounded-2xl border p-5', meta.soft)} aria-label="Qué pide atención">
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <span className={cn('h-2.5 w-2.5 rounded-full', meta.dot)} />{meta.label}
      </p>
      {evaluation.reasons.length > 0 && evaluation.level !== 'green' ? (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {evaluation.reasons.map((reason) => (
            <li key={reason.text} className="flex items-start gap-2.5 rounded-xl bg-white/80 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', LEVEL_META[reason.level].dot)} />{reason.text}
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">Va al ritmo de lo contratado. No hay nada pendiente.</p>}
    </section>
  );
}

function CurrentCycle({ cycle, today, onMarkPublished, onOpenPlan }) {
  return (
    <section className={CARD} aria-label={`Parrilla de ${cycle.label}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{cycle.label}{cycle.start && !cycle.start.endsWith('-01') && <span className="ml-1.5 text-sm font-normal text-zinc-500">del {shortDate(cycle.start)} al {shortDate(cycle.end)}</span>}</h2>
          <p className={LABEL}>Día {cycle.day} de {cycle.length} · {cycle.reached.publicada} de {cycle.quota} publicadas</p>
        </div>
        {cycle.created > 0 && <button type="button" onClick={onOpenPlan} className={cn(TEXT_ACTION, '-mr-2 -mt-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5')}>Abrir parrilla <ExternalLink className="h-4 w-4" /></button>}
      </div>
      <CycleBar cycle={cycle} className="mt-4 h-2.5" />
      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {OPERATION_STAGES.map((stage) => {
          const done = cycle.reached[stage.key] || 0;
          return (
            <li key={stage.key} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3" title={stage.hint}>
              <span className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300"><span className={cn('h-2 w-2 shrink-0 rounded-full', STAGE_TONE[stage.key])} />{stage.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5"><span className={cn('block h-full rounded-full', STAGE_TONE[stage.key])} style={{ width: `${Math.min(100, (done / (cycle.quota || 1)) * 100)}%` }} /></span>
              <span className="text-right text-xs font-semibold tabular-nums">{done}/{cycle.quota}</span>
            </li>
          );
        })}
      </ul>

      {cycle.pieces?.length ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-100 dark:border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-white/[0.03]">
              <tr><th className="px-3 py-2 font-medium">Fecha</th><th className="px-3 py-2 font-medium">Pieza</th><th className="px-3 py-2 font-medium">Estado</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
              {cycle.pieces.map((piece) => {
                const late = piece.date < today && piece.status !== 'PUBLICADO';
                const status = PIECE_STATUS[piece.status];
                return (
                  <tr key={piece.id} className={cn(late && 'bg-destructive/[0.04]')}>
                    <td className={cn('whitespace-nowrap px-3 py-2.5 tabular-nums', late ? 'font-semibold text-destructive' : 'text-zinc-600 dark:text-zinc-300')}>{shortDate(piece.date)}</td>
                    <td className="px-3 py-2.5"><span className="text-zinc-500">{piece.format} · </span><span className="text-zinc-800 dark:text-zinc-100">{piece.title}</span></td>
                    <td className="px-3 py-2.5"><span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-semibold', status.chip)}>{status.label}</span></td>
                    <td className="px-3 py-1 text-right">
                      {late && <button type="button" onClick={() => onMarkPublished(piece)} className={cn(TEXT_ACTION, 'min-h-9 text-xs')}><CheckCircle2 className="h-4 w-4" />Ya se publicó</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-white/15">{cycle.label} todavía no tiene parrilla.</p>
      )}
    </section>
  );
}

function History({ months, monthlyReport, onMarkReport }) {
  return (
    <section className={CARD} aria-label="Meses anteriores">
      <h2 className={cn(CARD_TITLE, 'mb-3')}>Meses anteriores</h2>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-zinc-500"><tr><th className="py-2 font-medium">Mes</th><th className="py-2 font-medium">Publicadas</th>{monthlyReport && <th className="py-2 font-medium">Informe</th>}</tr></thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
          {months.map((month) => {
            const closed = month.reached.publicada >= month.quota;
            return (
              <tr key={month.label}>
                <td className="py-2.5 font-medium">{month.label}</td>
                <td className="py-2.5">
                  <span className={cn('inline-flex items-center gap-1.5 tabular-nums', !closed && 'font-semibold text-destructive')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', closed ? LEVEL_META.green.dot : LEVEL_META.red.dot)} />{month.reached.publicada} de {month.quota}
                  </span>
                </td>
                {monthlyReport && (
                  <td className="py-1">
                    {month.report?.deliveredAt
                      ? <span className="text-zinc-600 dark:text-zinc-300">Entregado el {shortDate(month.report.deliveredAt)}{month.report.by && <span className="text-zinc-400"> · {month.report.by}</span>}</span>
                      : <button type="button" onClick={() => onMarkReport(month)} className={cn(TEXT_ACTION, '-ml-3 min-h-9')}><FileBarChart className="h-4 w-4" />Marcar entregado</button>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Profile({ client, canManage, onEdit }) {
  const { contract } = client;
  const quota = contractQuota(contract);
  return (
    <section className={CARD} aria-label="Ficha operativa">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className={CARD_TITLE}>Ficha operativa</h2>
        {canManage && <button type="button" onClick={onEdit} className={cn(TEXT_ACTION, '-mr-2 -mt-2')}><Edit className="h-4 w-4" />Editar</button>}
      </div>
      {client.description && <p className="mb-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{client.description}</p>}
      {client.instagramUrl && (
        <a href={client.instagramUrl} target="_blank" rel="noreferrer" className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-brand-cyan-deep hover:underline dark:text-brand-cyan">
          <Instagram className="h-4 w-4" />{client.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
        </a>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Agencia">{labelOf(CLIENT_AGENCIES, client.agency)}</Field>
        <Field label="Complejidad">{labelOf(CLIENT_COMPLEXITY, client.complexity)}</Field>
        <Field label="Tipo">{labelOf(SERVICE_TYPES, contract?.serviceType)}</Field>
        <Field label="Estado">{labelOf(CONTRACT_STATUSES, contract?.status)}</Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 dark:border-white/5">
        <Person role="Project manager" member={client.projectManager} />
        <Person role="Community manager" member={client.communityManager} />
      </div>

      <h3 className={cn(CARD_TITLE, 'mt-6 border-t border-zinc-100 pt-4 dark:border-white/5')}>Contrato</h3>
      {contract ? (
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vigencia">{shortDate(contract.startDate)} – {contract.endDate ? shortDate(contract.endDate) : 'sin cierre'}</Field>
            <Field label="Ciclo">{contract.cutDay > 1 ? `Del ${contract.cutDay} al ${contract.cutDay - 1}` : 'Mes calendario'}</Field>
          </div>
          {quota > 0 && (
            <div>
              <p className={LABEL}>Piezas al mes</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {contract.deliverables.map((row) => <span key={row.format} className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium dark:border-white/10">{row.quantity} {row.format}</span>)}
                <span className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold dark:bg-white/10">{quota} en total</span>
              </div>
            </div>
          )}
          <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            {contract.storiesPerWeek > 0 && <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-zinc-400" />Historias: {labelOf(STORY_FREQUENCIES, contract.storiesPerWeek).toLowerCase()}</li>}
            {contract.productionDays > 0 && <li className="flex items-center gap-2"><Video className="h-4 w-4 text-zinc-400" />{contract.productionDays === 1 ? '1 jornada de producción al mes' : `${contract.productionDays} jornadas de producción al mes`}</li>}
            {contract.monthlyReport && <li className="flex items-center gap-2"><FileBarChart className="h-4 w-4 text-zinc-400" />Informe mensual</li>}
          </ul>
          {contract.notes && <p className="rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-300">{contract.notes}</p>}
        </div>
      ) : <p className="mt-3 rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-white/15">Sin contrato no hay contra qué medir. {canManage && 'Cárgalo con «Editar».'}</p>}
    </section>
  );
}

function Tasks({ tasks, onNewTask }) {
  return (
    <section className={CARD} aria-label="Tareas abiertas">
      <div className="flex items-center justify-between gap-3">
        <h2 className={CARD_TITLE}>Tareas abiertas <span className="font-normal text-zinc-400">({tasks.length})</span></h2>
        <button type="button" onClick={onNewTask} className={cn(TEXT_ACTION, '-mr-2')}><Plus className="h-4 w-4" />Nueva tarea</button>
      </div>
      {tasks.length ? (
        <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/5">
          {tasks.map((task) => (
            <li key={task.id} className="flex min-w-0 items-center gap-3 py-2.5">
              <TeamAvatar member={task.assignee} size={24} />
              <p className="min-w-0 flex-1 text-sm text-zinc-800 dark:text-zinc-100">{task.title}</p>
              <span className={cn('shrink-0 text-xs tabular-nums', task.overdue ? 'font-semibold text-destructive' : 'text-zinc-500')}>{task.overdue ? `Venció ${shortDate(task.dueDate)}` : shortDate(task.dueDate)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 flex items-center gap-2 py-2 text-sm text-zinc-500"><CheckSquare className="h-4 w-4" />Nada pendiente en Gestión.</p>}
    </section>
  );
}

export default function ClientOperationPage({
  client, evaluation, today, canManage, currentUserId, isAdmin,
  onEditProfile, onMarkPublished, onMarkReport, onOpenPlan, onNewTask, onOpenWorkspace, onAddObservation, onDeleteObservation,
}) {
  const measured = isMeasured(client);
  const { current } = client.cycles || {};
  const history = client.history || [];
  // Entrar a un cliente es entrar a una página: arriba del todo, no donde iba la lista.
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [client.id]);
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-20 animate-in fade-in duration-200">
      <PageHeader
        breadcrumbs={[{ label: 'Clientes', href: '/clientes' }, { label: 'Operación', href: '/clientes?tab=operacion' }, { label: client.name }]}
        title={<span className="flex items-center gap-4"><ClientAvatar client={client} size={48} className="rounded-xl border border-zinc-200 dark:border-white/10" /><span>{client.name}</span></span>}
        subtitle={[labelOf(CLIENT_AGENCIES, client.agency), labelOf(SERVICE_TYPES, client.contract?.serviceType), client.complexity && `complejidad ${labelOf(CLIENT_COMPLEXITY, client.complexity).toLowerCase()}`].filter(Boolean).join(' · ')}>
        <Button variant="outline" className="min-h-11 rounded-xl" onClick={onOpenWorkspace}><LayoutGrid className="mr-2 h-4 w-4" />Espacio del cliente</Button>
        <Button className="min-h-11 rounded-xl" onClick={onNewTask}><Plus className="mr-2 h-4 w-4" />Nueva tarea</Button>
      </PageHeader>

      <Attention evaluation={evaluation} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <ClientObservations observations={client.observations || []} currentUserId={currentUserId} isAdmin={isAdmin}
            onAdd={onAddObservation} onDelete={onDeleteObservation} />
          {measured && current && <CurrentCycle cycle={current} today={today} onMarkPublished={onMarkPublished} onOpenPlan={onOpenPlan} />}
          {!measured && <Tasks tasks={client.openTasks || []} onNewTask={onNewTask} />}
          {measured && history.length > 0 && <History months={history} monthlyReport={client.contract.monthlyReport} onMarkReport={onMarkReport} />}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Profile client={client} canManage={canManage} onEdit={onEditProfile} />
          {measured && <Tasks tasks={client.openTasks || []} onNewTask={onNewTask} />}
        </div>
      </div>
    </div>
  );
}
