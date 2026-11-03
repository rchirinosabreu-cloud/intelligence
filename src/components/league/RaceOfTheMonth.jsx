import React, { useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Award, ArrowRight, CalendarClock, Check, ChevronDown, Clock, FileText, Flame, Sparkles, Sun, ThumbsUp, Trophy, Users, X } from '@/components/ui/icons';
import BriaPortrait from '@/components/bria/BriaPortrait';
import RunnerAvatar from './RunnerAvatar';
import KudosGift from './KudosGift';
import LeagueWelcome from './LeagueWelcome';
import MeetingAward from './MeetingAward';
import RecognitionCollection, { RecognitionHistory, RecognitionStatus } from './RecognitionCollection';
import { requestLeague } from '@/lib/leagueRequest';
import { cn } from '@/lib/utils';
import { DAILY_HABITS, EXTRA_ACTIONS, EXTRA_POINTS, HABIT_POINTS, MEETING_POINTS, RECOGNITION_POINTS, KUDOS_WEEKLY, leagueMonthLabel, leagueRank } from '@/lib/platformLeague';

// El nombre de archivo conserva compatibilidad con el dock y ?carrera.
// Las tres vistas muestran datos guardados; ningún logro añade puntos desde la interfaz.
const HABIT_ICON = { RELOJ: Clock, AL_DIA: Sparkles, A_TIEMPO: CalendarClock, DOCUMENTADO: FileText, SIN_DEVOLUCION: ThumbsUp };
const EXTRA_ICON = { PRIMERO_EN_ABRIR: Sun, PRIMERO_EN_REUNION: Users };
const POSITION_MESSAGES = [
  '¡Arriba se siente bien!',
  'El primer puesto ya se ve',
  '¡Estás en el podio!',
  'El podio está a un pasito',
  '¡Entre los cinco primeros!',
  'Estás haciendo ruido',
  '¡Todavía queda carrera!',
  '¡A seguir sumando!',
  '¡A seguir sumando!',
  '¡A seguir sumando!',
  '¡A seguir sumando!',
  'Todavía puedes sorprender',
  '¡Sigue avanzando!',
  'Hoy puede empezar tu remontada',
  '¡Vamos a encender esos primeros motores!',
];
const surface = 'rounded-2xl border border-zinc-200/80 bg-white dark:border-white/10 dark:bg-zinc-900';
const muted = 'text-zinc-500 dark:text-zinc-400';

function Habits({ today }) {
  const items = [...DAILY_HABITS.map(item => ({ ...item, icon: HABIT_ICON[item.key], value: today.habits?.[item.key], points: HABIT_POINTS })),
    ...EXTRA_ACTIONS.map(item => ({ ...item, extra: true, icon: EXTRA_ICON[item.key], value: today.extras?.[item.key] }))];
  return <details className={cn(surface, 'group px-4')}>
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan [&::-webkit-details-marker]:hidden">
      <Check className="h-4 w-4 text-brand-green-deep dark:text-brand-green" /><span className="flex-1">Tus hábitos de hoy</span><span className={cn('text-xs font-normal', muted)}>{today.earned} de {today.possible}</span><ChevronDown className="h-4 w-4 group-open:rotate-180" />
    </summary>
    <ul className="divide-y divide-zinc-100 pb-2 dark:divide-white/5">{items.map(item => {
      const Icon = item.icon;
      const unavailable = item.extra && !item.source;
      const earned = item.value === true;
      return <li key={item.key} className="py-3" {...{ [item.extra ? 'data-race-today-extra' : 'data-race-today-habit']: item.key }} data-race-today-state={earned ? 'earned' : item.value === false ? 'missed' : 'idle'}>
        <div className="flex items-center gap-2"><Icon className={cn('h-4 w-4', earned ? 'text-brand-green-deep dark:text-brand-green' : muted)} /><span className="flex-1 text-sm font-medium">{item.label}</span><span className={cn('text-xs', earned ? 'text-brand-green-deep dark:text-brand-green' : muted)}>{unavailable ? 'Próximamente' : earned ? `+${item.points} hoy` : item.value === false ? 'Sin sumar hoy' : 'Sin evaluar'}</span></div>
        <p className={cn('mt-1 pl-6 text-xs leading-5', muted)}>{item.hint}</p>
      </li>;
    })}</ul>
  </details>;
}

