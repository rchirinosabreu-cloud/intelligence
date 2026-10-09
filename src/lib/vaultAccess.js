// Quién ve y quién edita cada acceso de la bóveda (decisión de Rodny, 9 de octubre de 2026): un
// administrador ve todos; un project manager ve los de los clientes donde figura como PM, más los que un
// administrador le comparta. Los accesos de la propia agencia (sin cliente) son de administración salvo que
// se compartan. Compartir y ver el historial de lecturas es solo de administradores.

export const VAULT_MAX_SHARED = 20;
const vaultError = (message, status = 400, code = 'VAULT_INVALID') => Object.assign(new Error(message), { status, code });

export const canUseVault = (user) => user?.isActive !== false && ['ADMIN', 'PROJECT_MANAGER'].includes(String(user?.role || '').toUpperCase());

const isAdmin = (actor) => actor?.active !== false && actor?.role === 'ADMIN';
const isPm = (actor) => actor?.active !== false && actor?.role === 'PROJECT_MANAGER';

export const canSeeCredential = (actor, credential) => {
  if (!credential || actor?.active === false) return false;
  if (isAdmin(actor)) return true;
  if (!isPm(actor)) return false;
  return Boolean(credential.clientId && (actor.managedClientIds || []).includes(credential.clientId))
    || (credential.sharedUserIds || []).includes(actor.ref);
};

export const canEditCredential = (actor, credential) => isAdmin(actor)
  || (isPm(actor) && Boolean(credential?.clientId) && (actor.managedClientIds || []).includes(credential.clientId));

const text = (value, max, label, { required = false } = {}) => {
  const clean = String(value ?? '').trim();
  if (required && !clean) throw vaultError(`Falta ${label}.`);
  if (clean.length > max) throw vaultError(`${label[0].toUpperCase()}${label.slice(1)} pasa de ${max} caracteres.`);
  return clean || null;
};

/** Valida lo que llega del formulario. Al editar, solo vuelve lo que se envió: lo demás no se toca. */
export const validateCredentialInput = (input = {}, { creating }) => {
  const out = {};
  const has = (key) => creating || Object.hasOwn(input, key);
  if (has('clientId')) out.clientId = input.clientId ? String(input.clientId) : null;
  if (has('platform')) out.platform = text(input.platform, 60, 'la plataforma', { required: true });
  if (has('label')) out.label = text(input.label, 120, 'el nombre');
  if (has('url')) {
    const url = text(input.url, 500, 'el enlace');
    if (url) {
      let parsed;
      try { parsed = new URL(url); } catch { throw vaultError('El enlace debe ser una dirección completa, como https://…'); }
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw vaultError('El enlace debe ser una dirección completa, como https://…');
    }
    out.url = url;
  }
  if (has('username')) out.username = text(input.username, 300, 'el usuario');
  if (has('secret')) out.secret = text(input.secret, 4000, 'la contraseña', { required: creating });
  if (has('notes')) out.notes = text(input.notes, 4000, 'las notas');
  if (has('sharedUserIds')) {
    const ids = [...new Set((Array.isArray(input.sharedUserIds) ? input.sharedUserIds : []).map(String).filter(Boolean))];
    if (ids.length > VAULT_MAX_SHARED) throw vaultError(`Puedes compartir un acceso con ${VAULT_MAX_SHARED} personas como máximo.`);
    out.sharedUserIds = ids;
  }
  if (!creating && out.secret === null) delete out.secret; // Dejar la contraseña en blanco al editar no la borra.
  return out;
};
