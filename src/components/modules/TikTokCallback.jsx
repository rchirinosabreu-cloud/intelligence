import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Loader2 } from '@/components/ui/icons';
import { TiktokLogo } from '@/components/ui/SocialBrandLogos';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { TIKTOK_RETURN_KEY } from './SocialAccountsWidget';

/**
 * A donde TikTok devuelve a la persona después de autorizar (25 de noviembre de 2026).
 *
 * TikTok entrega un código de un solo uso; el servidor lo cambia por la autorización y contesta con la
 * cuenta que autorizó. Aquí se **confirma** que esa es la cuenta del cliente antes de guardarla: quien
 * tenía otra sesión de TikTok abierta en el navegador conectaría la cuenta equivocada sin verlo.
 */
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

const TikTokCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Conectando con TikTok…');
  const [connection, setConnection] = useState(null);
  const [isLinking, setIsLinking] = useState(false);
  const exchangeRef = useRef(null);

  const goBack = (clientId = connection?.clientId) => {
    let returnTo = null;
    try {
      returnTo = sessionStorage.getItem(TIKTOK_RETURN_KEY);
      sessionStorage.removeItem(TIKTOK_RETURN_KEY);
    } catch {
      returnTo = null;
    }
    // Solo rutas de esta misma aplicación: lo guardado no puede mandar a otro sitio.
    navigate(returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : clientId ? `/cliente/${clientId}` : '/clientes');
  };

  useEffect(() => {
    let active = true;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const refused = searchParams.get('error');
    if (refused) {
      setStatus('error');
      setMessage(/denied|cancel/i.test(refused) ? 'Se canceló la autorización en TikTok. No se conectó nada.' : 'TikTok no autorizó la conexión.');
      return undefined;
    }
    if (!code || !state) {
      setStatus('error');
      setMessage('TikTok no devolvió un código de autorización.');
      return undefined;
    }
    // StrictMode repite los efectos y el código de TikTok solo se puede cambiar una vez.
    if (!exchangeRef.current || exchangeRef.current.code !== code) {
      exchangeRef.current = { code, promise: axios.post(`${getApiBaseUrl()}/api/social/tiktok/exchange`, { code, state }, { headers: authHeaders() }) };
    }
    exchangeRef.current.promise.then(({ data }) => {
      if (!active) return;
      setConnection(data);
      setStatus('confirm');
    }).catch((error) => {
      if (!active) return;
      console.error('[TikTok] No se pudo completar la conexión:', error.response?.data || error.message || error);
      setStatus('error');
      setMessage(error.response?.data?.error || 'No se pudo conectar con TikTok.');
    });
    return () => { active = false; };
  }, [searchParams]);

  const link = async () => {
    setIsLinking(true);
    try {
      await axios.post(`${getApiBaseUrl()}/api/social/tiktok/link`, { pending: connection.pending }, { headers: authHeaders() });
      toast.success('TikTok conectado');
      setStatus('success');
      setMessage('La cuenta quedó conectada.');
      goBack();
    } catch (error) {
      console.error('[TikTok] No se pudo guardar la cuenta:', error.response?.data || error.message || error);
      toast.error(error.response?.data?.error || 'No se pudo conectar la cuenta.');
    } finally {
      setIsLinking(false);
    }
  };

  const account = connection?.account || {};

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4 sm:p-6" data-tiktok-callback>
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan">
          {status === 'loading' && <Loader2 className="h-6 w-6 animate-spin" />}
          {status === 'confirm' && <TiktokLogo className="h-6 w-6" />}
          {status === 'success' && <CheckCircle2 className="h-6 w-6" />}
          {status === 'error' && <AlertCircle className="h-6 w-6 text-destructive" />}
        </div>
        <h1 className="break-words text-center text-xl font-bold text-zinc-900 dark:text-white">
          {status === 'confirm' ? `Cuenta de TikTok de ${connection.clientName}` : 'TikTok'}
        </h1>

        {status === 'confirm' ? (
          <>
            <p className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-400">Confirma que esta es la cuenta de este cliente antes de conectarla.</p>
            <div className="mt-5 flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200 px-3 py-3 dark:border-white/10" data-tiktok-account>
              {account.avatarUrl
                ? <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-white/10"><TiktokLogo className="h-5 w-5" aria-hidden="true" /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-zinc-900 dark:text-zinc-50">{account.nickname || account.username || 'Cuenta de TikTok'}</span>
                {account.username && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">@{account.username}</span>}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              ¿No es esta? Cancela, cambia de cuenta en tiktok.com y vuelve a conectar.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => goBack()} disabled={isLinking}>Cancelar</Button>
              <Button type="button" onClick={link} disabled={isLinking}>
                {isLinking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Conectar esta cuenta
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-400" aria-live="polite">{message}</p>
            {status === 'error' && (
              <div className="mt-6 flex justify-center">
                <Button type="button" onClick={() => goBack()}>Volver a la ficha del cliente</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TikTokCallback;
