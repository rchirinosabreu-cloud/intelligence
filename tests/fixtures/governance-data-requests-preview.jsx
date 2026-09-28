import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GovernanceDataRequests from '../../src/components/modules/Governance/GovernanceDataRequests';
import { computeDeadlines, validateDataRequest } from '../../src/lib/dataSubjectRequests';
import '../../src/index.css';
import 'react-datepicker/dist/react-datepicker.css';

// Muestra local de solicitudes de titulares: las reglas reales en memoria, sin API ni base.
const TODAY = '2026-10-08';
let consecutive = 0;
const store = [];
const add = (input) => {
  const request = validateDataRequest(input, { today: TODAY });
  consecutive += 1;
  store.push({ id: `r${consecutive}`, reference: `SOL-${String(consecutive).padStart(4, '0')}`, ...request });
};
add({ type: 'RECLAMO', reason: 'SUPRIMIR', channel: 'EMAIL', status: 'EN_TRAMITE', requesterName: 'Laura Gómez', contactEmail: 'laura@correo.co', description: 'Pide suprimir sus datos del CRM.', receivedOn: '2026-10-06' });
add({ type: 'CONSULTA', reason: 'CONOCER', channel: 'TELEFONO', status: 'RECIBIDA', requesterName: 'Carlos Pérez', contactPhone: '3001234567', description: 'Quiere saber qué datos suyos tenemos.', receivedOn: '2026-09-21' });
add({ type: 'RECLAMO', reason: 'RECTIFICAR', channel: 'EMAIL', status: 'INCOMPLETA', requesterName: 'Marta Ruiz', contactEmail: 'marta@correo.co', description: 'Pide corregir su teléfono.', receivedOn: '2026-10-01', incompleteRequestedOn: '2026-10-02', legendAddedOn: '2026-10-02' });
add({ type: 'CONSULTA', reason: 'PRUEBA_AUTORIZACION', channel: 'EMAIL', status: 'RESPONDIDA', requesterName: 'Diego Torres', contactEmail: 'diego@correo.co', description: 'Pide la prueba de su autorización.', receivedOn: '2026-09-15', respondedOn: '2026-09-22', responseSummary: 'Se envió la autorización del formulario.', responseEvidence: 'Correo del 22/09' });

const present = (row) => ({ ...row, deadlines: computeDeadlines(row, TODAY) });
const request = async (path, { method = 'GET', body } = {}) => {
  await new Promise((resolve) => setTimeout(resolve, 120));
  if (method === 'GET') {
    const onlyOpen = path.includes('open=true');
    const items = store.map(present).filter((item) => !onlyOpen || item.deadlines.open);
    return { items, hasMore: false, page: 1, today: TODAY };
  }
  const input = validateDataRequest(body, { today: TODAY });
  if (method === 'POST') { consecutive += 1; store.push({ id: `r${consecutive}`, reference: `SOL-${String(consecutive).padStart(4, '0')}`, ...input }); }
  else { const id = path.split('/').pop(); Object.assign(store.find((row) => row.id === id), input); }
  return {};
};

const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={cache}>
    <div className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm">
        <span>Muestra local · Reglas reales · Hoy: 8 de octubre de 2026</span>
        <button className="min-h-11 rounded-lg border px-3" onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
      </div>
      <section className="mx-auto max-w-6xl rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-6"><GovernanceDataRequests request={request} /></section>
    </div>
  </QueryClientProvider>
);
