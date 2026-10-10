-- «Bria se adelanta» y el foco de la semana (10 de octubre de 2026). Esquema aditivo e idempotente, fuera de Prisma.
CREATE SCHEMA IF NOT EXISTS bria_memory;
-- Avisos que una persona ocultó («Ocultar por hoy»): por quien mira y por clave del aviso, hasta una hora.
CREATE TABLE IF NOT EXISTS bria_memory.nudge_dismissals (
  user_ref TEXT NOT NULL,
  nudge_key TEXT NOT NULL,
  until_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_ref, nudge_key)
);
CREATE INDEX IF NOT EXISTS nudge_dismissals_until ON bria_memory.nudge_dismissals(until_at);
-- El foco de la semana que Bria dejó en el chat de cada persona: una fila por semana y persona, con su conversación.
CREATE TABLE IF NOT EXISTS bria_memory.weekly_focus_deliveries (
  week_key TEXT NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  user_ref TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_key, user_ref)
);
