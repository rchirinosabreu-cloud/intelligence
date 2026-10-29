import React, { useLayoutEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, CheckSquare, Edit, ExternalLink, FileBarChart, Instagram, LayoutGrid, Plus, RotateCcw, Video } from '@/components/ui/icons';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import ClientAvatar from '@/components/ui/ClientAvatar';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import {
  CLIENT_AGENCIES, CLIENT_COMPLEXITY, CONTRACT_STATUSES, OPERATION_STAGES, SERVICE_TYPES, STORY_FREQUENCIES,
  canMarkPublished, contractQuota, isMeasured, labelOf, shortDate,
} from '@/lib/clientOperations';
import { LEVEL_META, PIECE_STATUS, STAGE_TONE } from './operationTones';
import CycleBar from './CycleBar';
import ClientObservations from './ClientObservations';
import { CloseDialog, ReportDialog, WorkAuthorizationDialog } from './MonthlyCloseDialogs';
import { unbackedWork } from '@/lib/unbackedWork';
import { canConfirmClose, closeOpensOn, closeSummaryText, reportStatusLabel } from '@/lib/monthlyClose';

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

// El informe del mes y su estado (29 de octubre de 2026): solo «Enviado» cuenta como entregado.
function ReportStatus({ report }) {
  const status = report?.status || 'PENDIENTE';
  const sent = status === 'ENVIADO';
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5" data-report-status={status}>
      <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', sent ? 'bg-status-positive/10 text-status-positive-fg' : 'bg-zinc-100 text-zinc-700 dark:bg-white/5 dark:text-zinc-200')}>{reportStatusLabel(status)}</span>
      {sent && report?.deliveredAt && <span className="text-xs text-zinc-500">el {shortDate(report.deliveredAt)}{report.by ? ` · ${report.by}` : ''}</span>}
      {!sent && report?.updatedAt && <span className="text-xs text-zinc-500">desde el {shortDate(report.updatedAt)}</span>}
      {report?.link && <a href={report.link} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-cyan-deep hover:underline dark:text-brand-cyan">Ver informe</a>}
    </span>
  );
}

// El cierre del mes, confirmado o por confirmar (29 de octubre de 2026).
function CloseStatus({ cycle, today, onClose, onReopen, compact = false }) {
  if (cycle.close) {
    const summary = closeSummaryText(cycle.close.snapshot);
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1 text-xs text-zinc-600 dark:text-zinc-300" data-close-status="confirmed" title={compact ? summary : undefined}>
        <span>
          Cerrado el {shortDate(cycle.close.closedAt)}{cycle.close.by ? ` · ${cycle.close.by}` : ''}{compact ? '' : `. ${summary}`}
          {!compact && cycle.close.note && <span className="text-zinc-500"> {cycle.close.note}</span>}
        </span>
        {/* Todo es editable (Rodny, 29 de octubre de 2026): un cierre confirmado por error se reabre. */}
        {onReopen && <button type="button" onClick={() => onReopen(cycle)} data-close-reopen className="min-h-9 rounded-md px-1 font-medium text-brand-cyan-deep hover:underline dark:text-brand-cyan">Reabrir</button>}
      </span>
    );
  }
  if (canConfirmClose(cycle, today)) {
    return <button type="button" onClick={() => onClose(cycle)} data-close-open className={cn(TEXT_ACTION, '-ml-3 min-h-9')}><CheckCircle2 className="h-4 w-4" />Confirmar cierre</button>;
  }
  return <span className="text-xs text-zinc-500" data-close-status="later">Se confirma desde el {shortDate(closeOpensOn(cycle))}</span>;
}

