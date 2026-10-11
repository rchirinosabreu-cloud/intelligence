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
-- El pulso de Bria (10 de octubre de 2026): cada hora hábil lee los hechos de la plataforma y decide qué decirle a
-- cada persona. `pulse_runs` evita que dos réplicas o un reinicio repitan la misma hora; `pulse_messages` guarda lo
-- que dijo (para no repetirse, para los topes y para la X).
CREATE TABLE IF NOT EXISTS bria_memory.pulse_runs (
  hour_key TEXT PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bria_memory.pulse_messages (
  id UUID PRIMARY KEY,
  user_ref TEXT NOT NULL,
  kinds TEXT[] NOT NULL,
  fact_ids TEXT[] NOT NULL,
  fingerprints TEXT[] NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  ask TEXT,
  url TEXT,
  task_ids TEXT[] NOT NULL DEFAULT '{}',
  urgency TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('MODELO','REGLA')),
  model TEXT,
  usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  dismissed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pulse_messages_user ON bria_memory.pulse_messages(user_ref, created_at DESC);
-- Los botones de cada aviso los decide la plataforma según el hecho (enlace, o algo que pedirle a Bria).
ALTER TABLE bria_memory.pulse_messages ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '[]';
-- El foco de la semana que Bria dejó en el chat de cada persona: una fila por semana y persona, con su conversación.
CREATE TABLE IF NOT EXISTS bria_memory.weekly_focus_deliveries (
  week_key TEXT NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  user_ref TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_key, user_ref)
);
