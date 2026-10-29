import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import { changeLine, platformStatusFromSheet } from '@/lib/externalPlan';
import { PIECE_STATUS } from '@/components/modules/Clients/operations/operationTones';
import ClientAvatar from '@/components/ui/ClientAvatar';
import {
  ChevronLeft, ExternalLink, FileSpreadsheet, Info, Loader2, MessageSquare, RefreshCw, Sparkles
} from '@/components/ui/icons';

// El espejo de una parrilla de MIO (Rodny, 29 de octubre de 2026: «desde la plataforma misma podamos ver si hay
// comentarios nuevos del cliente, correcciones, aprobaciones»). La parrilla vive en la hoja de Google de MIO; aquí se lee
// tal cual, con lo que cambió desde la lectura anterior y los comentarios de Google atados a cada pieza. Editar se hace en
// la hoja: cada pieza abre su fila.

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const CARD = 'rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900';
const LABEL = 'text-xs font-medium text-zinc-500 dark:text-zinc-400';
const TEXT_ACTION = 'inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan-soft dark:text-brand-cyan dark:hover:bg-brand-cyan/10';

const when = (iso) => (iso
  ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : null);
const day = (key) => (key ? new Date(`${key}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' }) : null);
const urlsIn = (text) => (String(text || '').match(/https?:\/\/[^\s]+/g) || []).slice(0, 3);

const CHANGE_KIND_LABEL = { STATUS: 'Cambió de estado', SHEET_COMMENT: 'Comentario nuevo', GOOGLE_COMMENT: 'Comentario nuevo', GOOGLE_REPLY: 'Respuesta nueva' };

function StatusChip({ status }) {
  const meta = PIECE_STATUS[platformStatusFromSheet(status)] || PIECE_STATUS.BORRADOR;
  return (
    <span title={status ? `En la hoja: ${status}` : 'Sin estado en la hoja'} className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-semibold', meta.chip)}>
      {meta.label}
    </span>
  );
}

function LongText({ label, text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 320;
  return (
    <div className="min-w-0">
      <p className={LABEL}>{label}</p>
      <p className={cn('mt-1 whitespace-pre-wrap text-sm text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-100', long && !open && 'line-clamp-6')}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((value) => !value)} className="mt-1 text-xs font-medium text-brand-cyan-deep hover:underline dark:text-brand-cyan">
          {open ? 'Ver menos' : 'Ver todo'}
        </button>
      )}
    </div>
  );
}

function CommentThread({ comment }) {
  return (
    <li className={cn('rounded-xl border p-3 text-sm', comment.resolved ? 'border-zinc-100 bg-zinc-50 dark:border-white/5 dark:bg-white/[0.03]' : 'border-brand-cyan/30 bg-brand-cyan-soft/40 dark:border-brand-cyan/20 dark:bg-brand-cyan/5')} data-google-comment={comment.id}>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">{comment.author}</span>
        <span>{when(comment.createdAt)}</span>
        {comment.resolved && <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300">Resuelto</span>}
      </p>
      {comment.quoted && <p className="mt-1 border-l-2 border-zinc-300 pl-2 text-xs italic text-zinc-500 dark:border-white/15 dark:text-zinc-400">«{comment.quoted}»</p>}
      <p className="mt-1 whitespace-pre-wrap text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-100">{comment.content}</p>
      {comment.replies?.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-l-2 border-zinc-200 pl-3 dark:border-white/10">
          {comment.replies.map((reply, index) => (
            <li key={reply.id || index} className="text-sm">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{reply.author}</span>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{when(reply.createdAt)}</span>
              <p className="whitespace-pre-wrap text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-200">{reply.content}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function PieceCard({ piece }) {
  const links = urlsIn(piece.content);
  return (
    <article className={cn(CARD, piece.changed?.length && 'ring-1 ring-brand-yellow/60')} data-external-piece={piece.row}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{piece.format}{piece.number ? ` ${piece.number}` : ''}</span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{day(piece.date) || piece.dateText || 'Sin fecha'}</span>
        <StatusChip status={piece.status} />
        {piece.changed?.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-yellow-soft px-2 py-0.5 text-xs font-semibold text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow" data-piece-changed>
            <Sparkles className="h-3.5 w-3.5" />{[...new Set(piece.changed.map((kind) => CHANGE_KIND_LABEL[kind]))].join(' · ')}
          </span>
        )}
        {piece.cellUrl && (
          <a href={piece.cellUrl} target="_blank" rel="noreferrer" className={cn(TEXT_ACTION, 'ml-auto -my-2 text-xs')} data-piece-open-sheet>
            Abrir en la hoja <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </header>
      {piece.objective && <p className="mt-1 text-xs uppercase tracking-wide text-zinc-400">{piece.objective}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <LongText label="Copy" text={piece.copy} />
        <LongText label="Caption" text={piece.caption} />
      </div>
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {links.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">
              <ExternalLink className="h-3.5 w-3.5" />{links.length === 1 ? 'Ver material' : `Material ${index + 1}`}
            </a>
          ))}
        </div>
      )}
      {piece.comment && (
        <div className="mt-4 rounded-xl border-l-[3px] border-brand-yellow bg-brand-yellow/[0.08] px-3 py-2" data-piece-sheet-comment>
          <p className={LABEL}>Comentarios en la hoja</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-100">{piece.comment}</p>
        </div>
      )}
      {piece.comments?.length > 0 && (
        <div className="mt-4">
          <p className={cn(LABEL, 'flex items-center gap-1.5')}><MessageSquare className="h-3.5 w-3.5" />Comentarios de Google ({piece.comments.length})</p>
          <ul className="mt-2 space-y-2">{piece.comments.map((comment) => <CommentThread key={comment.id} comment={comment} />)}</ul>
        </div>
      )}
    </article>
  );
}

export default function ExternalPlanView() {
  const { clientSlug, period } = useParams();
  const queryClient = useQueryClient();
  const key = ['external-plan', clientSlug, period];
  const { data: plan, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/content/external-plans/${encodeURIComponent(clientSlug)}/${encodeURIComponent(period)}`, { headers: authHeaders() })).data,
    staleTime: 30_000,
  });
  const refresh = useMutation({
    mutationFn: async () => (await axios.post(`${getApiBaseUrl()}/api/content/external-plans/${encodeURIComponent(clientSlug)}/refresh`, {}, { headers: authHeaders() })).data,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['external-plans'] });
      if (result?.ok) toast.success('Hoja de MIO leída.');
      else toast.error(result?.problem || 'No pudimos leer la hoja.');
    },
    onError: (failure) => {
      console.error('[Parrillas MIO] No se pudo leer la hoja:', failure?.response?.data || failure);
      toast.error(failure?.response?.data?.error || 'No pudimos leer la hoja.');
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center p-20"><Loader2 className="h-8 w-8 animate-spin text-brand-cyan" /></div>;
  }
  if (error || !plan) {
    return (
      <div className={cn(CARD, 'mx-auto max-w-xl text-center')}>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{error?.response?.data?.error || 'No encontramos esta parrilla de MIO.'}</p>
        <Link to="/parrillas" className={cn(TEXT_ACTION, 'mt-3')}><ChevronLeft className="h-4 w-4" />Volver a Parrillas</Link>
      </div>
    );
  }

  const pieces = plan.pieces || [];
  const reached = plan.summary?.reached || {};
  const counts = [
    ['Piezas', pieces.length],
    ['Aprobadas', reached.aprobada ?? 0],
    ['Programadas', reached.programada ?? 0],
    ['Publicadas', reached.publicada ?? 0],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-in fade-in duration-200" data-external-plan-view>
      <nav className="flex items-center gap-2 text-xs text-zinc-500">
        <Link to="/parrillas" className="hover:text-zinc-800 dark:hover:text-zinc-200">Parrillas</Link>
        <span>›</span>
        <span>{plan.client.name}</span>
        <span>›</span>
        <span>{plan.label} {plan.year}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ClientAvatar client={plan.client} size={48} className="rounded-2xl border border-zinc-200 dark:border-white/10" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-zinc-900 [overflow-wrap:anywhere] dark:text-white sm:text-2xl">{plan.client.name} · {plan.label} {plan.year}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1 rounded-md bg-brand-green-soft px-2 py-0.5 text-xs font-semibold text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green"><FileSpreadsheet className="h-3.5 w-3.5" />Hoja de MIO</span>
              {plan.tabName && <span>Pestaña {plan.tabName}</span>}
              {plan.readAt && <span data-external-read-at>· Leída el {when(plan.readAt)}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending} className={cn(TEXT_ACTION, 'border border-zinc-200 dark:border-white/10')} data-external-refresh>
            {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Leer ahora
          </button>
          <a href={plan.tabUrl || plan.sheetUrl} target="_blank" rel="noreferrer" className={cn(TEXT_ACTION, 'border border-zinc-200 dark:border-white/10')}>
            Abrir la hoja <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </header>

      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Esta parrilla vive en la hoja de Google de MIO: aquí se lee tal cual cada dos horas. Para cambiar una pieza, ábrela en la hoja.
      </p>

      {plan.problem && (
        <div className="flex items-start gap-2 rounded-xl border border-brand-yellow/40 bg-brand-yellow/[0.08] px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100" role="status">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-yellow-deep dark:text-brand-yellow" />{plan.problem}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen">
        {counts.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900">
            <p className={LABEL}>{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p>
          </div>
        ))}
      </section>

      {plan.changes?.length > 0 && (
        <section className={CARD} data-external-changes>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            <Sparkles className="h-4 w-4 text-brand-yellow-deep dark:text-brand-yellow" />Lo que cambió en la hoja
            {plan.changedAt && <span className="font-normal text-zinc-500 dark:text-zinc-400">· {when(plan.changedAt)}</span>}
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">
            {plan.changes.map((change, index) => <li key={index} className="[overflow-wrap:anywhere]">{changeLine(change)}</li>)}
          </ul>
        </section>
      )}

      {plan.looseComments?.length > 0 && (
        <section className={CARD} data-external-loose-comments>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50"><MessageSquare className="h-4 w-4" />Comentarios de Google sin pieza</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Abiertos y recientes, pero no citan el texto de ninguna pieza de este mes.</p>
          <ul className="mt-3 space-y-2">{plan.looseComments.map((comment) => <CommentThread key={comment.id} comment={comment} />)}</ul>
        </section>
      )}

      {!plan.commentsRead && plan.readAt && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Los comentarios de Google (los de burbuja) se verán desde la próxima lectura.</p>
      )}

      {pieces.length ? (
        <div className="space-y-4">{pieces.map((piece) => <PieceCard key={piece.row} piece={piece} />)}</div>
      ) : (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-white/15">La pestaña de {plan.label.toLowerCase()} todavía no tiene piezas.</p>
      )}
    </div>
  );
}
