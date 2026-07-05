ALTER TABLE remote_command RENAME TO remote_command_old;

CREATE TABLE remote_command (
  id TEXT PRIMARY KEY,
  install_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('uninstall','policy_reset')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','acknowledged','completed','failed')),
  created_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  completed_at INTEGER,
  retain_until INTEGER NOT NULL,
  FOREIGN KEY (install_id) REFERENCES registration (install_id) ON DELETE CASCADE
);

INSERT INTO remote_command (id, install_id, type, status, created_at, acknowledged_at, completed_at, retain_until)
SELECT id, install_id, type, status, created_at, acknowledged_at, completed_at, retain_until
FROM remote_command_old
WHERE type IN ('uninstall','policy_reset');

DROP TABLE remote_command_old;

CREATE INDEX IF NOT EXISTS remote_command_install_status_idx ON remote_command (install_id, status);
CREATE INDEX IF NOT EXISTS remote_command_retain_until_idx ON remote_command (retain_until);
