import React, { useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Award, CalendarClock, Check, ChevronDown, Clock, FileText, Flame, Sparkles, Sun, ThumbsUp, Trophy, Users, X } from '@/components/ui/icons';
import RunnerAvatar from './RunnerAvatar';
import { requestLeague } from '@/lib/leagueRequest';
import { cn } from '@/lib/utils';
import { DAILY_HABITS, EXTRA_ACTIONS, EXTRA_POINTS, HABIT_POINTS, KUDOS_VALUE, KUDOS_WEEKLY, leagueMonthLabel, ordinalLabel, trackPosition } from '@/lib/platformLeague';

// «La carrera del mes» (Rodny, 2 y 3 de noviembre de 2026): un panel acoplado a la derecha, como el de Bria, que se
// abre desde la copa asomada al borde y no tapa la pantalla ni roba el clic de lo que hay detrás; se cierra con la X
// o con Escape. Sin niveles ni barras de progreso (Rodny los quitó): el puntaje, la posición y la pista. La pista va
// primero y compacta: un carril corto por persona en orden fijo, sin nombres —el nombre y los puntos aparecen al
// pasar el cursor o al enfocar con el teclado—, cada avatar en su puntaje sobre la escala que manda el servidor.
// Los personajes se mueven siempre (RunnerAvatar). Todo lo que se pinta viene del servidor.

const HABIT_ICON = { RELOJ: Clock, AL_DIA: Sparkles, A_TIEMPO: CalendarClock, DOCUMENTADO: FileText, SIN_DEVOLUCION: ThumbsUp };
const EXTRA_ICON = { PRIMERO_EN_ABRIR: Sun, PRIMERO_EN_REUNION: Users };
const PODIUM_TONE = ['bg-brand-yellow text-zinc-900', 'bg-brand-cyan text-white', 'bg-brand-coral text-white'];
const LANE_HEIGHT = 28;
const RUNNER_SIZE = 26;

const points = (value) => (typeof value === 'number' ? `${value} ${value === 1 ? 'punto' : 'puntos'}` : 'sin puntos');

function StatTile({ icon: Icon, tone, value, label, marker }) {
  return (
    <div data-league-stat={marker} className="flex min-w-0 flex-col items-center rounded-2xl border border-zinc-200/80 bg-white px-2 py-2.5 text-center dark:border-white/10 dark:bg-zinc-900">
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-full', tone)}><Icon className="h-4 w-4" /></span>
      <span className="mt-1.5 text-lg font-semibold leading-none text-zinc-950 dark:text-white">{value}</span>
      <span className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{label}</span>
    </div>
  );
}

function Chip({ icon: Icon, label, hint, state, marker, value, extra = false }) {
  return (
    <li
      {...{ [extra ? 'data-race-today-extra' : 'data-race-today-habit']: marker }}
      data-race-today-state={state}
      title={hint}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        state === 'earned' && 'border-brand-green/40 bg-brand-green/15 text-brand-green-deep dark:bg-brand-green/20 dark:text-brand-green',
        state === 'missed' && 'border-zinc-200 bg-white text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400',
        state === 'idle' && 'border-dashed border-zinc-300 text-zinc-400 dark:border-white/15'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className="text-[10px] font-medium opacity-80">+{value}</span>
      {state === 'earned' && <Check className="h-3 w-3" aria-label="Ganado" />}
    </li>
  );
}

/** Las líneas de salida y meta y el punteado de las marcas, en cada carril (alineadas con la escala). */
function TrackGuides({ marks, max }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 right-3 block">
      {marks.slice(1, -1).map((mark) => (
        <span key={mark} className="absolute inset-y-0 w-px border-l border-dashed border-zinc-400/40 dark:border-white/15" style={{ left: `${trackPosition(mark, max)}%` }} />
      ))}
      <span className="absolute inset-y-0 left-0 w-0.5 bg-zinc-700 dark:bg-zinc-200" />
      <span className="absolute inset-y-0 right-0 w-1.5" style={{ backgroundImage: 'repeating-conic-gradient(rgb(63 63 70) 0 25%, rgb(244 244 245) 0 50%)', backgroundSize: '6px 6px' }} />
    </span>
  );
}

