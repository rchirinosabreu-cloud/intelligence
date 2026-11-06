import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Selecciones de lectura, no borradores: cada pantalla valida los valores que conoce.
// Cambiar una selección conserva otros parámetros, ancla y procedencia del viaje.
export function useNavigationSelection() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const update = useCallback(changes => {
    const next = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== null && item !== undefined && item !== '') next.append(key, String(item));
      }
    }
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { replace: true, state: location.state });
  }, [location, navigate]);
  return [params, update];
}
