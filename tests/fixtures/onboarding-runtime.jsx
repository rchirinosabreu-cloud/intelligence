import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Link, useLocation } from 'react-router-dom';
import { OnboardingProvider, QuotationGuideButton } from '@/components/onboarding/OnboardingProvider';
import '@/index.css';
if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Solo local');
const params = new URLSearchParams(location.search), progress = {};
let failNext = params.has('error');
const person = { id: 'demo-runtime', name: 'Persona de prueba', role: 'VIEWER', modulePermissions: { dashboard: true, cotizaciones: !params.has('denied') } };
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.fetch = async (input, options = {}) => {
  if (new URL(String(input), location.origin).pathname !== '/api/user/onboarding') throw new Error('Ruta no permitida en esta prueba');
  if (options.method === 'POST') {
    await new Promise(resolve => setTimeout(resolve, 250));
    if (failNext) { failNext = false; return Response.json({ error: 'Guardado de prueba rechazado' }, { status: 500 }); }
    const body = JSON.parse(options.body); progress[body.guideId] = body.status;
    return Response.json({ userId: person.id, ...body });
  }
  return Response.json({ user: person, progress });
};
function Demo() {
  const { pathname } = useLocation();
  return <OnboardingProvider userId={person.id} pathname={pathname}><main className="p-8"><h1>Integración real · datos simulados</h1><nav className="my-8 flex gap-8"><Link to="/">Dashboard</Link><Link to="/cotizaciones">Cotizaciones</Link></nav><p>{pathname}</p><QuotationGuideButton /><button onClick={() => { person.modulePermissions.cotizaciones = false; query.invalidateQueries({ queryKey: ['onboarding', person.id] }); }}>Revocar permiso (prueba)</button></main></OnboardingProvider>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><MemoryRouter><Demo /></MemoryRouter></QueryClientProvider>);
