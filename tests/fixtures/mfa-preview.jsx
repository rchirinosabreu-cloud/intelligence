import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import Login from '../../src/components/Login';
import ForceMfaEnrollment from '../../src/components/ForceMfaEnrollment';
import MfaSettings from '../../src/components/security/MfaSettings';
import { ConfirmDialogProvider } from '../../src/components/ui/ConfirmDialog';
import '../../src/index.css';

// Muestra local de la verificación en dos pasos: las pantallas reales contra la API de
// scripts/preview-mfa.js. Como en main.jsx, el token viaja en cada petición a la API.
const originalFetch = window.fetch;
window.fetch = (resource, config = {}) => {
    const headers = new Headers(config.headers || {});
    const token = localStorage.getItem('authToken');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return originalFetch(resource, { ...config, headers });
};

function Shell() {
    const { isAuthenticated, isLoading, currentUser, login, logout } = useAuth();
    if (isLoading) return null;
    if (!isAuthenticated) return <Login onLogin={login} />;
    if (currentUser?.mfaEnrollmentRequired) {
        return (
            <Routes>
                <Route path="/activar-verificacion" element={<ForceMfaEnrollment />} />
                <Route path="*" element={<Navigate to="/activar-verificacion" replace />} />
            </Routes>
        );
    }
    return (
        <main className="mx-auto max-w-xl space-y-4 p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Mi Espacio · {currentUser?.name}</h1>
                <button type="button" onClick={logout} className="rounded-lg border px-3 py-2 text-sm">Cerrar sesión</button>
            </div>
            <MfaSettings />
        </main>
    );
}

function Preview() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ConfirmDialogProvider>
                    <div className="min-h-screen bg-background text-foreground">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm">
                            <span>Muestra local · Datos en memoria · Sin correos ni servicios externos</span>
                            <button className="min-h-11 rounded-lg border px-3" onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
                        </div>
                        <Shell />
                    </div>
                </ConfirmDialogProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

createRoot(document.getElementById('root')).render(<Preview />);
