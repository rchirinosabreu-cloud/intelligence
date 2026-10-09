-- Memoria de la agencia (9 de octubre de 2026). Esquema aditivo en el espacio lateral de Bria: no cambia
-- ninguna tabla operativa ni el proveedor de Prisma. Nada se borra: un hecho reemplazado queda SUPERSEDED.
CREATE SCHEMA IF NOT EXISTS bria_memory;
CREATE TABLE IF NOT EXISTS bria_memory.agency_facts (
  workspace TEXT NOT NULL, id TEXT NOT NULL,
  client_id TEXT, entity TEXT NOT NULL, entity_key TEXT NOT NULL,
  entity_type TEXT NOT NULL, topic TEXT NOT NULL,
  statement TEXT NOT NULL CHECK(length(statement) BETWEEN 1 AND 600),
  certainty TEXT NOT NULL CHECK(certainty IN ('CONFIRMADO','VIGENTE_DOCUMENTADO','VIGENTE_DE_HECHO','PRACTICA','PROPUESTA','NO_CONCLUYENTE','HISTORICO')),
  purpose TEXT NOT NULL CHECK(purpose IN ('operacion','editorial','personas','comercial','financiero','direccion')),
  sensitivity TEXT NOT NULL CHECK(sensitivity IN ('normal','restringida')),
  valid_from DATE, valid_until DATE, observed_on DATE, as_of DATE,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  origin TEXT NOT NULL CHECK(origin IN ('LECTURA','EQUIPO')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUPERSEDED','RETIRED')),
  superseded_by TEXT, digest TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  actor_ref TEXT NOT NULL, actor_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  terms TSVECTOR NOT NULL,
  CHECK(valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CHECK(purpose <> 'direccion' OR sensitivity = 'restringida'),
  PRIMARY KEY(workspace, id)
);
CREATE INDEX IF NOT EXISTS bria_agency_facts_entity ON bria_memory.agency_facts(workspace, status, entity_key);
CREATE INDEX IF NOT EXISTS bria_agency_facts_client ON bria_memory.agency_facts(workspace, status, client_id);
CREATE INDEX IF NOT EXISTS bria_agency_facts_terms ON bria_memory.agency_facts USING GIN(terms);
CREATE TABLE IF NOT EXISTS bria_memory.agency_fact_events (
  id UUID PRIMARY KEY, workspace TEXT NOT NULL, fact_id TEXT NOT NULL, revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('IMPORT','IMPORT_UPDATE','CONFIRM','CORRECT','SUPERSEDE','RETIRE','LINK')),
  before_data JSONB, after_data JSONB NOT NULL, actor_ref TEXT NOT NULL, actor_name TEXT NOT NULL,
  reason TEXT NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace, fact_id) REFERENCES bria_memory.agency_facts(workspace, id),
  UNIQUE(workspace, fact_id, revision)
);
CREATE TABLE IF NOT EXISTS bria_memory.agency_questions (
  workspace TEXT NOT NULL, id TEXT NOT NULL,
  client_id TEXT, entity TEXT NOT NULL, entity_key TEXT NOT NULL,
  question TEXT NOT NULL CHECK(length(question) BETWEEN 1 AND 600), why TEXT, who TEXT,
  priority TEXT NOT NULL CHECK(priority IN ('alta','media','baja')),
  purpose TEXT NOT NULL CHECK(purpose IN ('operacion','editorial','personas','comercial','financiero','direccion')),
  related_fact_ids TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ANSWERED','DISMISSED')),
  answer_fact_id TEXT, answered_by_ref TEXT, answered_by_name TEXT, answered_at TIMESTAMPTZ,
  last_offered_at TIMESTAMPTZ, digest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace, id)
);
CREATE INDEX IF NOT EXISTS bria_agency_questions_entity ON bria_memory.agency_questions(workspace, status, entity_key);
CREATE INDEX IF NOT EXISTS bria_agency_questions_client ON bria_memory.agency_questions(workspace, status, client_id);
