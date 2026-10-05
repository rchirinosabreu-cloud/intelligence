import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ServiceHealthDot from '@/components/layout/ServiceHealthDot';
import { Bell, Moon } from '@/components/ui/icons';
import { getNotificationDisplayParts } from '@/utils/notificationUtils';
import '@/index.css';

// Muestra local del punto del semáforo en la barra superior y de sus avisos (5 de octubre de 2026).
// Cada barra consulta un resumen distinto; nada toca un servidor. `?dark` para el modo oscuro.
const dark = new URLSearchParams(location.search).has('dark');
document.documentElement.classList.toggle('dark', dark);
document.body.className = dark ? 'bg-zinc-950' : 'bg-zinc-50';

const SUMMARIES = {
  GREEN: { overall: 'GREEN', troubled: [] },
  YELLOW: { overall: 'YELLOW', troubled: [{ id: 'google-calendar', label: 'Google Calendar y Meet', light: 'YELLOW' }] },
  RED: { overall: 'RED', troubled: [{ id: 'openai', label: 'OpenAI', light: 'RED' }] }
};

const Bar = ({ light }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['service-health-summary'], SUMMARIES[light]);
  return (
    <QueryClientProvider client={client}>
      <div className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white/50 px-6 backdrop-blur-md dark:border-white/5 dark:bg-zinc-950/50">
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{light === 'GREEN' ? 'Todo bien' : light === 'YELLOW' ? 'Con problemas' : 'Caído'}</span>
        <div className="flex items-center gap-4 text-zinc-600 dark:text-zinc-300">
          <ServiceHealthDot isAdmin />
          <span className="flex h-11 w-11 items-center justify-center"><Moon className="h-4 w-4" /></span>
          <span className="flex h-11 w-11 items-center justify-center"><Bell className="h-4 w-4" /></span>
          <span className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    </QueryClientProvider>
  );
};

const notices = [
  { type: 'SERVICE_HEALTH_DOWN', message: 'OpenAI está caído: Se acabó el crédito de la cuenta: hay que recargar.', tone: 'bg-destructive/10 text-destructive' },
  { type: 'SERVICE_HEALTH_RECOVERED', message: 'OpenAI volvió a funcionar.', tone: 'bg-status-positive/10 text-status-positive-fg' }
];

createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      {['GREEN', 'YELLOW', 'RED'].map((light) => <Bar key={light} light={light} />)}
      <div className="w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {notices.map((notice) => {
          const parts = getNotificationDisplayParts(notice);
          return (
            <div key={notice.type} className="flex gap-3 border-b border-zinc-100 p-4 last:border-0 dark:border-zinc-800">
              <span className={`mt-0.5 h-8 w-8 shrink-0 rounded-full ${notice.tone}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{parts.title}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{parts.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  </MemoryRouter>
);
