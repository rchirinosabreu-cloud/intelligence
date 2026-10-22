import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Check, Copy, ExternalLink, Loader2, MessageCircle } from '@/components/ui/icons';
import BriaPortrait from '@/components/bria/BriaPortrait';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { canUseBria } from '@/lib/briaLivingMemory';
import { useAuth } from '@/context/AuthContext';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
import { primaryButtonClass, secondaryButtonClass, ErrorNote } from '@/components/security/MfaEnrollment';
import { ALERT_KIND_LABELS } from '@/lib/whatsappAlertKinds';

// Bria en WhatsApp (Rodny, 20 de octubre de 2026): la persona vincula su número desde aquí, con su sesión. La
// plataforma le da un código de seis dígitos y ella se lo manda a Bria por WhatsApp: Bria nunca escribe primero.
// Mientras el código vive, la tarjeta pregunta cada pocos segundos si ya quedó vinculado. Vinculado, la persona
// elige qué avisos le llegan por ahí (22 de octubre de 2026): vienen encendidos y cada quien apaga los suyos.

const POLL_MS = 4000;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const api = (path, options) => fetch(`${getApiBaseUrl()}/api/bria/whatsapp${path}`, options).then(async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No se pudo hablar con la plataforma.');
  return data;
});

const WhatsAppLink = () => {
  const { currentUser } = useAuth();
  const confirm = useConfirmDialog();
  const [status, setStatus] = useState(null);
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [savingAlert, setSavingAlert] = useState(null);
  const copiedTimer = useRef(null);

  const load = useCallback(async () => {
    try { setStatus(await api('')); setError(''); }
    catch (failure) { setError(failure.message); }
  }, []);

  useEffect(() => { if (canUseBria(currentUser)) load(); }, [currentUser, load]);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Mientras hay un código vivo, se pregunta si ya quedó vinculado; el aviso sale solo con la respuesta del servidor.
  useEffect(() => {
    if (!code || status?.linked) return undefined;
    const expiresAt = new Date(code.expiresAt).getTime();
    const timer = setInterval(async () => {
      if (Date.now() > expiresAt) { setCode((current) => (current ? { ...current, expired: true } : current)); clearInterval(timer); return; }
      try {
        const fresh = await api('');
        if (fresh.linked) { setStatus(fresh); setCode(null); toast.success('Tu WhatsApp quedó vinculado con Bria'); clearInterval(timer); }
      } catch { /* la siguiente vuelta lo intenta otra vez */ }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [code, status?.linked]);

  if (!canUseBria(currentUser)) return null;

  const requestCode = async () => {
    setLoading(true); setError('');
    try { setCode(await api('/link-code', { method: 'POST' })); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(code.message); setCopied(true); clearTimeout(copiedTimer.current); copiedTimer.current = setTimeout(() => setCopied(false), 2000); }
    catch { setError('No se pudo copiar. Escríbelo a mano.'); }
  };

  // El interruptor cambia con lo que responde el servidor, nunca con el clic.
  const toggleAlert = async (kind, on) => {
    setSavingAlert(kind); setError('');
    try {
      const saved = await api('/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, on }) });
      setStatus((current) => ({ ...current, alerts: current.alerts.map((row) => (row.kind === saved.kind ? { ...row, on: saved.on } : row)) }));
    } catch (failure) { console.error('[WhatsApp] No se pudo cambiar el aviso:', failure.message); setError(failure.message); }
    finally { setSavingAlert(null); }
  };

  const unlink = async () => {
    if (!(await confirm({ title: 'Desvincular tu WhatsApp', description: `Bria dejará de responderte ${status.phone ? `en el ${status.phone}` : 'por WhatsApp'}. Puedes volver a vincularlo cuando quieras.`, confirmLabel: 'Desvincular' }))) return;
    setLoading(true); setError('');
    try { await api('', { method: 'DELETE' }); await load(); toast.success('Tu WhatsApp quedó desvinculado'); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };

  return (
    <div data-whatsapp-link className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="brain-ai-header flex items-center gap-3 px-6 py-4 text-white">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
          <BriaPortrait alt="" className="h-9 w-9" />
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-xl font-bold"><MessageCircle className="h-5 w-5" /> Bria en WhatsApp</h3>
          <p className="text-sm text-white/90">Escríbele a Bria desde tu celular, como lo haces aquí.</p>
        </div>
      </div>
      <div className="space-y-4 p-6">
        <ErrorNote>{error}</ErrorNote>
        {!status && !error && <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />}

        {status && !status.configured && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">El número de Bria todavía no está conectado. Cuando lo esté, aquí podrás vincular tu WhatsApp.</p>
        )}

        {status?.configured && status.linked && (
          <>
            <div className="rounded-xl border border-brand-green/40 bg-brand-green-soft px-4 py-3 text-sm text-brand-green-deep dark:bg-brand-green/10 dark:text-brand-green">
              {/* Meta no siempre manda el número de quien escribe (puede usar nombre de usuario): sin número, se dice sin él. */}
              {status.phone ? <>Vinculado al <strong>{status.phone}</strong></> : 'Tu WhatsApp quedó vinculado'} desde el {formatDate(status.linkedAt)}. Guarda el número de Bria: <strong>{status.numberDisplay}</strong>.
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Lo que hablen por WhatsApp queda en tu historial de Bria, con tus mismos permisos. Las contraseñas de la bóveda nunca salen por ahí.</p>
            {status.alerts?.length > 0 && (
              <div data-whatsapp-alerts className="space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Avisos que te llegan por aquí</p>
                {status.alerts.map(({ kind, on }) => {
                  const info = ALERT_KIND_LABELS[kind];
                  if (!info) return null;
                  return (
                    <div key={kind} className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-800 dark:text-zinc-200">{info.label}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{info.hint}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={info.label}
                        disabled={savingAlert === kind}
                        onClick={() => toggleAlert(kind, !on)}
                        className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60', on ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-600')}
                      >
                        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all', on ? 'left-[1.375rem]' : 'left-0.5')} />
                      </button>
                    </div>
                  );
                })}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Si llevas un día sin escribirle a Bria, te llega un aviso corto con «Ver aviso»; al tocarlo te lo muestra completo.</p>
              </div>
            )}
            <button type="button" onClick={unlink} disabled={loading} className={cn(secondaryButtonClass, 'text-destructive hover:bg-destructive/10 dark:text-destructive')}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Desvincular
            </button>
          </>
        )}

        {status?.configured && !status.linked && !code && (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Vincula tu número una vez. Te damos un código; se lo mandas a Bria por WhatsApp y listo.</p>
            <button type="button" onClick={requestCode} disabled={loading} className={primaryButtonClass}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Vincular mi WhatsApp
            </button>
          </>
        )}

        {status?.configured && !status.linked && code && (
          <div className="space-y-4" data-whatsapp-link-code>
            {code.expired ? (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">El código venció. Pide otro cuando tengas el celular a la mano.</p>
                <button type="button" onClick={requestCode} disabled={loading} className={primaryButtonClass}>Pedir otro código</button>
              </>
            ) : (
              <>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                  <li>Guarda el número de Bria: <strong className="text-zinc-900 dark:text-zinc-100">{code.numberDisplay}</strong>.</li>
                  <li>Mándale por WhatsApp este mensaje, tal cual:</li>
                </ol>
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <code className="text-2xl font-black tracking-widest text-zinc-900 dark:text-zinc-100">{code.message}</code>
                  <button type="button" onClick={copy} className={secondaryButtonClass} aria-label="Copiar el mensaje">
                    {copied ? <Check className="h-4 w-4 text-brand-green-deep dark:text-brand-green" /> : <Copy className="h-4 w-4" />} {copied ? 'Copiado' : 'Copiar'}
                  </button>
                  <a href={code.link} target="_blank" rel="noopener noreferrer" className={primaryButtonClass + ' w-auto'}>
                    <ExternalLink className="h-4 w-4" /> Abrir WhatsApp
                  </a>
                </div>
                <p className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando tu mensaje. El código vale 10 minutos y solo para tu número.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsAppLink;
