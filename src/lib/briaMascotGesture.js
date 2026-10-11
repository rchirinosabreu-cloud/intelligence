// Los gestos de Bria (Rodny, 11 de octubre de 2026: «cuando uno pasa el cursor, hace un movimiento, cuando está
// escribiendo, se inclina … un movimiento suave y natural siempre»). La regla es pura: según lo que la persona
// hace con ella, un solo gesto, o ninguno. El movimiento lo dibuja CSS sobre el lienzo (`[data-bria-gesture]`),
// y mientras Bria trabaja o celebra manda la pose del lienzo: ahí no se superpone ningún gesto.
export const GESTURES = Object.freeze(['hover', 'typing', 'listening']);

export function briaGesture({ hovered = false, typing = false, listening = false, busy = false } = {}) {
  if (busy) return null;
  if (listening) return 'listening';
  if (typing) return 'typing';
  if (hovered) return 'hover';
  return null;
}