/** Un carril corto: el corredor en su puntaje; el nombre y los puntos solo al pasar el cursor o enfocar. */
function Lane({ lane, index, track }) {
  const position = trackPosition(lane.score, track.max);
  const tipSide = position < 18 ? 'left' : position > 82 ? 'right' : 'center';
  return (
    <div
      data-race-lane={lane.id}
      data-race-lane-self={lane.isSelf ? 'true' : 'false'}
      className={cn('relative w-full', lane.isSelf && 'bg-brand-cyan/10 dark:bg-brand-cyan/15', index % 2 === 1 && !lane.isSelf && 'bg-zinc-900/[0.03] dark:bg-white/[0.03]')}
      style={{ height: LANE_HEIGHT }}
    >
      <TrackGuides marks={track.marks} max={track.max} />
      <div className="absolute inset-y-0 left-3 right-3">
        <button
          type="button"
          aria-label={`${lane.name}: ${points(lane.score)}`}
          data-race-runner={lane.id}
          className="group absolute bottom-0 flex -translate-x-1/2 flex-col items-center rounded-md outline-none transition-[left] duration-700 ease-out focus-visible:ring-2 focus-visible:ring-brand-cyan motion-reduce:transition-none"
          style={{ left: `${position}%` }}
        >
          <span
            data-race-lane-tip
            className={cn(
              'pointer-events-none absolute bottom-full z-10 mb-0.5 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-white dark:text-zinc-900',
              tipSide === 'center' && 'left-1/2 -translate-x-1/2',
              tipSide === 'left' && 'left-0 -translate-x-2',
              tipSide === 'right' && 'right-0 translate-x-2'
            )}
          >
            {lane.name} · {points(lane.score)}
          </span>
          {lane.isSelf && <span aria-hidden="true" className="absolute bottom-0 h-1.5 w-6 rounded-full bg-brand-cyan/40 blur-[1px]" />}
          <RunnerAvatar person={lane} size={RUNNER_SIZE} phase={index} className="relative" />
        </button>
      </div>
    </div>
  );
}

