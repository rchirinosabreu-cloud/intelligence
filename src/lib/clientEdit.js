import { partyDocumentType } from './partyIdentity.js';
import { normalizeClientProfile } from './clientProfile.js';

export const clientSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const clientSlugHelp = 'Usa letras minúsculas, números y guiones, sin espacios.';

/**
 * Lo que se puede cambiar de una ficha desde Clientes: el slug, más la ficha completa
 * (`normalizeClientProfile`): nombre, identidad para la cuenta de cobro, contacto y
 * ubicación. Desde el 30 de septiembre de 2026 el nombre legal va suelto y el documento
 * va entero —tipo y número— o no va.
 */
export function validateClientEdit(body) {
  const invalid = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('No hay cambios válidos para guardar.');
  const data = {};
  if (Object.hasOwn(body, 'name') && (typeof body.name !== 'string' || !body.name.trim())) invalid('El nombre del cliente no puede estar vacío.');
  if (Object.hasOwn(body, 'slug')) {
    if (typeof body.slug !== 'string' || !clientSlugPattern.test(body.slug.trim())) invalid(`Slug inválido. ${clientSlugHelp}`);
    data.slug = body.slug.trim();
  }

  const profile = normalizeClientProfile(body);
  if (!profile.valid) invalid(Object.values(profile.errors)[0]);
  Object.assign(data, profile.data);

  if (!Object.keys(data).length) invalid('No hay cambios válidos para guardar.');
  return data;
}

export { partyDocumentType };
