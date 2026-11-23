import React from 'react';
import { Bria3D } from '@/components/bria/BriaBrand';

// Every static Bria portrait uses this identity: the 3D Bria (18 de noviembre de 2026).
// De cuerpo entero también en pequeño (Rodny, 23 de noviembre de 2026: «Bria sale cortada a veces»): el retrato era su
// cara recortada por abajo y se leía como una imagen cortada. Sin `mood` es Bria quieta en reposo; con `mood`, animada
// en esa emoción (dialogs, the plan review).
export default function BriaPortrait({ alt = '', className = '', mood = null, ...props }) {
  if (mood) return <Bria3D {...props} mood={mood} alt={alt} data-bria-portrait className={className} />;
  return <Bria3D {...props} mood="reposo" still alt={alt} data-bria-portrait data-bria-design="3d" className={className} />;
}
