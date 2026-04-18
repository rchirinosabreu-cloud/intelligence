import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/apiBaseUrl';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
          throw new Error('Credenciales incorrectas');
      }

      const data = await response.json();
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
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl p-8 relative overflow-hidden">

        {/* Glow effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="text-center mb-8 relative z-10">
          <div className="flex justify-center mb-4">
             <img src="/brainstudio-logo.png" alt="Brainstudio" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Brainstudio OS
          </h1>
          <p className="text-zinc-400 mt-2 text-sm">Intelligence & Agency Operations</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
          {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
                  {errorMsg}
              </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 uppercase tracking-wider">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-950/50 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              placeholder="tu@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 uppercase tracking-wider">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-950/50 border border-zinc-800 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 mt-2 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-all duration-200 shadow-[0_0_20px_rgba(var(--primary),0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? 'Verificando...' : 'Acceder al Sistema'}
          </button>
        </form>
      </div>

      {/* Public Legal Links */}
      <div className="mt-8 flex gap-6 relative z-10">
        <Link
          to="/privacidad"
          className="text-[10px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Privacidad
        </Link>
        <Link
          to="/terminos"
          className="text-[10px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Términos
        </Link>
      </div>
    </div>
  );
};

export default Login;
