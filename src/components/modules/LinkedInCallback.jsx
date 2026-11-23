import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Loader2 } from '@/components/ui/icons';
import { LinkedinLogo } from '@/components/ui/SocialBrandLogos';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { LINKEDIN_RETURN_KEY } from './SocialAccountsWidget';

/**
 * A donde LinkedIn devuelve a la persona después de autorizar (23 de noviembre de 2026).
 *
 * LinkedIn entrega un código de un solo uso; el servidor lo cambia por la autorización y contesta con las
 * páginas de empresa donde esa persona puede publicar. Aquí se elige cuál es la de este cliente: nunca se
 * conecta una sola de oficio, porque quien administra varias páginas conectaría la equivocada sin verlo.
 */
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });

const LinkedInCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Conectando con LinkedIn…');
  const [connection, setConnection] = useState(null);
  const [organizationId, setOrganizationId] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const exchangeRef = useRef(null);

  const goBack = (clientId = connection?.clientId) => {
    let returnTo = null;
    try {
      returnTo = sessionStorage.getItem(LINKEDIN_RETURN_KEY);
      sessionStorage.removeItem(LINKEDIN_RETURN_KEY);
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
      setMessage(/cancel/i.test(refused) ? 'Se canceló la autorización en LinkedIn. No se conectó nada.' : (searchParams.get('error_description') || 'LinkedIn no autorizó la conexión.'));
      return undefined;
    }
    if (!code || !state) {
      setStatus('error');
      setMessage('LinkedIn no devolvió un código de autorización.');
      return undefined;
    }
    // StrictMode repite los efectos y el código de LinkedIn solo se puede cambiar una vez.
    if (!exchangeRef.current || exchangeRef.current.code !== code) {
      exchangeRef.current = { code, promise: axios.post(`${getApiBaseUrl()}/api/social/linkedin/exchange`, { code, state }, { headers: authHeaders() }) };
    }
    exchangeRef.current.promise.then(({ data }) => {
      if (!active) return;
      setConnection(data);
      if (!data.organizations?.length) {
        setStatus('error');
        setMessage('Tu usuario de LinkedIn no administra ninguna página de empresa. Tiene que autorizar alguien que sea administrador de la página del cliente.');
        return;
      }
      setStatus('choose');
    }).catch((error) => {
      if (!active) return;
      console.error('[LinkedIn] No se pudo completar la conexión:', error.response?.data || error.message || error);
      setStatus('error');
      setMessage(error.response?.data?.error || 'No se pudo conectar con LinkedIn.');
    });
    return () => { active = false; };
  }, [searchParams]);

  const link = async () => {
    setIsLinking(true);
    try {
      await axios.post(`${getApiBaseUrl()}/api/social/linkedin/link`, { pending: connection.pending, organizationId }, { headers: authHeaders() });
      toast.success('LinkedIn conectado');
      setStatus('success');
      setMessage('La página quedó conectada.');
      goBack();
    } catch (error) {
      console.error('[LinkedIn] No se pudo guardar la página:', error.response?.data || error.message || error);
      toast.error(error.response?.data?.error || 'No se pudo conectar la página.');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4 sm:p-6" data-linkedin-callback>
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan">
          {status === 'loading' && <Loader2 className="h-6 w-6 animate-spin" />}
          {status === 'choose' && <LinkedinLogo className="h-6 w-6" />}
          {status === 'success' && <CheckCircle2 className="h-6 w-6" />}
          {status === 'error' && <AlertCircle className="h-6 w-6 text-destructive" />}
        </div>
        <h1 className="text-center text-xl font-bold text-zinc-900 dark:text-white">
          {status === 'choose' ? `Página de LinkedIn de ${connection.clientName}` : 'LinkedIn'}
        </h1>

        {status === 'choose' ? (
          <>
            <p className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-400">Elige cuál de las páginas que administras es la de este cliente.</p>
            <fieldset className="mt-5 max-h-[50vh] min-w-0 space-y-2 overflow-y-auto pr-1">
              <legend className="sr-only">Páginas de LinkedIn disponibles</legend>
              {connection.organizations.map((organization) => (
                <label
                  key={organization.organizationId}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${organizationId === organization.organizationId ? 'border-brand-cyan bg-brand-cyan-soft/40 dark:bg-brand-cyan/10' : 'border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5'}`}
                >
                  <input type="radio" name="linkedin-page" value={organization.organizationId} checked={organizationId === organization.organizationId} onChange={() => setOrganizationId(organization.organizationId)} className="accent-brand-cyan" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-zinc-900 dark:text-zinc-50">{organization.name}</span>
                    {organization.vanityName && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">linkedin.com/company/{organization.vanityName}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => goBack()} disabled={isLinking}>Cancelar</Button>
              <Button type="button" onClick={link} disabled={!organizationId || isLinking}>
                {isLinking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Conectar
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

export default LinkedInCallback;
