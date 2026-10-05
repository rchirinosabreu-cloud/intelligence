import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
    Bell,
    Calendar,
    Check,
    Clock,
    MessageSquare,
    Paperclip,
    Pause,
    PlayCircle,
    Plus,
    Star,
    Tag,
    Users
} from '@/components/ui/icons';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TeamAvatar from '@/components/ui/TeamAvatar';
import ClientAvatar from '@/components/ui/ClientAvatar';
import { cn } from '@/lib/utils';
import { formatElapsedTime } from '@/lib/taskTiming';
import {
    TASK_WORKER_STATE,
    closeSessionFor,
    collaboratorElapsedMs,
    isWorkingNow,
    openSessionFor,
    taskStatusFromSessions,
    taskTotalElapsedMs,
    workerBreakdown
} from '@/lib/taskCollaborators';
import '@/index.css';

// Co-responsables **dentro del tablero de Gestión** (Rodny, 29 de septiembre de 2026).
//
// El prototipo anterior enseñaba la regla en una pantalla suelta; este la enseña donde
// viviría: columnas `brain-glass` sobre `brain-ambient`, la tarjeta con su pestaña de
// prioridad y el panel de la tarea encima. Sirve para decidir la forma, no para ejecutar:
// las sesiones viven en memoria y se pierden al recargar. La lógica sí es la de verdad,
// la de `src/lib/taskCollaborators.js`, con sus pruebas.
//
// Lo único que este prototipo inventa sobre la plataforma de hoy es **la lista de
// personas de una tarea**. Todo lo demás ya existe: `TaskWorkSession` guarda `workerId`,
// así que el reloj por persona no es una tabla nueva, es una consulta distinta.

// La pestaña de prioridad se dibuja con las mismas dos curvas que `NativeTasks.jsx`.
// Están copiadas a propósito: esto es una muestra, no debe importar de la pantalla real
// ni obligar a exportar nada de ella todavía.
const TASK_TAB_FILL_PATH = 'M0,28 V10 A10,10 0 0 1 10,0 H68 C77,0 81,6 85,13 C89,20 93,24 100,24 V28 Z';
const TASK_TAB_STROKE_PATH = 'M0.5,28 V10 A9.5,9.5 0 0 1 10,0.5 H68 C77,0.5 81,6 85,13 C89,20 93,24 100,24';

const PRIORITY_COLOR = {
    URGENTE: 'text-destructive',
    ALTA: 'text-amber-600 dark:text-amber-400',
    NORMAL: 'text-blue-600 dark:text-blue-400'
};
const PRIORITY_LABEL = { URGENTE: 'Urgente', ALTA: 'Alta', NORMAL: 'Normal' };

const EQUIPO = {
    'u-rodny': { id: 'u-rodny', name: 'Rodny Chirinos', role: 'Director' },
    'u-melissa': { id: 'u-melissa', name: 'Melissa Ortega', role: 'Community Manager' },
    'u-bruno': { id: 'u-bruno', name: 'Bruno Salas', role: 'Diseñador' }
};

const RESPONSABLE = 'u-rodny';
const CO_RESPONSABLES = ['u-melissa', 'u-bruno'];
const EQUIPO_TAREA = [RESPONSABLE, ...CO_RESPONSABLES];

const ESTADO_PERSONA = {
    [TASK_WORKER_STATE.WORKING]: 'Trabajando ahora',
    [TASK_WORKER_STATE.PAUSED]: 'En pausa',
    [TASK_WORKER_STATE.NOT_STARTED]: 'No ha empezado'
};

const minutos = (n) => n * 60_000;

const COLUMNAS = [
    { id: 'pendiente', title: 'Pendiente', accent: 'bg-brand-cyan', canCreate: true },
    { id: 'en-proceso', title: 'En proceso', accent: 'bg-brand-yellow', canCreate: false },
    { id: 'realizado', title: 'Realizado', accent: 'bg-brand-green', canCreate: false }
];

