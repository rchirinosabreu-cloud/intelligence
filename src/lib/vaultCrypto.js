// Cifrado de la bóveda de accesos (9 de octubre de 2026). AES-256-GCM: cifra y además detecta cualquier
// alteración. Cada valor se ata a su registro y campo con datos adicionales (`aad`, por ejemplo
// «<id>:secret»), así que un texto cifrado copiado a otra fila no se abre. La clave se deriva con HKDF de
// `VAULT_ENCRYPTION_KEY` o, si no existe, de `ENCRYPTION_KEY`; nunca se usa la clave cruda tal cual.

import crypto from 'node:crypto';

const VERSION = 'v1';
const vaultError = (message) => Object.assign(new Error(message), { status: 500, code: 'VAULT_KEY' });

export const vaultKey = (env = process.env) => {
  const raw = env.VAULT_ENCRYPTION_KEY || env.ENCRYPTION_KEY;
  if (!raw || String(raw).length < 32) throw vaultError('Falta la clave de cifrado de la bóveda o es demasiado corta.');
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(String(raw)), Buffer.from('brainstudio-vault'), Buffer.from(VERSION), 32));
};

export const sealSecret = (plain, key, aad) => {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(aad)));
  const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
};

export const openSecret = (sealed, key, aad) => {
  if (!sealed) return null;
  const [version, iv, tag, body] = String(sealed).split('.');
  if (version !== VERSION || !iv || !tag || body == null) throw vaultError('Un valor de la bóveda tiene un formato desconocido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(String(aad)));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
};
