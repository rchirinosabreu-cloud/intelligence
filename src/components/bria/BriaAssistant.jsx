import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { canUseBria } from '@/lib/briaLivingMemory';
import { onBriaAsk } from '@/lib/briaAsk';
import { cn } from '@/lib/utils';
import BriaConversation from './BriaConversation';

// Mounted once in AppLayout: navigating modules never resets the conversation.
export default function BriaAssistant({ currentUser, initialOpen = false, onDockWidthChange, onOpenChange }) {
  const navigate = useNavigate(), trigger = useRef(null);
  const available = !!currentUser?.id && canUseBria(currentUser), key = `bria:panel:${currentUser?.id}`;
  const [open, setOpen] = useState(() => initialOpen || sessionStorage.getItem(key) === 'open');
  const [fullScreen, setFullScreen] = useState(false), [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)'), changed = event => setDesktop(event.matches);
    media.addEventListener('change', changed); return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => { onDockWidthChange?.(available && open && !fullScreen && desktop ? 452 : 0); return () => onDockWidthChange?.(0); }, [available, open, fullScreen, desktop, onDockWidthChange]);
  useEffect(() => { sessionStorage.setItem(key, open ? 'open' : 'closed'); }, [key, open]);
  useEffect(() => { onOpenChange?.(available && open); }, [available, open, onOpenChange]);
  // Otra pantalla le pide algo a Bria (Ritmo, 10 de octubre de 2026): el panel se abre con el mensaje listo.
  useEffect(() => onBriaAsk(() => { setOpen(true); setFullScreen(false); }), []);
  useEffect(() => {
    if (!open || !fullScreen || !available) return;
    const before = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; };
  }, [open, fullScreen, available]);
  if (!available) return null;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <>
    <Button ref={trigger} variant="ghost" size="icon" aria-label="Preguntarle a Bria" title="Preguntarle a Bria" aria-expanded={open} aria-controls="bria-assistant-panel" data-bria-assistant-trigger onClick={() => setOpen(value => !value)} className="h-11 w-11 rounded-full"><img src="/brainstudio-mascot-tip.png" alt="" className="h-7 w-7 object-contain" /></Button>
    {createPortal(<aside id="bria-assistant-panel" aria-label="Asistente Bria" data-bria-assistant-panel data-bria-mode={fullScreen ? 'fullscreen' : 'docked'} className={cn('fixed z-[230] overflow-hidden border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100', !open && 'hidden', fullScreen ? 'inset-0' : 'bottom-3 right-3 top-20 w-[min(440px,calc(100vw-24px))] rounded-3xl')}>
      <BriaConversation key={currentUser.id} userId={currentUser.id} userName={currentUser.name} userRole={currentUser.role} fullScreen={fullScreen} visible={open} onFullScreen={() => setFullScreen(value => !value)} onClose={close} onOpenSource={source => { setFullScreen(false); navigate(source.url); }} />
    </aside>, document.body)}
  </>;
}
