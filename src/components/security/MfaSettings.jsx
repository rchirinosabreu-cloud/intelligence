import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, RefreshCw, ShieldCheck } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { normalizeSecondFactorInput } from '@/lib/mfaClient';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import MfaEnrollment, { ErrorNote, inputClass, primaryButtonClass, secondaryButtonClass } from './MfaEnrollment';
import MfaRecoveryCodes from './MfaRecoveryCodes';

// Verificación en dos pasos en «Mi Espacio» (27 de septiembre de 2026).

const formatDate = (value) => (value
    ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' })
    : '');

const MfaSettings = () => {
    const { currentUser, updateCurrentUser } = useAuth();
    const [status, setStatus] = useState(null);
    const [mode, setMode] = useState('idle'); // idle | enroll | regenerate | disable
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [freshCodes, setFreshCodes] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/user/mfa`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo consultar la verificación en dos pasos.');
            setStatus(data);
        } catch (err) {
            setError(err.message);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const reset = () => {
        setMode('idle');
        setCode('');
        setPassword('');
        setError('');
    };

    const submit = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        const isDisable = mode === 'disable';
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/user/mfa${isDisable ? '' : '/recovery-codes'}`, {
                method: isDisable ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isDisable ? { password, code } : { code })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo completar la acción.');
            if (isDisable) updateCurrentUser({ mfaEnabled: false });
            else setFreshCodes(data.recoveryCodes);
            reset();
            await load();
        } catch (err) {
            setError(err.message);
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const finishEnrollment = async () => {
        updateCurrentUser({ mfaEnabled: true, mfaEnrollmentRequired: false });
        reset();
        await load();
    };

    return (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
                <h3 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    <ShieldCheck className="h-5 w-5 text-brand-green-deep dark:text-brand-green" /> Verificación en dos pasos
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Además de tu contraseña, al entrar se pide un código de tu teléfono.
                </p>
            </div>
            <div className="space-y-4 p-6">
                {!status && !error && <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />}

                {freshCodes && (
                    <MfaRecoveryCodes codes={freshCodes} email={currentUser?.email} onDone={() => setFreshCodes(null)} doneLabel="Ya los guardé" />
                )}

                {status && !status.enabled && !freshCodes && (
                    mode === 'enroll'
                        ? <MfaEnrollment email={currentUser?.email} onDone={finishEnrollment} />
                        : (
                            <>
                                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                                    {status.required
                                        ? 'Tu rol exige la verificación en dos pasos. Actívala para seguir usando la plataforma.'
                                        : 'Está desactivada. Te recomendamos activarla: protege tu cuenta aunque alguien conozca tu contraseña.'}
                                </p>
                                <button type="button" onClick={() => setMode('enroll')} className={primaryButtonClass}>
                                    <ShieldCheck className="h-4 w-4" /> Activar
                                </button>
                            </>
                        )
                )}

                {status?.enabled && !freshCodes && (
                    <>
                        <div className="rounded-xl border border-brand-green/40 bg-brand-green-soft px-4 py-3 text-sm text-brand-green-deep dark:bg-brand-green/10 dark:text-brand-green">
                            Activa desde el {formatDate(status.enabledAt)}. Te quedan {status.recoveryCodesRemaining} códigos de respaldo.
                        </div>

                        {mode === 'idle' ? (
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => setMode('regenerate')} className={secondaryButtonClass}>
                                    <RefreshCw className="h-4 w-4" /> Nuevos códigos de respaldo
                                </button>
                                {!status.required && (
                                    <button type="button" onClick={() => setMode('disable')} className={cn(secondaryButtonClass, 'text-destructive hover:bg-destructive/10 dark:text-destructive')}>
                                        Desactivar
                                    </button>
                                )}
                            </div>
                        ) : (
                            <form onSubmit={submit} className="space-y-4">
                                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                                    {mode === 'disable'
                                        ? 'Para desactivarla confirma tu contraseña y un código de la app.'
                                        : 'Los códigos anteriores dejarán de servir. Confirma con un código de la app.'}
                                </p>
                                {mode === 'disable' && (
                                    <label className="block space-y-2">
                                        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Contraseña</span>
                                        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} required autoComplete="current-password" />
                                    </label>
                                )}
                                <label className="block space-y-2">
                                    <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Código de la app o de respaldo</span>
                                    <input
                                        type="text"
                                        autoComplete="one-time-code"
                                        value={code}
                                        onChange={(event) => setCode(normalizeSecondFactorInput(event.target.value))}
                                        className={`${inputClass} font-mono tracking-widest`}
                                        placeholder="000000"
                                        required
                                    />
                                </label>
                                <ErrorNote>{error}</ErrorNote>
                                <div className="flex flex-wrap gap-2">
                                    <button type="submit" disabled={loading || !code} className={cn(primaryButtonClass, 'sm:w-auto', mode === 'disable' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}>
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                        {mode === 'disable' ? 'Desactivar' : 'Generar nuevos códigos'}
                                    </button>
                                    <button type="button" onClick={reset} className={secondaryButtonClass}>Cancelar</button>
                                </div>
                            </form>
                        )}
                    </>
                )}

                {mode === 'idle' && <ErrorNote>{error}</ErrorNote>}
            </div>
        </div>
    );
};

export default MfaSettings;
