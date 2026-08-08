import React, { useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 10) {
      setErrorMsg('Tu nueva contrasena debe tener al menos 10 caracteres.');
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
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/40 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="relative hidden min-h-[560px] overflow-hidden lg:block">
            <img
              src="/brainstudio-login-hero.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
            <div className="absolute bottom-8 left-8 right-8">
              <img src="/brainstudio-logo.png" alt="Brainstudio" className="mb-5 h-14 w-14 object-contain" />
              <p className="text-2xl font-bold leading-tight">Imagina. Crea. Conecta. Trasciende.</p>
            </div>
          </div>

          <div className="bg-white p-7 text-zinc-950 dark:bg-zinc-950 dark:text-white sm:p-10">
            <div className="mb-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Hola, {currentUser?.name || 'equipo Brain'}.</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Actualiza tu contrasena</h1>
              <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Para proteger la plataforma, necesitas crear una nueva contrasena antes de continuar.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Contrasena actual</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:focus:ring-indigo-500/20"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Tu nueva contrasena</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:focus:ring-indigo-500/20"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Confirmar nueva contrasena</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 dark:border-white/10 dark:bg-white/5 dark:focus:ring-indigo-500/20"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-60"
              >
                <LockKeyhole className="h-4 w-4" />
                {loading ? 'Actualizando...' : 'Guardar nueva contrasena'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
