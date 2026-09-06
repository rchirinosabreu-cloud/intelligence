import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BriaClientCriteria from '../../src/components/modules/ContentPlan/BriaClientCriteria';
import BriaScoreDetails from '../../src/components/modules/ContentPlan/BriaScoreDetails';
import '../../src/index.css';

function Pilot() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [dark, setDark] = useState(false);
  useEffect(() => { fetch('/api/demo').then(response => { if (!response.ok) throw new Error('Inicia el servidor local del piloto.'); return response.json(); }).then(setData).catch(error => { console.error(error); setError(error.message); }); }, []);
  const changeViewer = async event => {
    try {
      const response = await fetch('/api/demo/viewer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewer: event.target.value }) });
      if (!response.ok) throw new Error('No se pudo cambiar de usuario de ejemplo.');
      const result = await response.json(); setData(value => ({ ...value, ...result }));
    } catch (error) { console.error(error); setError(error.message); }
  };
  return <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-10"><div className="mx-auto max-w-4xl space-y-6">
    <p className="text-sm text-zinc-600 dark:text-zinc-300">Piloto local · datos ficticios · base de pruebas aislada</p>
    <h1 className="text-2xl font-semibold">Bria aprende con criterio</h1>
    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">Prueba la propuesta, aprobación y revocación de reglas para un cliente. Las decisiones se guardan en PostgreSQL local. El desglose del puntaje es una muestra ficticia del cálculo candidato, no una valoración real.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {data && <>
      <div className="flex flex-wrap items-end gap-4"><label className="grid gap-2 text-sm font-medium">Probar como<select value={data.selected} onChange={changeViewer} className="min-h-11 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">{data.viewers.map(viewer => <option key={viewer}>{viewer}</option>)}</select></label><button className="min-h-11 rounded-xl border border-zinc-200 px-4 text-sm dark:border-zinc-700" onClick={() => { setDark(!dark); document.documentElement.classList.toggle('dark', !dark); }}>{dark ? 'Modo claro' : 'Modo oscuro'}</button></div>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="mb-2 font-semibold">Cliente de ejemplo · septiembre 2026</h2><p className="mb-5 text-sm text-zinc-600 dark:text-zinc-300">Una decisión editorial compartida y un puntaje que se puede explicar.</p><div className="flex flex-wrap gap-3"><BriaClientCriteria key={data.selected} planId={data.planId} /><BriaScoreDetails review={data.review} /></div></section>
    </>}
  </div></main>;
}
createRoot(document.getElementById('root')).render(<Pilot />);
