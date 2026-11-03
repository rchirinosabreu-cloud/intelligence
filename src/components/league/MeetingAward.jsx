import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/Select';
import { Users } from '@/components/ui/icons';
import { requestLeague } from '@/lib/leagueRequest';
import { MEETING_POINTS } from '@/lib/platformLeague';

export default function MeetingAward({ meetings, lanes }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [day, setDay] = useState(meetings.maxDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy || !memberId) return;
    setBusy(true); setError('');
    try {
      await requestLeague('/meetings', { method: 'POST', body: { memberId, day } });
      await client.invalidateQueries({ queryKey: ['league'] });
      setOpen(false);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const field = 'mt-1 block min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100';
  return <section data-league-meetings className="rounded-2xl border border-brand-green/20 bg-brand-green/5 p-4 dark:bg-brand-green/10">
    <h3 className="flex items-center gap-2 text-base font-bold"><Users className="h-5 w-5 text-brand-green-deep dark:text-brand-green" />Primero en tráfico</h3>
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">+{MEETING_POINTS} puntos para quien llegó primero. Un administrador registra a una persona por semana.</p>
    {meetings.entries.length > 0 && <ul className="mt-3 space-y-2 text-sm">{meetings.entries.map(entry => <li key={entry.weekKey} className="flex justify-between gap-2"><span><strong>{entry.name}</strong> · {new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${entry.date}T12:00:00Z`))}</span><strong className="text-brand-green-deep dark:text-brand-green">+{entry.points}</strong></li>)}</ul>}
    {meetings.canManage && (open ? <form onSubmit={submit} className="mt-3 space-y-3">
      <label className="block text-sm">Fecha de la reunión<input aria-label="Fecha de la reunión" type="date" min={meetings.minDate} max={meetings.maxDate} required value={day} onChange={event => setDay(event.target.value)} className={field} /></label>
      <label className="block text-sm">Quién llegó primero<Select aria-label="Quién llegó primero" required value={memberId} onChange={event => setMemberId(event.target.value)} className={field}><option value="">Elige a una persona</option>{lanes.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy || !memberId}>{busy ? 'Guardando…' : `Asignar ${MEETING_POINTS} puntos`}</Button><Button variant="ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button></div>
    </form> : <Button variant="outline" className="mt-3 w-full" onClick={() => setOpen(true)}>Registrar primero en tráfico</Button>)}
  </section>;
}
