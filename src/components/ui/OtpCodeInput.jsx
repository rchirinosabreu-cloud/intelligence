import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { completesOtp, otpDigits } from '@/lib/mfaClient';

// Código de seis dígitos en casillas (Rodny, 12 de octubre de 2026: «que el código de 6
// dígitos se vea así … y que no haga falta presionar enter sino que al colocar el último
// dígito, ya ingrese»). Por debajo es un solo campo real, transparente y encima de las
// casillas: así funcionan pegar «123 456», la sugerencia del código en el celular
// (`one-time-code`), el teclado numérico, borrar y los lectores de pantalla, que leen un
// solo campo con su etiqueta. Las casillas solo dibujan lo escrito.

const OtpCodeInput = forwardRef(({
    id,
    value,
    onChange,
    onComplete,
    length = 6,
    busy = false,
    invalid = false,
    autoFocus = false,
    className,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy
}, ref) => {
    const inputRef = useRef(null);
    const [focused, setFocused] = useState(false);
    useImperativeHandle(ref, () => inputRef.current);

    const digits = otpDigits(value, length);
    const activeIndex = Math.min(digits.length, length - 1);

    const handleChange = (event) => {
        const next = otpDigits(event.target.value, length);
        onChange(next);
        if (!busy && completesOtp(digits, next, length)) onComplete?.(next);
    };

    // El cursor siempre al final: escribir añade y borrar quita el último dígito.
    const keepCaretAtEnd = (event) => {
        const field = event.currentTarget;
        const end = field.value.length;
        if (field.selectionStart !== end || field.selectionEnd !== end) field.setSelectionRange(end, end);
    };

    return (
        <div className={cn('relative w-full max-w-sm', className)}>
            <input
                ref={inputRef}
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                autoFocus={autoFocus}
                value={digits}
                onChange={handleChange}
                onSelect={keepCaretAtEnd}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                readOnly={busy}
                aria-label={ariaLabel}
                aria-describedby={ariaDescribedBy}
                aria-invalid={invalid || undefined}
                data-otp-input
                className="absolute inset-0 z-10 h-full w-full cursor-text appearance-none border-0 bg-transparent text-base text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
            />
            <div aria-hidden="true" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
                {Array.from({ length }, (_, index) => {
                    const digit = digits[index] || '';
                    const isActive = focused && !busy && index === activeIndex;
                    return (
                        <div
                            key={index}
                            data-otp-box
                            className={cn(
                                'flex h-14 items-center justify-center rounded-xl border bg-white text-2xl font-semibold tabular-nums text-zinc-950 transition-colors dark:bg-zinc-950 dark:text-white',
                                invalid
                                    ? 'border-destructive/70 dark:border-destructive/70'
                                    : isActive
                                        ? 'border-brand-cyan ring-2 ring-brand-cyan/20 dark:border-brand-cyan'
                                        : digit
                                            ? 'border-zinc-300 dark:border-zinc-600'
                                            : 'border-zinc-200 dark:border-zinc-800',
                                busy && 'opacity-60'
                            )}
                        >
                            {digit || (isActive && (
                                <span className="h-6 w-px animate-pulse bg-zinc-900 motion-reduce:animate-none dark:bg-white" />
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

OtpCodeInput.displayName = 'OtpCodeInput';

export default OtpCodeInput;
