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
