-- Lectura de la semana (10 de octubre de 2026): lo que Bria le propone a la dirección a partir de Ritmo y del mapa
-- de carga. Una fila por generación; se conserva el historial. Esquema aditivo e idempotente, fuera de Prisma.
CREATE SCHEMA IF NOT EXISTS bria_memory;
CREATE TABLE IF NOT EXISTS bria_memory.rhythm_readings (
  id UUID PRIMARY KEY,
  week_key TEXT NOT NULL CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$'),
  trigger TEXT NOT NULL CHECK (trigger IN ('MANUAL','AUTOMATICO')),
  period_days INTEGER NOT NULL CHECK (period_days > 0),
  reading JSONB NOT NULL,
  digest TEXT NOT NULL,
  model TEXT,
  usage JSONB,
  generated_by_ref TEXT NOT NULL,
  generated_by_name TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rhythm_readings_week ON bria_memory.rhythm_readings(week_key, generated_at DESC);
