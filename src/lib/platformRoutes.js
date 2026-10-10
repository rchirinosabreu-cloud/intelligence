// Recorre el router de Express y devuelve cada ruta de la API con su método, su ruta y los guardianes que la
// cuidan (10 de octubre de 2026). Es la fuente del mapa de la plataforma que usa Bria: se lee del código que corre,
// no de una lista escrita a mano. Lógica pura sobre la estructura interna del router (`stack`, `route`, `regexp`).

const unexpress = (regexp) => String(regexp)
  .replace(/^\/\^\\\//, '/')
  .replace(/\\\/\?\(\?=\\\/\|\$\)\/i$/, '')
  .replace(/\\\//g, '/')
  .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param');

const guardOf = (layer) => layer?.handle?.permission || null;

export const listApiRoutes = (router) => {
  const rows = [];
  const walk = (stack, prefix, inherited) => {
    // Los `router.use(ruta, guardián)` solo cuidan lo que cuelga de su ruta.
    const scoped = [];
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]).map((m) => m.toUpperCase());
        const path = prefix + (layer.route.path === '/' ? '' : layer.route.path);
        const own = layer.route.stack.map(guardOf).filter(Boolean);
        const applying = scoped.filter((s) => path.startsWith(s.prefix)).map((s) => s.guard);
        for (const method of methods) rows.push({ method, path: path || '/', guards: [...inherited, ...applying, ...own] });
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const mount = layer.regexp?.fast_slash ? '' : unexpress(layer.regexp);
        const applying = scoped.filter((s) => (prefix + mount).startsWith(s.prefix)).map((s) => s.guard);
        walk(layer.handle.stack, prefix + mount, [...inherited, ...applying]);
      } else if (guardOf(layer)) {
        const mount = layer.regexp?.fast_slash ? '' : unexpress(layer.regexp);
        if (!mount) inherited = [...inherited, guardOf(layer)];
        else scoped.push({ prefix: prefix + mount, guard: guardOf(layer) });
      }
    }
  };
  walk(router.stack, '', []);
  return rows;
};

/** La ruta como la ve el catálogo: `:param` genérico y sin el regex que Express deja en los montajes con parámetro. */
export const routeKey = (method, path) => `${method} ${path.replace(/\(\?:\/\(\[\^\/\]\+\?\)\)/g, '/:id').replace(/\/$/, '') || '/'}`;
