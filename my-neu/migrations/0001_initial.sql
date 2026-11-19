CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, recovery_hash TEXT, recovery_salt TEXT, created_at INTEGER NOT NULL, session_version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE boards (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE seeds (id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'text', text TEXT NOT NULL DEFAULT '', image_key TEXT, x REAL NOT NULL, y REAL NOT NULL);
CREATE INDEX seeds_board ON seeds(board_id);
CREATE INDEX boards_owner ON boards(owner_id);
CREATE TABLE subscriptions (user_id TEXT PRIMARY KEY REFERENCES users(id), stripe_customer_id TEXT, stripe_subscription_id TEXT, status TEXT NOT NULL, period_end INTEGER);
CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL);