function Rules() {
  return <details className="group text-xs">
    <summary className={cn('flex min-h-10 cursor-pointer list-none items-center justify-center gap-1 rounded-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan [&::-webkit-details-marker]:hidden', muted)}>Cómo se cuentan los puntos<ChevronDown className="h-3.5 w-3.5 group-open:rotate-180" /></summary>
    <ul className={cn(surface, 'mt-2 list-disc space-y-2 p-4 pl-8 leading-5', muted)}>
      <li>Cada hábito cumplido en un día te suma {HABIT_POINTS} puntos.</li>
      <li>La primera actividad registrada desde las 8:00 am suma {EXTRA_POINTS} puntos.</li>
      <li>Si eres el primero en ingresar a la reunión de tráfico, sumarás {MEETING_POINTS} puntos.</li>
      <li>Cada semana tendrás {KUDOS_WEEKLY} puntos para regalar a otra persona como agradecimiento o reconocimiento.</li>
      <li>Las insignias de logros también te sumarán {RECOGNITION_POINTS} puntos.</li>
    </ul>
  </details>;
}

export default function RaceOfTheMonth({ open, onOpenChange, league, error, onRetry, returnFocusRef, introduction, onShowIntroduction }) {
  const queryClient = useQueryClient();
  const panelRef = useRef(null);
  const [activeTab, setActiveTab] = useState('month');
  const [given, setGiven] = useState(null);
  const lanes = useMemo(() => league?.race?.lanes || [], [league]);
  const self = lanes.find(lane => lane.isSelf);
  const ranked = useMemo(() => [...lanes].filter(lane => typeof lane.score === 'number').sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es')), [lanes]);
  const podium = ranked.filter(person => person.score > 0).slice(0, 3);
  const month = leagueMonthLabel(league?.month);
  const today = league?.today;
  const positionMessage = POSITION_MESSAGES[league?.position?.rank - 1];
  const history = useQuery({ queryKey: ['league', 'recognitions', league?.month, league?.startsAt], queryFn: () => requestLeague('/recognitions'), enabled: open && Boolean(league), staleTime: 60000, retry: false });
  const currentGift = given && given.startsAt === league?.startsAt && given.week === league?.kudos?.weekKey ? given.gift : null;

  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content ref={panelRef} data-league-panel aria-label="Reconocimientos"
        onInteractOutside={event => event.preventDefault()}
        onOpenAutoFocus={event => { event.preventDefault(); panelRef.current?.focus(); }}
        onCloseAutoFocus={event => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }}
        className="fixed bottom-3 right-3 top-20 z-[70] flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50 text-zinc-900 shadow-xl shadow-zinc-950/10 outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-4 motion-reduce:animate-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-yellow/20 text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow"><Trophy className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><DialogPrimitive.Title className="text-lg font-bold leading-tight">Reconocimientos</DialogPrimitive.Title><DialogPrimitive.Description className={cn('mt-1 text-xs', muted)}><span className="capitalize">{month || 'Tu mes'}</span>{league?.closesOn && ` · cierra el ${league.closesOn}`}</DialogPrimitive.Description></div>
          <DialogPrimitive.Close aria-label="Cerrar reconocimientos" className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-zinc-400 dark:hover:bg-white/10"><X className="h-4 w-4" /></DialogPrimitive.Close>
        </header>
        {introduction && league && !error ? <LeagueWelcome person={self} {...introduction} /> : <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList aria-label="Vistas de reconocimientos" className="mx-5 mb-1 grid h-11 shrink-0 grid-cols-3 rounded-2xl bg-zinc-200/60 p-1 dark:bg-zinc-900">
            {[['month', 'Mi mes', Sparkles], ['achievements', 'Logros', Award], ['team', 'Equipo', Users]].map(([value, label, Icon]) => <TabsTrigger key={value} value={value} className="gap-1.5 rounded-xl text-zinc-600 data-[state=active]:bg-white data-[state=active]:text-zinc-950 dark:text-zinc-400 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-white"><Icon className="h-4 w-4" />{label}</TabsTrigger>)}
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 custom-scrollbar">
            {error ? <div role="alert" className="py-8 text-center text-destructive"><p className="text-sm">No pudimos actualizar tu mes.</p><Button variant="ghost" onClick={onRetry} className="mt-2">Reintentar</Button></div> : !league ? <p role="status" className={cn('py-8 text-center text-sm', muted)}>Preparando tu mes…</p> : <>
              <TabsContent value="month" className="space-y-4 pt-3">
                {league.winner && <p data-race-winner className="flex items-center gap-2 rounded-2xl bg-brand-yellow/10 p-3 text-sm dark:bg-brand-yellow/10"><RunnerAvatar person={league.winner} size={38} /><span><strong>{league.winner.name}</strong> ganó la liga de {leagueMonthLabel(league.winner.month)} con {league.winner.score} puntos.</span></p>}
                {self && <section data-race-hero className="relative overflow-hidden rounded-3xl border border-brand-cyan/20 bg-brand-cyan/10 p-5 dark:border-brand-cyan/25 dark:bg-brand-cyan/10">
                  <Sparkles aria-hidden="true" className="absolute right-4 top-4 h-5 w-5 text-brand-cyan-deep/40 dark:text-brand-cyan/50" />
                  <div className="flex items-center gap-5">
                    <div className="relative flex h-28 w-24 shrink-0 items-end justify-center pb-2"><span aria-hidden="true" className="absolute bottom-1 h-16 w-24 rounded-[50%] bg-brand-cyan/15 dark:bg-brand-cyan/20" /><RunnerAvatar person={self} size={104} className="relative" /></div>
                    <div className="min-w-0"><p className="text-sm font-medium">¡Vamos, {self.name}!</p><p data-race-panel-score className="mt-1 flex items-baseline gap-1.5 text-5xl font-bold tracking-tight">{league.score ?? '–'}<span className="text-sm font-medium tracking-normal">puntos</span></p>{typeof today?.points === 'number' && <p data-race-today-points className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-green/15 px-2.5 py-1 text-xs font-semibold text-brand-green-deep dark:bg-brand-green/20 dark:text-brand-green"><Sparkles className="h-3 w-3" />+{today.points} hoy</p>}</div>
                  </div>
                  <div className="mt-4 border-t border-brand-cyan/20 pt-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span data-race-position className="font-semibold">{league.position ? `Vas en el puesto ${league.position.rank}` : 'Tu mes está comenzando'}</span><span className={muted}>{typeof league.daysLeft === 'number' && `${league.daysLeft} días para el cierre`}</span></div>
                    {positionMessage && <p data-race-position-message className="mt-2 text-sm leading-5 text-zinc-600 dark:text-zinc-300">{positionMessage}</p>}
                  </div>
                </section>}
                {league.nextStep && <section className={cn(surface, 'relative overflow-hidden p-4')}>
                  <span aria-hidden="true" className="brain-gradient-primary absolute inset-x-0 top-0 h-1" />
                  <div className="flex items-start gap-3"><BriaPortrait className="h-12 w-12 shrink-0" /><div><p className="text-xs font-semibold text-brand-cyan-deep dark:text-brand-cyan">UN PASO PARA HOY</p><h3 className="mt-1 text-base font-bold">{league.nextStep.label}</h3><p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">{league.nextStep.text}</p></div></div>
                  <a href={league.nextStepUrl || '/gestion'} className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">Ir a mis tareas<ArrowRight className="h-4 w-4" /></a>
                </section>}
                <div className="grid grid-cols-2 gap-3">
                  <div className={cn(surface, 'flex items-center gap-2.5 px-3 py-3')}><Flame className="h-5 w-5 shrink-0 text-brand-coral-deep dark:text-brand-coral" /><div><p className="text-lg font-bold leading-none">{league.streak?.days ?? 0}</p><p className={cn('mt-1 text-xs', muted)}>días cumplidos</p></div></div>
                  <div className={cn(surface, 'flex items-center gap-2.5 px-3 py-3')}><Award className="h-5 w-5 shrink-0 text-brand-magenta-deep dark:text-brand-coral" /><div><p className="text-lg font-bold leading-none">{league.kudos?.score ?? 0} <span className="text-xs font-normal">pts</span></p><p className={cn('mt-1 text-xs', muted)}>del equipo</p></div></div>
                </div>
                <section><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Tus últimas victorias</h3><button onClick={() => setActiveTab('achievements')} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-brand-cyan-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-cyan">Ver logros →</button></div><RecognitionStatus query={history}>{data => <RecognitionHistory data={data} compact />}</RecognitionStatus></section>
                {today && <Habits today={today} />}
                <section className="flex items-center gap-3 rounded-2xl border border-brand-yellow/30 bg-brand-yellow/10 p-4 dark:bg-brand-yellow/5"><Trophy className="h-7 w-7 shrink-0 text-brand-yellow-deep dark:text-brand-yellow" /><div><h3 className="text-sm font-semibold">Premio del mes</h3><p className={cn('mt-0.5 text-xs', muted)}>{league.prize || 'Por confirmar'}</p></div></section>
                <Rules />
              </TabsContent>
              <TabsContent value="achievements" className="space-y-5 pt-4"><RecognitionStatus query={history}>{data => <RecognitionCollection data={data} />}</RecognitionStatus></TabsContent>
              <TabsContent value="team" className="space-y-4 pt-3">
                <div><h3 className="text-xl font-bold">Así va el equipo</h3><p className={cn('mt-1 text-sm', muted)}>Cada buen hábito cuenta. El mes sigue abierto.</p></div>
                {podium.length === 3 && podium.every(person => ranked.filter(other => other.score === person.score).length === 1) && <section data-race-podium aria-label="Primeras posiciones del mes" className="grid grid-cols-3 items-end gap-2 rounded-3xl bg-brand-yellow/10 px-3 pt-4 dark:bg-brand-yellow/5">
                  {[podium[1], podium[0], podium[2]].map((person, index) => { const rank = [2, 1, 3][index]; return <div key={person.id} className="flex min-w-0 flex-col items-center">
                    {rank === 1 && <Trophy aria-hidden="true" className="mb-1 h-5 w-5 text-brand-yellow-deep dark:text-brand-yellow" />}<RunnerAvatar person={person} size={rank === 1 ? 76 : 60} phase={index} /><p className="mt-2 max-w-full truncate text-sm font-semibold">{person.name}</p><p className={cn('text-xs', muted)}>{person.score} pts</p><span className={cn('mt-2 flex w-full items-center justify-center rounded-t-xl text-lg font-bold', rank === 1 ? 'h-12 bg-brand-yellow/40 text-brand-yellow-deep dark:text-brand-yellow' : rank === 2 ? 'h-8 bg-brand-cyan/15 text-brand-cyan-deep dark:text-brand-cyan' : 'h-6 bg-brand-coral/20 text-brand-coral-deep dark:text-brand-coral')}>{rank}</span>
                  </div>; })}
                </section>}
                <section className={cn(surface, 'overflow-hidden px-3')} aria-label="Clasificación del mes"><ol className="divide-y divide-zinc-100 dark:divide-white/5">{ranked.map((person, index) => <li key={person.id} data-league-member={person.id} className={cn('flex min-h-14 items-center gap-3 rounded-lg px-1 py-2', person.isSelf && 'bg-brand-cyan/10 dark:bg-brand-cyan/10')}><span className={cn('w-5 text-center text-xs tabular-nums', muted)}>{leagueRank(person.score, ranked) ?? '–'}</span><span className="flex w-9 shrink-0 justify-center"><RunnerAvatar person={person} size={38} phase={index} /></span><span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}{person.isSelf && <span className="ml-1.5 text-xs text-brand-cyan-deep dark:text-brand-cyan">Tú</span>}</span><span className="text-sm font-bold tabular-nums">{person.score} <span className={cn('text-xs font-normal', muted)}>pts</span></span></li>)}</ol></section>
                {league.meetings && <MeetingAward meetings={league.meetings} lanes={lanes} />}
                {self && <section data-race-kudos className="rounded-2xl border border-brand-magenta/20 bg-brand-magenta/5 p-4 dark:bg-brand-magenta/10"><h3 className="flex items-center gap-2 text-base font-bold"><Award className="h-5 w-5 text-brand-magenta-deep dark:text-brand-coral" />5 puntos para…</h3><p className="mb-3 mt-1 text-sm text-zinc-600 dark:text-zinc-300">Cada semana podrás regalar cinco puntos a algún miembro del equipo para agradecerle por alguna ayuda o reconocer su trabajo</p><KudosGift lanes={lanes} selfId={self.id} given={currentGift || league.kudos?.givenThisWeek} onGiven={gift => { setGiven({ startsAt: league.startsAt, week: league.kudos.weekKey, gift }); queryClient.invalidateQueries({ queryKey: ['league'] }); }} />{league.kudos?.received?.map((gift, index) => <p key={index} className="mt-3 border-t border-brand-magenta/10 pt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300"><strong>{gift.from}</strong>{gift.note ? `: «${gift.note}»` : ' te regaló puntos.'}</p>)}</section>}
                <p className={cn('text-center text-xs', muted)}>El resultado se valida al cierre del mes.</p>
              </TabsContent>
            </>}
          </div>
        </Tabs>}
        {!introduction && onShowIntroduction && <button type="button" onClick={onShowIntroduction} className="mx-5 mb-2 min-h-9 shrink-0 rounded-lg text-xs font-medium text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-zinc-400">Ver bienvenida</button>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
