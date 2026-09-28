import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GovernanceUsage from '../../src/components/modules/Governance/GovernanceUsage';
import '../../src/index.css';

// Muestra local del registro de uso de IA con datos inventados: sin API ni base de datos.
const now = Date.now();
const at = (minutes) => new Date(now - minutes * 60000).toISOString();
const items = [
  { id: '1', occurredAt: at(3), actorName: 'Rodny Muestra', flow: 'parrillas.review', provider: 'openai', model: 'gpt-5.6-luna', clientName: 'Cliente Demo', outcome: 'ALLOWED', statusCode: 200, inputTokens: 5210, outputTokens: 880, durationMs: 4210 },
  { id: '2', occurredAt: at(18), actorName: null, flow: 'minutes-automatic', provider: 'openai', model: 'gpt-5.6-terra', clientName: null, outcome: 'ALLOWED', statusCode: 200, inputTokens: 18400, outputTokens: 1320, durationMs: 11820 },
  { id: '3', occurredAt: at(42), actorName: 'Ana Muestra', flow: 'reports', provider: 'openai', model: 'gpt-5.6-terra', clientName: 'Marca Ejemplo', outcome: 'ALLOWED', statusCode: 200, inputTokens: 2900, outputTokens: 610, durationMs: 6100 },
  { id: '4', occurredAt: at(65), actorName: 'Ana Muestra', flow: 'parrillas.review', provider: 'openai', model: 'gpt-5.6-luna', clientName: 'Cliente Protegido', outcome: 'BLOCKED', statusCode: null, inputTokens: null, outputTokens: null, durationMs: 12 },
  { id: '5', occurredAt: at(90), actorName: null, flow: 'fireflies', provider: 'fireflies', model: 'graphql', clientName: null, outcome: 'ERROR', statusCode: 429, inputTokens: null, outputTokens: null, durationMs: 340 }
];
const summary = {
  days: 30, calls: 1284, blocked: 3, errors: 11, people: 9, inputTokens: 4820113, outputTokens: 612004,
  byFlow: [{ flow: 'parrillas.review', calls: 540 }, { flow: 'minutes-automatic', calls: 310 }, { flow: 'reports', calls: 212 }, { flow: 'chat', calls: 150 }, { flow: 'fireflies', calls: 72 }],
  byProvider: [{ provider: 'openai', model: 'gpt-5.6-luna', calls: 690 }, { provider: 'openai', model: 'gpt-5.6-terra', calls: 522 }, { provider: 'fireflies', model: 'graphql', calls: 72 }]
};
const request = async (path, { download } = {}) => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (download) return new Blob(['Fecha\n'], { type: 'text/csv' });
  return path.startsWith('/usage/summary') ? summary : { items, hasMore: true, page: 1 };
};

const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Preview() {
  return (
    <QueryClientProvider client={cache}>
      <div className="min-h-screen bg-background p-4 text-foreground sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm">
          <span>Muestra local · Datos inventados · Sin API</span>
          <button className="min-h-11 rounded-lg border px-3" onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
        </div>
        <section className="mx-auto max-w-6xl rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6"><GovernanceUsage request={request} /></section>
      </div>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')).render(<Preview />);
