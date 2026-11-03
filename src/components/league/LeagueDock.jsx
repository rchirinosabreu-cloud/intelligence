import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy, X } from '@/components/ui/icons';
import { requestLeague } from '@/lib/leagueRequest';
import RaceOfTheMonth from './RaceOfTheMonth';
import { LeaguePoseContext } from './LeaguePoseContext';
import { nextLeaguePose } from '@/lib/leaguePose';

// La copa de la liga (Rodny, 3 de noviembre de 2026: «no quiero nada en el dashboard, solo quiero un icono de la copa
// por ahí medio asomándose a la mitad de la pantalla derecha, y ahí se abre el panel»): una pestaña pequeña pegada al
// borde derecho de la ventana, a media altura, que se asoma a medias y termina de salir al pasar el cursor o al
// tocarla. Está en toda la plataforma (se monta en el AppLayout), nunca en una pantalla concreta. Tocarla abre
// «Reconocimientos»; `?carrera` en cualquier ruta la abre de una vez (es a donde mandan los avisos de Bria). Si la
// cuenta no tiene ficha en Equipo, no hay copa. Sin reloj aquí: la liga la calcula el servidor.
export const LEAGUE_QUERY_KEY = ['league', 'month'];
const STALE_MS = 5 * 60 * 1000;

export default function LeagueDock({ enabled = true, userId, welcome }) {
  const queryClient = useQueryClient();
  const dockRef = useRef(null);
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('carrera'));
  const [pose, setPose] = useState(() => Math.floor(Math.random() * 3));
  const [invitationDismissed, setInvitationDismissed] = useState(false);
  const [replay, setReplay] = useState(false);
  const introduction = Boolean(welcome && (welcome.pending || replay));
  const queryKey = [...LEAGUE_QUERY_KEY, userId];
  const changeOpen = value => {
    if (value && !open) setPose(previous => nextLeaguePose(previous));
    setOpen(value);
  };
  const { data: league, error, refetch } = useQuery({
    queryKey,
    queryFn: () => requestLeague(''),
    enabled,
    staleTime: STALE_MS,
    retry: (count, failure) => failure?.status !== 404 && count < 2
  });
  // Al abrir se vuelve a pedir: «hoy» cambia con cada cierre y cada reloj.
  useEffect(() => { if (open && enabled) queryClient.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }); }, [open, enabled, queryClient]);
  if (!enabled || error?.status === 404) return null;
  const invite = Boolean(welcome?.pending && league && !open && !invitationDismissed && !welcome.blocked);
  const finishIntroduction = async status => {
    if (!welcome.pending || await welcome.acknowledge(status)) setReplay(false);
  };

  return (
    <>
      {invite && <div data-league-invitation className="league-invitation brain-popover-surface fixed right-8 top-1/2 z-[46] flex w-[min(260px,calc(100vw-64px))] -translate-y-1/2 items-start rounded-2xl border p-3 text-zinc-900 dark:text-zinc-100">
        <button type="button" aria-label="¡Hey, por aquí! Conoce tu liga" onClick={() => changeOpen(true)} className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
          <span role="status" className="block text-base font-bold">¡Hey, por aquí!</span>
        </button>
        <button type="button" aria-label="Ocultar invitación" onClick={() => setInvitationDismissed(true)} className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 outline-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-zinc-400 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>}
      <button
        ref={dockRef}
        type="button"
        data-league-dock
        aria-label="Abrir reconocimientos"
        title="Reconocimientos"
        aria-expanded={open}
        onClick={() => changeOpen(true)}
        className="league-dock brain-popover-surface fixed top-1/2 z-[45] flex h-12 w-10 items-center justify-center rounded-l-xl border-r-0 text-brand-yellow-deep outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-yellow"
      >
        <Trophy className={`h-5 w-5 shrink-0${invite ? ' league-trophy-hello' : ''}`} />
      </button>
      <LeaguePoseContext.Provider value={pose}>
        <RaceOfTheMonth open={open} onOpenChange={changeOpen} league={league || null} error={error} onRetry={refetch} returnFocusRef={dockRef}
          introduction={introduction ? { busy: welcome.busy, error: welcome.error, onFinish: finishIntroduction } : null}
          onShowIntroduction={welcome ? () => setReplay(true) : undefined} />
      </LeaguePoseContext.Provider>
    </>
  );
}