// Dos tareas normales acompañan a la compartida: sin ellas no se ve qué cambia y qué no.
const TAREAS_FIJAS = [
    {
        id: 't-1',
        columna: 'pendiente',
        title: 'Carrusel de lanzamiento · septiembre',
        clientName: 'Clínica Norte',
        assignee: 'u-bruno',
        priority: 'NORMAL',
        dueLabel: '2 oct',
        snippet: 'Cinco láminas con los testimonios que envió la clínica. Revisar tipografía del cierre.',
        category: 'Diseño',
        complexity: 'MEDIA',
        attachments: 3,
        comments: 2
    },
    {
        id: 't-3',
        columna: 'realizado',
        title: 'Informe mensual de resultados',
        clientName: 'Villa Montaña',
        assignee: 'u-melissa',
        priority: 'NORMAL',
        dueLabel: '26 sep',
        snippet: 'Entregado con el comparativo de alcance frente a agosto.',
        category: 'Reportes',
        complexity: 'BAJA',
        attachments: 1,
        comments: 5
    }
];

const TAREA_COMPARTIDA = {
    id: 't-2',
    title: 'Parrilla de octubre · Villa Montaña',
    clientName: 'Corporación Villa Montaña',
    priority: 'ALTA',
    dueLabel: '3 oct',
    snippet: 'Doce piezas. Rodny graba y edita los reels; Melissa arma el resto y escribe los textos; Bruno hace las plantillas.',
    category: 'Parrilla',
    complexity: 'ALTA',
    attachments: 6,
    comments: 4
};

/** La pestaña de prioridad, igual que en el tablero. */
function PriorityTab({ id, priority }) {
    const color = PRIORITY_COLOR[priority];
    if (!color) return null;
    return (
        <span className={cn('absolute left-0 top-0 z-10 inline-flex h-7 min-w-[7.5rem] items-center pl-3.5 pr-9 text-[10px] font-bold uppercase tracking-wider', color)}>
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <linearGradient id={`tab-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
                        <stop offset="0.55" stopColor="currentColor" stopOpacity="0.06" />
                        <stop offset="0.85" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={TASK_TAB_FILL_PATH} className="fill-white dark:fill-zinc-900" />
                <path d={TASK_TAB_FILL_PATH} fill={`url(#tab-${id})`} />
                <path d={TASK_TAB_STROKE_PATH} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" className="stroke-zinc-200 dark:stroke-white/10" />
            </svg>
            <span className="relative flex items-center gap-1.5">
                <Tag className="h-3 w-3" />
                {PRIORITY_LABEL[priority]}
            </span>
        </span>
    );
}

function CardShell({ task, children, onClick }) {
    return (
        <div
            className={cn('relative mb-3 group/card', PRIORITY_COLOR[task.priority] && 'pt-6', onClick && 'cursor-pointer')}
            onClick={onClick}
        >
            <PriorityTab id={task.id} priority={task.priority} />
            <div className={cn(
                'relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white text-card-foreground shadow-sm transition-all duration-300 ease-out hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20',
                PRIORITY_COLOR[task.priority] && 'rounded-tl-none'
            )}>
                <div className="flex flex-col gap-4 p-5">{children}</div>
            </div>
        </div>
    );
}

/** Cliente encima del título, como la tarjeta real desde el 30 de septiembre de 2026. */
function ClientAndTitle({ task }) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2 pr-16">
                <ClientAvatar client={{ id: task.id, name: task.clientName }} size={20} />
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{task.clientName}</span>
            </div>
            <h4 className="text-sm font-bold leading-relaxed text-zinc-900 dark:text-zinc-50">{task.title}</h4>
        </div>
    );
}

