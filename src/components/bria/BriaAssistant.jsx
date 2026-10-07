import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Sparkles, X } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { answerBlocks } from '@/lib/briaAnswerFormat';
import { cn } from '@/lib/utils';

/**
 * La entrada a Bria desde cualquier pantalla (Rodny, 6 de octubre de 2026: «un asistente completo de
 * acompañamiento y ayuda según su rol»). Un botón en la barra superior abre un diálogo centrado donde la
 * persona pregunta en sus palabras; el servidor responde con lo que las herramientas le devolvieron para
 * esa persona (sus permisos van en cada herramienta) y con las fuentes, que aquí son enlaces al sitio de la
 * plataforma donde está cada cosa. Nada se pinta como respuesta antes de que el servidor responda.
 */

const MAX_HISTORY = 10;
const SOURCE_KINDS = { tarea: 'Tarea', pieza: 'Pieza', cliente: 'Cliente', minuta: 'Reunión' };
const TOOL_LABELS = {
  buscar_cliente: 'la búsqueda de clientes',
  mis_tareas: 'tus tareas',
  tareas_de_cliente: 'las tareas del cliente',
  parrilla_de_cliente: 'la parrilla',
  operacion_de_cliente: 'la operación del cliente',
  memoria_de_reuniones: 'la memoria de reuniones',
  publicaciones_programadas: 'las publicaciones programadas'
};
const SUGGESTIONS = ['¿Qué tengo pendiente hoy?', '¿Qué sale esta semana en redes?', '¿Cómo va la parrilla de este mes de Endova?'];

export const askBria = async ({ question, history }) => {
  const token = localStorage.getItem('authToken');
  const response = await fetch(`${getApiBaseUrl()}/api/bria/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ question, history })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error('[BriaAssistant] Bria no pudo responder:', payload);
    throw Object.assign(new Error(payload?.message || 'Bria no pudo responder. Intenta de nuevo.'), { status: response.status });
  }
  return payload;
};

const firstNameOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function Answer({ turn, onOpenSource }) {
  const blocks = answerBlocks(turn.text);
  const failed = (turn.failures || []).map((failure) => TOOL_LABELS[failure.tool] || failure.tool);
  return (
    <div data-bria-turn="assistant" className="max-w-[92%] space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-cyan-deep dark:text-brand-cyan">Bria</p>
      <div className="space-y-2 text-sm leading-6 text-zinc-800 dark:text-zinc-100">
        {blocks.map((block, index) => (block.type === 'ul'
          ? <ul key={index} className="list-disc space-y-1 pl-5">{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
          : <p key={index}>{block.text}</p>))}
      </div>
      {failed.length > 0 && (
        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">Una parte de la consulta falló ({failed.join(', ')}); lo demás sí se leyó.</p>
      )}
      {turn.sources?.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Fuentes de la respuesta">
          {turn.sources.map((source) => (
            <li key={`${source.kind}:${source.id}`}>
              <button
                type="button"
                onClick={() => onOpenSource(source)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:border-brand-cyan/50 hover:text-brand-cyan-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-brand-cyan"
              >
                <span className="shrink-0 text-zinc-400 dark:text-zinc-500">{SOURCE_KINDS[source.kind] || 'Ver'}</span>
                <span className="truncate">{source.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BriaAssistant({ currentUser, initialOpen = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(initialOpen);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, turns.length, busy]);

  if (!currentUser?.id) return null;
  const firstName = firstNameOf(currentUser.name);

  const send = async (text) => {
    const value = String(text ?? question).trim();
    if (!value || busy) return;
    const history = turns.slice(-MAX_HISTORY).map(({ role, text: turnText }) => ({ role, text: turnText }));
    const id = `u-${Date.now()}`;
    setTurns((current) => [...current, { id, role: 'user', text: value }]);
    setQuestion('');
    setBusy(true);
    try {
      const result = await askBria({ question: value, history });
      setTurns((current) => [...current, { id: `a-${Date.now()}`, role: 'assistant', text: result.answer, sources: result.sources || [], failures: result.failures || [] }]);
    } catch (error) {
      toast.error(String(error.message || 'Bria no pudo responder. Intenta de nuevo.').slice(0, 70));
      // Lo escrito no se pierde por un fallo: la pregunta vuelve al campo y la burbuja se retira.
      setTurns((current) => current.filter((turn) => turn.id !== id));
      setQuestion(value);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const openSource = (source) => {
    if (!source?.url) return;
    setOpen(false);
    navigate(source.url);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="rounded-full h-11 w-11"
        aria-label="Preguntarle a Bria"
        title="Preguntarle a Bria"
        data-bria-assistant-trigger
        onClick={() => setOpen(true)}
      >
        <Sparkles className="w-4 h-4 text-brand-cyan-deep dark:text-brand-cyan" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          data-bria-assistant-dialog
          // El diálogo compartido es una rejilla: tres filas, y la conversación se queda con el alto que sobra.
          className="h-[min(640px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-xl"
          onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}
        >
          <div className="brain-ai-header relative shrink-0 px-5 py-4 pr-14 text-white sm:px-6 sm:pr-14">
            <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white" aria-hidden="true">
                <img src="/brainstudio-mascot-tip.png" alt="" className="h-11 w-11 object-contain" />
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-lg leading-6 text-white">Pregúntale a Bria</DialogTitle>
                <DialogDescription className="text-sm leading-5 text-white/95">Solo respondo con lo que hay en la plataforma y con lo que tú puedes ver.</DialogDescription>
              </div>
            </DialogHeader>
            <DialogClose asChild>
              <button type="button" aria-label="Cerrar" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white">
                <X className="h-4 w-4" />
              </button>
            </DialogClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6" aria-live="polite">
            {turns.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {firstName ? `Hola, ${firstName}. ` : ''}Pregúntame por tus tareas, un cliente, su parrilla o lo que sale en redes. Si tienes acceso, también por la operación de un cliente y lo que se dijo en reuniones.
                </p>
                <ul className="flex flex-wrap gap-2" aria-label="Preguntas de ejemplo">
                  {SUGGESTIONS.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => send(suggestion)}
                        className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-brand-cyan/50 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/40 dark:border-zinc-700 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ol className="space-y-5">
                {turns.map((turn) => (
                  <li key={turn.id} className={cn('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {turn.role === 'user'
                      ? <p data-bria-turn="user" className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2 text-sm leading-6 text-zinc-900 dark:bg-white/10 dark:text-zinc-100">{turn.text}</p>
                      : <Answer turn={turn} onOpenSource={openSource} />}
                  </li>
                ))}
                {busy && (
                  <li className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400" data-bria-busy>
                    <Loader2 className="h-4 w-4 animate-spin text-brand-cyan" aria-hidden="true" />
                    Bria está buscando…
                  </li>
                )}
              </ol>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex shrink-0 items-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-5"
            onSubmit={(event) => { event.preventDefault(); send(); }}
          >
            <label htmlFor="bria-assistant-question" className="sr-only">Tu pregunta para Bria</label>
            <textarea
              id="bria-assistant-question"
              ref={inputRef}
              value={question}
              rows={1}
              maxLength={1000}
              placeholder="Escribe tu pregunta…"
              disabled={busy}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
              }}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400 focus:border-brand-cyan/60 focus:outline-none focus:ring-2 focus:ring-brand-cyan/30 disabled:opacity-60 dark:border-zinc-700 dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <Button type="submit" size="icon" aria-label="Enviar la pregunta" disabled={busy || !question.trim()} className="h-11 w-11 shrink-0 rounded-xl">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
