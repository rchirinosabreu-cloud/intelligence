import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import RunnerAvatar from './RunnerAvatar';
import { LeaguePoseContext } from './LeaguePoseContext';
import { CAMERA_POINTS, HABIT_POINTS, EXTRA_POINTS, KUDOS_WEEKLY, MEETING_POINTS, RECOGNITION_POINTS } from '@/lib/platformLeague';
import { PRODUCTION_DAY_EFFORT } from '@/lib/leagueAreaChecks';

// Recorrido de la primera vez (Rodny, 21 de noviembre de 2026: «que sea interactivo esa primera vez, con movimiento de
// los avatars y explicando lo nuevo … breve y dinámico»). Un paso por idea; quien vuelve a abrir la liga ya no lo ve y
// «Ver bienvenida» enseña el resumen fijo de `LeagueWelcome`.
const WAVE = 1, CELEBRATE = 2;
// El empujón de cierre es de noviembre de 2026: quien conozca la liga después del lunes 30 ve el texto de siempre.
const LAST_WEEK = Date.now() < Date.parse('2026-12-01T05:00:00Z');
const people = keys => keys.map(([key, name]) => ({ pixelAvatarKey: key, name }));
const steps = [
  { id: 'inicio', eyebrow: 'La liga del mes', title: 'El buen trabajo suma', pose: WAVE, tone: 'bg-brand-cyan/10',
    cast: people([['elisa', 'Elisa'], ['jesu', 'Jesu'], ['rodny', 'Rodny'], ['helen', 'Helen'], ['melissa', 'Melissa']]),
    lead: LAST_WEEK ? 'Ya estamos en la última semana de noviembre. ¡A darla toda para terminar en el podio!' : 'Cada día cuenta para terminar el mes en el podio.',
    text: 'Desde el lunes 23 hay reglas nuevas. Te las contamos en un minuto.', next: 'Ver lo nuevo' },
  { id: 'area', eyebrow: 'Nuevo', title: 'Tu área también suma', pose: CELEBRATE, tone: 'bg-brand-green/10',
    cast: people([['elisa', 'Elisa'], ['brayan', 'Brayan'], ['francys', 'Francys']]),
    text: 'El trabajo de cada área ya cuenta como esfuerzo, con el mismo tope de 10 puntos al día.',
    chips: [['Registro en Financiero', '+½'], ['Con su soporte', '+1'], ['Gestión en el CRM', '+1'], ['Jornada con evidencia', `+${PRODUCTION_DAY_EFFORT}`]] },
  { id: 'cierre', eyebrow: 'Cambia', title: 'Al día cierra a las 5:00 p. m.', pose: WAVE, tone: 'bg-brand-yellow/15',
    cast: people([['david', 'David'], ['kamila', 'Kamila']]),
    text: 'Lo ganas si a esa hora no tienes nada vencido. Mover la fecha ese mismo día no cuenta.',
    chips: [['Al día a las 5:00 p. m.', `+${HABIT_POINTS}`]],
    note: 'Cada hábito se mide con el trabajo de tu área: el que no te aplica no juega en tu día.' },
  { id: 'camara', eyebrow: 'Nuevo', title: 'Cámara encendida en tráfico', pose: WAVE, tone: 'bg-brand-magenta/10',
    cast: people([['sara', 'Sara'], ['francisco', 'Francisco'], ['mariceth', 'Mariceth']]),
    text: 'Enciende la cámara en la reunión de tráfico. Un administrador la marca al terminar.',
    chips: [['Cámara encendida, una vez por semana', `+${CAMERA_POINTS}`]] },
  { id: 'anticipada', eyebrow: 'Cambia', title: 'Entrega anticipada', pose: CELEBRATE, tone: 'bg-brand-cyan/10',
    cast: people([['keila', 'Keila'], ['melissa', 'Melissa']]),
    text: 'Entregar antes de la fecha sigue premiando, ahora con un tope de 7 puntos al día.',
    chips: [['La primera del día', '+5'], ['La segunda', '+2'], ['Las demás', '+0']] },
  { id: 'final', eyebrow: 'Sigue igual', title: LAST_WEEK ? 'Queda una semana' : 'Y lo de siempre', pose: CELEBRATE, tone: 'bg-brand-yellow/15',
    cast: people([['helen', 'Helen'], ['rodny', 'Rodny'], ['jesu', 'Jesu']]),
    text: LAST_WEEK ? 'Lo demás no cambia. El mes cierra el lunes 30 y el podio todavía se puede mover.' : 'Lo demás no cambia, y la liga empieza de cero cada mes.',
    chips: [['Hábito cumplido', `+${HABIT_POINTS}`], ['Primera actividad del día', `+${EXTRA_POINTS}`], ['Primero en tráfico', `+${MEETING_POINTS}`], ['Cada logro', `+${RECOGNITION_POINTS}`], ['Regalo semanal', `+${KUDOS_WEEKLY}`]],
    next: '¡A darla toda!' },
];

const LARGEST_CAST = Math.max(...steps.map(item => item.cast.length));

