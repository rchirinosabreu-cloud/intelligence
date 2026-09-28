import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from '@/components/ui/icons';
import { useAuth } from '../context/AuthContext';
import MfaEnrollment, { secondaryButtonClass } from './security/MfaEnrollment';

// Rol con verificación en dos pasos obligatoria (MFA_REQUIRED_ROLES) que aún no la activó:
// el servidor responde 428 a todo lo demás, así que esta es la única pantalla disponible.
const ForceMfaEnrollment = () => {
    const { currentUser, logout, updateCurrentUser } = useAuth();
    const navigate = useNavigate();

    const handleDone = () => {
        updateCurrentUser({ mfaEnabled: true, mfaEnrollmentRequired: false });
        navigate('/', { replace: true });
    };

    const handleUseAnotherAccount = () => {
        logout();
        navigate('/login', { replace: true });
    };

    return (
        <div className="min-h-screen bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white">
            <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-10">
                <img src="/brainstudio-logo.png" alt="Brainstudio" className="mb-7 h-14 w-auto self-start object-contain" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Hola, {currentUser?.name || 'equipo Brain'}.</p>
                <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold tracking-tight">
                    <ShieldCheck className="h-8 w-8 text-brand-green-deep dark:text-brand-green" />
                    Activa la verificación en dos pasos
                </h1>
                <p className="mb-8 mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                    Tu rol tiene acceso a información sensible de la agencia y de los clientes. Desde ahora, además de tu
                    contraseña, al entrar te pediremos un código de tu teléfono.
                </p>
                <div className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
                    <MfaEnrollment email={currentUser?.email} onDone={handleDone} />
                </div>
                <button type="button" onClick={handleUseAnotherAccount} className={`${secondaryButtonClass} mt-6 self-start`}>
                    <ArrowLeft className="h-4 w-4" />
                    Usar otra cuenta
                </button>
            </main>
        </div>
    );
};

export default ForceMfaEnrollment;
