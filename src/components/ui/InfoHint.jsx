import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * El iconito que explica una cifra (Rodny, 12 de noviembre de 2026: «no comprendo qué
 * significa la relación ahí, horas, por hora, qué es eso? no puede tener cada uno un
 * iconito que cuando uno pose el cursor, te diga qué es o a qué se refiere?»).
 *
 * **No es un `title`**: un `title` no existe en un celular, no lo alcanza el tabulador y
 * el lector de pantalla lo lee tarde o no lo lee. Es un botón de verdad que se abre al
 * pasar el ratón, al enfocarlo con el teclado y al tocarlo.
 *
 * **No usa el popover compartido**, y es deliberado: ese está hecho para el clic —trae
 * capa de descarte y manejo de foco— y no suelta el `mouseleave`, así que el globo se
 * quedaba abierto tapando la tabla. Aquí el estado es nuestro y se cierra solo.
 *
 * El globo se dibuja en el `body` con posición fija porque dentro de una tarjeta con
 * `overflow-hidden` —la tabla de Rentabilidad, por ejemplo— quedaría recortado.
 *
 * El texto dice **qué es la cifra y con qué se compara**, en una o dos frases. Nunca un
 * juicio ni una recomendación: eso lo pone quien decide.
 */
const WIDTH = 256;
const GAP = 8;
const MARGIN = 12;

export default function InfoHint({ label, children, className, align = 'center' }) {
  const [spot, setSpot] = useState(null);
  const buttonRef = useRef(null);

  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    // El eje horizontal se acota a la ventana: cerca del borde el globo se corre, no se sale.
    const wanted = align === 'end' ? rect.right - WIDTH : rect.left + rect.width / 2 - WIDTH / 2;
    const left = Math.min(Math.max(wanted, MARGIN), Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN));
    // Debajo si cabe; si no, encima. El alto real lo pone el texto, así que se estima generoso.
    const below = window.innerHeight - rect.bottom > 160;
    setSpot({ left, top: below ? rect.bottom + GAP : null, bottom: below ? null : window.innerHeight - rect.top + GAP });
  }, [align]);

  const open = useCallback(() => place(), [place]);
  const close = useCallback(() => setSpot(null), []);

  useEffect(() => {
    if (!spot) return undefined;
    // Al desplazar la página o cambiar el tamaño, el globo se cierra en vez de quedar flotando lejos.
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [spot, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        // Área táctil real sin empujar la fila: el icono mide 14 px y el botón 24, con un
        // margen negativo para no mover la línea base de la cabecera.
        className={cn('-m-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full p-1 align-middle text-zinc-400 transition hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/40 dark:text-zinc-500 dark:hover:text-zinc-300', className)}
        aria-label={`Qué es ${label}`}
        aria-expanded={!!spot}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={() => (spot ? close() : open())}
        data-info-hint={label}
        data-state={spot ? 'open' : 'closed'}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {spot && typeof document !== 'undefined' && createPortal(
        <div
          role="note"
          style={{ position: 'fixed', left: spot.left, top: spot.top ?? undefined, bottom: spot.bottom ?? undefined, width: WIDTH }}
          className="brain-popover-surface pointer-events-none z-[80] p-3 text-xs leading-relaxed"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">{label}</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">{children}</p>
        </div>,
        document.body
      )}
    </>
  );
}
