import React, { useEffect, useRef, useState } from 'react';
import atlasUrl from '@/assets/bria-3d/reposo-giro.webp';
import reposoAnim from '@/assets/bria-3d/reposo.webp';
import { BRIA_TURN, stepTurn, turnColumn, turnRow } from '@/lib/briaTurn';

// La Bria en reposo que se pone de frente con el cursor (`src/lib/briaTurn.js`). Mientras carga la imagen de los
// ángulos se ve el reposo de siempre. Dibuja solo cuando cambia de cuadro, y el navegador lo pausa con la pestaña oculta.
export default function BriaTurn({ facing = false, className = '', ...props }) {
  const canvas = useRef(null);
  const target = useRef(facing ? 1 : 0);
  const [ready, setReady] = useState(false);
  target.current = facing ? 1 : 0;
  useEffect(() => {
    let frame, cancelled = false;
    const image = new Image();
    image.decoding = 'async';
    image.src = atlasUrl;
    const { cell } = BRIA_TURN;
    image.decode().then(() => {
      if (cancelled || !canvas.current) return;
      setReady(true);
      const ctx = canvas.current.getContext('2d');
      const start = performance.now();
      let last = start, amount = target.current, drawn = '';
      const tick = (now) => {
        amount = stepTurn(amount, target.current, now - last); last = now;
        const col = turnColumn(now - start), row = turnRow(amount), key = `${col}:${row}`;
        if (key !== drawn) {
          ctx.clearRect(0, 0, cell, cell);
          ctx.drawImage(image, col * cell, row * cell, cell, cell, 0, 0, cell, cell);
          drawn = key;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }).catch(error => console.error('[Bria] No cargó el giro; queda el reposo:', error));
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, []);
  return <span className={`relative inline-block ${className}`} data-bria-turn={facing ? 'frente' : 'reposo'} {...props}>
    {!ready && <img src={reposoAnim} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />}
    <canvas ref={canvas} width={BRIA_TURN.cell} height={BRIA_TURN.cell} className="absolute inset-0 h-full w-full" />
  </span>;
}
