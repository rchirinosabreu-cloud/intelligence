import { useEffect, useRef } from 'react';

/**
 * Entradas animadas solo la primera vez (Rodny, 21 de septiembre de 2026: «al viajar entre módulos es como si
 * cargaran de nuevo»). Al navegar, React desmonta un módulo y monta el siguiente, así que su animación de
 * entrada se repite y parece una recarga. Con esto, la primera visita de la sesión anima y las siguientes no.
 *
 * Solo memoria de la pestaña: al recargar la página vuelve a animar, que es cuando la animación sí aporta.
 */
const visited = new Set();

export const useFirstVisit = (key) => {
  const firstVisit = useRef(null);
  if (firstVisit.current === null) {
    firstVisit.current = !visited.has(key);
  }
  // En el StrictMode de desarrollo el doble montaje puede saltarse la animación de la primera visita; en
  // producción no ocurre. Marcar aquí (y no durante el render) mantiene el render sin efectos.
  useEffect(() => { visited.add(key); }, [key]);
  return firstVisit.current;
};

/** Solo para pruebas: olvida lo visitado. */
export const forgetVisits = () => visited.clear();