function CardFooter({ task }) {
    return (
        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-4 dark:border-white/10">
            <div className="flex min-w-0 items-center gap-2">
                <span className="hidden items-center gap-1 text-[10px] font-semibold uppercase tracking-tight text-zinc-400 sm:inline-flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan" />
                    <span className="max-w-[110px] truncate">{task.category}</span>
                </span>
                <span className={cn(
                    'text-[10px] font-bold uppercase tracking-tight',
                    task.complexity === 'ALTA' ? 'text-destructive' : task.complexity === 'MEDIA' ? 'text-brand-cyan-deep dark:text-brand-cyan' : 'text-brand-green-deep dark:text-brand-green'
                )}>
                    {task.complexity}
                </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{task.attachments}</span>
                <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{task.comments}</span>
            </div>
        </div>
    );
}

/** Una tarea de siempre: un responsable, un reloj. Está aquí para comparar. */
function TarjetaNormal({ task }) {
    const persona = EQUIPO[task.assignee];
    return (
        <CardShell task={task}>
            <ClientAndTitle task={task} />
            <div className="flex items-center justify-between gap-3 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                    <TeamAvatar member={persona} size={20} showTitle={false} className="h-5 w-5 shrink-0" />
                    <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">{persona.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 font-medium text-zinc-500 dark:text-zinc-400">
                    <Calendar className="h-3.5 w-3.5" />
                    {task.dueLabel}
                </div>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{task.snippet}</p>
            <CardFooter task={task} />
        </CardShell>
    );
}

/**
 * La tarjeta de una tarea con co-responsables. Cambian **dos** cosas frente a la de
 * siempre: donde iba un nombre va la fila de personas, y junto al cronómetro aparece
 * cuántas están trabajando ahora mismo. Esa es la respuesta a «cómo saben los demás que
 * X está trabajando en algo»: se lee desde el tablero, sin abrir nada.
 */
function TarjetaCompartida({ task, sessions, now, onOpen }) {
    const estado = taskStatusFromSessions(sessions, task.baseStatus);
    const trabajando = EQUIPO_TAREA.filter((id) => isWorkingNow(sessions, id));
    const total = taskTotalElapsedMs(sessions, now);

    return (
        <CardShell task={task} onClick={onOpen}>
            {/* Como en la tarjeta real, la fila de distintivos solo existe si tiene algo que decir. */}
            {trabajando.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {(
                    <span
                        data-task-working-chip
                        title={`${trabajando.map((id) => EQUIPO[id].name.split(' ')[0]).join(' y ')} está${trabajando.length > 1 ? 'n' : ''} trabajando ahora`}
                        className="inline-flex items-center gap-1 rounded-lg border border-brand-cyan/30 bg-brand-cyan/10 px-1.5 py-0.5 text-[10px] font-bold text-brand-cyan-deep dark:text-brand-cyan"
                    >
                        <Users className="h-3 w-3" />
                        {trabajando.length === 1 ? '1 trabajando' : `${trabajando.length} trabajando`}
                    </span>
                )}
                {estado === 'EN_CURSO' && (
                    <span className="ml-0.5 text-[10px] font-bold uppercase tracking-tighter tabular-nums text-zinc-500">
                        {formatElapsedTime(total)}
                    </span>
                )}
            </div>
            )}

            <ClientAndTitle task={task} />

            {/* Donde antes iba un nombre, ahora va el equipo. El responsable primero. */}
            <div className="flex items-center justify-between gap-3 text-xs">
                <div
                    data-task-team
                    className="flex min-w-0 items-center gap-2"
                    title={`Responsable ${EQUIPO[RESPONSABLE].name} · con ${CO_RESPONSABLES.map((id) => EQUIPO[id].name).join(' y ')}`}
                >
                    <div className="flex shrink-0 -space-x-1.5">
                        {EQUIPO_TAREA.map((id) => (
                            <TeamAvatar
                                key={id}
                                member={EQUIPO[id]}
                                size={20}
                                showTitle={false}
                                className={cn(
                                    'h-5 w-5 shrink-0 ring-2 ring-white dark:ring-zinc-900',
                                    isWorkingNow(sessions, id) && 'ring-brand-cyan dark:ring-brand-cyan'
                                )}
                            />
                        ))}
                    </div>
                    <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">
                        {EQUIPO[RESPONSABLE].name.split(' ')[0]} +{CO_RESPONSABLES.length}
                    </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 font-medium text-zinc-500 dark:text-zinc-400">
                    <Calendar className="h-3.5 w-3.5" />
                    {task.dueLabel}
                </div>
            </div>

            <p className="line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{task.snippet}</p>
            <CardFooter task={task} />
        </CardShell>
    );
}

