-- Buzones compartidos de la agencia leídos por Bria (11 de octubre de 2026): social.brainstudio@gmail.com y
-- contacto@brainstudioagencia.com, conectados por un administrador con una contraseña de aplicación que se guarda
-- cifrada (AES-256-GCM, misma llave y misma forma que la bóveda) y nunca viaja al navegador ni pasa por el modelo.
-- De cada correo solo se guarda lo justo para no releerlo y para el aviso: remitente, asunto, fecha, decisión.
-- Esquema aditivo e idempotente, fuera de Prisma.
CREATE SCHEMA IF NOT EXISTS bria_memory;
CREATE TABLE IF NOT EXISTS bria_memory.mail_accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  label TEXT,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 993,
  username TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_by_ref TEXT,
  connected_by_name TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS bria_memory.mail_seen (
  account_id UUID NOT NULL REFERENCES bria_memory.mail_accounts(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  from_address TEXT,
  from_name TEXT,
  subject TEXT,
  received_at TIMESTAMPTZ,
  important BOOLEAN NOT NULL DEFAULT false,
  reasons TEXT[] NOT NULL DEFAULT '{}',
  client_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, message_id)
);
CREATE INDEX IF NOT EXISTS mail_seen_recent ON bria_memory.mail_seen(account_id, created_at DESC);
