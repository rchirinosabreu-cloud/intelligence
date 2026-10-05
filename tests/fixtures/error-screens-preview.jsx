import React from 'react';
import { createRoot } from 'react-dom/client';
import ApplicationErrorBoundary from '../../src/components/errors/ApplicationErrorBoundary';
import '../../src/index.css';

// Muestra local de las pantallas de error (5 de octubre de 2026). ?caso=real provoca un error de
// una pantalla; ?caso=version, un archivo de una versión anterior que ya se intentó recuperar.
// Nada sale al servidor: sin sesión el registro no se envía.
const params = new URLSearchParams(location.search);
const caso = params.get('caso') || 'real';
if (params.has('oscuro')) document.documentElement.classList.add('dark');
if (caso === 'version') sessionStorage.setItem('brainstudio:preload-recovery', `${typeof __BUILD_SHA__ === 'undefined' ? 'development' : __BUILD_SHA__}:${location.pathname}${location.search}`);

function Broken() {
    if (caso === 'version') throw new TypeError('Failed to fetch dynamically imported module: /assets/FinancialDashboard-a1b2c3.js');
    throw new TypeError("Cannot read properties of undefined (reading 'amount')");
}

createRoot(document.getElementById('root')).render(
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <header className="flex h-16 items-center border-b border-zinc-200 bg-white px-6 text-sm font-semibold text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200">Menú y header siguen en pie</header>
        <main className="mx-auto max-w-5xl px-6">
            <ApplicationErrorBoundary scope="page"><Broken /></ApplicationErrorBoundary>
        </main>
    </div>
);
