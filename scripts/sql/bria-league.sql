-- La liga del buen uso de la plataforma (2 de noviembre de 2026). Aditivo e idempotente.
-- Cada día hábil, a las 18:05 de Bogotá, la plataforma escribe los cinco puntos de cada persona con su evidencia;
-- los lunes cada persona puede regalar sus 10 puntos de bondad a una sola persona. Nada se borra: un mes cerrado
-- se queda tal cual para poder volver a leerlo.
CREATE SCHEMA IF NOT EXISTS bria_memory;

CREATE TABLE IF NOT EXISTS bria_memory.league_days (
  day_key TEXT NOT NULL CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  member_id TEXT NOT NULL,
  habits JSONB NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day_key, member_id)
);
CREATE INDEX IF NOT EXISTS league_days_member ON bria_memory.league_days(member_id, day_key DESC);
-- Los extras del día (3 de noviembre de 2026): «primero en abrir» y «primero en la reunión», para una sola persona.
ALTER TABLE bria_memory.league_days ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS bria_memory.league_kudos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_key TEXT NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  giver_member_id TEXT NOT NULL,
  receiver_member_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT league_kudos_one_gift_per_week UNIQUE (week_key, giver_member_id),
  CONSTRAINT league_kudos_not_to_self CHECK (giver_member_id <> receiver_member_id)
);
CREATE INDEX IF NOT EXISTS league_kudos_receiver ON bria_memory.league_kudos(receiver_member_id, created_at DESC);

-- Nuevo inicio solicitado por Rodny. La fecha se fija una sola vez: reiniciar o volver a desplegar
-- no reinicia la liga. Las tablas del piloto siguen intactas y no se copian a esta edición.
CREATE TABLE IF NOT EXISTS bria_memory.league_runs (
  id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO bria_memory.league_runs(id) VALUES ('fresh-start-2026-11') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS bria_memory.league_run_days (
  run_id TEXT NOT NULL REFERENCES bria_memory.league_runs(id),
  day_key TEXT NOT NULL CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  member_id TEXT NOT NULL,
  habits JSONB NOT NULL,
  extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, day_key, member_id)
);
CREATE TABLE IF NOT EXISTS bria_memory.league_run_kudos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL REFERENCES bria_memory.league_runs(id),
  week_key TEXT NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  giver_member_id TEXT NOT NULL,
  receiver_member_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, week_key, giver_member_id),
  CHECK (giver_member_id <> receiver_member_id)
);
CREATE INDEX IF NOT EXISTS league_run_kudos_month ON bria_memory.league_run_kudos(run_id, created_at);
