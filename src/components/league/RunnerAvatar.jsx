import React from 'react';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';

// El personaje de la carrera del mes (2 y 3 de noviembre de 2026): el avatar en píxel que diseñó OpenAI para cada
// persona (`pixelAvatarUrl`, un PNG transparente a la misma escala para todo el equipo), siempre en movimiento como
// un sprite en reposo (`league-pixel`, en `index.css`; quieto con `prefers-reduced-motion`), y, mientras alguien no
// tenga el suyo, su foto de siempre (`avatarUrl`, redonda, como en el resto de la plataforma). `size` es el alto en
// píxeles de pantalla; el ancho del píxel lo da la imagen. `phase` desfasa el balanceo entre corredores.
export default function RunnerAvatar({ person, size = 40, className, title, phase = 0 }) {
  if (person?.pixelAvatarUrl) {
    return (
      <img
        src={person.pixelAvatarUrl}
        alt={title || person.name || ''}
        draggable={false}
        data-runner-avatar="pixel"
        style={{ height: size, animationDelay: `${-((phase % 6) * 0.15).toFixed(2)}s` }}
        className={cn('league-pixel block w-auto max-w-none select-none object-contain', className)}
      />
    );
  }
  return (
    <span data-runner-avatar="photo" className={cn('league-pixel block shrink-0', className)} style={{ width: size, height: size, animationDelay: `${-((phase % 6) * 0.15).toFixed(2)}s` }}>
      <TeamAvatar member={person} size={size} className="h-full w-full rounded-full" showTitle={false} />
    </span>
  );
}
