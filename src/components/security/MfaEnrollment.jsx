import React, { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Smartphone } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { formatTotpSecret, normalizeSecondFactorInput } from '@/lib/mfaClient';
import MfaRecoveryCodes from './MfaRecoveryCodes';

// Vincular la app autenticadora (27 de septiembre de 2026): QR, clave para escribir a mano,
// código de confirmación y, al final, los códigos de respaldo, que solo se muestran una vez.

export const inputClass = 'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white';
export const primaryButtonClass = 'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800';

export const ErrorNote = ({ children }) => (children ? (
    <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{children}</p>
) : null);

const MfaEnrollment = ({ email, onDone }) => {
    const [setup, setSetup] = useState(null);
    const [code, setCode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const start = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/user/mfa/setup`, { method: 'POST' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo generar el código QR.');
            setSetup(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const confirm = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/user/mfa/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo confirmar el código.');
            setRecoveryCodes(data.recoveryCodes);
        } catch (err) {
            setError(err.message);
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const copySecret = async () => {
        try {
            await navigator.clipboard.writeText(setup.secret);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    if (recoveryCodes) {
        return <MfaRecoveryCodes codes={recoveryCodes} email={email} onDone={onDone} doneLabel="Ya los guardé, terminar" />;
    }

    if (!setup) {
        return (
            <div className="space-y-4">
                <ol className="space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    <li>1. Instala en tu teléfono una app autenticadora: Google Authenticator, Microsoft Authenticator o 1Password.</li>
                    <li>2. Escanea el código QR que te mostraremos.</li>
                    <li>3. Escribe el código de seis dígitos que aparece en la app.</li>
                </ol>
                <ErrorNote>{error}</ErrorNote>
                <button type="button" onClick={start} disabled={loading} className={primaryButtonClass}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                    Vincular mi app autenticadora
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={confirm} className="space-y-5">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <img
                    src={setup.qrDataUrl}
                    alt="Código QR para vincular la app autenticadora"
                    className="h-44 w-44 shrink-0 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800"
                />
                <div className="min-w-0 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <p>Escanea el código con tu app. Si no puedes, escribe esta clave en la app:</p>
                    <p className="break-all rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs tracking-wider text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                        {formatTotpSecret(setup.secret)}
                    </p>
                    <button type="button" onClick={copySecret} className={secondaryButtonClass}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Clave copiada' : 'Copiar clave'}
                    </button>
                </div>
            </div>

            <label className="block space-y-2">
                <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Código de seis dígitos de la app</span>
                <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(normalizeSecondFactorInput(event.target.value).replace(/\D/g, ''))}
                    className={`${inputClass} font-mono tracking-[0.3em]`}
                    placeholder="000000"
                    required
                    minLength={6}
                />
            </label>
            <ErrorNote>{error}</ErrorNote>
            <button type="submit" disabled={loading || code.length !== 6} className={primaryButtonClass}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Activar verificación en dos pasos
            </button>
        </form>
    );
};

export default MfaEnrollment;
