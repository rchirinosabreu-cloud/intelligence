import React, { useState } from 'react';
import { Check, Copy, Download } from '@/components/ui/icons';
import { recoveryCodesFileText } from '@/lib/mfaClient';
import { primaryButtonClass, secondaryButtonClass } from './MfaEnrollment';

// Los códigos de respaldo solo se ven una vez: el servidor guarda su huella, no el código.
const MfaRecoveryCodes = ({ codes, email, onDone, doneLabel = 'Listo' }) => {
    const [copied, setCopied] = useState(false);
    const text = recoveryCodesFileText(codes, email);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    const download = () => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'brainstudio-codigos-de-respaldo.txt';
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-brand-yellow/60 bg-brand-yellow-soft px-4 py-3 text-sm text-zinc-800 dark:bg-brand-yellow/10 dark:text-zinc-100">
                Guarda estos códigos ahora: <strong>no volverás a verlos</strong>. Cada uno sirve una sola vez para
                entrar si pierdes o cambias tu teléfono.
            </div>
            <ul className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                {codes.map((code) => <li key={code}>{code}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copy} className={secondaryButtonClass}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copiados' : 'Copiar'}
                </button>
                <button type="button" onClick={download} className={secondaryButtonClass}>
                    <Download className="h-4 w-4" />
                    Descargar .txt
                </button>
            </div>
            {onDone && (
                <button type="button" onClick={onDone} className={primaryButtonClass}>
                    {doneLabel}
                </button>
            )}
        </div>
    );
};

export default MfaRecoveryCodes;
