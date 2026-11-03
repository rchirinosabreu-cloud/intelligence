import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy } from '@/components/ui/icons';
import { requestLeague } from '@/lib/leagueRequest';
import { cn } from '@/lib/utils';
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

export default function LeagueDock({ enabled = true }) {
  const queryClient = useQueryClient();
  const dockRef = useRef(null);
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('carrera'));
  const [pose, setPose] = useState(() => Math.floor(Math.random() * 3));
  const changeOpen = value => {
    if (value && !open) setPose(previous => nextLeaguePose(previous));
    setOpen(value);
  };
  const { data: league, error, refetch } = useQuery({
    queryKey: LEAGUE_QUERY_KEY,
    queryFn: () => requestLeague(''),
    enabled,
    staleTime: STALE_MS,
    retry: (count, failure) => failure?.status !== 404 && count < 2
  });
  // Al abrir se vuelve a pedir: «hoy» cambia con cada cierre y cada reloj.
  useEffect(() => { if (open && enabled) queryClient.invalidateQueries({ queryKey: LEAGUE_QUERY_KEY }); }, [open, enabled, queryClient]);
  if (!enabled || error?.status === 404) return null;

  return (
    <>
      <button
        ref={dockRef}
        type="button"
        data-league-dock
        aria-label="Abrir reconocimientos"
        title="Reconocimientos"
        aria-expanded={open}
        onClick={() => changeOpen(true)}
        className={cn(
          'league-dock brain-popover-surface fixed right-0 top-1/2 z-[45] flex h-14 w-16 -translate-y-1/2 items-center justify-start rounded-l-2xl border-r-0 pl-3 text-brand-yellow-deep shadow-md shadow-zinc-950/10 outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan dark:text-brand-yellow',
          open && 'league-dock-open'
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-yellow/25 dark:bg-brand-yellow/15"><Trophy className="h-5 w-5" /></span>
      </button>
      <LeaguePoseContext.Provider value={pose}>
        <RaceOfTheMonth open={open} onOpenChange={changeOpen} league={league || null} error={error} onRetry={refetch} returnFocusRef={dockRef} />
      </LeaguePoseContext.Provider>
    </>
  );
}
