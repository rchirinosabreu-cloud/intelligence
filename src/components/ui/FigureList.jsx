import React from 'react';
import { cn } from '@/lib/utils';

// El bloque «etiqueta + cifra» de toda la plataforma (Rodny, 10 de noviembre de 2026): la etiqueta pequeña y gris, la
// cifra con peso pero del tamaño del texto. Cada pantalla que muestre cifras así usa esta pieza en vez de dibujar la suya.
export default function FigureList({ rows, className }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 rounded-lg bg-zinc-50 p-4 sm:grid-cols-2 dark:bg-white/5', className)} data-figure-list>
      {rows.map(([name, value]) => (
        <div key={name} className="min-w-0">
          <dt className="brain-type-label">{name}</dt>
          <dd className="brain-type-value mt-1">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
