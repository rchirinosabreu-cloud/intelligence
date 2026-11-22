import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/Select';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { Users } from '@/components/ui/icons';
import { requestLeague } from '@/lib/leagueRequest';
import { CAMERA_POINTS, MEETING_POINTS, MEETING_WINNERS_PER_WEEK } from '@/lib/platformLeague';

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
  // Cámara encendida (Rodny, 21 de noviembre de 2026): el administrador marca, después de la reunión, a quienes la tuvieron encendida.
  const cameras = meetings.cameras || [];
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraDay, setCameraDay] = useState(meetings.maxDate);
  const [cameraIds, setCameraIds] = useState([]);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const toggleCamera = id => setCameraIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  async function submitCameras(event) {
    event.preventDefault();
    if (cameraBusy || !cameraIds.length) return;
    setCameraBusy(true); setCameraError('');
    try {
      await requestLeague('/meetings/cameras', { method: 'POST', body: { memberIds: cameraIds, day: cameraDay } });
      await client.invalidateQueries({ queryKey: ['league'] });
      setCameraIds([]); setCameraOpen(false);
    } catch (failure) { setCameraError(failure.message); }
    finally { setCameraBusy(false); }
  }
  const dateLabel = date => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const cameraDates = [...new Set(cameras.map(entry => entry.date))].sort().reverse();
  const field = 'mt-1 block min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100';
  return <section data-league-meetings className="rounded-2xl border border-brand-green/20 bg-brand-green/5 p-4 dark:bg-brand-green/10">
    <h3 className="flex items-center gap-2 text-base font-bold"><Users className="h-5 w-5 text-brand-green-deep dark:text-brand-green" />Primero en tráfico</h3>
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">+{MEETING_POINTS} puntos para cada una de las {MEETING_WINNERS_PER_WEEK} primeras personas en llegar. Un administrador las registra cada semana.</p>
    {meetings.entries.length > 0 && <ul className="mt-3 space-y-2 text-sm">{meetings.entries.map(entry => <li key={`${entry.weekKey}:${entry.memberId}`} data-league-meeting-entry={entry.memberId} className="flex justify-between gap-2"><span><strong>{entry.name}</strong> · {new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${entry.date}T12:00:00Z`))}</span><strong className="text-brand-green-deep dark:text-brand-green">+{entry.points}</strong></li>)}</ul>}
    {meetings.canManage && (open ? <form onSubmit={submit} className="mt-3 space-y-3">
      <label className="block text-sm">Fecha de la reunión<BrainDatePicker ariaLabel="Fecha de la reunión" min={meetings.minDate} max={meetings.maxDate} required value={day} onChange={setDay} className={field} /></label>
      <label className="block text-sm">Quién llegó primero<Select aria-label="Quién llegó primero" required value={memberId} onChange={event => setMemberId(event.target.value)} className={field}><option value="">Elige a una persona</option>{lanes.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={busy || !memberId}>{busy ? 'Guardando…' : `Asignar ${MEETING_POINTS} puntos`}</Button><Button variant="ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button></div>
    </form> : <Button variant="outline" className="mt-3 w-full" onClick={() => setOpen(true)}>Registrar primero en tráfico</Button>)}
    <div data-league-cameras className="mt-4 border-t border-brand-green/20 pt-4">
      <h4 className="text-sm font-bold">Cámara encendida</h4>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">+{CAMERA_POINTS} puntos a cada persona que tuvo la cámara encendida en la reunión de tráfico. Un administrador las marca después de la reunión.</p>
      {cameraDates.length > 0 && <ul className="mt-3 space-y-2 text-sm">{cameraDates.map(date => <li key={date} data-league-camera-entry={date} className="flex justify-between gap-3"><span className="min-w-0 break-words"><strong>{dateLabel(date)}</strong> · {cameras.filter(entry => entry.date === date).map(entry => entry.name).join(', ')}</span><strong className="shrink-0 text-brand-green-deep dark:text-brand-green">+{CAMERA_POINTS} c/u</strong></li>)}</ul>}
      {meetings.canManage && (cameraOpen ? <form onSubmit={submitCameras} className="mt-3 space-y-3">
        <label className="block text-sm">Fecha de la reunión<BrainDatePicker ariaLabel="Fecha de la reunión para la cámara" min={meetings.minDate} max={meetings.maxDate} required value={cameraDay} onChange={setCameraDay} className={field} /></label>
        <fieldset>
          <legend className="text-sm">Quiénes tuvieron la cámara encendida</legend>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">{lanes.map(person => <label key={person.id} className="flex min-h-10 min-w-0 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-zinc-300 text-brand-green-deep focus:ring-brand-cyan dark:border-white/20 dark:bg-zinc-900" checked={cameraIds.includes(person.id)} onChange={() => toggleCamera(person.id)} />
            <span className="truncate">{person.name}</span>
          </label>)}</div>
        </fieldset>
        {cameraError && <p role="alert" className="text-sm text-destructive">{cameraError}</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={cameraBusy || !cameraIds.length}>{cameraBusy ? 'Guardando…' : cameraIds.length ? `Dar ${CAMERA_POINTS} puntos a ${cameraIds.length}` : 'Marca a quienes la tuvieron'}</Button><Button variant="ghost" type="button" disabled={cameraBusy} onClick={() => setCameraOpen(false)}>Cancelar</Button></div>
      </form> : <Button variant="outline" className="mt-3 w-full" onClick={() => setCameraOpen(true)}>Registrar cámara encendida</Button>)}
    </div>
  </section>;
}
