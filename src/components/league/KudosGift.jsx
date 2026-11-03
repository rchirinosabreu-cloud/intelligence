import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Award } from '@/components/ui/icons';
import RunnerAvatar from './RunnerAvatar';
import { requestLeague } from '@/lib/leagueRequest';
import { cn } from '@/lib/utils';
import { KUDOS_MONTHLY } from '@/lib/platformLeague';
export default function KudosGift({ lanes, selfId, given, onGiven }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const others = lanes.filter((lane) => lane.id !== selfId);
  if (given) {
    return <p data-race-kudos-given className="text-sm leading-5 text-zinc-700 dark:text-zinc-200">Este mes le diste tus {KUDOS_MONTHLY} puntos a <span className="font-semibold">{given.name}</span>.</p>;
  }
  if (!open) {
    return (
      <Button type="button" className="w-full rounded-xl bg-brand-magenta text-white hover:bg-brand-magenta-deep" onClick={() => setOpen(true)} data-race-kudos-open>
        <Award className="h-4 w-4" />
        Regalar mis {KUDOS_MONTHLY} puntos
      </Button>
    );
  }
  const submit = async (event) => {
    event.preventDefault();
    const lane = others.find((row) => row.id === to);
    if (!lane || busy) return;
    setBusy(true);
    try {
      const saved = await requestLeague('/kudos', { method: 'POST', body: { memberId: lane.id, note } });
      onGiven({ id: saved?.to?.id || lane.id, name: saved?.to?.name || lane.name, note: saved?.note ?? note });
      toast.success(`Tus ${KUDOS_MONTHLY} puntos ya son de ${saved?.to?.name || lane.name}.`);
    } catch (error) {
      console.error('[Liga] No se pudo regalar:', error);
      toast.error(error.message || 'No pudimos registrar el regalo.');
    } finally { setBusy(false); }
  };
  return (
    <form data-race-kudos-form className="space-y-2" onSubmit={submit}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">¿A quién?</p>
      <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto">
        {others.map((lane, index) => (
          <label key={lane.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-white/5', to === lane.id && 'bg-brand-magenta/10 dark:bg-brand-magenta/15')}>
            <input type="radio" name="kudos-to" value={lane.id} checked={to === lane.id} onChange={() => setTo(lane.id)} className="accent-brand-magenta" />
            <RunnerAvatar person={lane} size={24} phase={index} />
            <span className="truncate text-zinc-800 dark:text-zinc-100">{lane.name}</span>
          </label>
        ))}
      </div>
      <label className="block">
        <span className="sr-only">Motivo</span>
        <input type="text" value={note} onChange={(event) => setNote(event.target.value.slice(0, 120))} placeholder="Una línea: por qué" className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-magenta/40 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100" />
      </label>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 rounded-lg bg-brand-magenta text-white hover:bg-brand-magenta-deep" disabled={!to || busy}>Regalar</Button>
        <Button type="button" variant="ghost" className="rounded-lg" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}
