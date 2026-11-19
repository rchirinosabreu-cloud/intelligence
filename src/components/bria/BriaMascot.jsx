import React, { useEffect, useRef, useState } from 'react';
import { Bria3D } from '@/components/bria/BriaBrand';
import BriaTurn from '@/components/bria/BriaTurn';

// La mascota flotante es la Bria en 3D (18 de noviembre de 2026): en reposo respira, parpadea y sonríe de vez en
// cuando; mientras trabaja teclea en su portátil; al terminar algo celebra una vez y vuelve al reposo.
// En reposo, con el cursor encima se pone de frente y te sonríe (`BriaTurn`, renderizado desde Blender en varios
// ángulos); escribir y dictar siguen siendo un movimiento suave de CSS (`src/lib/briaMascotGesture.js`). Con «menos
// movimiento» cada emoción se muestra quieta y no gira.
export const BRIA_3D_CELEBRATION_MS = 3300;
export default function BriaMascot({ working = false, completionId = null, gesture = null, className = 'h-10 w-10' }) {
  const [celebrating, setCelebrating] = useState(false);
  const seen = useRef(completionId);
  useEffect(() => {
    if (!completionId || completionId === seen.current) return undefined;
    seen.current = completionId; setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), BRIA_3D_CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [completionId]);
  const state = celebrating ? 'celebrate' : working ? 'working' : 'idle';
  const mood = celebrating ? 'celebra' : working ? 'trabajando' : 'reposo';
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (state === 'idle' && !reduced) return <BriaTurn facing={gesture === 'hover'} data-bria-mascot data-bria-design="3d" data-bria-state={state} data-bria-gesture={gesture || undefined} aria-hidden="true" className={`pointer-events-none shrink-0 ${className}`} />;
  return <Bria3D mood={mood} data-bria-mascot data-bria-design="3d" data-bria-state={state} data-bria-gesture={gesture || undefined} aria-hidden="true" className={`pointer-events-none shrink-0 ${className}`} />;
}
