import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, RefreshCw, ShieldCheck } from '@/components/ui/icons';
import OtpCodeInput from '@/components/ui/OtpCodeInput';
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
    const [useBackupCode, setUseBackupCode] = useState(false);
    const codeInputRef = useRef(null);
    const submittingRef = useRef(false);

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
        setUseBackupCode(false);
        setError('');
    };

    // Lo llaman el botón y la sexta casilla; el candado evita mandarlo dos veces.
    const run = async (value) => {
        if (submittingRef.current || !value) return;
        submittingRef.current = true;
        setLoading(true);
        setError('');
        const isDisable = mode === 'disable';
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/user/mfa${isDisable ? '' : '/recovery-codes'}`, {
                method: isDisable ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isDisable ? { password, code: value } : { code: value })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo completar la acción.');
            if (isDisable) updateCurrentUser({ mfaEnabled: false });
            else setFreshCodes(data.recoveryCodes);
            reset();
            await load();
        } catch (err) {
            console.error('MFA settings error:', err);
            setError(err.message);
            setCode('');
            codeInputRef.current?.focus();
        } finally {
            submittingRef.current = false;
            setLoading(false);
        }
    };

    const submit = (event) => {
        event.preventDefault();
        run(code);
    };

    // Desactivar pide además la contraseña: sin ella la sexta casilla no envía nada.
    const completeCode = (value) => {
        if (mode === 'disable' && !password) return;
        run(value);
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
                                        ? 'Para desactivarla escribe tu contraseña y después el código de la app.'
                                        : 'Los códigos anteriores dejarán de servir. Confirma con un código de la app.'}
                                </p>
                                {mode === 'disable' && (
                                    <label className="block space-y-2">
                                        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Contraseña</span>
                                        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} required autoComplete="current-password" />
                                    </label>
                                )}
                                {useBackupCode ? (
                                    <label className="block space-y-2">
                                        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Código de respaldo</span>
                                        <input
                                            type="text"
                                            autoComplete="off"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            value={code}
                                            onChange={(event) => setCode(normalizeSecondFactorInput(event.target.value))}
                                            className={`${inputClass} font-mono tracking-widest`}
                                            placeholder="abcde-fghjk"
                                            required
                                        />
                                    </label>
                                ) : (
                                    <label className="block space-y-2">
                                        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Código de la app</span>
                                        <OtpCodeInput
                                            ref={codeInputRef}
                                            value={code}
                                            onChange={setCode}
                                            onComplete={completeCode}
                                            busy={loading}
                                            invalid={Boolean(error) && !code}
                                        />
                                    </label>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { setUseBackupCode((previous) => !previous); setCode(''); setError(''); }}
                                    className="min-h-11 text-xs font-semibold text-brand-cyan-deep transition-colors hover:text-brand-cyan dark:text-brand-cyan"
                                >
                                    {useBackupCode ? 'Usar el código de la app' : 'Usar un código de respaldo'}
                                </button>
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
