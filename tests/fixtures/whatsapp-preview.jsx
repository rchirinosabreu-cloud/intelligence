import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';
import WhatsAppLink from '../../src/components/profile/WhatsAppLink';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import BrainToaster from '../../src/components/ui/BrainToaster';
import '../../src/index.css';

// Muestra local de Bria en WhatsApp: la tarjeta real del perfil contra la API de scripts/preview-whatsapp.js, y al
// lado un «celular» que manda lo escrito como un aviso firmado de Meta y enseña lo que Bria responde.

const PERSON = { id: 'u-rodny', name: 'Rodny Muestra', email: 'rodny@example.test', role: 'ADMIN', modulePermissions: { bria: true } };
const fakeJwt = () => { const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, ''); return `${b64({ alg: 'none' })}.${b64({ userId: PERSON.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.x`; };
localStorage.setItem('authToken', fakeJwt());
localStorage.setItem('currentUser', JSON.stringify(PERSON));
const originalFetch = window.fetch;
window.fetch = (resource, config = {}) => { const headers = new Headers(config.headers || {}); headers.set('Authorization', `Bearer ${localStorage.getItem('authToken')}`); return originalFetch(resource, { ...config, headers }); };

function Phone() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => { const data = await fetch('/api/preview/phone').then((r) => r.json()); setMessages(data.phone); };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 1500); return () => clearInterval(timer); }, []);
  const post = async (path, payload) => {
    setBusy(true);
    try { const data = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => r.json()); if (data.phone) setMessages(data.phone); }
    finally { setBusy(false); }
  };
  const send = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    await post('/api/preview/phone', { text }); setText('');
  };
  // Tocar un botón de Bria: llega con su identificador, como en producción.
  const tap = (button) => post('/api/preview/phone', { text: button.title, replyId: button.id, list: Boolean(button.list), template: Boolean(button.template) });
  return (
    <section data-preview-phone style={{ height: 640, borderRadius: '2rem' }} className="flex flex-col overflow-hidden border border-zinc-300 bg-zinc-100 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <span className="h-9 w-9 rounded-full brain-gradient-primary" />
        <div><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Brain Studio</p><p className="text-xs text-zinc-500">+57 304 378 6298 · celular de muestra</p></div>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-center text-xs text-zinc-500">Escríbele a Bria como lo harías desde tu WhatsApp.</p>}
        {messages.map((message, index) => (
          <div key={`${message.at}-${index}`} data-preview-bubble={message.from} className={`max-w-[85%] overflow-hidden rounded-2xl text-sm shadow-sm ${message.from === 'me' ? 'ml-auto bg-brand-green-soft text-brand-green-deep dark:bg-brand-green/10 dark:text-brand-green' : 'bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100'}`}>
            <p className="whitespace-pre-wrap px-3 py-2">{message.text}</p>
            {message.footer && <p className="px-3 pb-2 text-xs text-zinc-500">{message.footer}</p>}
            {message.listButton && <p className="border-t border-zinc-100 px-3 py-2 text-center text-xs font-semibold text-brand-cyan-deep dark:border-zinc-800 dark:text-brand-cyan">☰ {message.listButton}</p>}
            {message.buttons?.map((button) => (
              <button key={button.id} type="button" data-preview-button={button.title} disabled={busy} onClick={() => tap(button)} className="block min-h-11 w-full border-t border-zinc-100 px-3 py-2 text-center text-sm font-semibold text-brand-cyan-deep hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-brand-cyan dark:hover:bg-zinc-800">
                {button.title}{button.description ? <span className="block text-xs font-normal text-zinc-500">{button.description}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <button type="button" disabled={busy} onClick={() => post('/api/preview/alert', { kind: 'ACCESS' })} className="min-h-9 rounded-full border border-zinc-200 px-3 text-xs dark:border-zinc-700">Simular pedido de acceso</button>
        <button type="button" disabled={busy} onClick={() => post('/api/preview/alert', { kind: 'PULSE', fuera: true })} className="min-h-9 rounded-full border border-zinc-200 px-3 text-xs dark:border-zinc-700">Aviso tras un día sin escribir</button>
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <input aria-label="Mensaje" value={text} onChange={(event) => setText(event.target.value)} placeholder="Mensaje" className="min-h-11 flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
        <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Enviar</button>
      </form>
    </section>
  );
}

function Preview() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ConfirmDialogProvider>
          <BrainToaster />
          <div className="min-h-screen bg-background text-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm">
              <span>Muestra local · Sin Meta ni base de datos · Bria responde sin modelo</span>
              <button className="min-h-11 rounded-lg border px-3" onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
            </div>
            <main className="mx-auto grid max-w-5xl gap-6 p-6" style={{ gridTemplateColumns: window.innerWidth >= 1024 ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)' }}>
              <div className="space-y-4">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Mi Espacio · Rodny Muestra</h1>
                <WhatsAppLink />
              </div>
              <Phone />
            </main>
          </div>
        </ConfirmDialogProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<Preview />);
