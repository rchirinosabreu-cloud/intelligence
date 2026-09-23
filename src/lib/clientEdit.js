import { normalizePartyIdentity, partyDocumentType } from './partyIdentity.js';

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

  // La identidad del tercero es una sola cosa: nombre legal y documento van juntos.
  // Media identidad no sirve para un documento de cobro, así que o se guardan los
  // tres campos o se vacían los tres.
  const identityKeys = ['legalName', 'documentType', 'documentNumber'].filter(key => Object.hasOwn(body, key));
  if (identityKeys.length) {
    const cleared = identityKeys.length === 3 && identityKeys.every(key => !String(body[key] ?? '').trim());
    if (cleared) {
      Object.assign(data, { legalName: null, documentType: null, documentNumber: null });
    } else {
      const result = normalizePartyIdentity({
        legalName: body.legalName,
        documentType: body.documentType,
        documentNumber: body.documentNumber
      });
      if (!result.valid) invalid(Object.values(result.errors)[0]);
      Object.assign(data, result.identity);
    }
  }

  if (!Object.keys(data).length) invalid('No hay cambios válidos para guardar.');
  return data;
}

export { partyDocumentType };
