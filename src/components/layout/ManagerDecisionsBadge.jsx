import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { hasUnseen, MANAGER_SEEN_EVENT, readSeen } from '@/lib/managerDecisionsSeen';

/**
 * Punto coral sobre el icono de Manager cuando hay decisiones que la persona no ha visto. Se apaga al abrir Decisiones.
 * Consulta cada 10 minutos con la pestaña visible, solo para quien puede ver Manager.
 */
export default function ManagerDecisionsBadge({ userId, enabled }) {
  const [seenTick, setSeenTick] = useState(0);
  useEffect(() => {
    const refresh = () => setSeenTick((tick) => tick + 1);
    window.addEventListener(MANAGER_SEEN_EVENT, refresh);
    return () => window.removeEventListener(MANAGER_SEEN_EVENT, refresh);
  }, []);

  const { data } = useQuery({
    queryKey: ['manager-decisions-pulse'],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/manager/decisions/pulse`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('[ManagerDecisionsBadge] No se pudo leer si hay decisiones nuevas:', payload);
        throw new Error(payload?.message || 'No se pudo leer si hay decisiones nuevas.');
      }
      return payload;
    },
    enabled: Boolean(enabled),
    staleTime: 60_000,
    refetchInterval: enabled ? () => (document.hidden ? false : 600_000) : false,
    retry: false
  });

  if (!enabled || !hasUnseen(data?.keys || [], readSeen(userId))) return null;
  return (
    <span data-manager-new={seenTick} role="img" aria-label="Hay decisiones nuevas en Manager" title="Hay decisiones nuevas" className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full rounded-full bg-brand-coral opacity-60 motion-safe:animate-ping [animation-iteration-count:3]" aria-hidden="true" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-coral ring-2 ring-white dark:ring-zinc-950" aria-hidden="true" />
    </span>
  );
}
