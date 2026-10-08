CREATE TABLE IF NOT EXISTS bria_memory.conversations (
  id uuid PRIMARY KEY,
  workspace text NOT NULL,
  actor_ref text NOT NULL,
  title text NOT NULL DEFAULT 'Nueva conversación',
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bria_conversations_owner ON bria_memory.conversations(workspace,actor_ref,updated_at DESC);
CREATE TABLE IF NOT EXISTS bria_memory.conversation_turns (
  conversation_id uuid NOT NULL REFERENCES bria_memory.conversations(id) ON DELETE CASCADE,
  position integer NOT NULL,
  role text NOT NULL CHECK(role IN ('user','assistant')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(conversation_id,position)
);
CREATE TABLE IF NOT EXISTS bria_memory.conversation_attachments (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL,
  position integer NOT NULL,
  name text NOT NULL,
  mime text NOT NULL,
  original_bytes bytea NOT NULL CHECK(octet_length(original_bytes) BETWEEN 1 AND 20971520),
  analysis_bytes bytea,
  extracted_text text NOT NULL DEFAULT '',
  status text NOT NULL CHECK(status IN ('READ','IMAGE','PDF','UNREADABLE')),
  warning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(conversation_id,position) REFERENCES bria_memory.conversation_turns(conversation_id,position) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS bria_attachments_conversation ON bria_memory.conversation_attachments(conversation_id,position DESC);

-- Additive rollout: old inline attachments remain readable until verified migration.
ALTER TABLE bria_memory.conversation_attachments ALTER COLUMN original_bytes DROP NOT NULL;
ALTER TABLE bria_memory.conversation_attachments ADD COLUMN IF NOT EXISTS storage_key text;
ALTER TABLE bria_memory.conversation_attachments ADD COLUMN IF NOT EXISTS original_sha256 text;
ALTER TABLE bria_memory.conversation_attachments ADD COLUMN IF NOT EXISTS analysis_key text;
ALTER TABLE bria_memory.conversation_attachments ADD COLUMN IF NOT EXISTS analysis_sha256 text;
ALTER TABLE bria_memory.conversation_attachments ADD COLUMN IF NOT EXISTS size_bytes integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bria_attachment_storage_shape' AND conrelid='bria_memory.conversation_attachments'::regclass) THEN
    ALTER TABLE bria_memory.conversation_attachments ADD CONSTRAINT bria_attachment_storage_shape CHECK (
      (original_bytes IS NOT NULL AND storage_key IS NULL) OR
      (original_bytes IS NULL AND storage_key IS NOT NULL AND original_sha256 IS NOT NULL AND original_sha256 ~ '^[a-f0-9]{64}$' AND size_bytes IS NOT NULL AND size_bytes BETWEEN 1 AND 20971520)
    );
  END IF;
END $$;

-- Contains only a scope and retry state, never recoverable messages or file bytes.
CREATE TABLE IF NOT EXISTS bria_memory.conversation_purges (
  id uuid PRIMARY KEY,
  workspace text NOT NULL,
  actor_ref text NOT NULL,
  prefix text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bria_purges_due ON bria_memory.conversation_purges(next_attempt_at,lease_until);
