// Quién ve la liga (Rodny, 3 de noviembre de 2026: «activa más bien la posibilidad de activar la liga para cierta
// persona, como cuando activo Bria o algún acceso a los módulos»). Es la casilla «Liga del mes» de la ventana de
// Equipo, guardada en `modulePermissions.liga` como la de Bria. Nadie la tiene por su cargo, tampoco un
// administrador: se enciende persona por persona. El cálculo del servidor corre para todo el equipo de todas formas:
// cuando se encienda, el mes ya estará contado desde el inicio persistido de la liga.
import { hasModuleAccess } from './platformModules.js';

export const LEAGUE_PERMISSION_KEY = 'liga';

/** `true` si esa cuenta activa tiene la liga encendida en Equipo. */
export function canUseLeague(user) {
  if (!user || user.isActive === false) return false;
  return hasModuleAccess(user, LEAGUE_PERMISSION_KEY);
}