function CurrentCycle({ cycle, today, monthlyReport, onReport, onClose, onReopen, externalPlanUrl, onMarkPublished, onUndoPublished, onOpenPlan }) {
  // Sin parrilla aquí, el mes sale de la hoja de MIO: sus piezas se leen, no se marcan desde la plataforma.
  const fromSheet = cycle.source?.kind === 'HOJA_MIO';
  return (
    <section className={CARD} aria-label={`Parrilla de ${cycle.label}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{cycle.label}{cycle.start && !cycle.start.endsWith('-01') && <span className="ml-1.5 text-sm font-normal text-zinc-500">del {shortDate(cycle.start)} al {shortDate(cycle.end)}</span>}</h2>
          <p className={LABEL}>Día {cycle.day} de {cycle.length} · {cycle.reached.publicada} de {cycle.quota} publicadas</p>
          {fromSheet && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400" data-cycle-source="HOJA_MIO">
              Leído de la hoja de MIO{cycle.source.tab ? `, pestaña ${cycle.source.tab}` : ''}{cycle.source.readAt ? ` · ${shortDate(cycle.source.readAt)}` : ''}
              {cycle.source.problem && <span className="text-zinc-600 dark:text-zinc-300"> · {cycle.source.problem}</span>}
            </p>
          )}
        </div>
        {fromSheet && externalPlanUrl
          ? <a href={externalPlanUrl} target="_blank" rel="noreferrer" className={cn(TEXT_ACTION, '-mr-2 -mt-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5')}>Abrir la hoja <ExternalLink className="h-4 w-4" /></a>
          : cycle.created > 0 && <button type="button" onClick={onOpenPlan} className={cn(TEXT_ACTION, '-mr-2 -mt-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5')}>Abrir parrilla <ExternalLink className="h-4 w-4" /></button>}
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
                const canMark = canMarkPublished(piece, today);
                const status = PIECE_STATUS[piece.status];
                return (
                  <tr key={piece.id} className={cn(late && 'bg-destructive/[0.04]')}>
                    <td className={cn('whitespace-nowrap px-3 py-2.5 tabular-nums', late ? 'font-semibold text-destructive' : 'text-zinc-600 dark:text-zinc-300')}>{shortDate(piece.date)}</td>
                    <td className="px-3 py-2.5"><span className="text-zinc-500">{piece.format} · </span><span className="text-zinc-800 dark:text-zinc-100">{piece.title}</span></td>
                    <td className="px-3 py-2.5"><span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-semibold', status.chip)}>{status.label}</span></td>
                    <td className="px-3 py-1 text-right">
                      {canMark && <button type="button" onClick={() => onMarkPublished(piece)} className={cn(TEXT_ACTION, 'min-h-9 text-xs')}><CheckCircle2 className="h-4 w-4" />Ya se publicó</button>}
                      {/* Lo marcado a mano se puede deshacer: vuelve al estado que tenía antes del clic. */}
                      {piece.markedByHand && onUndoPublished && (
                        <button type="button" onClick={() => onUndoPublished(piece)} title="Marcada a mano como publicada: vuelve al estado que tenía"
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5">
                          <RotateCcw className="h-4 w-4" />Deshacer
                        </button>
                      )}
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

      <div className="mt-5 grid gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-2 dark:border-white/5" data-cycle-close>
        {monthlyReport && (
          <div className="min-w-0">
            <p className={LABEL}>Informe del mes</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ReportStatus report={cycle.report} />
              <button type="button" onClick={() => onReport(cycle)} data-report-open className={cn(TEXT_ACTION, 'min-h-9 px-2 text-xs')}>Actualizar</button>
            </div>
          </div>
        )}
        <div className="min-w-0">
          <p className={LABEL}>Cierre del mes</p>
          <div className="mt-1"><CloseStatus cycle={cycle} today={today} onClose={onClose} onReopen={onReopen} /></div>
        </div>
      </div>
    </section>
  );
}

function History({ months, monthlyReport, today, onReport, onClose, onReopen }) {
  return (
    <section className={CARD} aria-label="Meses anteriores">
      <h2 className={cn(CARD_TITLE, 'mb-3')}>Meses anteriores</h2>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-zinc-500"><tr><th className="py-2 font-medium">Mes</th><th className="py-2 font-medium">Publicadas</th>{monthlyReport && <th className="py-2 font-medium">Informe</th>}<th className="py-2 font-medium">Cierre</th></tr></thead>
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
                  <td className="py-1" data-history-report={month.label}>
                    <div className="flex flex-wrap items-center gap-1">
                      <ReportStatus report={month.report} />
                      <button type="button" onClick={() => onReport(month)} aria-label={`Actualizar el informe de ${month.label.toLowerCase()}`}
                        className={cn(TEXT_ACTION, 'min-h-9 px-2 text-xs')}><FileBarChart className="h-4 w-4" />Actualizar</button>
                    </div>
                  </td>
                )}
                <td className="py-1" data-history-close={month.label}><CloseStatus cycle={month} today={today} onClose={onClose} onReopen={onReopen} compact /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// Trabajo en curso sin propuesta aprobada (29 de octubre de 2026): qué pasa y, para Dirección o Administración, la
// autorización para seguir. La salida normal es renovar el contrato con «Editar».
function UnbackedWork({ client, today, onAuthorize }) {
  const finding = unbackedWork({ contract: client.contract, work: client.work, authorization: client.workAuthorization }, today);
  if (!finding) return null;
  return (
    <div data-unbacked-work={finding.authorized ? 'authorized' : 'open'}
      className={cn('mb-4 rounded-xl border p-3 text-sm', finding.authorized
        ? 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300'
        : 'border-brand-yellow/40 bg-brand-yellow/10 text-zinc-800 dark:text-zinc-100')}>
      <p className="font-semibold">{finding.authorized ? 'Trabajo autorizado sin propuesta' : 'Trabajo sin propuesta aprobada'}</p>
      <p className="mt-1">{finding.text}</p>
      {!finding.authorized && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Renueva el contrato con «Editar» o aprueba una cotización nueva.</p>}
      {client.canAuthorizeWork && onAuthorize && (
        <button type="button" onClick={onAuthorize} data-work-authorization-open className={cn(TEXT_ACTION, '-ml-3 mt-1 min-h-9')}>
          {finding.authorized ? 'Cambiar la autorización' : 'Autorizar seguir'}
        </button>
      )}
    </div>
  );
}

// La parrilla de MIO en su hoja de Google (29 de octubre de 2026): lo leído del mes en curso y del siguiente, que es el
// que ya se está preparando. Solo lectura: lo que se cambia, se cambia en la hoja.
function ExternalPlan({ client, onRefresh }) {
  const [reading, setReading] = useState(false);
  if (!client.externalPlanUrl) return null;
  const refresh = async () => {
    setReading(true);
    try { await onRefresh(); } finally { setReading(false); }
  };
  return (
    <div className="mb-4 rounded-xl border border-zinc-200 p-3 text-sm dark:border-white/10" data-external-plan>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Parrilla de MIO</p>
        <div className="flex items-center gap-1">
          <a href={client.externalPlanUrl} target="_blank" rel="noreferrer" className={cn(TEXT_ACTION, 'min-h-9 px-2 text-xs')}>Abrir la hoja</a>
          {onRefresh && <button type="button" onClick={refresh} disabled={reading} data-external-plan-refresh className={cn(TEXT_ACTION, 'min-h-9 px-2 text-xs disabled:opacity-50')}>{reading ? 'Leyendo…' : 'Leer ahora'}</button>}
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {(client.externalPlan || []).map((month) => {
          const reached = month.summary?.reached || {};
          return (
            <li key={`${month.year}-${month.month}`} data-external-plan-month={month.label} className="text-xs text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold">{month.label}</span>
              {month.summary?.created
                ? `: ${month.summary.created} piezas · ${reached.disenada || 0} diseñadas · ${reached.aprobada || 0} aprobadas · ${reached.publicada || 0} publicadas`
                : month.readAt ? ': sin piezas en la hoja' : ': todavía no se ha leído'}
              {month.problem && <span className="block text-zinc-500 dark:text-zinc-400">{month.problem}</span>}
            </li>
          );
        })}
      </ul>
      {client.externalPlan?.[0]?.readAt && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Leída el {shortDate(client.externalPlan[0].readAt)}. Se vuelve a leer cada dos horas.</p>}
    </div>
  );
}

function Profile({ client, canManage, onEdit, today, onAuthorizeWork, onRefreshExternalPlan }) {
  const { contract } = client;
  const quota = contractQuota(contract);
  return (
    <section className={CARD} aria-label="Ficha operativa">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className={CARD_TITLE}>Ficha operativa</h2>
        {canManage && <button type="button" onClick={onEdit} className={cn(TEXT_ACTION, '-mr-2 -mt-2')}><Edit className="h-4 w-4" />Editar</button>}
      </div>
      <UnbackedWork client={client} today={today} onAuthorize={onAuthorizeWork} />
      <ExternalPlan client={client} onRefresh={onRefreshExternalPlan} />
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

function Tasks({ tasks, onNewTask, onOpenTask }) {
  return (
    <section className={CARD} aria-label="Tareas abiertas">
      <div className="flex items-center justify-between gap-3">
        <h2 className={CARD_TITLE}>Tareas abiertas <span className="font-normal text-zinc-400">({tasks.length})</span></h2>
        <button type="button" onClick={onNewTask} className={cn(TEXT_ACTION, '-mr-2')}><Plus className="h-4 w-4" />Nueva tarea</button>
      </div>
      {tasks.length ? (
        <ul className="mt-2 divide-y divide-zinc-100 dark:divide-white/5">
          {tasks.map((task) => (
            <li key={task.id}>
              {/* La tarea se abre en Gestión, en el mismo panel de siempre. */}
              <button type="button" onClick={() => onOpenTask?.(task)} title="Abrir en Gestión"
                className="flex min-h-11 w-full min-w-0 items-center gap-3 py-2.5 text-left hover:text-brand-cyan-deep dark:hover:text-brand-cyan">
                <TeamAvatar member={task.assignee} size={24} />
                <span className="min-w-0 flex-1 text-sm text-zinc-800 dark:text-zinc-100">{task.title}</span>
                <span className={cn('shrink-0 text-xs tabular-nums', task.overdue ? 'font-semibold text-destructive' : 'text-zinc-500')}>{task.overdue ? `Venció ${shortDate(task.dueDate)}` : shortDate(task.dueDate)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 flex items-center gap-2 py-2 text-sm text-zinc-500"><CheckSquare className="h-4 w-4" />Nada pendiente en Gestión.</p>}
    </section>
  );
}

export default function ClientOperationPage({
  client, evaluation, today, canManage, currentUserId, isAdmin,
  onEditProfile, onMarkPublished, onUndoPublished, onSaveReport, onConfirmClose, onReopenClose, onRefreshExternalPlan, onAuthorizeWork, onOpenPlan, onNewTask, onOpenTask, onOpenWorkspace, onAddObservation, onDeleteObservation,
}) {
  const measured = isMeasured(client);
  const { current } = client.cycles || {};
  const history = client.history || [];
  const monthlyReport = Boolean(client.contract?.monthlyReport);
  // El mes cuyo informe o cierre se está editando; el diálogo se cierra solo cuando el servidor confirma.
  const [reportFor, setReportFor] = useState(null);
  const [closeFor, setCloseFor] = useState(null);
  const [authorizing, setAuthorizing] = useState(false);
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
          {measured && current && <CurrentCycle cycle={current} today={today} monthlyReport={monthlyReport} onReport={setReportFor} onClose={setCloseFor} onReopen={onReopenClose} externalPlanUrl={client.externalPlanUrl}
            onMarkPublished={onMarkPublished} onUndoPublished={onUndoPublished} onOpenPlan={onOpenPlan} />}
          {!measured && <Tasks tasks={client.openTasks || []} onNewTask={onNewTask} onOpenTask={onOpenTask} />}
          {measured && history.length > 0 && <History months={history} monthlyReport={monthlyReport} today={today} onReport={setReportFor} onClose={setCloseFor} onReopen={onReopenClose} />}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Profile client={client} canManage={canManage} onEdit={onEditProfile} today={today} onAuthorizeWork={onAuthorizeWork ? () => setAuthorizing(true) : null} onRefreshExternalPlan={onRefreshExternalPlan} />
          {measured && <Tasks tasks={client.openTasks || []} onNewTask={onNewTask} onOpenTask={onOpenTask} />}
        </div>
      </div>
      {reportFor && <ReportDialog month={reportFor} onClose={() => setReportFor(null)}
        onSave={async (data) => { await onSaveReport(reportFor, data); setReportFor(null); }} />}
      {closeFor && <CloseDialog month={closeFor} monthlyReport={monthlyReport} onClose={() => setCloseFor(null)}
        onConfirm={async (note) => { await onConfirmClose(closeFor, note); setCloseFor(null); }} />}
      {authorizing && <WorkAuthorizationDialog clientName={client.name} today={today} onClose={() => setAuthorizing(false)}
        onSave={async (data) => { await onAuthorizeWork(data); setAuthorizing(false); }} />}
    </div>
  );
}
