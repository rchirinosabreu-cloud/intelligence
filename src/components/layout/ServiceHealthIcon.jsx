import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

/**
 * El semáforo vive en el propio acceso a Salud Operativa (Rodny, 10 de octubre de 2026).
 * Conserva la consulta y el polling del antiguo punto de la cabecera, solo para administradores.
 */

const DOT = {
  GREEN: { tone: 'text-status-positive-fg', label: 'Todos los servicios funcionan' },
  YELLOW: { tone: 'text-status-attention-fg', label: 'Hay servicios con problemas' },
  RED: { tone: 'text-destructive', label: 'Hay servicios caídos' },
  GRAY: { tone: 'text-zinc-400 dark:text-zinc-500', label: 'Todavía no hay comprobaciones' }
};

export default function ServiceHealthIcon({ isAdmin }) {
  const { data, isError } = useQuery({
    queryKey: ['service-health-summary'],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/service-health/summary`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('[ServiceHealthIcon] No se pudo leer el estado de los servicios:', payload);
        throw new Error(payload?.error || 'No se pudo leer el estado de los servicios.');
      }
      return payload;
    },
    enabled: isAdmin,
    staleTime: 30_000,
    refetchInterval: isAdmin ? () => (document.hidden ? false : 60_000) : false,
    retry: false
  });

  if (!isAdmin) return null;
  const overall = isError ? 'YELLOW' : data?.overall || 'GRAY';
  const dot = DOT[overall] || DOT.GRAY;
  const label = isError ? 'No se pudo actualizar el estado de los servicios' : dot.label;
  const troubled = Array.isArray(data?.troubled) ? data.troubled : [];
  const detail = troubled.length ? `: ${troubled.map((service) => service.label).join(', ')}` : '';

  return (
    <span
      role="img"
      data-service-health-icon={overall}
      aria-label={`${label}${detail}`}
      title={`${label}${detail}`}
      className={cn('relative flex h-5 w-5 shrink-0 items-center justify-center transition-colors', dot.tone)}
    >
      <Activity aria-hidden="true" className="h-5 w-5" />
    </span>
  );
}
