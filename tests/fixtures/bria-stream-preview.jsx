import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import BrainToaster from '@/components/ui/BrainToaster';
import BriaConversation from '@/components/bria/BriaConversation';
import '@/index.css';

// Muestra local de Bria escribiendo en vivo (9 de octubre de 2026): el chat real, con la API simulada en el
// navegador. Toda pregunta recibe «Buscando en la bóveda…» y luego la respuesta palabra por palabra. `&dark`.
const params = new URLSearchParams(location.search);
localStorage.setItem('authToken', 'demo');
sessionStorage.clear();
document.documentElement.classList.toggle('dark', params.has('dark'));
document.body.className = params.has('dark') ? 'bg-zinc-950' : 'bg-zinc-50';

const CHAT = '0b9f4a52-1c3e-4d8e-9f00-123456789abc';
let turns = [];
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const answer = 'Encontré **una sola cuenta de CapCut**, la de Brain Studio. Te la dejo abajo en una tarjeta: se oculta sola en un minuto y queda registrado que la viste. Si buscabas la de un cliente, dime cuál.';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  if (!url.pathname.startsWith('/api/bria/conversations')) return new Response('{}', { status: 404 });
  if (url.pathname === '/api/bria/conversations' && (init.method || 'GET') === 'GET') return json(turns.length ? [{ id: CHAT, title: 'CapCut', revision: 1 }] : []);
  if (url.pathname === '/api/bria/conversations') return json({ id: CHAT, revision: 0, turns });
  if (url.pathname.endsWith('/messages')) {
    const question = JSON.parse(init.body).question;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        await sleep(400); send({ type: 'status', label: 'Buscando en la bóveda…' });
        await sleep(params.has('lento') ? 4000 : 900);
        for (const word of answer.split(/(?<= )/)) { send({ type: 'delta', text: word }); await sleep(45); }
        turns = [...turns, { id: `${CHAT}:${turns.length}`, role: 'user', text: question }, { id: `${CHAT}:${turns.length + 1}`, role: 'assistant', text: answer }];
        send({ type: 'done', chat: { id: CHAT, revision: turns.length / 2, turns } });
        controller.close();
      }
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  }
  return json({ id: CHAT, revision: turns.length / 2, turns });
};

createRoot(document.getElementById('root')).render(
  <ConfirmDialogProvider>
    <div className="mx-auto h-screen max-w-xl border-x border-zinc-200 dark:border-zinc-800"><BriaConversation userName="Rodny" userRole="ADMIN" /></div>
    <BrainToaster />
  </ConfirmDialogProvider>
);
