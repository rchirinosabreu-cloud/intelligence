import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// La versión «Demo» (Rodny, 26 de octubre de 2026): una píldora en el header para que ninguna captura se
// confunda con producción y el cliente sepa que puede tocar lo que quiera. Lo decide el servidor
// (`DEMO_MODE`, leído en `/api/health`): el mismo build sirve para producción y para la demo.
const DemoBadge = () => {
  const { data } = useQuery({
    queryKey: ['app-health'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/health`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: Infinity,
    retry: false
  });
  if (!data?.demo) return null;
  return (
    <span
      data-demo-badge
      title="Esta es una versión de demostración con una agencia inventada. Nada de lo que hagas aquí afecta a nadie."
      className="inline-flex shrink-0 items-center rounded-full border border-brand-yellow/50 bg-brand-yellow/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-yellow-deep dark:bg-brand-yellow/20 dark:text-brand-yellow"
    >
      Demo
    </span>
  );
};

export default DemoBadge;