/** Regalar los 10 puntos de la semana: a una sola persona, con una línea. El servidor decide; la pantalla solo dice lo que respondió. */
function KudosGift({ lanes, selfId, given, onGiven }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const others = lanes.filter((lane) => lane.id !== selfId);
  if (given) {
    return <p data-race-kudos-given className="text-sm leading-5 text-zinc-700 dark:text-zinc-200">Esta semana le diste tus {KUDOS_WEEKLY} puntos a <span className="font-semibold">{given.name}</span>.</p>;
  }
  if (!open) {
    return (
      <Button type="button" className="w-full rounded-xl bg-brand-magenta text-white hover:bg-brand-magenta-deep" onClick={() => setOpen(true)} data-race-kudos-open>
        <Award className="h-4 w-4" />
        Regalar mis {KUDOS_WEEKLY} puntos
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
      toast.success(`Tus ${KUDOS_WEEKLY} puntos ya son de ${saved?.to?.name || lane.name}.`);
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

export default function RaceOfTheMonth({ open, onOpenChange, league }) {
  const queryClient = useQueryClient();
  const lanes = useMemo(() => league?.race?.lanes || [], [league]);
  const track = useMemo(() => league?.race?.track || { max: 100, marks: [0, 25, 50, 75, 100] }, [league]);
  const self = useMemo(() => lanes.find((lane) => lane.isSelf) || null, [lanes]);
  const podium = useMemo(() => [...lanes].filter((lane) => typeof lane.score === 'number').sort((a, b) => b.score - a.score).slice(0, 3), [lanes]);
  const [given, setGiven] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const month = leagueMonthLabel(league?.month);
  const score = typeof league?.score === 'number' ? league.score : null;
  const today = league?.today;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        {/* Acoplado a la derecha como el panel de Bria: no tapa nada, no roba el clic de lo que hay detrás. Encima del menú lateral (60). */}
        <DialogPrimitive.Content
          data-league-panel
          aria-label="La carrera del mes"
          onInteractOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}
          className="fixed bottom-3 right-3 top-20 z-[70] flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50 text-zinc-900 shadow-xl shadow-zinc-950/10 outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-right-4 data-[state=open]:slide-in-from-right-4 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200/80 px-4 py-3 dark:border-white/10">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/25 text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow"><Trophy className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-base font-semibold leading-tight text-zinc-950 dark:text-white">La carrera del mes</DialogPrimitive.Title>
              <DialogPrimitive.Description className="truncate text-xs capitalize text-zinc-500 dark:text-zinc-400">{month || 'Liga'}{league?.closesOn ? <span className="normal-case"> · cierra el {league.closesOn}</span> : null}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close aria-label="Cerrar la carrera" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:hover:bg-white/10 dark:hover:text-zinc-100">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 custom-scrollbar">
            {!league && <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando la liga…</p>}

            {/* Quien ganó el mes anterior, los primeros días del mes. */}
            {league?.winner && (
              <p data-race-winner className="flex items-center gap-3 rounded-2xl border border-brand-yellow/40 bg-brand-yellow/10 px-3 py-2 text-sm text-zinc-800 dark:bg-brand-yellow/10 dark:text-zinc-100">
                <RunnerAvatar person={league.winner} size={36} />
                <span><span className="font-semibold">{league.winner.name}</span> ganó la liga de {leagueMonthLabel(league.winner.month)} con {league.winner.score} puntos.{league.winner.note ? ` ${league.winner.note}` : ''}</span>
              </p>
            )}

            {/* Tu recorrido: puntos y posición, sin niveles ni barras. */}
            {self && (
              <section data-race-hero className="brain-gradient-primary relative overflow-hidden rounded-3xl p-4 text-white">
                <div className="flex items-center gap-4">
                  <span className="flex h-24 w-24 shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-white/20 pt-2">
                    <RunnerAvatar person={self} size={88} title={self.name} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white/90">{self.name}</p>
                    <p className="mt-0.5 flex items-baseline gap-1.5 text-4xl font-semibold leading-none tracking-tight" data-race-panel-score>{score ?? '–'}<span className="text-base font-medium text-white/80">{score === 1 ? 'punto' : 'puntos'}</span></p>
                    {league?.position?.rank && <p className="mt-2 text-sm font-semibold text-white/95" data-race-position>Vas {ordinalLabel(league.position.rank, league.gender)} de {league.position.of}</p>}
                    {typeof today?.points === 'number' && <p className="mt-1 inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold" data-race-today-points>+{today.points} hoy</p>}
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-white/85">{typeof league?.daysLeft === 'number' ? `Quedan ${league.daysLeft} días · ` : ''}El resultado se valida al cierre del mes.</p>
              </section>
            )}

            {/* La pista: un carril corto por persona, en orden fijo; el nombre, al pasar el cursor. */}
            {lanes.length > 0 && (
              <section>
                <p className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  La pista
                  <span className="normal-case tracking-normal text-zinc-400 dark:text-zinc-500">{lanes.length} integrantes · hasta {track.max}</span>
                </p>
                <div data-race-track className="rounded-2xl border border-zinc-200/80 bg-brand-yellow/5 pb-1 dark:border-white/10 dark:bg-brand-yellow/10">
                  <div className="relative mx-3 h-5 border-b border-zinc-200/70 dark:border-white/10">
                    {track.marks.map((mark) => <span key={mark} className="absolute top-0.5 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400" style={{ left: `${trackPosition(mark, track.max)}%` }}>{mark}</span>)}
                  </div>
                  <div className="mt-1 overflow-hidden rounded-b-xl">
                    {lanes.map((lane, index) => <Lane key={lane.id} lane={lane} index={index} track={track} />)}
                  </div>
                </div>
              </section>
            )}

            {/* Hoy: los hábitos y los extras, y los puntos que suman. */}
            {today && (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Hoy <span className="normal-case tracking-normal text-zinc-700 dark:text-zinc-200" data-race-today>· {today.earned} de {today.possible} hábitos · {points(today.points)}</span></p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {DAILY_HABITS.map((habit) => {
                    const value = today.habits?.[habit.key];
                    return <Chip key={habit.key} icon={HABIT_ICON[habit.key] || Sparkles} label={habit.label} hint={habit.hint} marker={habit.key} value={HABIT_POINTS} state={value === true ? 'earned' : value === false ? 'missed' : 'idle'} />;
                  })}
                  {EXTRA_ACTIONS.map((extra) => {
                    const value = today.extras?.[extra.key];
                    return <Chip key={extra.key} extra icon={EXTRA_ICON[extra.key] || Sparkles} label={extra.label} hint={extra.source ? extra.hint : `${extra.hint} Todavía sin fuente en la plataforma.`} marker={extra.key} value={EXTRA_POINTS} state={value === true ? 'earned' : value === false ? 'missed' : 'idle'} />;
                  })}
                </ul>
                {league?.nextStep && <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300"><span className="font-semibold text-brand-cyan-deep dark:text-brand-cyan">Lo que más te sube:</span> {league.nextStep.text}</p>}
              </section>
            )}

            {league && (
              <div className="grid grid-cols-3 gap-2">
                <StatTile marker="hoy" icon={Sparkles} tone="bg-brand-cyan/15 text-brand-cyan-deep dark:text-brand-cyan" value={typeof today?.points === 'number' ? `+${today.points}` : '–'} label="hoy" />
                <StatTile marker="racha" icon={Flame} tone="bg-brand-coral/15 text-brand-coral-deep dark:text-brand-coral" value={league?.streak?.days ?? 0} label={league?.streak?.days === 1 ? 'día con los 5' : 'días con los 5'} />
                <StatTile marker="regalos" icon={Award} tone="bg-brand-magenta/15 text-brand-magenta-deep dark:text-brand-magenta" value={league?.kudos?.score ?? 0} label="del equipo" />
              </div>
            )}

            {/* El podio de hoy. */}
            {podium.length === 3 && (
              <section data-race-podium className="rounded-3xl border border-zinc-200/80 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Podio de hoy</p>
                <div className="mt-3 grid grid-cols-3 items-end gap-2">
                  {[podium[1], podium[0], podium[2]].map((lane, column) => {
                    const rank = column === 1 ? 1 : column === 0 ? 2 : 3;
                    return (
                      <div key={lane.id} className="flex flex-col items-center">
                        <RunnerAvatar person={lane} size={rank === 1 ? 56 : 44} phase={rank} />
                        <span className={cn('mt-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold', PODIUM_TONE[rank - 1])}>{rank}</span>
                        <span className="mt-1 max-w-full truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">{lane.name}</span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{lane.score} pts</span>
                        <span aria-hidden="true" className={cn('mt-2 w-full rounded-t-lg', rank === 1 ? 'h-6 bg-brand-yellow/40' : rank === 2 ? 'h-4 bg-brand-cyan/25' : 'h-3 bg-brand-coral/25')} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* La bondad: regalar los 10 de la semana y lo que te regalaron. */}
            {self && (
              <section data-race-kudos className="rounded-3xl border border-brand-magenta/25 bg-brand-magenta/5 p-4 dark:border-brand-magenta/25 dark:bg-brand-magenta/10">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-magenta-deep dark:text-brand-magenta">Bondad del equipo</p>
                <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-100">
                  <span className="text-xl font-semibold">{league?.kudos?.score ?? 0}</span> puntos
                  {league?.kudos?.received?.length ? <span className="text-zinc-500 dark:text-zinc-400"> · {league.kudos.received.length} {league.kudos.received.length === 1 ? 'regalo' : 'regalos'}</span> : null}
                </p>
                {league?.kudos?.received?.slice(0, 2).map((gift, index) => (
                  <p key={index} className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300"><span className="font-semibold">{gift.from}:</span> «{gift.note}»</p>
                ))}
                <div className="mt-3"><KudosGift lanes={lanes} selfId={self.id} given={given || league?.kudos?.givenThisWeek} onGiven={(gift) => { setGiven(gift); queryClient.invalidateQueries({ queryKey: ['league'] }); }} /></div>
              </section>
            )}

            {league && (
              <section className="flex items-center gap-3 rounded-3xl border border-zinc-200/80 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-yellow/25 text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow"><Trophy className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Premio del mes</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{league?.prize || 'Por confirmar'}</p>
                </div>
              </section>
            )}

            <section>
              <button type="button" onClick={() => setShowRules((value) => !value)} aria-expanded={showRules} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-zinc-300 dark:hover:bg-white/10">
                Ver cómo se cuenta
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showRules && 'rotate-180')} />
              </button>
              {showRules && (
                <ul className="mt-2 space-y-1.5 px-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                  <li>Cada día hábil tiene cinco hábitos en juego y cada uno vale {HABIT_POINTS} puntos. Un día en que no cerraste nada no resta. Nunca cuenta cuántas tareas.</li>
                  {DAILY_HABITS.map((habit) => <li key={habit.key}><span className="font-semibold text-zinc-800 dark:text-zinc-100">{habit.label}:</span> {habit.hint}</li>)}
                  <li>Los extras del día valen {EXTRA_POINTS} y son de una sola persona: {EXTRA_ACTIONS.map((extra) => extra.label.toLowerCase()).join(' y ')}.</li>
                  <li>Cada lunes cada persona tiene {KUDOS_WEEKLY} puntos para regalar a una sola persona; cada regalo que recibes vale {KUDOS_VALUE}.</li>
                  <li>Quien dirige elige al ganador con estos datos a la vista.</li>
                </ul>
              )}
            </section>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
