import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TeamAvatar from '../../src/components/ui/TeamAvatar';
import { formatElapsedTime } from '../../src/lib/taskTiming';
import {
    TASK_WORKER_STATE,
    closeSessionFor,
    collaboratorElapsedMs,
    isWorkingNow,
    openSessionFor,
    taskStatusFromSessions,
    taskTotalElapsedMs,
    workerBreakdown
} from '../../src/lib/taskCollaborators';
import '../../src/index.css';

// Prototipo local de co-responsables (Rodny, 28 de septiembre de 2026). Nada de esto
// toca el servidor ni la base de datos: las sesiones viven en memoria y se pierden al
// recargar. Lo que sí es real es **la lógica**: los relojes salen de
// `src/lib/taskCollaborators.js`, el mismo módulo que tiene sus pruebas.
//
// Sirve para decidir una sola cosa: si «cada quien con su reloj, un solo responsable que
// cierra» alcanza, o si hace falta que cada uno cierre su parte.

const EQUIPO = {
    'u-rodny': { id: 'm-rodny', name: 'Rodny Chirinos', role: 'Director' },
    'u-melissa': { id: 'm-melissa', name: 'Melissa', role: 'Community Manager' },
    'u-bruno': { id: 'm-bruno', name: 'Bruno', role: 'Diseñador' }
};

const RESPONSABLE = 'u-rodny';
const CO_RESPONSABLES = ['u-melissa', 'u-bruno'];
const TODOS = [RESPONSABLE, ...CO_RESPONSABLES];

const ESTADO_TEXTO = {
    [TASK_WORKER_STATE.WORKING]: 'Trabajando ahora',
    [TASK_WORKER_STATE.PAUSED]: 'En pausa',
    [TASK_WORKER_STATE.NOT_STARTED]: 'No ha empezado'
};

const minutos = (n) => n * 60_000;

function Reloj({ sessions, workerId, now }) {
    const elapsed = collaboratorElapsedMs(sessions, workerId, now);
    const activo = isWorkingNow(sessions, workerId);
    return (
        <span className={`tabular-nums text-sm font-semibold ${activo ? 'text-primary' : elapsed > 0 ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400'}`}>
            {formatElapsedTime(elapsed)}
        </span>
    );
}

