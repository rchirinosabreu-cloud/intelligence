import React from 'react';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bria3D } from '@/components/bria/BriaBrand';
import { cn } from '@/lib/utils';

// Cabecera común de los avisos con Bria (Rodny, 18 de noviembre de 2026: «ella vive ahí en la plataforma, entonces no
// tiene que verse cortada por los bordes … debe verse delante, que se vea el cuerpo, que se vea el movimiento»).
// Bria va de cuerpo entero y animada, con los pies apoyados sobre el borde inferior de la cabecera: nada la recorta
// (la cabecera no recorta lo que se sale de ella) y queda por delante del cuerpo blanco del aviso. El texto reserva su espacio a
// la derecha para no pasar por debajo de ella, y nunca fuerza saltos de línea: el título se equilibra solo.
export default function BriaNoticeHeader({ mood, badge, title, description, className }) {
  return (
    <div className={cn('relative min-h-[136px] bg-gradient-to-br from-[#00AC8A] to-[#009EB9] px-5 py-5 pr-[116px] text-white sm:px-6 sm:pr-[148px]', className)}>
      <Bria3D mood={mood} alt="" aria-hidden="true" data-bria-notice
        className="pointer-events-none absolute -bottom-3 right-3 z-10 w-[96px] sm:right-5 sm:w-[118px]" />
      <DialogHeader className="text-left">
        {badge && <span className="mb-1 w-fit rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">{badge}</span>}
        <DialogTitle className="text-balance text-lg font-semibold leading-snug text-white">{title}</DialogTitle>
        {description && <DialogDescription className="text-pretty text-sm leading-relaxed text-white/90">{description}</DialogDescription>}
      </DialogHeader>
    </div>
  );
}
