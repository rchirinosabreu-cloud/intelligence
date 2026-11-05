import React, { useId, useState } from 'react';
import { Trash2 } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { shortDate } from '@/lib/clientOperations';

// Observaciones del cliente (Rodny, 2 de octubre de 2026: «el Excel tenía observaciones»). Contexto que
// el equipo tiene que leer —lo que pidió el cliente, lo que se acordó, por qué algo está quieto—, no
// pendientes: los pendientes van a Gestión. La más reciente arriba; las del Excel dicen de qué columna
// salieron. Se guarda y se borra solo con la respuesta del servidor.

const MAX = 2000;
const INITIAL_SHOWN = 4;

function Observation({ observation, canDelete, onDelete }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const long = observation.text.length > 280;
  const date = shortDate(observation.date);
  const dated = date ? `${date} ${String(observation.date).slice(0, 4)}` : '';
  const meta = observation.source === 'EXCEL'
    ? `Del Excel${observation.label ? ` · ${observation.label}` : ''}${dated ? ` · Incorporada el ${dated}` : ''}`
    : [observation.by || 'Alguien del equipo', dated].filter(Boolean).join(' · ');
  return (
    <li className="group py-3">
      <p className={cn('whitespace-pre-line text-sm leading-relaxed text-zinc-800 dark:text-zinc-100', long && !open && 'line-clamp-4')}>{observation.text}</p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{meta}</span>
        <span className="flex items-center gap-1">
          {long && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="min-h-9 rounded-lg px-2 text-xs font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan">
              {open ? 'Ver menos' : 'Ver todo'}
            </button>
          )}
          {canDelete && (
            <button type="button" aria-label="Borrar observación" disabled={busy}
              onClick={async () => { setBusy(true); try { await onDelete(observation); } finally { setBusy(false); } }}
              className="brain-danger-button-icon inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

export default function ClientObservations({ observations = [], currentUserId, isAdmin, onAdd, onDelete }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const id = useId();
  const value = text.trim();
  const visible = showAll ? observations : observations.slice(0, INITIAL_SHOWN);

  const submit = async (event) => {
    event.preventDefault();
    if (!value || saving) return;
    setSaving(true);
    setError('');
    try {
      await onAdd(value);
      setText('');
      setFormOpen(false);
    } catch (failure) {
      console.error('[ClientObservations] No se pudo guardar la observación:', failure?.message || failure);
      setError(failure?.message || 'No se pudo guardar la observación. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900" aria-label="Observaciones">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Observaciones <span className="font-normal text-zinc-400">({observations.length})</span></h2>
        <button type="button" aria-expanded={formOpen} aria-controls={`${id}-form`} disabled={saving} onClick={() => setFormOpen((open) => !open)}
          className="min-h-11 rounded-lg px-2 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan disabled:opacity-50">
          {formOpen ? 'Ocultar formulario' : value ? 'Continuar observación' : 'Añadir observación'}
        </button>
      </div>
      {formOpen && <form id={`${id}-form`} onSubmit={submit} className="mt-3 space-y-2">
        <label htmlFor={id} className="sr-only">Nueva observación</label>
        <textarea id={id} autoFocus rows={3} maxLength={MAX} value={text} onChange={(e) => { setText(e.target.value); setError(''); }}
          placeholder="Lo que pidió el cliente, lo que se acordó, por qué algo está quieto…"
          className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={!value || saving}
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar observación'}
          </button>
        </div>
      </form>}
      {observations.length ? (
        <ul id={`${id}-list`} className="mt-2 divide-y divide-zinc-100 dark:divide-white/5">
          {visible.map((observation) => (
            <Observation key={observation.id} observation={observation} onDelete={onDelete}
              canDelete={isAdmin || (observation.authorId && observation.authorId === currentUserId)} />
          ))}
        </ul>
      ) : <p className="mt-3 text-sm text-zinc-500">Todavía no hay observaciones de este cliente.</p>}
      {observations.length > INITIAL_SHOWN && (
        <button type="button" aria-expanded={showAll} aria-controls={`${id}-list`} onClick={() => setShowAll((open) => !open)}
          className="mt-2 min-h-11 rounded-lg px-2 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan">
          {showAll ? 'Ver menos observaciones' : `Ver ${observations.length - INITIAL_SHOWN} anteriores`}
        </button>
      )}
    </section>
  );
}
