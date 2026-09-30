import React from 'react';
import MoneyInput from '@/components/ui/MoneyInput';

/**
 * La TRM y el valor en pesos de una cuenta en dólares (Rodny, 30 de septiembre de 2026:
 * «en el financiero siempre registramos todo en pesos … usando el TRM oficial, sin
 * embargo ese valor en pesos obviamente puede ser editado»). Lo usan la cuenta por cobrar
 * nueva y la emisión de la cuenta de cobro, para que se vea y funcione igual.
 *
 * `copValue` es el valor que se muestra: el escrito a mano si `copEdited`, si no el
 * calculado (total × TRM). Escribirlo lo marca como escrito a mano.
 */
export default function UsdToPesosFields({
    rate,
    rateSource,
    rateDate,
    rateStatus = { loading: false, error: '' },
    onLoadRate,
    onRateChange,
    copValue,
    copEdited,
    onCopChange,
    onCopReset,
    idPrefix = 'usd'
}) {
    const field = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-zinc-950 dark:text-white';
    return (
        <div data-receivable-usd className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-white/10">
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200" htmlFor={`${idPrefix}-rate`}>
                    <span className="block">TRM</span>
                    <MoneyInput id={`${idPrefix}-rate`} required min="0.01" value={rate} aria-label="TRM para pasar a pesos"
                        onChange={onRateChange} className={field} />
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                        {rateStatus.loading
                            ? 'Consultando la TRM oficial…'
                            : rateSource === 'SUPERFINANCIERA_TRM'
                                ? `TRM oficial${rateDate ? ` del ${new Date(`${rateDate}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC' })}` : ''}`
                                : 'Escrita a mano'}
                        <button type="button" onClick={onLoadRate} disabled={rateStatus.loading}
                            className="min-h-11 font-medium text-primary underline underline-offset-2 disabled:opacity-50">Usar la TRM oficial</button>
                    </span>
                    {rateStatus.error && <span role="alert" className="block text-xs text-destructive brain-destructive-text">{rateStatus.error}</span>}
                </label>
                <label className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200" htmlFor={`${idPrefix}-cop`}>
                    <span className="block">Valor en cartera (pesos)</span>
                    <MoneyInput id={`${idPrefix}-cop`} required min="0.01" aria-label="Valor en pesos en cartera"
                        value={copValue ?? ''} onChange={onCopChange} className={field} />
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                        {copEdited ? 'Escrito a mano: el que de verdad entra.' : 'Total en dólares por la TRM.'}
                        {copEdited && <button type="button" onClick={onCopReset}
                            className="min-h-11 font-medium text-primary underline underline-offset-2">Volver a calcularlo</button>}
                    </span>
                </label>
            </div>
            <p className="text-xs text-zinc-500">El documento dice dólares. En cartera se lleva en pesos, y ese valor se puede ajustar después al que de verdad entró.</p>
        </div>
    );
}
