import React from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import CommercialRequestForm from './CommercialRequestForm';

/**
 * Public page (no login): the commercial request form on the brand ambient.
 * Submits to POST /api/public/commercial-request, which creates the CRM opportunity.
 */
export default function CommercialRequestPage() {
  const submit = async answers => {
    const params = new URLSearchParams(window.location.search);
    const meta = {
      referrer: document.referrer || null,
      campaign: params.get('utm_campaign') || params.get('c') || null,
      source: params.get('utm_source') || null,
      locale: navigator.language || null
    };
    const response = await fetch(`${getApiBaseUrl()}/api/public/commercial-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, meta })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No pudimos enviar tu solicitud. Inténtalo de nuevo en un momento.');
    return data;
  };

  return (
    <div className="brain-ambient min-h-screen bg-zinc-50 text-foreground dark:bg-zinc-950">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <a href="https://brainstudioagencia.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
          <img src="/brainstudio-logo.png" alt="Brain Studio" className="h-8 w-8 object-contain" />
          <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Brainstudio</span>
        </a>
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Solicitud comercial</span>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
        <CommercialRequestForm onSubmit={submit} />
        <p className="mx-auto mt-6 max-w-3xl text-center text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
          Usaremos estos datos únicamente para preparar tu propuesta y contactarte. Brain Studio Agencia Creativa S.A.S.
        </p>
      </main>
    </div>
  );
}
