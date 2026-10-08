-- Watermarks contain API cursors, never OAuth credentials or mail content.
CREATE TABLE IF NOT EXISTS bria_memory.sync_state (
  workspace text PRIMARY KEY,
  cursor jsonb,
  status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated integer NOT NULL DEFAULT 0,
  excluded integer NOT NULL DEFAULT 0,
  error_code text
);
