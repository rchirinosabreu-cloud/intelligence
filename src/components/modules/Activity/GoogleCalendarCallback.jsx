import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { toast } from 'react-hot-toast';

const GoogleCalendarCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Conectando Google Calendar...');

  useEffect(() => {
    const code = searchParams.get('code');
    const oauthState = searchParams.get('state');
    if (!code || !oauthState) {
      setStatus('error');
      setMessage('Google no devolvio un codigo de autorizacion.');
      return;
    }

    const completeConnection = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/activity/google-calendar/oauth-callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('authToken')}`
          },
          body: JSON.stringify({
            code,
            state: oauthState
          })
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(error.details || error.error || 'No se pudo conectar Google Calendar');
        }

        setStatus('success');
        sessionStorage.removeItem('googleCalendarRequestedEmail');
        setMessage('Google Calendar conectado correctamente.');
        toast.success('Google Calendar conectado');
        setTimeout(() => navigate('/actividad'), 900);
      } catch (error) {
        console.error('Google Calendar OAuth callback error:', error);
        setStatus('error');
        setMessage(error.message || 'No se pudo conectar Google Calendar.');
        toast.error(error.message || 'No se pudo conectar Google Calendar');
      }
    };

    completeConnection();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
          {status === 'loading' && <Loader2 className="h-6 w-6 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="h-6 w-6" />}
          {status === 'error' && <AlertCircle className="h-6 w-6 text-red-500" />}
        </div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Google Calendar</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
        {status === 'error' && (
          <button
            type="button"
            onClick={() => navigate('/actividad')}
            className="mt-6 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20"
          >
            Volver a actividad
          </button>
        )}
      </div>
    </div>
  );
};

export default GoogleCalendarCallback;
