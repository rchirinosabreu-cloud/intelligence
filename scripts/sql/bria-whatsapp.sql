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
