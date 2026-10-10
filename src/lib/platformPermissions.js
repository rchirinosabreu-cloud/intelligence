// Qué pide cada ruta de la API, leído del router real (10 de octubre de 2026). Es lo que Bria comprueba de entrada
// antes de preparar una operación del mapa; la API lo vuelve a comprobar al ejecutar. Se arma una vez, perezosamente,
// porque el router importa servicios y los servicios no pueden importar el router al arrancar.

import { listApiRoutes, routeKey } from './platformRoutes.js';
import { describeGuards } from './platformCatalog.js';

export const buildRoutePermissionIndex = (router) => {
  const index = new Map();
  for (const route of listApiRoutes(router)) {
    const key = routeKey(route.method, route.path);
    const permission = describeGuards(route.guards);
    // Una misma clave puede salir dos veces (rutas antiguas duplicadas): se queda la más exigente.
    const current = index.get(key);
    index.set(key, current && !permission ? current : permission);
  }
  return index;
};

let loading = null;
const load = () => loading ||= import('../routes/index.js').then((module) => buildRoutePermissionIndex(module.default));

/** `{ modules, roles, financial }` de una operación del mapa, o `null` si solo pide sesión. */
export const getRoutePermission = async (key) => (await load()).get(key) || null;
