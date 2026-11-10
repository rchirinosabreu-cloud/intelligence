-- La liga del buen uso de la plataforma (2 de noviembre de 2026). Aditivo e idempotente.
-- Cada día hábil, a las 18:05 de Bogotá, la plataforma escribe los cinco puntos de cada persona con su evidencia;
-- cada mes una persona puede regalar sus 10 puntos a alguien del equipo. Nada se borra: un mes cerrado
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

-- El cupo mensual conserva todos los regalos anteriores, aunque hubiera varios en un mes.
-- El trigger protege también a servidores antiguos durante un despliegue gradual.
CREATE TABLE IF NOT EXISTS bria_memory.league_kudos_months (
  run_id TEXT NOT NULL REFERENCES bria_memory.league_runs(id),
  month_key TEXT NOT NULL CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  giver_member_id TEXT NOT NULL,
  PRIMARY KEY (run_id, month_key, giver_member_id)
);
CREATE OR REPLACE FUNCTION bria_memory.claim_league_month() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO bria_memory.league_kudos_months(run_id, month_key, giver_member_id)
    VALUES (NEW.run_id, to_char(NEW.created_at AT TIME ZONE 'America/Bogota', 'YYYY-MM'), NEW.giver_member_id);
  RETURN NEW;
END;
$$;
-- La restricción semanal impediría regalar en dos meses que comparten semana ISO.
-- Este bloque toma el mismo bloqueo que los escritores antes de sustituir el límite.
DO $$ BEGIN
  LOCK TABLE bria_memory.league_run_kudos IN ACCESS EXCLUSIVE MODE;
  ALTER TABLE bria_memory.league_run_kudos
    DROP CONSTRAINT IF EXISTS league_run_kudos_run_id_week_key_giver_member_id_key;
  DROP TRIGGER IF EXISTS league_monthly_budget ON bria_memory.league_run_kudos;
  CREATE TRIGGER league_monthly_budget BEFORE INSERT ON bria_memory.league_run_kudos
    FOR EACH ROW EXECUTE FUNCTION bria_memory.claim_league_month();
  INSERT INTO bria_memory.league_kudos_months(run_id, month_key, giver_member_id)
    SELECT DISTINCT run_id, to_char(created_at AT TIME ZONE 'America/Bogota', 'YYYY-MM'), giver_member_id
    FROM bria_memory.league_run_kudos ON CONFLICT DO NOTHING;
END $$;

-- Cupo semanal de cinco puntos (decisión del 3 de noviembre). Conserva los regalos de diez ya entregados.
ALTER TABLE bria_memory.league_run_kudos ADD COLUMN IF NOT EXISTS points SMALLINT NOT NULL DEFAULT 10 CHECK (points IN (5,10));
ALTER TABLE bria_memory.league_run_kudos ALTER COLUMN points SET DEFAULT 5;
CREATE TABLE IF NOT EXISTS bria_memory.league_kudos_weeks (
  run_id TEXT NOT NULL REFERENCES bria_memory.league_runs(id),
  week_key TEXT NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  giver_member_id TEXT NOT NULL,
  PRIMARY KEY (run_id, week_key, giver_member_id)
);
CREATE OR REPLACE FUNCTION bria_memory.claim_league_week() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.week_key := to_char(NEW.created_at AT TIME ZONE 'America/Bogota', 'IYYY-"W"IW');
  NEW.points := 5;
  INSERT INTO bria_memory.league_kudos_weeks(run_id, week_key, giver_member_id)
    VALUES(NEW.run_id, NEW.week_key, NEW.giver_member_id);
  RETURN NEW;
END;
$$;
DO $$ BEGIN
  LOCK TABLE bria_memory.league_run_kudos IN ACCESS EXCLUSIVE MODE;
  DROP TRIGGER IF EXISTS league_monthly_budget ON bria_memory.league_run_kudos;
  DROP TRIGGER IF EXISTS league_weekly_budget ON bria_memory.league_run_kudos;
  CREATE TRIGGER league_weekly_budget BEFORE INSERT ON bria_memory.league_run_kudos
    FOR EACH ROW EXECUTE FUNCTION bria_memory.claim_league_week();
  INSERT INTO bria_memory.league_kudos_weeks(run_id,week_key,giver_member_id)
    SELECT DISTINCT run_id,week_key,giver_member_id FROM bria_memory.league_run_kudos ON CONFLICT DO NOTHING;
END $$;

CREATE TABLE IF NOT EXISTS bria_memory.league_meeting_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL REFERENCES bria_memory.league_runs(id),
  week_key TEXT NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  day_key TEXT NOT NULL CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  member_id TEXT NOT NULL,
  awarded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT league_meeting_awards_week_member_key UNIQUE (run_id, week_key, member_id)
);
-- Los dos primeros en la reunión de tráfico reciben diez puntos cada uno (Rodny, 9 de noviembre de 2026):
-- la semana deja de admitir una sola persona y pasa a rechazar solo a la misma persona dos veces. El tope de dos
-- lo pone el repositorio al insertar. Aditivo: conserva los premios ya registrados.
DO $$ DECLARE old_constraint TEXT; BEGIN
  SELECT conname INTO old_constraint FROM pg_constraint
    WHERE conrelid = 'bria_memory.league_meeting_awards'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (run_id, week_key)';
  IF old_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE bria_memory.league_meeting_awards DROP CONSTRAINT %I', old_constraint);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'bria_memory.league_meeting_awards'::regclass AND conname = 'league_meeting_awards_week_member_key') THEN
    ALTER TABLE bria_memory.league_meeting_awards ADD CONSTRAINT league_meeting_awards_week_member_key UNIQUE (run_id, week_key, member_id);
  END IF;
END $$;