/** Una fila del equipo dentro del panel: reloj para todas, botón solo para la tuya. */
function FilaEquipo({ workerId, sessions, now, viendoComo, onToggle, cerrada }) {
    const persona = EQUIPO[workerId];
    const activo = isWorkingNow(sessions, workerId);
    const elapsed = collaboratorElapsedMs(sessions, workerId, now);
    const esResponsable = workerId === RESPONSABLE;
    const soyYo = workerId === viendoComo;
    const estado = activo ? TASK_WORKER_STATE.WORKING : elapsed > 0 ? TASK_WORKER_STATE.PAUSED : TASK_WORKER_STATE.NOT_STARTED;

    return (
        <li className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5',
            soyYo ? 'border-brand-cyan/40 bg-brand-cyan/5' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
        )}>
            <TeamAvatar member={persona} size={32} showTitle={false} className={cn('h-8 w-8', activo && 'ring-2 ring-brand-cyan ring-offset-1 ring-offset-white dark:ring-offset-zinc-900')} />
            {/* En el celular el nombre se queda con la fila y el reloj baja: si compartieran el ancho,
                el nombre quedaría en una letra. */}
            <div className="min-w-0 flex-1 basis-40">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-zinc-900 dark:text-white">
                    <span className="truncate">{persona.name}</span>
                    {esResponsable && (
                        <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            Responsable
                        </span>
                    )}
                    {soyYo && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-brand-cyan-deep dark:text-brand-cyan">tú</span>}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{persona.role} · {ESTADO_PERSONA[estado]}</p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className={cn(
                'shrink-0 font-mono text-sm font-semibold tabular-nums',
                activo ? 'text-brand-cyan-deep dark:text-brand-cyan' : elapsed > 0 ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400'
            )}>
                {formatElapsedTime(elapsed)}
            </span>
            {/* Cada quien arranca y para **su** reloj. Nadie mueve el de otro: por eso el
                botón solo aparece en tu propia fila. */}
            <div className="shrink-0 text-right sm:w-[104px]">
                {soyYo && !cerrada ? (
                    <button
                        type="button"
                        onClick={() => onToggle(workerId)}
                        className={cn(
                            'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors',
                            activo
                                ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                                : 'bg-brand-cyan text-white hover:bg-brand-cyan-deep'
                        )}
                    >
                        {activo ? <Pause className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                        {activo ? 'Pausar' : 'Empezar'}
                    </button>
                ) : null}
            </div>
            </div>
        </li>
    );
}

