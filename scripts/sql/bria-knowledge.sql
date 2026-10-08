-- Additive sidecar schema: no production table/provider is changed.
CREATE SCHEMA IF NOT EXISTS bria_memory;
CREATE TABLE IF NOT EXISTS bria_memory.learnings (
  id UUID PRIMARY KEY, workspace TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('AGENCY','ACCOUNT','PERSONAL')),
  entity TEXT NOT NULL, entity_key TEXT NOT NULL, topic TEXT NOT NULL, topic_key TEXT NOT NULL,
  subject_ref TEXT NOT NULL, content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 2000),
  kind TEXT NOT NULL CHECK(kind IN ('CONFIRMED','PROPOSAL')), status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  valid_from DATE NOT NULL, valid_until DATE, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  actor_ref TEXT NOT NULL, actor_name TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(valid_until IS NULL OR valid_until >= valid_from),
  UNIQUE(workspace,scope,entity_key,topic_key,subject_ref,kind)
);
CREATE INDEX IF NOT EXISTS bria_learnings_scope ON bria_memory.learnings(workspace,status,scope,entity_key);
CREATE TABLE IF NOT EXISTS bria_memory.learning_events (
  id UUID PRIMARY KEY, learning_id UUID NOT NULL REFERENCES bria_memory.learnings(id), revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','UNDO','REVOKE')), before_data JSONB, after_data JSONB NOT NULL,
  actor_ref TEXT NOT NULL, actor_name TEXT NOT NULL, reason TEXT NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(learning_id,revision)
);
CREATE TABLE IF NOT EXISTS bria_memory.sources (
  workspace TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, source_date TEXT, locator TEXT,
  digest TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0), status TEXT NOT NULL CHECK(status IN ('INDEXED','EXCLUDED')),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(workspace,id)
);
CREATE TABLE IF NOT EXISTS bria_memory.source_versions (
  workspace TEXT NOT NULL, source_id TEXT NOT NULL, revision INTEGER NOT NULL, digest TEXT NOT NULL,
  body TEXT NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace,source_id,revision), FOREIGN KEY(workspace,source_id) REFERENCES bria_memory.sources(workspace,id)
);
CREATE TABLE IF NOT EXISTS bria_memory.source_search (
  workspace TEXT NOT NULL, source_id TEXT NOT NULL, position INTEGER NOT NULL, content TEXT NOT NULL,
  terms TSVECTOR NOT NULL, PRIMARY KEY(workspace,source_id,position), FOREIGN KEY(workspace,source_id) REFERENCES bria_memory.sources(workspace,id)
);
CREATE INDEX IF NOT EXISTS bria_source_terms ON bria_memory.source_search USING GIN(terms);
CREATE TABLE IF NOT EXISTS bria_memory.import_runs (
  id UUID PRIMARY KEY, workspace TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETED','FAILED')),
  cursor TEXT, imported INTEGER NOT NULL DEFAULT 0, unchanged INTEGER NOT NULL DEFAULT 0, error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
