import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ImportantNoticeBand from '@/components/notifications/ImportantNoticeBand';
import DashboardAnnouncements from '@/components/modules/DashboardAnnouncements';
import '@/index.css';

async function request(path, body, method = 'POST') {
  const r = await fetch(path, body ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await r.json(); if (!r.ok) throw new Error(data.error); return data;
}
function Preview() {
  const client = useQueryClient(), [dark, setDark] = useState(false), [note, setNote] = useState(''), [height, setHeight] = useState(0);
  const { data } = useQuery({ queryKey: ['personal-dashboard'], queryFn: () => request('/api/preview/state'), refetchInterval: 2000 });
  const refresh = () => client.invalidateQueries();
  const mutate = async (url, body, method) => { const result = await request(url, body, method); await refresh(); return result; };
  return <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-8 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <strong className="text-xl">Brainstudio</strong><p className="text-sm text-zinc-500">Muestra local · datos ficticios</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <button className="min-h-11" onClick={() => { setDark(!dark); document.documentElement.classList.toggle('dark', !dark); }}>{dark ? 'Tema claro' : 'Tema oscuro'}</button>
        <button className="min-h-11" onClick={() => mutate('/api/preview/actor', { manager: data?.actor.role !== 'ADMIN' })}>{data?.actor.role === 'ADMIN' ? 'Ver como destinataria' : 'Ver como emisor'}</button>
        <button className="min-h-11 rounded-xl border border-zinc-200 px-4 dark:border-zinc-700" onClick={() => mutate('/api/preview/new', {})}>Nuevo ejemplo</button>
      </div>
    </header>
    <main className="mx-auto max-w-6xl space-y-6 p-6 sm:p-10" style={{ paddingBottom: height + 40 }}>
      <div><p className="text-sm text-zinc-500">Gestión / Mi trabajo</p><h1 className="mt-2 text-3xl font-bold">Tu trabajo sigue aquí</h1><p className="mt-2 text-zinc-500">{data?.actor.name} · Abre el anuncio y vuelve a esta misma pantalla.</p></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="mb-4 text-lg font-semibold">Pendientes de hoy</h2>
          {['Revisar las piezas del cliente', 'Preparar la próxima jornada'].map(title => <div key={title} className="mb-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"><p>{title}</p><span className="mt-2 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800">Pendiente</span></div>)}
          <label className="mt-5 block text-sm">Nota en edición<textarea aria-label="Nota en edición" value={note} onChange={e => setNote(e.target.value)} placeholder="Escribe algo para comprobar que no se pierde al abrir el anuncio…" className="mt-2 min-h-24 w-full rounded-xl border border-zinc-200 bg-transparent p-3 dark:border-zinc-700" /></label>
        </section>
        <DashboardAnnouncements announcements={data?.announcements || []} canManage={data?.actor.role === 'ADMIN'} className="h-[460px]"
          onCreate={body => mutate('/api/dashboard/announcements', body)}
          onUpdate={body => mutate(`/api/dashboard/announcements/GLOBAL/${body.id}`, body, 'PATCH')}
          onDelete={body => mutate(`/api/dashboard/announcements/GLOBAL/${body.id}`, body, 'DELETE')} />
      </div>
    </main>
    <ImportantNoticeBand onHeightChange={setHeight} /><Toaster />
  </div>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BrowserRouter><Preview /></BrowserRouter></QueryClientProvider>);
