import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Select from '@/components/ui/Select';
import { Button } from '@/components/ui/button';
import WelcomeWorkspace from './welcome/WelcomeWorkspace';
import { welcomeDemoProfiles } from './welcome/welcomeContent';
import '@/index.css';

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Muestra disponible solo en local');
const params = new URLSearchParams(location.search);
if (params.has('dark')) document.documentElement.classList.add('dark');

function Preview() {
  const [profile, setProfile] = useState(Object.hasOwn(welcomeDemoProfiles, params.get('profile')) ? params.get('profile') : 'francis');
  const [dark, setDark] = useState(params.has('dark'));
  return <>
    <aside className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
      <div><p className="font-semibold">Bienvenida · Muestra local</p><p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Perfiles y permisos ficticios. Sin conexión a producción.</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2"><span className="sr-only">Perfil de ejemplo</span><Select aria-label="Perfil de ejemplo" value={profile} onChange={event => setProfile(event.target.value)} className="w-44"><option value="francis">Francis · 7 módulos</option><option value="david">David · 4 módulos</option><option value="admin">Admin · todos</option><option value="empty">Sin módulos</option></Select></label>
        <Button variant="outline" className="min-h-11" onClick={() => { setDark(!dark); document.documentElement.classList.toggle('dark', !dark); }}>{dark ? 'Tema claro' : 'Tema oscuro'}</Button>
        <a href="/tests/fixtures/first-access.html" className="inline-flex min-h-11 items-center underline underline-offset-4">Probar ingreso completo</a>
      </div>
    </aside>
    <WelcomeWorkspace key={profile} user={welcomeDemoProfiles[profile]} />
  </>;
}
createRoot(document.getElementById('root')).render(<Preview />);
