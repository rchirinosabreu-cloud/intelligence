import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

/**
 * El semáforo de servicios en la barra superior (Rodny, 5 de octubre de 2026): un punto de color, solo
 * para administradores, visible desde cualquier pantalla. Verde todo funciona, amarillo algo falla,
 * rojo algo está caído. Al tocarlo lleva al tablero completo en Salud operativa.
 */

const DOT = {
  GREEN: { tone: 'bg-status-positive', label: 'Todos los servicios funcionan' },
  YELLOW: { tone: 'bg-status-attention', label: 'Hay servicios con problemas' },
  RED: { tone: 'bg-destructive', label: 'Hay servicios caídos' },
  GRAY: { tone: 'bg-zinc-300 dark:bg-zinc-600', label: 'Todavía no hay comprobaciones' }
};

export default function ServiceHealthDot({ isAdmin }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['service-health-summary'],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/service-health/summary`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('[ServiceHealthDot] No se pudo leer el estado de los servicios:', payload);
        throw new Error(payload?.error || 'No se pudo leer el estado de los servicios.');
      }
      return payload;
    },
    enabled: isAdmin,
    staleTime: 30_000,
    refetchInterval: isAdmin ? () => (document.hidden ? false : 60_000) : false,
    retry: false
  });

  if (!isAdmin || !data) return null;
  const dot = DOT[data.overall] || DOT.GRAY;
  const troubled = Array.isArray(data.troubled) ? data.troubled : [];
  const detail = troubled.length ? `: ${troubled.map((service) => service.label).join(', ')}` : '';

  return (
    <button
      type="button"
      data-service-health-dot={data.overall}
      onClick={() => navigate('/salud-operativa')}
      aria-label={`${dot.label}${detail}. Ver el estado de los servicios`}
      title={`${dot.label}${detail}`}
      className="relative flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/40 dark:hover:bg-white/10"
    >
      <span className={cn('h-2.5 w-2.5 rounded-full ring-4', dot.tone, data.overall === 'RED' ? 'ring-destructive/20' : data.overall === 'YELLOW' ? 'ring-status-attention/25' : 'ring-transparent')} />
    </button>
  );
}
