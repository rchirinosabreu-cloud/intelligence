import React from 'react';
import isotipoUrl from '@/assets/bria-marca/isotipo.png';
import isotipoNegativoUrl from '@/assets/bria-marca/isotipo-negativo.png';
import logoUrl from '@/assets/bria-marca/logo.png';
import logoNegativoUrl from '@/assets/bria-marca/logo-negativo.png';
import atentaUrl from '@/assets/bria-marca/atenta.png';
import trabajandoUrl from '@/assets/bria-marca/laptop.png';
import celebraUrl from '@/assets/bria-marca/celebra.png';

// La guía de marca de Bria (Rodny, 18 de noviembre de 2026). Tres piezas y un solo sitio que las importa:
// - el isotipo firma lo que dice Bria (avisos, mensajes del chat, la píldora de un logro);
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
