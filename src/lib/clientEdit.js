export const clientSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const clientSlugHelp = 'Usa letras minúsculas, números y guiones, sin espacios.';

export function validateClientEdit(body) {
  const invalid = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('No hay cambios válidos para guardar.');
  const data = {};
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) invalid('El nombre del cliente no puede estar vacío.');
    data.name = body.name.trim();
  }
  if (Object.hasOwn(body, 'slug')) {
    if (typeof body.slug !== 'string' || !clientSlugPattern.test(body.slug.trim())) invalid(`Slug inválido. ${clientSlugHelp}`);
    data.slug = body.slug.trim();
  }
  if (!Object.keys(data).length) invalid('No hay cambios válidos para guardar.');
  return data;
}
