import React, { useState } from 'react';
import { ArrowLeft, Lock, LockKeyhole } from '@/components/ui/icons';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/apiBaseUrl';
import { useAuth } from '../context/AuthContext';

const ForcePasswordChange = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUseAnotherAccount = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 10) {
      setErrorMsg('Tu nueva contrasena debe tener al menos 10 caracteres.');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg('Tu nueva contrasena debe ser diferente a la actual.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('La confirmacion no coincide con tu nueva contrasena.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/user/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo actualizar la contrasena');
      }

      logout();
      navigate('/login?passwordChanged=true', { replace: true });
    } catch (error) {
      console.error('Forced password change error:', error);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden overflow-hidden bg-indigo-50 lg:block">
          <img
            src="/brainstudio-login-hero.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-indigo-950/35 via-indigo-950/5 to-white/0" />
          <div className="absolute inset-x-0 bottom-0 p-12">
            <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/45 bg-white/40 px-4 py-2 text-xs font-semibold text-indigo-900 shadow-sm backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.7)]" />
              Brainstudio OS
            </div>
            <h2 className="max-w-md text-4xl font-bold leading-tight text-indigo-950">
              Imagina. Crea. Conecta. Trasciende.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-indigo-950/65">
              La operacion creativa de Brainstudio reunida en un solo lugar para convertir ideas en movimiento.
            </p>
          </div>
        </section>

        <main className="flex min-h-screen items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">
            <div className="mb-10">
              <img src="/brainstudio-logo.png" alt="Brainstudio" className="mb-7 h-16 w-auto object-contain" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Hola, {currentUser?.name || 'equipo Brain'}.</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-950 dark:text-white">
                Actualiza tu contrasena
              </h1>
              <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Para proteger la plataforma, necesitas crear una nueva contrasena antes de continuar.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {errorMsg && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600 animate-in fade-in zoom-in duration-300 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Contrasena actual</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-500/20"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Tu nueva contrasena</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-500/20"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Confirmar nueva contrasena</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white py-3 pl-11 pr-4 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-indigo-500/20"
                    required
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LockKeyhole className="h-4 w-4" />
                {loading ? 'Actualizando...' : 'Guardar nueva contrasena'}
              </button>

              <button
                type="button"
                onClick={handleUseAnotherAccount}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-indigo-400/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Usar otra cuenta
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
