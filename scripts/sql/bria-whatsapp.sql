-- Bria en WhatsApp (Rodny, 20 de octubre de 2026): el número de la agencia habla con el equipo por la API oficial
-- de Meta. Aquí vive el vínculo número ↔ persona (hecho con un código que la persona genera en su perfil), los
-- códigos vivos y los mensajes ya recibidos (para no responder dos veces un aviso repetido y para explicarle a un
-- número desconocido una sola vez qué es este número). Nunca se guarda el texto de los mensajes: la conversación
-- es la de Bria de siempre (bria_memory.conversations), con las mismas reglas de acceso y borrado.
-- Esquema aditivo e idempotente, fuera de Prisma.
CREATE SCHEMA IF NOT EXISTS bria_memory;
CREATE TABLE IF NOT EXISTS bria_memory.whatsapp_links (
  user_id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL UNIQUE,
  profile_name TEXT,
  conversation_id UUID,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ
);
-- 22 de octubre de 2026: Meta identifica a quien escribe con su BSUID (siempre) y solo a veces con su número. `wa_id`
-- pasa a guardar la clave estable (el BSUID, o el número en un aviso antiguo) y `phone` el número cuando llega.
ALTER TABLE bria_memory.whatsapp_links ADD COLUMN IF NOT EXISTS phone TEXT;
CREATE INDEX IF NOT EXISTS whatsapp_links_phone ON bria_memory.whatsapp_links(phone) WHERE phone IS NOT NULL;
CREATE TABLE IF NOT EXISTS bria_memory.whatsapp_link_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_link_codes_user ON bria_memory.whatsapp_link_codes(user_id);
CREATE TABLE IF NOT EXISTS bria_memory.whatsapp_inbound (
  message_id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'MESSAGE' CHECK (kind IN ('MESSAGE','UNKNOWN_REPLY')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_inbound_recent ON bria_memory.whatsapp_inbound(wa_id, received_at DESC);
-- Avisos por WhatsApp (22 de octubre de 2026). `alerts_off` son los tipos que la persona apagó (vienen encendidos);
-- `last_inbound_at` es su último mensaje, que abre la ventana de 24 horas en la que Bria escribe libre.
ALTER TABLE bria_memory.whatsapp_links ADD COLUMN IF NOT EXISTS alerts_off TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE bria_memory.whatsapp_links ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;
-- Cada aviso que salió o se intentó, con su texto y sus botones: fuera de la ventana sale solo la plantilla y el
-- aviso entero llega cuando la persona toca «Ver aviso». Es texto de la plataforma (lo mismo que la campana), nunca
-- lo que escribe una persona. Se borra a los 14 días.
CREATE TABLE IF NOT EXISTS bria_memory.whatsapp_alerts (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ACCESS','DAILY','PULSE')),
  source_ref TEXT NOT NULL,
  topic TEXT,
  text TEXT NOT NULL,
  buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
  via TEXT CHECK (via IN ('SESSION','TEMPLATE')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  UNIQUE (user_id, source_ref)
);
CREATE INDEX IF NOT EXISTS whatsapp_alerts_user_recent ON bria_memory.whatsapp_alerts(user_id, created_at DESC);
