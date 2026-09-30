import React, { useLayoutEffect, useRef, useState } from 'react';
import {
    AMOUNT_DECIMALS,
    caretAfterFormat,
    formatAmountDisplay,
    readPastedAmount,
    readTypedAmount
} from '@/lib/amountInput';

/**
 * El campo de dinero de toda la plataforma (Rodny, 30 de septiembre de 2026: «cuando lo
 * estoy escribiendo no hace los puntos de cada tres dígitos … esto debe ser GLOBAL»).
 *
 * Muestra «1.200.000» mientras se escribe, pero `onChange` recibe siempre el valor limpio
 * («1200000», «4938.27»), el mismo que daba el campo numérico del navegador: los
 * formularios y el servidor no cambian. Los puntos los pone el campo; un punto escrito a
 * mano se ignora; la coma abre los centavos (máximo `decimals`). Un campo numérico del
 * navegador no puede mostrar los puntos, por eso este es de texto con teclado numérico.
 *
 * Controlado con `value` + `onChange`, o suelto con `defaultValue` + `onCommit` (se
 * llama al salir del campo con el valor limpio). `min`, `max` y `required` se validan
 * como en el campo numérico, con el aviso nativo del navegador.
 */
const normalize = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    return String(value).trim();
};

const MoneyInput = React.forwardRef(function MoneyInput({
    value,
    defaultValue,
    onChange,
    onCommit,
    onBlur,
    onKeyDown,
    decimals = AMOUNT_DECIMALS,
    allowNegative = false,
    min,
    max,
    required,
    ...rest
}, forwardedRef) {
    const controlled = value !== undefined;
    const options = { decimals, allowNegative };
    const [state, setState] = useState(() => {
        const initial = normalize(controlled ? value : defaultValue);
        return { synced: initial, display: formatAmountDisplay(initial, options) };
    });
    // Un valor que llega de fuera (precargado, recalculado, limpiado) se vuelve a mostrar.
    // Lo que el propio campo emitió no: así «4.938,» conserva su coma mientras se escribe.
    if (controlled && normalize(value) !== state.synced) {
        const next = normalize(value);
        setState({ synced: next, display: formatAmountDisplay(next, options) });
    }

    const inputRef = useRef(null);
    const pendingCaret = useRef(null);
    const setRefs = (node) => {
        inputRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
    };

    useLayoutEffect(() => {
        const input = inputRef.current;
        if (pendingCaret.current !== null && input && input === document.activeElement) {
            input.setSelectionRange(pendingCaret.current, pendingCaret.current);
        }
        pendingCaret.current = null;
    });

    // Los topes del campo numérico, con el aviso nativo y cifras con puntos.
    useLayoutEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        const number = state.synced === '' ? null : Number(state.synced);
        let message = '';
        if (required && number === null) message = 'Completa este campo.';
        else if (number !== null && min !== undefined && min !== null && min !== '' && number < Number(min)) message = `El valor mínimo es ${formatAmountDisplay(min, options)}.`;
        else if (number !== null && max !== undefined && max !== null && max !== '' && number > Number(max)) message = `El valor no puede ser mayor que ${formatAmountDisplay(max, options)}.`;
        input.setCustomValidity(message);
    });

    const apply = (rawText, rawCaret) => {
        const next = readTypedAmount(rawText, options);
        pendingCaret.current = caretAfterFormat(rawText, rawCaret, next.display);
        // Siempre un objeto nuevo: aunque la tecla no cambie nada (un punto ignorado), el
        // campo se vuelve a pintar y el cursor vuelve a su sitio.
        setState({ synced: next.value, display: next.display });
        if (next.value !== state.synced) onChange?.(next.value);
    };

    const handleChange = (event) => {
        const input = event.target;
        apply(input.value, input.selectionStart ?? input.value.length);
    };

    const handleKeyDown = (event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const input = event.target;
        const { selectionStart: start, selectionEnd: end } = input;
        // Borrar sobre un punto de miles borra la cifra de al lado: si no, el punto
        // vuelve a aparecer y parece que la tecla no hace nada.
        if (start === end && event.key === 'Backspace' && start > 0 && state.display[start - 1] === '.') {
            input.setSelectionRange(start - 1, start - 1);
        } else if (start === end && event.key === 'Delete' && state.display[start] === '.') {
            input.setSelectionRange(start + 1, start + 1);
        }
    };

    const handlePaste = (event) => {
        const text = event.clipboardData?.getData('text');
        if (!text) return;
        event.preventDefault();
        const input = event.target;
        const start = input.selectionStart ?? state.display.length;
        const end = input.selectionEnd ?? start;
        const pasted = formatAmountDisplay(readPastedAmount(text, options), options);
        const rawText = `${state.display.slice(0, start)}${pasted}${state.display.slice(end)}`;
        apply(rawText, start + pasted.length);
    };

    const handleBlur = (event) => {
        onBlur?.(event);
        onCommit?.(state.synced);
    };

    return (
        <input
            {...rest}
            ref={setRefs}
            type="text"
            inputMode={decimals > 0 || allowNegative ? 'decimal' : 'numeric'}
            autoComplete="off"
            required={required}
            value={state.display}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleBlur}
        />
    );
});

export default MoneyInput;
