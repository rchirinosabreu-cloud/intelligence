import React, { useEffect, useRef, useState } from 'react';
import { Key } from '@/components/ui/icons';
import { requestVault, VAULT_REVEAL_MS } from '@/lib/vaultRequest';
import RevealedAccess from '@/components/vault/RevealedAccess';

// Las tarjetas de acceso que Bria deja bajo su respuesta (9 de octubre de 2026). Bria solo conoce el nombre;
// el valor lo pide la persona con «Ver acceso», la plataforma comprueba su permiso, registra la lectura y lo
// muestra durante un minuto.
function AccessCard({ card, request }) {
  const [shown, setShown] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hide = () => { clearTimeout(timer.current); setShown(null); };
  const reveal = async () => {
    setBusy(true); setError('');
    try {
      const access = await request(`/credentials/${encodeURIComponent(card.id)}/reveal`, { method: 'POST', body: { via: 'BRIA' } });
      setShown(access);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setShown(null), VAULT_REVEAL_MS);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900" data-access-card={card.id}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan"><Key className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{card.nombre}</p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{card.plataforma} · {card.cliente}</p>
        </div>
        <button type="button" disabled={busy} onClick={shown ? hide : reveal} className="min-h-11 shrink-0 rounded-xl border border-zinc-200 px-3 text-sm text-zinc-700 transition-colors hover:border-primary hover:text-brand-cyan-deep disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-brand-cyan">
          {busy ? 'Abriendo…' : shown ? 'Ocultar' : 'Ver acceso'}
        </button>
      </div>
      {shown && <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"><RevealedAccess access={shown} /><p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Se oculta en un minuto. Quedó registrado que lo viste.</p></div>}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </li>
  );
}

export default function BriaAccessCards({ cards = [], request = requestVault }) {
  if (!cards.length) return null;
  return <ul aria-label="Accesos" className="mt-3 space-y-2">{cards.map((card) => <AccessCard key={card.id} card={card} request={request} />)}</ul>;
}
