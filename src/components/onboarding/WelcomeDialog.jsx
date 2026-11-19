import { Bria3D, BriaLogo } from '@/components/bria/BriaBrand';
import React, { useRef } from 'react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LayoutDashboard, Brain, CheckSquare, Map, FileBarChart, Palette, LayoutGrid, FileText, FolderOpen, DollarSign, Wallet, Zap, Users, UserCheck, Activity, Target, Megaphone, X } from '@/components/ui/icons';
import { getWelcomeModules, welcomeName } from '@/lib/welcomeContent';

const icons = { LayoutDashboard, Brain, CheckSquare, Map, FileBarChart, Palette, LayoutGrid, FileText, FolderOpen, DollarSign, Wallet, Zap, Users, UserCheck, Activity, Target, Megaphone };

export default function WelcomeDialog({ user, open, onOpenChange, returnFocusRef, busy = false, error = '' }) {
  const titleRef = useRef(null);
  const modules = getWelcomeModules(user);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {/* La bienvenida con la marca de Bria (Rodny, 18 de noviembre de 2026): Bria de pie sobre el degradado, el logo y,
        al lado, lo de siempre: el saludo, los módulos disponibles y el botón para empezar. */}
    <DialogContent showCloseButton={false} data-onboarding-dialog="welcome"
      overlayClassName="z-[70] motion-reduce:!animate-none"
      className="z-[71] flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[28px] border-bria-line bg-white p-0 text-bria-night motion-reduce:!animate-none dark:border-white/10 dark:bg-bria-night dark:text-white sm:max-w-3xl sm:flex-row"
      onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); returnFocusRef?.current?.focus(); }}
      onInteractOutside={event => event.preventDefault()}>
      <div aria-hidden="true" className="relative flex h-36 shrink-0 items-end justify-center overflow-hidden bg-bria sm:h-auto sm:w-64">
        <svg viewBox="0 0 340 520" preserveAspectRatio="none" className="absolute inset-0 h-full w-full"><path d="M0 330 C90 280 170 380 340 300 L340 520 L0 520 Z" className="fill-white/15" /><path d="M0 410 C110 360 210 450 340 390 L340 520 L0 520 Z" className="fill-white/20" /></svg>
        <Bria3D mood="feliz" className="relative -mb-6 w-24 sm:mb-8 sm:w-48" />
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <DialogClose asChild><button disabled={busy} type="button" aria-label="Cerrar bienvenida" className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-xl text-bria-muted hover:bg-bria-night/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan dark:text-zinc-300 dark:hover:bg-white/10"><X className="h-4 w-4" /></button></DialogClose>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
          <div className="hidden sm:block"><BriaLogo className="w-36 dark:hidden" /><BriaLogo negative className="hidden w-36 dark:block" /></div>
          <DialogHeader className="mt-4 space-y-2 text-left">
            <DialogTitle ref={titleRef} tabIndex={-1} className="pr-10 font-bria text-2xl font-bold leading-8 text-bria-night outline-none dark:text-white">¡Qué bueno tenerte aquí, {welcomeName(user?.name)}!</DialogTitle>
            <DialogDescription className="text-base leading-6 text-bria-ink dark:text-zinc-200">Soy Bria. Te acompaño a conocer tu espacio.</DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="mt-3 text-sm leading-6 text-destructive">{error}</p>}
          <p className="mt-4 text-sm leading-6 text-bria-muted dark:text-zinc-300">Aquí reunimos el trabajo, las ideas y los avances del equipo. Estos son los módulos disponibles para ti:</p>
          {modules.length ? <ul className="mt-4 divide-y divide-bria-line dark:divide-white/10">{modules.map(module => {
            const Icon = icons[module.icon];
            return <li key={module.id} data-welcome-module={module.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-bria-cyan-deep dark:text-bria-mint" />
              <div className="min-w-0"><p className="text-sm font-semibold leading-5">{module.title}</p><p className="mt-1 text-sm leading-5 text-bria-muted dark:text-zinc-400">{module.description}</p></div>
            </li>;
          })}</ul> : <p className="mt-4 text-sm leading-6 text-bria-muted dark:text-zinc-300">Aún no tienes módulos habilitados. Pide a un administrador que revise tus accesos en Equipo.</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-4 border-t border-bria-line px-6 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="max-w-xs text-xs leading-5 text-bria-muted dark:text-zinc-400">{modules.length ? 'Encontrarás estos módulos en el menú de la plataforma.' : 'Tus accesos los gestiona un administrador.'}</p>
          <DialogClose asChild><button type="button" disabled={busy} className="flex min-h-12 shrink-0 items-center justify-center rounded-2xl bg-bria-night px-6 text-base font-semibold text-white hover:bg-bria-night/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan disabled:opacity-50 dark:bg-white dark:text-bria-night dark:hover:bg-white/90">{modules.length ? 'Vamos a empezar' : 'Entendido'}</button></DialogClose>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
