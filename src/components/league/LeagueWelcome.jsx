import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Award, ArrowRight, Sparkles } from '@/components/ui/icons';
import RunnerAvatar from './RunnerAvatar';
import { DAILY_HABITS, HABIT_POINTS, EXTRA_POINTS, KUDOS_WEEKLY, KUDOS_VALUE, MEETING_POINTS, RECOGNITION_POINTS } from '@/lib/platformLeague';
import { MIN_MEASURED_MS, FORGOTTEN_SESSION_MS } from '@/lib/leagueDay';

const titles = ['Tu buen trabajo suma', 'Así sumas puntos', '5 puntos para…'];
export default function LeagueWelcome({ person, busy, error, onFinish }) {
  const [step, setStep] = useState(0);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  return <section data-league-welcome className="flex min-h-0 flex-1 flex-col px-5 pb-5">
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 custom-scrollbar">
      <div className="mb-5 mt-2 flex items-center gap-2" aria-label={`Paso ${step + 1} de 3`}>
        {[0, 1, 2].map(index => <span key={index} aria-hidden="true" className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-brand-cyan dark:bg-brand-cyan' : 'bg-zinc-200 dark:bg-zinc-800'}`} />)}
      </div>
      <div className="mb-4 flex h-36 items-center justify-center rounded-3xl bg-brand-cyan/10 dark:bg-brand-cyan/10">
        {step === 0 && person ? <RunnerAvatar person={person} size={108} /> : step === 2 ? <div className="flex items-center gap-3 text-brand-magenta-deep dark:text-brand-coral"><Award className="h-12 w-12" /><span className="text-5xl font-bold">+{KUDOS_VALUE}</span></div> : <div className="flex items-center gap-3 text-brand-cyan-deep dark:text-brand-cyan"><Sparkles className="h-12 w-12" /><span className="text-5xl font-bold">+{HABIT_POINTS}</span></div>}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-cyan-deep dark:text-brand-cyan">Tu liga del mes · {step + 1} de 3</p>
      <h2 ref={heading} tabIndex={-1} className="mt-2 text-2xl font-bold leading-tight text-zinc-900 outline-none dark:text-zinc-100">{titles[step]}</h2>
      {step === 0 && <div className="mt-3 space-y-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        <p>¡Hola{person?.name ? `, ${person.name}` : ''}! Aquí reconocemos los buenos hábitos al trabajar en Brain Studio.</p>
        <p>Cada mes sumas puntos por mantener tus pendientes y tu tiempo bien registrados. Tu avatar te acompaña y puedes ver cómo avanza el equipo.</p>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"><strong className="text-zinc-900 dark:text-zinc-100">Tres lugares para explorar</strong><p className="mt-1"><strong>Mi mes:</strong> tus puntos y hábitos.<br /><strong>Logros:</strong> tus insignias.<br /><strong>Equipo:</strong> las posiciones y los agradecimientos.</p></div>
        <p>Cada mes comienza una cuenta nueva. El resultado se valida al cierre del mes.</p>
      </div>}
      {step === 1 && <div className="mt-3 space-y-3 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
        <p>Cada hábito cumplido suma <strong>{HABIT_POINTS} puntos por día hábil</strong>: hasta {DAILY_HABITS.length * HABIT_POINTS} puntos diarios por hábitos, sin importar cuántas tareas tengas.</p>
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-3 dark:divide-white/10 dark:border-white/10 dark:bg-zinc-900">
          {DAILY_HABITS.map(habit => <li key={habit.key} className="py-2.5"><p className="flex justify-between gap-2 font-semibold text-zinc-900 dark:text-zinc-100"><span>{habit.label}</span><span className="text-brand-green-deep dark:text-brand-green">+{HABIT_POINTS}</span></p><p className="mt-1 text-xs leading-5">{habit.hint}</p></li>)}
        </ul>
        <p><strong>+{EXTRA_POINTS} extra:</strong> para quien registre la primera actividad desde las 8:00 a. m. de Bogotá. Llegar primero a tráfico suma {MEETING_POINTS} puntos, registrados por un administrador.</p>
        <p>Si un hábito no aplica, no suma ni resta. Cada reconocimiento obtenido, como «On fire», suma {RECOGNITION_POINTS} puntos.</p>
        <details className="rounded-xl border border-zinc-200 p-3 text-xs leading-5 dark:border-white/10"><summary className="cursor-pointer font-semibold">Los detalles de la medición</summary><ul className="mt-2 list-disc space-y-2 pl-4">
          <li>Reloj: cada tarea cerrada necesita al menos {MIN_MEASURED_MS / 60000} minutos medidos; no cuentan tiempos declarados, sesiones superpuestas o corregidas, ni sesiones de más de {FORGOTTEN_SESSION_MS / 3600000} horas.</li>
          <li>Al día usa la foto de las 6:00 a. m. A tiempo compara todos los cierres con fecha contra su fecha original; entregar ese mismo día también cuenta.</li>
          <li>Documentado revisa todas las tareas que creaste ese día: cada una necesita un comentario o archivo.</li>
          <li>El puntaje de hoy puede cambiar mientras trabajas. El día se guarda desde las 6:05 p. m., en horario de Bogotá.</li>
        </ul></details>
      </div>}
      {step === 2 && <div className="mt-3 space-y-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        <p>Cada semana podrás regalar <strong>{KUDOS_WEEKLY} puntos a una persona</strong> del equipo para agradecerle por alguna ayuda o reconocer su trabajo.</p>
        <div className="rounded-2xl border border-brand-magenta/20 bg-brand-magenta/5 p-4 dark:bg-brand-magenta/10"><p className="font-semibold text-zinc-900 dark:text-zinc-100">Equipo → 5 puntos para…</p><p className="mt-1">Elige a alguien y cuéntale por qué. Esa persona recibe +{KUDOS_VALUE} puntos. No se descuentan de tu puntaje.</p></div>
        <p>Puedes hacer un regalo a la semana. El cupo se renueva cada lunes y cada regalo que recibas suma.</p>
        <p className="text-xs">Puedes volver a esta explicación desde «Ver bienvenida».</p>
      </div>}
    </div>
    <div className="shrink-0 border-t border-zinc-200 pt-3 dark:border-white/10">
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        {step > 0 && <Button variant="ghost" disabled={busy} onClick={() => setStep(value => value - 1)}>Atrás</Button>}
        <Button className="flex-1 rounded-xl" disabled={busy} onClick={() => step < 2 ? setStep(value => value + 1) : onFinish('COMPLETED')}>{busy ? 'Guardando…' : step < 2 ? 'Siguiente' : '¡Vamos a sumar!'}<ArrowRight className="h-4 w-4" /></Button>
      </div>
      <button type="button" disabled={busy} onClick={() => onFinish('SKIPPED')} className="mt-1 min-h-10 w-full rounded-lg text-xs text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-zinc-400">Ver mi mes</button>
    </div>
  </section>;
}
