import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ImportantNoticeBand from '../../src/components/notifications/ImportantNoticeBand';
import BrainToaster from '../../src/components/ui/BrainToaster';
import { cn } from '../../src/lib/utils';
import { PLAN_DIGEST_KIND, PLAN_DIGEST_URL, PLAN_NOTICE_KIND, planDigestText, planNoticeText } from '../../src/lib/planCloseNotices';
import { cycleOf } from '../../src/lib/clientOperations';
import '../../src/index.css';

// Muestra local de los avisos de parrilla en la banda (Rodny, 30 de octubre de 2026). Es **la banda de verdad**:
// se monta `ImportantNoticeBand` y lo único ficticio es lo que responde el servidor. `?caso=` elige el aviso.

const octubre = cycleOf(2026, 10, 1);
const cuenta = { clientName: 'Finas Asesores', cycle: octubre, overdue: 2 };

const CASOS = {
  // El mes se está cerrando y esas piezas lo bloquean: salmón.
  cierre: {
    id: 'a1', kind: PLAN_NOTICE_KIND, url: '/clientes/operacion/finas-asesores',
    ...planNoticeText({ ...cuenta, closing: true })
  },
  // Todavía queda mes por delante: verde.
  abierto: {
    id: 'a2', kind: PLAN_NOTICE_KIND, url: '/clientes/operacion/finas-asesores',
    ...planNoticeText({ ...cuenta, closing: false })
  },
  // Varias cuentas a la vez: un aviso, no uno por cuenta.
  resumen: {
    id: 'a3', kind: PLAN_DIGEST_KIND, url: PLAN_DIGEST_URL,
    ...planDigestText(5, { closing: true, monthLabel: 'Octubre' })
  }
};

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const params = new URLSearchParams(window.location.search);
const notice = CASOS[params.get('caso') || 'cierre'];

// El único trozo ficticio: lo que responde el servidor. Todo lo demás es la banda real.
const original = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(typeof input === 'string' ? input : input?.url || '');
  if (url.includes('/api/important-notices/current')) return json({ notice, nextAt: null });
  if (url.includes('/api/important-notices/')) return json({ ok: true });
  return original(input, init);
};

const PIEZAS = [
  { fecha: '16 oct', pieza: 'Post · GESTIÓN INTEGRAL PARA TU ENTIDAD SIN ÁNIMO DE LUCRO', estado: 'Publicada', ok: true },
  { fecha: '27 oct', pieza: 'Reel · VIAJE', estado: 'Realizada', ok: false },
  { fecha: '30 oct', pieza: 'Reel · PRESENTACIÓN DE SERVICIOS FINAS ASESORES', estado: 'Realizada', ok: false }
];

function Pagina() {
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', params.get('tema') === 'dark');
  }, []);

  return (
    <div className="brain-ambient min-h-screen bg-zinc-50 pb-[420px] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold">Finas Asesores</h1>
        <p className="mb-6 text-sm text-zinc-500">Operación · octubre</p>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="pb-3 font-semibold">Fecha</th>
                <th className="pb-3 font-semibold">Pieza</th>
                <th className="pb-3 text-right font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {PIEZAS.map((row) => (
                <tr key={row.pieza} className={cn('border-t border-zinc-100 dark:border-zinc-800', !row.ok && 'bg-destructive/5')}>
                  <td className={cn('py-3 font-semibold', row.ok ? 'text-zinc-500' : 'text-destructive')}>{row.fecha}</td>
                  <td className="py-3 pr-4">{row.pieza}</td>
                  <td className="py-3 text-right">
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold',
                      row.ok ? 'bg-status-positive/15 text-status-positive-fg' : 'bg-destructive/10 text-destructive')}>
                      {row.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ImportantNoticeBand />
      <BrainToaster />
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <Pagina />
    </MemoryRouter>
  </QueryClientProvider>
);
