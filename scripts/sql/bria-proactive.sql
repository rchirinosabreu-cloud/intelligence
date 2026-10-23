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
-- El seguimiento de los avisos (14 de octubre de 2026): el pulso vuelve a mirar cada aviso vivo; si se resolvió escribe el
-- desenlace (`resolution`, con la hora) y si a la hora sigue igual lo dice una sola vez (`follow_up`). No son avisos nuevos.
ALTER TABLE bria_memory.pulse_messages ADD COLUMN IF NOT EXISTS follow_up TEXT;
ALTER TABLE bria_memory.pulse_messages ADD COLUMN IF NOT EXISTS followed_up_at TIMESTAMPTZ;
ALTER TABLE bria_memory.pulse_messages ADD COLUMN IF NOT EXISTS resolution TEXT;
ALTER TABLE bria_memory.pulse_messages ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
-- El foco de la semana que Bria dejó en el chat de cada persona: una fila por semana y persona, con su conversación.
CREATE TABLE IF NOT EXISTS bria_memory.weekly_focus_deliveries (
  week_key TEXT NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  user_ref TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_key, user_ref)
);
-- El cierre del día (14 de octubre de 2026) que Bria dejó en el chat de cada persona: una fila por día hábil y persona.
CREATE TABLE IF NOT EXISTS bria_memory.daily_close_deliveries (
  day_key TEXT NOT NULL CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  user_ref TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day_key, user_ref)
);
-- La lectura de la mañana (19 de octubre de 2026) que Bria dejó en el chat de cada persona de dirección: una fila por
-- día hábil y persona.
-- La revisión de las cuentas al cerrar el mes (23 de octubre de 2026): una por mes revisado y administrador.
CREATE TABLE IF NOT EXISTS bria_memory.monthly_review_deliveries (
  month_key TEXT NOT NULL CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  user_ref TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month_key, user_ref)
);

CREATE TABLE IF NOT EXISTS bria_memory.morning_brief_deliveries (
  day_key TEXT NOT NULL CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  user_ref TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day_key, user_ref)
);
-- Pedidos de acceso a un módulo (15 de octubre de 2026): cuando alguien le pide a Bria algo de un módulo que su
-- cuenta no tiene, Bria se lo pide a los administradores sin que la persona lo pida. Uno abierto por módulo y
-- persona; quién pidió, para qué (en pocas palabras), quién decidió y cuándo. Dar acceso escribe en la cuenta.
CREATE TABLE IF NOT EXISTS bria_memory.permission_requests (
  id UUID PRIMARY KEY,
  module_key TEXT NOT NULL CHECK (length(module_key) BETWEEN 1 AND 40),
  requester_ref TEXT NOT NULL, requester_name TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DENIED')),
  decided_by_ref TEXT, decided_by_name TEXT, decided_at TIMESTAMPTZ,
  requester_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS permission_requests_open ON bria_memory.permission_requests(module_key, requester_ref) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS permission_requests_status ON bria_memory.permission_requests(status, created_at);
