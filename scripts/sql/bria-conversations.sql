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
