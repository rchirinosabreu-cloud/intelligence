-- Bóveda de accesos (9 de octubre de 2026). Esquema aditivo propio: no cambia ninguna tabla operativa ni el
-- proveedor de Prisma. Los valores (usuario, contraseña, notas) se guardan cifrados con AES-256-GCM; nada en
-- texto plano. Nada se borra: un acceso retirado queda RETIRED con su historial, y cada lectura queda en
-- reveal_events.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.credentials (
  id UUID PRIMARY KEY,
  client_id TEXT,
  platform TEXT NOT NULL CHECK(length(platform) BETWEEN 1 AND 60),
  label TEXT CHECK(label IS NULL OR length(label) <= 120),
  url TEXT CHECK(url IS NULL OR length(url) <= 500),
  username_enc TEXT,
  secret_enc TEXT NOT NULL,
  notes_enc TEXT,
  shared_user_ids TEXT[] NOT NULL DEFAULT '{}',
  kind TEXT NOT NULL DEFAULT 'ACCESO' CHECK(kind IN ('ACCESO','BLOQUE')),
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('MANUAL','IMPORT')),
  import_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETIRED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by_ref TEXT NOT NULL, created_by_name TEXT NOT NULL,
  updated_by_ref TEXT NOT NULL, updated_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vault_credentials_client ON vault.credentials(status, client_id);
CREATE TABLE IF NOT EXISTS vault.credential_events (
  id UUID PRIMARY KEY, credential_id UUID NOT NULL REFERENCES vault.credentials(id),
  revision INTEGER NOT NULL, action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','RETIRE','IMPORT')),
  changed_fields TEXT[] NOT NULL DEFAULT '{}', reason TEXT,
  actor_ref TEXT NOT NULL, actor_name TEXT NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vault.reveal_events (
  id UUID PRIMARY KEY, credential_id UUID NOT NULL REFERENCES vault.credentials(id),
  via TEXT NOT NULL CHECK(via IN ('BOVEDA','BRIA')),
  actor_ref TEXT NOT NULL, actor_name TEXT NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vault_reveals_credential ON vault.reveal_events(credential_id, recorded_at DESC);
-- Vínculo formal con la ficha del cliente (9 de octubre de 2026). Si una ficha se borra, sus accesos quedan
-- sin cliente: pasan a ser de la agencia, visibles solo para administradores, nunca para otro PM.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vault_credentials_client_fk') THEN
    UPDATE vault.credentials v SET client_id = NULL WHERE client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Client" c WHERE c.id = v.client_id);
    ALTER TABLE vault.credentials ADD CONSTRAINT vault_credentials_client_fk FOREIGN KEY (client_id) REFERENCES public."Client"(id) ON DELETE SET NULL;
  END IF;
END $$;
