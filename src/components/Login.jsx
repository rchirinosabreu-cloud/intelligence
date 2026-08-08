import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { getApiBaseUrl } from '../lib/apiBaseUrl';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('expired') === 'true') {
      setInfoMsg('Tu sesión ha expirado por seguridad. Ingresa nuevamente.');
    }
    if (params.get('passwordChanged') === 'true') {
      setInfoMsg('Contraseña actualizada. Ingresa nuevamente con tu nueva clave.');
    }
  }, [location]);

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
              La operación creativa de Brainstudio reunida en un solo lugar para convertir ideas en movimiento.
            </p>
          </div>
        </section>

        <main className="flex min-h-screen items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">
            <div className="mb-10">
              <img src="/brainstudio-logo.png" alt="Brainstudio" className="mb-7 h-16 w-auto object-contain" />
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Brainstudio Intelligence</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-950 dark:text-white">
                Bienvenido de nuevo
              </h1>
              <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Accede a la plataforma operativa de la agencia.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
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
                <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Correo electrónico</span>
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

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Contraseña</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-500/20"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Verificando...' : 'Acceder'}
              </button>
            </form>

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
                Términos
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Login;
