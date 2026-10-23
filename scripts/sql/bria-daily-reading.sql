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
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('MEJORO','YA_NO_SE_VE','SIGUE','SIN_EVIDENCIA')),
  outcome_day TEXT,
  outcome_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (decision_id, user_ref)
);
CREATE INDEX IF NOT EXISTS decision_log_day ON bria_memory.decision_log(day_key DESC);
CREATE INDEX IF NOT EXISTS decision_log_user ON bria_memory.decision_log(user_ref, day_key DESC);
-- Seguimiento revisable (23 de octubre de 2026). Una revisión cambia solo con el veredicto humano;
-- el historial conserva sus correcciones y cada observación diaria, sin borrar los valores anteriores.
ALTER TABLE bria_memory.decision_log ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
-- Conserva YA_NO_SE_VE histórico; falta de evidencia ya no significa mejora.
-- La restricción se amplía solo una vez, sin reemplazarla en cada arranque.
DO $upgrade$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'bria_memory.decision_log'::regclass AND conname = 'decision_log_outcome_check'
      AND pg_get_constraintdef(oid) LIKE '%SIN_EVIDENCIA%') THEN
    ALTER TABLE bria_memory.decision_log DROP CONSTRAINT IF EXISTS decision_log_outcome_check;
    ALTER TABLE bria_memory.decision_log ADD CONSTRAINT decision_log_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('MEJORO','YA_NO_SE_VE','SIGUE','SIN_EVIDENCIA'));
  END IF;
END
$upgrade$;

-- Evidencia inmutable, protegida por AUDIT_TABLES al arrancar. Sin llave hacia la fila de trabajo:
-- borrar o cambiar esa fila nunca puede arrastrar su historial. La secuencia ordena incluso eventos simultáneos.
CREATE TABLE IF NOT EXISTS bria_memory.decision_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  decision_log_id UUID NOT NULL,
  event JSONB NOT NULL CHECK (jsonb_typeof(event) = 'object' AND event->>'type' IS NOT NULL AND event->>'type' IN ('VERDICT','OUTCOME')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decision_events_log ON bria_memory.decision_events(decision_log_id, id);

CREATE OR REPLACE FUNCTION bria_memory.record_decision_event() RETURNS trigger LANGUAGE plpgsql AS $events$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.revision IS NOT DISTINCT FROM OLD.revision
      AND (NEW.outcome, NEW.outcome_day, NEW.outcome_text) IS NOT DISTINCT FROM (OLD.outcome, OLD.outcome_day, OLD.outcome_text) THEN
      RETURN NEW;
    END IF;
    -- Primera modificación tras actualizar una base antigua: rescatar lo que ya había antes de reemplazarlo.
    IF NOT EXISTS (SELECT 1 FROM bria_memory.decision_events WHERE decision_log_id = OLD.id) THEN
      INSERT INTO bria_memory.decision_events(decision_log_id, event) VALUES (OLD.id,
        jsonb_build_object('type','VERDICT','revision',OLD.revision,'verdict',OLD.verdict,'note',OLD.note,
          'decidedAt',OLD.decided_at,'outcome',OLD.outcome,'outcomeDay',OLD.outcome_day,'outcomeText',OLD.outcome_text,
          'decisionId',OLD.decision_id,'dayKey',OLD.day_key,'userRef',OLD.user_ref,'userName',OLD.user_name,
          'title',OLD.title,'kind',OLD.kind,'subjectType',OLD.subject_type,'subjectId',OLD.subject_id,
          'subjectName',OLD.subject_name,'evidence',OLD.evidence));
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.revision IS DISTINCT FROM OLD.revision THEN
    INSERT INTO bria_memory.decision_events(decision_log_id, event) VALUES (NEW.id,
      jsonb_build_object('type','VERDICT','revision',NEW.revision,'verdict',NEW.verdict,'note',NEW.note,
        'decidedAt',NEW.decided_at,'outcome',NEW.outcome,'outcomeDay',NEW.outcome_day,'outcomeText',NEW.outcome_text,
        'decisionId',NEW.decision_id,'dayKey',NEW.day_key,'userRef',NEW.user_ref,'userName',NEW.user_name,
        'title',NEW.title,'kind',NEW.kind,'subjectType',NEW.subject_type,'subjectId',NEW.subject_id,
        'subjectName',NEW.subject_name,'evidence',NEW.evidence));
  ELSIF NEW.outcome IS NOT NULL THEN
    INSERT INTO bria_memory.decision_events(decision_log_id, event) VALUES (NEW.id,
      jsonb_build_object('type','OUTCOME','revision',NEW.revision,'outcome',NEW.outcome,'text',NEW.outcome_text,'day',NEW.outcome_day));
  END IF;
  RETURN NEW;
END
$events$;
DO $trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'bria_memory.decision_log'::regclass AND tgname = 'decision_log_events') THEN
    CREATE TRIGGER decision_log_events AFTER INSERT OR UPDATE ON bria_memory.decision_log
      FOR EACH ROW EXECUTE FUNCTION bria_memory.record_decision_event();
  END IF;
END
$trigger$;
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
