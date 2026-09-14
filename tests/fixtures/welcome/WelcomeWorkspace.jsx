import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/Select';
import WelcomeDialog from './WelcomeDialog';
import QuotationGuide from './QuotationGuide';
import { getWelcomeModules, welcomeName } from './welcomeContent';

// Local, versioned preview preferences only. Never production onboarding state.
const guideMemory = new Map();
const guideKey = user => `brainstudio:welcome-preview:guide:${user.id}:cotizaciones:v1`;
function readGuide(key) {
  try {
    const value = window.localStorage.getItem(key);
    if (['skipped', 'completed'].includes(value)) return value;
  } catch { /* Browser storage can be unavailable; keep this tab usable. */ }
  return guideMemory.get(key);
}
function rememberGuide(key, status) {
  const value = readGuide(key) === 'completed' ? 'completed' : status;
  guideMemory.set(key, value);
  try { window.localStorage.setItem(key, value); } catch { /* Memory fallback is limited to this page. */ }
}

export default function WelcomeWorkspace({ user }) {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState(null);
  const reopen = useRef(null);
  const guideTrigger = useRef(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const modules = getWelcomeModules(user);
  const quotations = selected?.id === 'cotizaciones';
  const chooseModule = id => {
    const module = modules.find(item => item.id === id);
    if (!module) return;
    setSelected(module);
    setGuideOpen(module.id === 'cotizaciones' && !readGuide(guideKey(user)));
  };
  const dismissGuide = status => {
    rememberGuide(guideKey(user), status);
    setGuideOpen(false);
  };
  return <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3"><img src="/brainstudio-logo.png" alt="" className="h-8 w-8 object-contain" /><p className="text-lg font-semibold">Brainstudio</p></div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.name}</p>
    </header>
    <div className="mx-auto flex max-w-6xl gap-8 px-5 py-8 sm:px-8">
      <nav aria-label="Módulos de muestra" className="hidden w-48 shrink-0 space-y-1 lg:block">{modules.map(module => <Button key={module.id} variant="ghost" aria-current={selected?.id === module.id ? 'page' : undefined} className="min-h-11 w-full justify-start font-medium" onClick={() => chooseModule(module.id)}>{module.title}</Button>)}</nav>
      <main className="min-w-0 flex-1">
        {modules.length > 0 && <label className="mb-6 block text-sm lg:hidden"><span className="mb-2 block text-zinc-500 dark:text-zinc-400">Abrir módulo</span><Select value={selected?.id || ''} onChange={event => chooseModule(event.target.value)} className="w-full"><option value="" disabled>Elige un módulo</option>{modules.map(module => <option key={module.id} value={module.id}>{module.title}</option>)}</Select></label>}
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Tu espacio de trabajo</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{selected?.title || `Hola, ${welcomeName(user.name)}`}</h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-600 dark:text-zinc-400">{selected?.description || 'Todo listo para empezar a trabajar en equipo. Conoce los módulos disponibles para ti.'}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {quotations && <Button ref={guideTrigger} variant="outline" className="min-h-11" onClick={() => setGuideOpen(true)}>Ver guía</Button>}
          <Button ref={reopen} variant={quotations ? 'ghost' : 'outline'} className="min-h-11" onClick={() => setOpen(true)}>Volver a ver la bienvenida</Button>
        </div>
        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold">{quotations ? 'Tus propuestas, en un solo lugar' : 'Este es un espacio de prueba'}</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-zinc-500 dark:text-zinc-400">{quotations ? 'Aquí podrás preparar propuestas y consultar su estado. Por ahora puedes explorar la guía: esta muestra no crea, emite ni envía cotizaciones.' : 'Puedes explorar la bienvenida y cerrar el popup. Aquí no se crean tareas ni se modifican tus datos o permisos.'}</p>
          {quotations && <p className="mt-4 text-xs leading-5 text-zinc-500 dark:text-zinc-400">La guía omitida o finalizada se recuerda por perfil de prueba en este navegador, si permite almacenamiento local. Siempre puedes volver a verla.</p>}
        </section>
      </main>
    </div>
    <WelcomeDialog user={user} open={open} onOpenChange={setOpen} returnFocusRef={reopen} />
    {quotations && guideOpen && !open && <QuotationGuide open onDismiss={dismissGuide} returnFocusRef={guideTrigger} />}
  </div>;
}
