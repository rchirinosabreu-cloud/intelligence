import React, { useEffect, useRef } from 'react';

// El círculo de la voz de Bria (Rodny, 20 de noviembre de 2026: «prefiero algo más 2D, más sencillo pero bonito, y
// degradados más como los de OpenAI o ElevenLabs… para eso están los gestos y movimientos»). Un círculo plano con
// nubes de color que se mueven adentro; no hay brillo ni sombra de esfera. El estado se cuenta con movimiento, no con
// texto: quieto y atento al escuchar (crece con la voz de quien habla), remolino mientras piensa, pulso mientras
// habla y gris y quieto en pausa.
export const ORB_COLORS = { base: ['#DDF7EC', '#BFEFF0'], clouds: ['#72DD9B', '#2BC1AF', '#14AEBC', '#FFFFFF', '#8FE3D0'] };
/** Cuánta energía lleva el círculo: 0 quieto, 1 al máximo. `at` va en segundos. */
export const orbEnergy = (state, level = 0, at = 0) => {
  if (state === 'paused') return 0;
  if (state === 'thinking') return 0.85;
  if (state === 'speaking') return 0.45 + 0.4 * Math.abs(Math.sin(at * 3.1) * Math.sin(at * 1.7 + 1));
  return 0.18 + 0.82 * Math.min(1, Math.max(0, Number(level) || 0));
};

const CLOUDS = [[0.9, 0.0, 0.34, 0.78], [0.7, 2.1, 0.4, 0.72], [1.1, 4.0, 0.36, 0.7], [0.5, 1.2, 0.28, 0.6], [0.8, 5.3, 0.42, 0.66]];

const paint = (context, size, at, energy, paused) => {
  const half = size / 2;
  context.clearRect(0, 0, size, size);
  context.save();
  context.beginPath(); context.arc(half, half, half, 0, Math.PI * 2); context.clip();
  const base = context.createLinearGradient(0, 0, size, size);
  base.addColorStop(0, ORB_COLORS.base[0]); base.addColorStop(1, ORB_COLORS.base[1]);
  context.fillStyle = base; context.fillRect(0, 0, size, size);
  CLOUDS.forEach(([speed, phase, reach, spread], index) => {
    const angle = at * speed + phase, wander = reach * (0.75 + 0.5 * energy);
    const x = half + Math.cos(angle) * half * wander, y = half + Math.sin(angle * 1.3 + phase) * half * wander;
    const radius = half * spread * (1 + 0.25 * energy * Math.sin(at * 2 + phase));
    const cloud = context.createRadialGradient(x, y, 0, x, y, radius), color = ORB_COLORS.clouds[index];
    cloud.addColorStop(0, `${color}F2`); cloud.addColorStop(0.55, `${color}80`); cloud.addColorStop(1, `${color}00`);
    context.fillStyle = cloud; context.fillRect(0, 0, size, size);
  });
  if (paused) { context.globalCompositeOperation = 'saturation'; context.fillStyle = '#808080'; context.fillRect(0, 0, size, size); context.globalCompositeOperation = 'source-over'; context.fillStyle = 'rgba(255,255,255,0.35)'; context.fillRect(0, 0, size, size); }
  context.restore();
};

export default function BriaVoiceOrb({ state = 'listening', level = 0, className = '' }) {
  const canvas = useRef(null), live = useRef({ state, level });
  live.current = { state, level };
  useEffect(() => {
    const element = canvas.current, context = element?.getContext?.('2d');
    if (!context) return undefined;
    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame = 0, clock = 0, last = 0, energy = 0.2;
    const draw = (now) => {
      const box = element.getBoundingClientRect(), ratio = Math.min(2, globalThis.devicePixelRatio || 1), size = Math.max(1, Math.round(box.width * ratio));
      if (element.width !== size) { element.width = size; element.height = size; }
      const step = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      const { state: current, level: heard } = live.current, target = orbEnergy(current, heard, now / 1000);
      energy += (target - energy) * Math.min(1, step * 8); // suaviza los saltos entre estados
      clock += step * (0.25 + 2.2 * energy); // las nubes van más rápido con más energía
      paint(context, size, still ? 1 : clock, still ? 0.3 : energy, current === 'paused');
      element.style.transform = `scale(${(1 + (still ? 0 : 0.1 * energy)).toFixed(3)})`;
      if (!still) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  // En reposo de movimiento (prefers-reduced-motion) se pinta una vez por cambio de estado.
  useEffect(() => { if (!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return; const element = canvas.current, context = element?.getContext?.('2d'); if (context && element.width) paint(context, element.width, 1, 0.3, state === 'paused'); }, [state]);
  return <canvas ref={canvas} data-bria-orb-canvas aria-hidden="true" className={`block aspect-square rounded-full will-change-transform ${className}`} />;
}
