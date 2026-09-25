-- F&F Chat :: workspaces (μία οικογένεια/παρέα) και AI ρυθμίσεις ανά χρήστη
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  builtin_ai INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

ALTER TABLE users ADD COLUMN workspace_id TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

-- Οι υπάρχοντες χρήστες μπαίνουν στο αρχικό workspace, που κρατά τον ενσωματωμένο AI (Λιάκος).
INSERT INTO workspaces (id, name, invite_code, builtin_ai, created_at)
VALUES ('legacy', 'Liakos Chat', 'legacy-' || lower(hex(randomblob(6))), 1, CAST(strftime('%s','now') AS INTEGER) * 1000);

UPDATE users SET workspace_id = 'legacy';
UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);

CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);

-- Το API key αποθηκεύεται κρυπτογραφημένο (AES-GCM), ποτέ σε καθαρό κείμενο.
CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT,
  bot_name TEXT,
  api_key_enc TEXT,
  updated_at INTEGER NOT NULL
);