/** El panel de la tarea, con la sección nueva donde hoy hay un solo responsable. */
function PanelTarea({ open, onOpenChange, task, sessions, now, viendoComo, onToggle, cerrada, onCerrar }) {
    const total = taskTotalElapsedMs(sessions, now);
    const desglose = useMemo(() => workerBreakdown(sessions, now, EQUIPO_TAREA), [sessions, now]);
    const estado = cerrada ? 'REALIZADA' : taskStatusFromSessions(sessions, task.baseStatus);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* El foco se queda en el diálogo (regla de AGENTS.md): si cae en el primer botón, «Añadir
                co-responsable» se abre marcado como si se fuera a pulsar. */}
            <DialogContent className="max-w-3xl p-0 outline-none" onOpenAutoFocus={(event) => { event.preventDefault(); event.currentTarget.focus(); }}>
                <div className="border-b border-zinc-200 px-5 pb-4 pt-5 dark:border-zinc-800">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-white">{task.title}</DialogTitle>
                            <DialogDescription className="mt-1 text-xs text-zinc-500">
                                ID: {task.id} • Gestiona los metadatos y la conversación en tiempo real
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-3.5 pr-8">
                            <span className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-400 shadow-sm dark:border-zinc-800 dark:bg-zinc-900" title="Marcar como especial">
                                <Star size={14} />
                            </span>
                            <span className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-400 shadow-sm dark:border-zinc-800 dark:bg-zinc-900" title="Seguir tarea">
                                <Bell size={14} />
                            </span>
                        </div>
                    </div>
                </div>

                <div className="max-h-[70vh] space-y-6 overflow-y-auto bg-zinc-50 px-5 py-5 dark:bg-zinc-950">
                    {/* Los metadatos de siempre, en solo lectura: aquí no es lo que se discute. */}
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {[
                            ['Cliente', task.clientName],
                            ['Estado', estado === 'EN_CURSO' ? 'En proceso' : estado === 'REALIZADA' ? 'Realizada' : 'Pendiente'],
                            ['Deadline', task.dueLabel],
                            ['Prioridad', PRIORITY_LABEL[task.priority]]
                        ].map(([label, value]) => (
                            <div key={label}>
                                <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{label}</p>
                                <p className="mt-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{value}</p>
                            </div>
                        ))}
                    </div>

                    {/* LA SECCIÓN NUEVA. Hoy aquí hay un desplegable «Responsable» con una
                        sola persona; pasaría a ser el equipo de la tarea, con su reloj. */}
                    <section data-task-team-panel className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                                    <Users className="h-4 w-4 text-zinc-400" />
                                    Equipo de la tarea
                                </h3>
                                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                    Cada persona controla su propio tiempo. Que alguien empiece no arranca el reloj de los demás.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 text-xs font-medium text-zinc-500 transition-colors hover:border-brand-cyan hover:text-brand-cyan-deep dark:border-white/20 dark:text-zinc-400 dark:hover:text-brand-cyan"
                                title="En la versión real abriría la lista del equipo"
                            >
                                <Plus className="h-3.5 w-3.5" /> Añadir co-responsable
                            </button>
                        </div>

                        <ul className="mt-3 space-y-2">
                            {EQUIPO_TAREA.map((id) => (
                                <FilaEquipo
                                    key={id}
                                    workerId={id}
                                    sessions={sessions}
                                    now={now}
                                    viendoComo={viendoComo}
                                    onToggle={onToggle}
                                    cerrada={cerrada}
                                />
                            ))}
                        </ul>
                    </section>

                    {/* El mismo bloque «Tiempo de trabajo» del panel de hoy, pero diciendo
                        de quién es cada tramo en vez de una sola cifra. */}
                    <section data-task-work-history className="border-y border-zinc-200/70 py-3 dark:border-zinc-800/70">
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Tiempo de trabajo</p>
                        <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{formatElapsedTime(total)}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                            {sessions.length} {sessions.length === 1 ? 'sesión registrada' : 'sesiones registradas'} · {EQUIPO_TAREA.length} personas
                        </p>

                        <ul className="mt-3 space-y-2">
                            {desglose.map((fila) => (
                                <li key={fila.workerId} className="flex items-center gap-3 text-xs">
                                    <span className="w-36 shrink-0 truncate text-zinc-700 dark:text-zinc-200">{EQUIPO[fila.workerId].name}</span>
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800">
                                        <div
                                            className={cn('h-full rounded-full', fila.state === TASK_WORKER_STATE.WORKING ? 'bg-brand-cyan' : 'bg-zinc-400')}
                                            style={{ width: total > 0 ? `${Math.round((fila.elapsedMs / total) * 100)}%` : '0%' }}
                                        />
                                    </div>
                                    <span className="w-20 shrink-0 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-200">{formatElapsedTime(fila.elapsedMs)}</span>
                                    <span className="hidden w-28 shrink-0 text-right text-[11px] text-zinc-500 sm:inline">{ESTADO_PERSONA[fila.state]}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            disabled={viendoComo !== RESPONSABLE || cerrada}
                            onClick={onCerrar}
                            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-green px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-green-deep disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Check className="h-4 w-4" /> Marcar realizada
                        </button>
                        <p className="min-w-0 flex-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {viendoComo === RESPONSABLE
                                ? 'Eres el responsable: al cerrarla se paran todos los relojes, también el de quien siga trabajando.'
                                : 'Solo el responsable cierra la tarea. Esto es lo que falta decidir: ¿alcanza, o cada quien debería cerrar su parte?'}
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// Escenas para las capturas: `?como=u-rodny&trabajando=u-melissa,u-bruno&abierta&dark`.
const ESCENA = new URLSearchParams(location.search);
if (ESCENA.has('dark')) document.documentElement.classList.add('dark');

function Board() {
    const [sessions, setSessions] = useState(() => {
        const base = Date.now();
        const trabajando = (ESCENA.get('trabajando') || '').split(',').filter((id) => EQUIPO[id]);
        return [
            { id: 'h1', workerId: 'u-melissa', startedAt: new Date(base - minutos(200)), endedAt: new Date(base - minutos(170)), durationMs: minutos(30) },
            { id: 'h2', workerId: 'u-rodny', startedAt: new Date(base - minutos(120)), endedAt: new Date(base - minutos(100)), durationMs: minutos(20) },
            ...trabajando.map((id, index) => ({ id: `e-${id}`, workerId: id, startedAt: new Date(base - minutos(42 - index * 25)), endedAt: null, durationMs: null }))
        ];
    });
    const [now, setNow] = useState(() => new Date());
    const [viendoComo, setViendoComo] = useState(() => (EQUIPO[ESCENA.get('como')] ? ESCENA.get('como') : 'u-melissa'));
    const [abierta, setAbierta] = useState(() => ESCENA.has('abierta'));
    const [cerrada, setCerrada] = useState(false);

    // Un solo reloj para toda la pantalla: con uno por fila los segundos no van a la par.
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const alternar = (workerId) => setSessions((actuales) => (
        isWorkingNow(actuales, workerId)
            ? closeSessionFor(actuales, workerId, new Date())
            : openSessionFor(actuales, workerId, new Date())
    ));

    const cerrarTarea = () => {
        setSessions((actuales) => EQUIPO_TAREA.reduce((acc, id) => closeSessionFor(acc, id, new Date()), actuales));
        setCerrada(true);
    };

    const estadoCompartida = cerrada ? 'REALIZADA' : taskStatusFromSessions(sessions, 'PENDIENTE');
    const columnaCompartida = estadoCompartida === 'REALIZADA' ? 'realizado' : estadoCompartida === 'EN_CURSO' ? 'en-proceso' : 'pendiente';
    const tareaCompartida = { ...TAREA_COMPARTIDA, baseStatus: 'PENDIENTE' };

    return (
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            {/* Cabecera fija y translúcida, como la de la plataforma. */}
            <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-4 border-b border-zinc-200/70 bg-white/80 px-4 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/80 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                    <TeamAvatar member={EQUIPO[viendoComo]} size={32} showTitle={false} className="h-8 w-8" />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">Gestión</p>
                        <p className="truncate text-[11px] text-zinc-500">Tablero del equipo</p>
                    </div>
                </div>
                {/* Andamio de la muestra: en la plataforma real esto no existe, cada quien
                    entra con su cuenta. Está aquí para poder mirar la misma tarea con los
                    ojos de las tres personas. */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="hidden text-[11px] uppercase tracking-wider text-zinc-400 sm:inline">Viendo como</span>
                    {EQUIPO_TAREA.map((id) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setViendoComo(id)}
                            className={cn(
                                'min-h-11 rounded-lg border px-3 text-xs transition-colors',
                                viendoComo === id
                                    ? 'border-brand-cyan bg-brand-cyan/10 font-semibold text-brand-cyan-deep dark:text-brand-cyan'
                                    : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
                            )}
                        >
                            {EQUIPO[id].name.split(' ')[0]}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => document.documentElement.classList.toggle('dark')}
                        className="min-h-11 rounded-lg border border-zinc-300 px-3 text-xs dark:border-zinc-700"
                    >
                        Tema
                    </button>
                </div>
            </header>

            <main className="brain-ambient min-h-screen px-4 pb-10 pt-20 sm:px-6">
                <div className="mx-auto max-w-[1400px] space-y-6">
                    <div className="task-board-grid">
                        {COLUMNAS.map((col) => {
                            const fijas = TAREAS_FIJAS.filter((t) => t.columna === col.id);
                            const llevaCompartida = columnaCompartida === col.id;
                            const total = fijas.length + (llevaCompartida ? 1 : 0);
                            return (
                                <div key={col.id} className="brain-glass flex min-w-0 flex-col p-3">
                                    <div className="flex items-center justify-between gap-2 px-1 pb-3">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', col.accent)} aria-hidden="true" />
                                            <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">{col.title}</h3>
                                            <span data-column-count className="rounded-full bg-zinc-200/70 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                                                {total}
                                            </span>
                                        </div>
                                        {col.canCreate && (
                                            <button
                                                type="button"
                                                title="Nueva tarea"
                                                aria-label={`Nueva tarea en ${col.title}`}
                                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-zinc-400 transition-colors hover:border-brand-cyan hover:text-brand-cyan-deep dark:border-white/20 dark:text-zinc-500 dark:hover:text-brand-cyan"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="min-h-[100px] flex-1 space-y-3 rounded-xl p-1">
                                        {llevaCompartida && (
                                            <TarjetaCompartida
                                                task={tareaCompartida}
                                                sessions={sessions}
                                                now={now}
                                                onOpen={() => setAbierta(true)}
                                            />
                                        )}
                                        {fijas.map((task) => <TarjetaNormal key={task.id} task={task} />)}
                                        {total === 0 && (
                                            <div className="flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-zinc-200/80 text-sm text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                                                Sin tareas
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Nota de la muestra, no parte de la pantalla. */}
                    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-5 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
                        <p className="font-semibold text-zinc-900 dark:text-white">Muestra local · nada de esto toca la base de datos</p>
                        <ul className="mt-2 space-y-1.5 text-zinc-600 dark:text-zinc-300">
                            <li>· Abre <strong>«Parrilla de octubre · Villa Montaña»</strong>: es la única tarea con equipo. Las otras dos están para comparar.</li>
                            <li>· Dale «Empezar». La tarjeta se mueve a <strong>En proceso</strong> y aparece «1 trabajando», aunque los demás no hayan empezado.</li>
                            <li>· Cambia de persona arriba: solo ves el botón de <strong>tu</strong> fila. Nadie arranca ni para el reloj de otro.</li>
                            <li>· Como Melissa no puedes cerrarla; como Rodny sí. <strong>Eso es lo que falta decidir.</strong></li>
                        </ul>
                    </div>
                </div>
            </main>

            <PanelTarea
                open={abierta}
                onOpenChange={setAbierta}
                task={tareaCompartida}
                sessions={sessions}
                now={now}
                viendoComo={viendoComo}
                onToggle={alternar}
                cerrada={cerrada}
                onCerrar={cerrarTarea}
            />
        </div>
    );
}

createRoot(document.getElementById('root')).render(<Board />);
