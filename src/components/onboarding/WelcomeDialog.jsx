import React, { useRef } from 'react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Brain, CheckSquare, Map, FileBarChart, Palette, LayoutGrid, FileText, FolderOpen, DollarSign, Zap, Users, UserCheck, Activity, X } from '@/components/ui/icons';
import { getWelcomeModules, welcomeName } from '@/lib/welcomeContent';

const icons = { LayoutDashboard, Brain, CheckSquare, Map, FileBarChart, Palette, LayoutGrid, FileText, FolderOpen, DollarSign, Zap, Users, UserCheck, Activity };

export default function WelcomeDialog({ user, open, onOpenChange, returnFocusRef, busy = false, error = '' }) {
  const titleRef = useRef(null);
  const modules = getWelcomeModules(user);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} data-onboarding-dialog="welcome"
      overlayClassName="z-[70] motion-reduce:!animate-none"
      className="z-[71] flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 text-zinc-900 motion-reduce:!animate-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-xl"
      onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); returnFocusRef?.current?.focus(); }}
      onInteractOutside={event => event.preventDefault()}>
      <div className="brain-ai-header relative shrink-0 px-5 py-5 pr-14 text-white sm:px-6 sm:pr-14">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-white" aria-hidden="true">
            <img src="/brainstudio-mascot-tip.png" alt="" className="h-11 w-11 object-contain" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <DialogTitle ref={titleRef} tabIndex={-1} className="text-lg leading-6 text-white outline-none">¡Qué bueno tenerte aquí, {welcomeName(user?.name)}!</DialogTitle>
            <DialogDescription className="text-sm leading-5 text-white/95">Soy Bria. Te acompaño a conocer tu espacio.</DialogDescription>
          </div>
        </DialogHeader>
        <DialogClose asChild><button disabled={busy} type="button" aria-label="Cerrar bienvenida" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"><X className="h-4 w-4" /></button></DialogClose>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        {error && <p role="alert" className="mb-3 text-sm leading-6 text-destructive">{error}</p>}
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">Aquí reunimos el trabajo, las ideas y los avances del equipo. Estos son los módulos disponibles para ti:</p>
        {modules.length ? <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">{modules.map(module => {
          const Icon = icons[module.icon];
          return <li key={module.id} data-welcome-module={module.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300" />
            <div className="min-w-0"><p className="text-sm font-semibold leading-5">{module.title}</p><p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{module.description}</p></div>
          </li>;
        })}</ul> : <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">Aún no tienes módulos habilitados. Pide a un administrador que revise tus accesos en Equipo.</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-4 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-xs text-xs leading-5 text-zinc-500 dark:text-zinc-400">{modules.length ? 'Encontrarás estos módulos en el menú de la plataforma.' : 'Tus accesos los gestiona un administrador.'}</p>
        <DialogClose asChild><Button disabled={busy} size="lg" className="shrink-0">{modules.length ? 'Vamos a empezar' : 'Entendido'}</Button></DialogClose>
      </div>
    </DialogContent>
  </Dialog>;
}
