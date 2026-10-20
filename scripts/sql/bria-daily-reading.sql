-- La memoria del tiempo y la lectura del día (19 de octubre de 2026). Esquema aditivo e idempotente, fuera de Prisma.
CREATE SCHEMA IF NOT EXISTS bria_memory;
-- Una foto por día de cada cuenta y de cada persona del equipo: cómo amaneció. Son números de trabajo (color de la
-- operación, piezas, aprobaciones, tareas, horas del día anterior), nunca una calificación. Se guardan sin llave hacia
-- el cliente a propósito: la historia de una cuenta sigue contando aunque su ficha cambie o se archive.
CREATE TABLE IF NOT EXISTS bria_memory.agency_snapshots (
  day_key TEXT NOT NULL CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('CLIENT','PERSON')),
  subject_id TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  subject_slug TEXT,
  pm_id TEXT,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day_key, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS agency_snapshots_subject ON bria_memory.agency_snapshots(subject_type, subject_id, day_key DESC);
-- La lectura de cada día hábil: las señales, lo que Bria propone hacer y no hacer, y quién la escribió (el modelo o
-- las reglas de la plataforma). Una por día; el mensaje de la mañana de cada persona sale de aquí.
-- El libro de decisiones (19 de octubre de 2026): cada decisión que Bria propuso en una lectura, con lo que decidió la
-- persona (hecha, descartada, aplazada) y, días después, lo que pasó según las señales. Una fila por decisión y persona.
-- Mide decisiones, nunca personas: no guarda nada sobre el sujeto más allá de su nombre y de la señal que lo sostenía.
CREATE TABLE IF NOT EXISTS bria_memory.decision_log (
  id UUID PRIMARY KEY,
  decision_id TEXT NOT NULL,
  day_key TEXT NOT NULL CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  user_ref TEXT NOT NULL,
  user_name TEXT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  subject_name TEXT,
  evidence TEXT[] NOT NULL DEFAULT '{}',
  verdict TEXT NOT NULL CHECK (verdict IN ('HECHO','NO','DESPUES')),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('MEJORO','YA_NO_SE_VE','SIGUE')),
  outcome_day TEXT,
  outcome_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (decision_id, user_ref)
);
CREATE INDEX IF NOT EXISTS decision_log_day ON bria_memory.decision_log(day_key DESC);
CREATE INDEX IF NOT EXISTS decision_log_user ON bria_memory.decision_log(user_ref, day_key DESC);
CREATE TABLE IF NOT EXISTS bria_memory.daily_readings (
  day_key TEXT PRIMARY KEY CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  base_day_key TEXT,
  source TEXT NOT NULL CHECK (source IN ('MODELO','REGLA')),
  reading JSONB NOT NULL,
  digest TEXT,
  model TEXT,
  usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