export default function LeagueTour({ busy, error, onFinish }) {
  const [index, setIndex] = useState(0);
  const heading = useRef(null);
  // Todos los pasos miden lo mismo (Rodny, 21 de noviembre de 2026: «unifica todos los tamaños … que sea consistente»):
  // los textos de los seis pasos se apilan en la misma celda y la más alta fija el alto, así el escenario, que ocupa
  // lo que sobra («queda demasiado espacio debajo»), no cambia de un paso a otro. Los avatares usan un solo tamaño,
  // el que cabe con el reparto más numeroso, y los puntos van siempre debajo del texto.
  const stage = useRef(null);
  const [stageBox, setStageBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setStageBox({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const step = steps[index], last = index === steps.length - 1;
  useEffect(() => { heading.current?.focus(); }, [index]);
  const go = delta => setIndex(value => Math.min(steps.length - 1, Math.max(0, value + delta)));
  const forward = () => (last ? onFinish('COMPLETED') : go(1));
  const onKeyDown = event => {
    if (event.key === 'ArrowRight' && !last) go(1);
    if (event.key === 'ArrowLeft') go(-1);
  };
  // Cada avatar ocupa unos tres cuartos de su alto: el tamaño es el que deja caber a lo ancho al reparto más grande.
  const room = (stageBox.width - 24 - 12 * (LARGEST_CAST - 1)) / LARGEST_CAST / 0.78;
  const avatarSize = Math.round(Math.max(44, Math.min(120, stageBox.height * 0.62, room || 120)));
  return <section data-league-welcome data-league-tour data-tour-step={step.id} onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col px-5 pb-5">
    <div data-welcome-content className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-4 custom-scrollbar">
      <div className="flex min-h-full flex-col">
        <div ref={stage} data-tour-stage className={cn('relative mt-2 min-h-20 flex-1 basis-0 overflow-hidden rounded-3xl transition-colors duration-300 motion-reduce:transition-none', step.tone)}>
          {/* El reparto va fuera del flujo: así el alto del escenario es solo el espacio que sobra y no depende del avatar. */}
          <div key={step.id} className="league-tour-in absolute inset-0 flex items-end justify-center gap-3 px-3">
            <LeaguePoseContext.Provider value={step.pose}>
              {stageBox.height > 0 && step.cast.map((person, order) => <RunnerAvatar key={person.pixelAvatarKey} person={person} size={avatarSize} phase={order} title={person.name} className="mb-2" />)}
            </LeaguePoseContext.Provider>
          </div>
        </div>
        <div className="grid shrink-0">
          {steps.map(item => {
            const current = item.id === step.id;
            return <div key={item.id} data-tour-text={item.id} aria-hidden={current ? undefined : true} className={cn('col-start-1 row-start-1 min-w-0', current ? 'league-tour-in' : 'invisible')}>
              <p className="mt-4 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan">{item.eyebrow}</p>
              <h2 ref={current ? heading : undefined} tabIndex={-1} className="mt-1 text-2xl font-bold leading-tight text-zinc-900 outline-none dark:text-zinc-100">{item.title}</h2>
              {item.lead && <p className="mt-3 text-base font-semibold leading-6 text-zinc-900 dark:text-zinc-100">{item.lead}</p>}
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.text}</p>
              {item.chips && <ul className="mt-3 flex flex-wrap gap-1.5">
                {item.chips.map(([label, points], order) => <li key={label} style={{ animationDelay: `${150 + order * 90}ms` }} className={cn('flex max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white py-1.5 pl-3 pr-2.5 text-xs text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200', current && 'league-tour-pop')}>
                  <span className="min-w-0">{label}</span><span className="shrink-0 text-sm font-bold text-brand-green-deep dark:text-brand-green">{points}</span>
                </li>)}
              </ul>}
              {item.note && <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{item.note}</p>}
            </div>;
          })}
        </div>
      </div>
    </div>
    <div className="shrink-0 border-t border-zinc-200 pt-3 dark:border-white/10">
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="mb-3 flex justify-center gap-1.5" role="group" aria-label={`Paso ${index + 1} de ${steps.length}`}>
        {steps.map((item, order) => <button key={item.id} type="button" aria-label={`Ir al paso ${order + 1}: ${item.title}`} aria-current={order === index ? 'step' : undefined} onClick={() => setIndex(order)}
          className="flex h-6 items-center outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"><span className={cn('block h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none', order === index ? 'w-6 bg-brand-cyan-deep dark:bg-brand-cyan' : 'w-1.5 bg-zinc-300 dark:bg-zinc-700')} /></button>)}
      </div>
      <div className="flex gap-2">
        {index > 0 && <Button variant="outline" className="rounded-xl" disabled={busy} onClick={() => go(-1)} aria-label="Paso anterior"><ArrowLeft className="h-4 w-4" /></Button>}
        <Button className="flex-1 rounded-xl" disabled={busy} onClick={forward}>{busy ? 'Guardando…' : step.next || 'Siguiente'}<ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  </section>;
}
