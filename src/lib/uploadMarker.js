// Una ruta que recibe archivos lo dice en su propio código (22 de octubre de 2026): con qué campo y cuántos admite.
// Las manos de Bria lo leen del router real (`listApiRoutes`), igual que los permisos (`permission`), así que una
// pantalla nueva que reciba archivos funciona por el chat y por WhatsApp sin una herramienta propia: basta con
// describirla en el mapa. Rodny, ese día: «me preocupa que haya que hacer lo mismo para cada cosita».

/** Marca el middleware que recibe archivos de una ruta y lo devuelve. */
export const receivesFiles = (middleware, { field, max = 1 } = {}) => {
  if (!field) throw new Error('receivesFiles necesita el campo del formulario.');
  return Object.assign(middleware, { upload: { field, max } });
};

/** `{ field, max }` de los guardianes de una ruta, o `null` si no recibe archivos. */
export const uploadOf = (layers = []) => layers.map((layer) => layer?.handle?.upload).find(Boolean) || null;
