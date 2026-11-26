import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { MessageCircle, SendMessage, Check, AlertCircle, Loader2, Megaphone, Clock } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { useCrmWhatsApp, useSendWhatsApp } from './crmApi';
import { formatDateTime } from './crmPresentation';
import { CRM_TIMEZONE } from '@/lib/crmRules';

// La conversación de WhatsApp de un prospecto (26 de noviembre de 2026): lo que escribió, la bienvenida de Bria y lo
// que respondió el equipo, con su estado de entrega. Se responde aquí mismo dentro de las 24 horas que deja Meta.

const timeFormatter = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: CRM_TIMEZONE });
const formatTime = value => (value ? timeFormatter.format(new Date(value)) : '');

/** ✓ enviado · ✓✓ entregado · ✓✓ en color leído · aviso si falló. */
export const DeliveryStatus = ({ status }) => {
  if (!status) return null;
  if (status === 'FAILED') return <span className="inline-flex items-center gap-1 text-destructive" title="No se entregó"><AlertCircle className="h-3 w-3" /> No se entregó</span>;
  const label = { SENT: 'Enviado', DELIVERED: 'Entregado', READ: 'Leído' }[status] || status;
  const double = status === 'DELIVERED' || status === 'READ';
  return (
    <span className={cn('inline-flex items-center', status === 'READ' ? 'text-brand-cyan-deep dark:text-brand-cyan' : 'text-zinc-400')} title={label} aria-label={label}>
      <Check className="h-3 w-3" />
      {double && <Check className="-ml-1.5 h-3 w-3" />}
    </span>
  );
};

const authorLabel = message => {
  if (message.direction === 'IN') return null;
  if (message.author === 'BRIA') return 'Bria · bienvenida automática';
  return message.authorName || 'Equipo';
};

const Bubble = ({ message }) => {
  const mine = message.direction === 'OUT';
  return (
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')} data-wa-message={message.direction}>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-6 shadow-sm sm:max-w-[75%]',
        mine
          ? 'rounded-br-md bg-brand-cyan/10 text-zinc-900 ring-1 ring-brand-cyan/20 dark:bg-brand-cyan/15 dark:text-zinc-50'
          : 'rounded-bl-md border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50'
      )}>
        {message.referral && (
          <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-lg bg-brand-magenta/10 px-2 py-0.5 text-xs font-medium text-brand-magenta-deep dark:text-brand-magenta">
            <Megaphone className="h-3 w-3" /> {message.referral.headline ? `Desde el anuncio «${message.referral.headline}»` : 'Desde un anuncio de Meta'}
          </p>
        )}
        {authorLabel(message) && <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{authorLabel(message)}</p>}
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] text-zinc-400" title={formatDateTime(message.occurredAt)}>
          {formatTime(message.occurredAt)}
          {mine && <DeliveryStatus status={message.status} />}
        </p>
      </div>
    </li>
  );
};

const CrmWhatsAppPanel = ({ leadId, origin }) => {
  const { data, isLoading, error } = useCrmWhatsApp(leadId);
  const send = useSendWhatsApp();
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const messages = data?.messages || [];
  const contact = data?.contacts?.[0] || null;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  // Solo aparece si hay conversación, o si la oportunidad vino por WhatsApp y todavía carga.
  if (!isLoading && !error && !contact && origin !== 'WHATSAPP') return null;

  const submit = event => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    send.mutate({ id: leadId, text: value }, {
      onSuccess: () => { setText(''); toast.success('Mensaje enviado por WhatsApp.'); },
      onError: failure => toast.error(failure.message)
    });
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950" data-crm-whatsapp>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          <MessageCircle className="h-4 w-4 text-brand-cyan-deep dark:text-brand-cyan" /> Conversación de WhatsApp
        </h2>
        {contact?.phone && <span className="text-xs text-zinc-500 dark:text-zinc-400">{contact.profileName ? `${contact.profileName} · ` : ''}{contact.phone}</span>}
      </div>

      {isLoading && <p className="flex items-center gap-2 py-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando la conversación…</p>}
      {error && <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error.message}</p>}

      {!isLoading && !error && (
        <>
          {messages.length === 0 ? (
            <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">Todavía no hay mensajes de WhatsApp con esta persona.</p>
          ) : (
            <ol ref={listRef} className="max-h-[26rem] space-y-2 overflow-y-auto overscroll-contain rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60" aria-label="Mensajes de WhatsApp">
              {messages.map(message => <Bubble key={message.id} message={message} />)}
            </ol>
          )}

          {contact && (contact.canReply ? (
            <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label htmlFor={`wa-reply-${leadId}`} className="sr-only">Responder por WhatsApp</label>
              <textarea
                id={`wa-reply-${leadId}`}
                value={text}
                onChange={event => setText(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event); }}
                maxLength={data?.maxLength || 4096}
                rows={2}
                placeholder="Escribe la respuesta…"
                className="min-h-[2.75rem] w-full flex-1 resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
              <Button type="submit" disabled={send.isPending || !text.trim()} className="w-full gap-2 sm:w-auto">
                {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendMessage className="h-4 w-4" />} Enviar
              </Button>
            </form>
          ) : (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-status-attention/15 px-3 py-2.5 text-sm text-status-attention-fg">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              Pasaron más de 24 horas desde su último mensaje. WhatsApp solo deja escribirle con una plantilla aprobada; mientras tanto, llámala o escríbele por otro medio.
            </p>
          ))}
          {contact?.canReply && contact.windowClosesAt && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Puedes escribirle libre hasta el {formatDateTime(contact.windowClosesAt)}</p>
          )}
        </>
      )}
    </section>
  );
};

export default CrmWhatsAppPanel;
