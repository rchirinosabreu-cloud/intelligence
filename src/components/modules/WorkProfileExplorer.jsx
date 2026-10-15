import React, { useMemo, useState } from 'react';
import Select from '@/components/ui/Select';
import { cn } from '@/lib/utils';
import { profilePredictionProblem } from '@/lib/workPrediction';

const time = ms => { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const date = value => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' }).format(new Date(`${value}T12:00:00Z`));
const COMPLEXITY = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', UNKNOWN: 'Sin clasificar' };

export default function WorkProfileExplorer({ data }) {
  const [person, setPerson] = useState(''), [type, setType] = useState(''), [client, setClient] = useState(''), [complexity, setComplexity] = useState('');
  const [limit, setLimit] = useState(15), [hoursMode, setHoursMode] = useState('weeks');
  const profiles = data.profiles || [];
  const persons = useMemo(() => [...new Map([...profiles, ...(data.hours || [])].map(p => [p.personId, p.personName])).entries()].sort((a,b) => a[1].localeCompare(b[1], 'es')), [profiles, data.hours]);
  const clients = [...new Map(profiles.filter(p => p.clientId).map(p => [p.clientId, p.clientName || 'Cliente sin nombre'])).entries()].sort((a,b) => a[1].localeCompare(b[1], 'es'));
  const types = [...new Set(profiles.map(p => p.workType))].sort((a,b) => a.localeCompare(b,'es'));
  const filtered = profiles.filter(p => (!person || p.personId === person) && (!type || p.workType === type) && (!client || p.clientId === client) && (!complexity || (p.complexity || 'UNKNOWN') === complexity));
  const hourRows = (data.hours || []).filter(p => !person || p.personId === person).flatMap(p => (p[hoursMode] || []).map(cell => ({ ...cell, personId: p.personId, personName: p.personName, day: cell.day || cell.week }))).sort((a,b) => b.day.localeCompare(a.day) || a.personName.localeCompare(b.personName, 'es'));
  const selectClass = 'w-full';
  return <section data-context-profiles className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
    <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Cuánto suele tomar cada trabajo</h2>
    <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">Tiempos registrados por contexto. La mediana y el percentil 75 describen lo que ocurrió; no garantizan otra entrega. Las categorías amplias, las muestras escasas y los tiempos dispares quedan como solo registro. La complejidad es orientativa.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400"><span className="block">Persona</span><Select className={selectClass} aria-label="Persona del historial" value={person} onChange={e => { setPerson(e.target.value); setLimit(15); }}><option value="">Todo el equipo</option>{persons.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
      <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400"><span className="block">Tipo de trabajo</span><Select className={selectClass} aria-label="Tipo de trabajo del historial" value={type} onChange={e => { setType(e.target.value); setLimit(15); }}><option value="">Todos los tipos</option>{types.map(value => <option key={value} value={value}>{value}</option>)}</Select></label>
      <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400"><span className="block">Cliente</span><Select className={selectClass} aria-label="Cliente del historial" value={client} onChange={e => { setClient(e.target.value); setLimit(15); }}><option value="">Todos los clientes</option>{clients.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
      <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400"><span className="block">Complejidad</span><Select className={selectClass} aria-label="Complejidad del historial" value={complexity} onChange={e => { setComplexity(e.target.value); setLimit(15); }}><option value="">Todas las complejidades</option>{Object.entries(COMPLEXITY).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
    </div>
    {data.historyIncomplete && <p className="mt-3 text-xs text-brand-coral-deep dark:text-brand-coral">La consulta del historial está incompleta. No uses estos tiempos como un estándar.</p>}
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="text-zinc-500 dark:text-zinc-400"><tr>{['Persona / trabajo','Cliente / complejidad','Promedio registrado','Mediana registrada','75 % registrado','Muestra'].map(label => <th key={label} className="px-2 pb-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {filtered.slice(0,limit).map(p => <tr data-context-profile-row key={JSON.stringify([p.personId,p.workType,p.clientId,p.complexity])} className="text-zinc-700 dark:text-zinc-200"><td className="px-2 py-3"><span className="block font-medium">{p.personName}</span>{p.workType}</td><td className="px-2 py-3">{p.clientName || 'Sin cliente'}<span className="block text-zinc-500 dark:text-zinc-400">{COMPLEXITY[p.complexity] || COMPLEXITY.UNKNOWN}</span></td><td className="px-2 py-3 tabular-nums">{p.measured ? time(p.meanMs) : 'Sin medición válida'}</td><td className="px-2 py-3 tabular-nums">{p.measured ? time(p.medianMs) : 'Sin medición válida'}</td><td className="px-2 py-3 tabular-nums">{p.measured ? time(p.p75Ms) : 'Sin medición válida'}</td><td className="px-2 py-3">{p.measured} de {p.closed} medidas{profilePredictionProblem(p) && <span className="block text-brand-yellow-deep dark:text-brand-yellow">Solo registro</span>}</td></tr>)}
    </tbody></table></div>
    {!filtered.length && <p className="py-5 text-sm text-zinc-600 dark:text-zinc-400">No hay mediciones para esta combinación. Amplía un filtro; no se inventan tiempos para completarla.</p>}
    {filtered.length > limit && <button type="button" onClick={() => setLimit(n => n + 15)} className="mt-2 min-h-11 text-xs font-medium text-brand-cyan-deep dark:text-brand-cyan">Ver más combinaciones ({filtered.length - limit})</button>}
    <details className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800"><summary className="cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200">Horas registradas por día y semana</summary>
      <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">Solo se filtran por persona y por el periodo del historial. Tiempo repartido en las fechas en que ocurrió, incluido trabajo abierto. Las declaraciones se muestran aparte; relojes simultáneos u olvidados se excluyen.</p>
      {data.hoursIncomplete && <p className="mt-2 text-xs text-brand-coral-deep dark:text-brand-coral">Faltan sesiones en la consulta: estos totales son parciales.</p>}
      <div className="mt-3 flex gap-1">{[['days','Por día'],['weeks','Por semana']].map(([value,label]) => <button type="button" key={value} aria-pressed={hoursMode === value} onClick={() => setHoursMode(value)} className={cn('min-h-11 rounded-lg px-3 text-xs font-medium', hoursMode === value ? 'bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50' : 'text-zinc-600 dark:text-zinc-400')}>{label}</button>)}</div>
      <div className="mt-2 max-h-80 overflow-auto" data-recorded-work-hours><table className="w-full min-w-[400px] text-left text-xs"><thead className="text-zinc-500 dark:text-zinc-400"><tr><th className="py-2 font-medium">Persona</th><th className="py-2 font-medium">{hoursMode === 'days' ? 'Día' : 'Semana desde'}</th><th className="py-2 font-medium">Cronometrado</th><th className="py-2 font-medium">Declarado</th></tr></thead><tbody>{hourRows.map(row => <tr key={`${row.personId}-${row.day}`} className="border-t border-zinc-100 text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"><td className="py-2 pr-2">{row.personName}</td><td className="py-2 pr-2">{date(row.day)}</td><td className="py-2 tabular-nums">{time(row.measuredMs)}</td><td className="py-2 tabular-nums">{time(row.declaredMs)}</td></tr>)}</tbody></table>{!hourRows.length && <p className="py-4 text-xs text-zinc-500 dark:text-zinc-400">No hay sesiones válidas registradas en el periodo.</p>}</div>
    </details>
  </section>;
}
