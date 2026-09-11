import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from '@/App';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import { RecognitionContext } from '@/components/recognitions/RecognitionContext';
import RecognitionNotice from '@/components/recognitions/RecognitionNotice';
import { mergeRecognitions, recognitionMessages } from '@/lib/recognitionPresentation';
import { markTaskTimingTutorialSeen, markTaskTimingTutorialAfternoonSeen } from '@/lib/taskTiming';
import { recognitionDemoUser, recognitionSamples, recognitionScenarios } from './recognitionData';
import '@/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// This entry is served ONLY by the isolated preview server. Never loaded by src/main.jsx.
const previousToken = localStorage.getItem('authToken');
if (previousToken && !previousToken.endsWith('.recognition-local')) {
  throw new Error('Este origen ya tiene una sesión. Usa un puerto distinto para no sustituirla.');
}
localStorage.setItem('authToken', `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 }))}.recognition-local`);
localStorage.setItem('currentUser', JSON.stringify(recognitionDemoUser));
markTaskTimingTutorialSeen(localStorage, recognitionDemoUser.id);
markTaskTimingTutorialAfternoonSeen(localStorage, recognitionDemoUser.id);

const buttonClass = 'min-h-11 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';
function Laboratory() {
  const [events, setEvents] = useState(recognitionSamples);
  const [notice, setNotice] = useState(null);
  const [style, setStyle] = useState('subtle');
  const [keepVisible, setKeepVisible] = useState(true);
  const simulate = (kind, description) => {
    // Replaying this scenario replaces the sample team opener, not a second winner.
    const event = { id: kind === 'FIRST_TASK' ? 'demo-first' : `demo-rodny-${kind}`, kind, taskId: kind === 'PLAN_APPROVED' ? undefined : 'recognition-completed-rodny', planId: kind === 'PLAN_APPROVED' ? 'recognition-demo-plan' : undefined, recipient: recognitionDemoUser, description, personalMessage: recognitionMessages[kind], occurredAt: new Date().toISOString(), demo: true, presentationId: crypto.randomUUID() };
    setEvents(current => mergeRecognitions(current, [event]));
    setNotice(event);
  };
  const controls = <section aria-label="Laboratorio de reconocimientos" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Laboratorio local · Reconocimientos</p><p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">Datos de ejemplo. Sin conexión a producción. Dashboard y Gestión disponibles para explorar.</p></div>
      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">Estilo del aviso<select aria-label="Estilo del aviso" value={style} onChange={event => setStyle(event.target.value)} className="min-h-11 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-900 focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"><option value="subtle">Sutil</option><option value="celebration">Celebración</option><option value="quiet">Sin movimiento</option></select></label>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {recognitionScenarios.map(scenario => <button key={scenario.kind} className={buttonClass} aria-label={scenario.button} onClick={() => simulate(scenario.kind, scenario.description)}>{scenario.button}</button>)}
      <button className={buttonClass} onClick={() => { setEvents(recognitionSamples()); setNotice(null); }}>Reiniciar muestra</button>
      <label className="flex min-h-11 items-center gap-2 px-1 text-xs text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={keepVisible} onChange={event => setKeepVisible(event.target.checked)} className="h-4 w-4 accent-teal-700" />Mantener aviso visible</label>
    </div>
  </section>;
  return <RecognitionContext.Provider value={{ events, demo: true, controls }}><App /><RecognitionNotice event={notice} style={style} onDismiss={() => setNotice(null)} durationMs={keepVisible ? 0 : 9000} /></RecognitionContext.Provider>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><MotionConfig reducedMotion="user"><ConfirmDialogProvider><Laboratory /></ConfirmDialogProvider></MotionConfig></React.StrictMode>);
