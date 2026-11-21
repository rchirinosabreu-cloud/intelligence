import React from 'react';
import isotipoUrl from '@/assets/bria-marca/isotipo.png';
import isotipoNegativoUrl from '@/assets/bria-marca/isotipo-negativo.png';
import logoUrl from '@/assets/bria-marca/logo.png';
import logoNegativoUrl from '@/assets/bria-marca/logo-negativo.png';
import atentaUrl from '@/assets/bria-marca/atenta.png';
import trabajandoUrl from '@/assets/bria-marca/laptop.png';
import celebraUrl from '@/assets/bria-marca/celebra.png';
import reposoAnim from '@/assets/bria-3d/reposo.webp';
import reposoStill from '@/assets/bria-3d/reposo.png';
import trabajandoAnim from '@/assets/bria-3d/trabajando.webp';
import trabajandoStill from '@/assets/bria-3d/trabajando.png';
import sentadaAnim from '@/assets/bria-3d/sentada.webp';
import sentadaStill from '@/assets/bria-3d/sentada.png';
import celebraAnim from '@/assets/bria-3d/celebra.webp';
import celebraStill from '@/assets/bria-3d/celebra.png';
import felizAnim from '@/assets/bria-3d/feliz.webp';
import felizStill from '@/assets/bria-3d/feliz.png';
import sorprendidaAnim from '@/assets/bria-3d/sorprendida.webp';
import sorprendidaStill from '@/assets/bria-3d/sorprendida.png';
import tristeAnim from '@/assets/bria-3d/triste.webp';
import tristeStill from '@/assets/bria-3d/triste.png';
import molestaAnim from '@/assets/bria-3d/molesta.webp';
import molestaStill from '@/assets/bria-3d/molesta.png';
import pensandoAnim from '@/assets/bria-3d/pensando.webp';
import pensandoStill from '@/assets/bria-3d/pensando.png';

// La guía de marca de Bria (Rodny, 18 de noviembre de 2026). Tres piezas y un solo sitio que las importa:
// - el isotipo firma lo que dice Bria (avisos, mensajes del chat, la tarjeta de un logro);
// - el logo (isotipo + «BRIA · Brain Intelligence», con Roc Grotesk dentro de la imagen) va donde Bria se presenta;
// - el personaje, en tres poses del mismo atlas aprobado (atenta, trabajando con su portátil, celebrando), cuando Bria
//   actúa o celebra. Siempre sobre fondo transparente: nunca dentro de un círculo ni de una caja (Rodny, mismo día).
// Las imágenes salen de la guía en PDF; Vite les pone huella de contenido, así que un cambio nunca queda en caché.

export function BriaIsotipo({ negative = false, alt = '', className = '', ...props }) {
  return <img {...props} src={negative ? isotipoNegativoUrl : isotipoUrl} alt={alt} data-bria-isotipo className={`w-auto object-contain ${className}`} />;
}

export function BriaLogo({ negative = false, alt = 'BRIA, Brain Intelligence', className = '', ...props }) {
  return <img {...props} src={negative ? logoNegativoUrl : logoUrl} alt={alt} data-bria-logo className={`h-auto object-contain ${className}`} />;
}

const POSES = { atenta: atentaUrl, trabajando: trabajandoUrl, celebra: celebraUrl };
export function BriaPose({ pose = 'atenta', alt = '', className = '', ...props }) {
  return <img {...props} src={POSES[pose] || atentaUrl} alt={alt} data-bria-pose={pose} className={`object-contain ${className}`} />;
}

// Bria en 3D (Rodny, 18 de noviembre de 2026): el mismo modelo y esqueleto, renderizado en Blender en cada emoción.
// Los ciclos (reposo, trabajando, sentada) se repiten sin corte; las reacciones se reproducen una vez y se quedan en
// su último cuadro. Van en WebP animado con transparencia porque Safari y el iPhone no muestran video con fondo
// transparente. Con «menos movimiento» se muestra el cuadro quieto. Siempre sobre fondo transparente.
export const BRIA_MOODS = {
  reposo: [reposoAnim, reposoStill], trabajando: [trabajandoAnim, trabajandoStill], sentada: [sentadaAnim, sentadaStill],
  celebra: [celebraAnim, celebraStill], feliz: [felizAnim, felizStill], sorprendida: [sorprendidaAnim, sorprendidaStill],
  triste: [tristeAnim, tristeStill], molesta: [molestaAnim, molestaStill], pensando: [pensandoAnim, pensandoStill],
};
export function Bria3D({ mood = 'reposo', still = false, alt = '', className = '', ...props }) {
  const [anim, stillUrl] = BRIA_MOODS[mood] || BRIA_MOODS.reposo;
  // `key` por emoción: al cambiar de emoción la imagen se monta de nuevo y una reacción empieza desde el principio.
  return <picture key={mood}>
    {!still && <source media="(prefers-reduced-motion: reduce)" srcSet={stillUrl} />}
    <img {...props} src={still ? stillUrl : anim} alt={alt} data-bria-3d={mood} draggable={false} className={`object-contain ${className}`} />
  </picture>;
}
