import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// «Esperando por ti» (Rodny, 20 de noviembre de 2026): en el inicio de Bria, lo que espera una decisión de la
// persona, en una sola lista. Cada fila lleva a donde hoy se resuelve: una pantalla, un pedido a Bria o un chat.
// Sin nada pendiente no aparece. Etapa 1 de la mudanza de Manager a Bria: aquí todavía no se responde.
const requestWaiting = async () => {
  const token = globalThis.localStorage?.getItem('authToken'), base = import.meta.env ? getApiBaseUrl() : '';
  const response = await fetch(`${base}/api/bria/waiting`, { credentials: 'same-origin', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No se pudo leer lo que espera por ti.');
  return data;
};

export default function BriaWaiting({ visible = true, disabled = false, request = requestWaiting, onGo, onAsk, onOpenChat, onCount }) {
  const [items, setItems] = useState([]), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (!visible) return undefined;
    request().then((data) => { if (mounted.current) setItems(Array.isArray(data?.items) ? data.items : []); })
      .catch((failure) => console.error('[BriaWaiting]', failure.message));
    return () => { mounted.current = false; };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onCount?.(items.length); }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items.length) return null;
  const act = (item) => (item.to ? onGo?.(item.to) : item.ask ? onAsk?.(item.ask) : item.conversationId ? onOpenChat?.(item.conversationId) : null);
  return (
    <section data-bria-waiting aria-label="Esperando por ti" className="mb-3 rounded-2xl border border-bria-line bg-white px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
      <h3 className="text-sm font-semibold text-bria-night dark:text-white">Esperando por ti</h3>
      <ul className="mt-1.5 divide-y divide-bria-line dark:divide-white/10">
        {items.map((item) => (
          <li key={`${item.kind}:${item.conversationId || item.to || item.ask}`}>
            <button type="button" disabled={disabled} data-bria-waiting-item={item.kind} onClick={() => act(item)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm text-bria-night transition-colors hover:text-bria-cyan-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan disabled:opacity-50 dark:text-zinc-200 dark:hover:text-bria-mint">
              <span className="min-w-0">{item.text}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-bria-muted dark:text-zinc-400" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
