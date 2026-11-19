import React, { useEffect, useRef, useState } from 'react';
import { Bria3D } from '@/components/bria/BriaBrand';

// La mascota flotante es la Bria en 3D (18 de noviembre de 2026): en reposo respira, parpadea y sonríe de vez en
// cuando; mientras trabaja teclea en su portátil; al terminar algo celebra una vez y vuelve al reposo.
// `gesture` (hover, typing, listening; `src/lib/briaMascotGesture.js`) sigue siendo un movimiento suave de CSS sobre la
// imagen entera. Con «menos movimiento» cada emoción se muestra quieta.
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
  return <Bria3D mood={mood} data-bria-mascot data-bria-design="3d" data-bria-state={state} data-bria-gesture={gesture || undefined} aria-hidden="true" className={`pointer-events-none shrink-0 ${className}`} />;
}