function FilaPersona({ workerId, sessions, now, esResponsable, onToggle, viendoComo }) {
    const persona = EQUIPO[workerId];
    const activo = isWorkingNow(sessions, workerId);
    const soyYo = viendoComo === workerId;

    return (
        <li className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${soyYo ? 'border-primary/40 bg-primary/5' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'}`}>
            <TeamAvatar member={persona} size={32} />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                    {persona.name}
                    {esResponsable && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:bg-zinc-800">Responsable</span>}
                    {soyYo && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-primary">tú</span>}
                </p>
                <p className="text-xs text-zinc-500">{ESTADO_TEXTO[activo ? TASK_WORKER_STATE.WORKING : collaboratorElapsedMs(sessions, workerId, now) > 0 ? TASK_WORKER_STATE.PAUSED : TASK_WORKER_STATE.NOT_STARTED]}</p>
            </div>
            <Reloj sessions={sessions} workerId={workerId} now={now} />
            <button
                type="button"
                onClick={() => onToggle(workerId)}
                className={`min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold transition ${activo
                    ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
            >
                {activo ? 'Parar' : 'Empezar'}
            </button>
        </li>
    );
}

function Prototipo() {
    // Arranca con algo de historia, para que el desglose no salga vacío.
    const [sessions, setSessions] = useState(() => {
        const base = Date.now();
        return [
            { id: 'h1', workerId: 'u-melissa', startedAt: new Date(base - minutos(200)), endedAt: new Date(base - minutos(170)), durationMs: minutos(30) },
            { id: 'h2', workerId: 'u-rodny', startedAt: new Date(base - minutos(120)), endedAt: new Date(base - minutos(100)), durationMs: minutos(20) }
        ];
    });
    const [now, setNow] = useState(() => new Date());
    const [viendoComo, setViendoComo] = useState('u-melissa');
    const [cerrada, setCerrada] = useState(false);

    // Un solo reloj para toda la pantalla: si cada fila tuviera el suyo, los segundos
    // no irían acompasados.
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const estado = cerrada ? 'REALIZADA' : taskStatusFromSessions(sessions, 'PENDIENTE');
    const desglose = useMemo(() => workerBreakdown(sessions, now, TODOS), [sessions, now]);
    const total = taskTotalElapsedMs(sessions, now);

    const alternar = (workerId) => setSessions((actuales) => (
        isWorkingNow(actuales, workerId)
            ? closeSessionFor(actuales, workerId, new Date())
            : openSessionFor(actuales, workerId, new Date())
    ));

    return (
        <div className="min-h-screen bg-zinc-50 p-4 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 text-sm dark:border-zinc-700">
                    <p>Prototipo local · sesiones en memoria · no toca la base de datos</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-zinc-500">Viendo como:</span>
                        {TODOS.map((id) => (
                            <button key={id} type="button" onClick={() => setViendoComo(id)}
                                className={`min-h-11 rounded-lg border px-3 text-xs ${viendoComo === id ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-zinc-300 dark:border-zinc-700'}`}>
                                {EQUIPO[id].name.split(' ')[0]}
                            </button>
                        ))}
                        <button type="button" onClick={() => document.documentElement.classList.toggle('dark')}
                            className="min-h-11 rounded-lg border border-zinc-300 px-3 text-xs dark:border-zinc-700">Tema</button>
                    </div>
                </div>

                {/* La tarjeta, como se vería en el tablero */}
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold">Video institucional · Villa Montaña</h2>
                            <p className="mt-1 text-sm text-zinc-500">Corporación Villa Montaña · vence el 3 de octubre</p>
                        </div>
                        <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${estado === 'EN_CURSO' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : estado === 'REALIZADA' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>
                            {estado === 'EN_CURSO' ? 'En proceso' : estado === 'REALIZADA' ? 'Realizada' : 'Pendiente'}
                        </span>
                    </div>

                    <p className="mt-4 text-xs text-zinc-500">
                        La tarjeta se ve «En proceso» porque <strong className="text-zinc-700 dark:text-zinc-200">alguien</strong> está trabajando, no porque lo estén todos.
                        Tiempo total de la tarea: <strong className="tabular-nums text-zinc-700 dark:text-zinc-200">{formatElapsedTime(total)}</strong>
                    </p>

                    <ul className="mt-4 space-y-2">
                        {TODOS.map((id) => (
                            <FilaPersona key={id} workerId={id} sessions={sessions} now={now}
                                esResponsable={id === RESPONSABLE} onToggle={alternar} viendoComo={viendoComo} />
                        ))}
                    </ul>

                    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                        <button type="button" disabled={viendoComo !== RESPONSABLE || cerrada}
                            onClick={() => { setSessions((s) => TODOS.reduce((acc, id) => closeSessionFor(acc, id, new Date()), s)); setCerrada(true); }}
                            className="min-h-11 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-40">
                            Marcar realizada
                        </button>
                        <p className="text-xs text-zinc-500">
                            {viendoComo === RESPONSABLE
                                ? 'Eres el responsable: tú la cierras, y al cerrarla se paran todos los relojes.'
                                : 'Solo el responsable puede cerrarla. Esto es lo que hay que decidir: ¿te alcanza, o cada quien debería cerrar su parte?'}
                        </p>
                    </div>
                </div>

                {/* El historial, que es lo que cambia de verdad */}
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <h3 className="text-sm font-semibold">Quién puso cuánto</h3>
                    <p className="mt-1 text-xs text-zinc-500">Hoy el historial diría solo «{formatElapsedTime(total)}». Esto es lo que se gana.</p>
                    <ul className="mt-3 space-y-2">
                        {desglose.map((fila) => (
                            <li key={fila.workerId} className="flex items-center gap-3 text-sm">
                                <span className="w-40 shrink-0 truncate">{EQUIPO[fila.workerId].name}</span>
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                                    <div className={`h-full rounded-full ${fila.state === TASK_WORKER_STATE.WORKING ? 'bg-primary' : 'bg-zinc-400'}`}
                                        style={{ width: total > 0 ? `${Math.round((fila.elapsedMs / total) * 100)}%` : '0%' }} />
                                </div>
                                <span className="w-24 shrink-0 text-right tabular-nums">{formatElapsedTime(fila.elapsedMs)}</span>
                                <span className="w-32 shrink-0 text-right text-xs text-zinc-500">{ESTADO_TEXTO[fila.state]}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="rounded-2xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                    <p className="font-semibold text-zinc-900 dark:text-white">Qué probar</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                        <li>Dale «Empezar» a Melissa. La tarjeta pasa a «En proceso» y solo corre su reloj.</li>
                        <li>Mira el de Rodny: sigue en 00:20:00, su tiempo de antes. No se movió.</li>
                        <li>Dale «Empezar» también a Rodny: dos relojes corriendo a la vez sobre la misma tarea.</li>
                        <li>Cambia de persona arriba: cada quien ve su propio botón resaltado.</li>
                        <li>Como Melissa, intenta cerrarla. No puedes: solo el responsable cierra.</li>
                    </ol>
                </div>
            </div>
        </div>
    );
}

createRoot(document.getElementById('root')).render(<Prototipo />);
