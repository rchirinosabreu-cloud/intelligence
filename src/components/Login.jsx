import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, KeyRound, Lock, Mail } from '@/components/ui/icons';
import { getApiBaseUrl } from '../lib/apiBaseUrl';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('expired') === 'true') {
      setInfoMsg('Tu sesion ha expirado por seguridad. Ingresa nuevamente.');
    }
    if (params.get('passwordChanged') === 'true') {
      setInfoMsg('Contrasena actualizada. Ingresa nuevamente con tu nueva clave.');
    }
  }, [location]);

  const clearMessages = () => {
    setErrorMsg('');
    setInfoMsg('');
  };

  const switchToLogin = () => {
    setAuthMode('login');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    clearMessages();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Credenciales incorrectas');
      }

      if (data.token) {
        onLogin(data.token, data.user);
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (event) => {
    event.preventDefault();
    setLoading(true);
    clearMessages();

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'No pudimos enviar el codigo de recuperacion.');
      }

      setInfoMsg(data.message || 'Si el correo existe, enviaremos un codigo de recuperacion.');
      setAuthMode('reset-confirm');
    } catch (error) {
      console.error('Password reset request error:', error);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (event) => {
    event.preventDefault();
    clearMessages();

    if (newPassword !== confirmPassword) {
      setErrorMsg('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: resetCode, newPassword })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'No pudimos actualizar la contrasena.');
      }

      setPassword('');
      setResetCode('');
      setNewPassword('');
      setConfirmPassword('');
      setAuthMode('login');
      setInfoMsg(data.message || 'Contrasena actualizada. Ingresa nuevamente con tu nueva clave.');
    } catch (error) {
      console.error('Password reset confirm error:', error);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const isResetRequest = authMode === 'reset-request';
  const isResetConfirm = authMode === 'reset-confirm';

  return (
    <div className="min-h-screen bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden overflow-hidden bg-zinc-950 lg:block">
          <img
            src="/brainstudio-login-hero.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/25 to-zinc-950/5" />
          <div className="absolute inset-x-0 bottom-0 p-12">
            <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.85)]" />
              Brainstudio OS
            </div>
            <h2 className="max-w-md text-4xl font-bold leading-tight text-white">
              Imagina. Crea. Conecta. Trasciende.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/70">
              La operacion creativa de Brainstudio reunida en un solo lugar para convertir ideas en movimiento.
            </p>
          </div>
        </section>

        <main className="flex min-h-screen items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">
            <div className="mb-10">
              <img src="/brainstudio-logo.png" alt="Brainstudio" className="mb-7 h-16 w-auto object-contain" />
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Brainstudio Intelligence</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-950 dark:text-white">
                {authMode === 'login' ? 'Bienvenido de nuevo' : 'Recupera tu acceso'}
              </h1>
              <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                {authMode === 'login'
                  ? 'Accede a la plataforma operativa de la agencia.'
                  : 'Te enviaremos un codigo al correo registrado para crear una nueva contrasena.'}
              </p>
            </div>

            <form
              onSubmit={isResetRequest ? handleResetRequest : isResetConfirm ? handleResetConfirm : handleSubmit}
              className="space-y-5"
            >
              {errorMsg && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600 animate-in fade-in zoom-in duration-300 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  {errorMsg}
                </div>
              )}
              {infoMsg && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-center text-sm text-indigo-700 animate-in fade-in zoom-in duration-300 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                  {infoMsg}
                </div>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Correo electronico</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-500/20"
                    placeholder="tu@email.com"
                    required
                  />
                </div>
              </label>

              {authMode === 'login' && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Contrasena</span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-500/20"
                      placeholder="********"
                      required
                    />
                  </div>
                </label>
              )}

              {isResetConfirm && (
                <>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Codigo de verificacion</span>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={resetCode}
                        onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-500/20"
                        placeholder="000000"
                        required
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Nueva contrasena</span>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-500/20"
                        placeholder="Minimo 8 caracteres"
                        required
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Confirmar contrasena</span>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-500/20"
                        placeholder="Repite la nueva contrasena"
                        required
                      />
                    </div>
                  </label>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#009EB9] px-4 py-3 font-semibold text-white shadow-lg shadow-[#009EB9]/20 transition hover:bg-[#008CA4] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? 'Verificando...'
                  : isResetRequest
                    ? 'Enviar codigo'
                    : isResetConfirm
                      ? 'Actualizar contrasena'
                      : 'Acceder'}
              </button>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              {authMode === 'login' ? (
                <button
                  type="button"
                  onClick={() => {
                    clearMessages();
                    setAuthMode('reset-request');
                  }}
                  className="text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
                >
                  Olvide mi contrasena
                </button>
              ) : (
                <button
                  type="button"
                  onClick={switchToLogin}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Volver al login
                </button>
              )}
            </div>

            <div className="mt-8 flex gap-6">
              <Link
                to="/privacidad"
                className="text-xs font-medium text-zinc-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-300"
              >
                Privacidad
              </Link>
              <Link
                to="/terminos"
                className="text-xs font-medium text-zinc-400 transition-colors hover:text-indigo-600 dark:hover:text-indigo-300"
              >
                Terminos
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Login;
