-- Bethany D1 Schema
-- Initial migration

-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  pin_hash TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- System docs (MODE-SYSTEM.md, CREATING-MODES.md, etc.)
CREATE TABLE system_docs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  content TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Modes (Claude's internal structure)
CREATE TABLE modes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  instructions TEXT,
  behavior TEXT DEFAULT 'collaborative',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Tracks (the working units within modes)
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mode_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  behavior TEXT DEFAULT 'collaborative',
  status TEXT DEFAULT 'active',
  plan JSON,
  progress JSON,
  profile JSON,
  situation JSON,
  preferences JSON,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (mode_id) REFERENCES modes(id)
);

-- Entries (all logged events: workouts, meals, expenses, journal, tasks, timeline)
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  track_id TEXT,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  data JSON,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

-- Daily notes (persistent task bucket)
CREATE TABLE daily_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  task TEXT NOT NULL,
  context TEXT,
  status TEXT DEFAULT 'open',
  added_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Daily plans
CREATE TABLE daily_plans (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  items JSON,
  completed JSON,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Conversations
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  last_message_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Messages
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Indexes for common queries
CREATE INDEX idx_tracks_user ON tracks(user_id);
CREATE INDEX idx_tracks_mode ON tracks(mode_id);
CREATE INDEX idx_entries_user ON entries(user_id);
CREATE INDEX idx_entries_track ON entries(track_id);
CREATE INDEX idx_entries_date ON entries(date);
CREATE INDEX idx_entries_type ON entries(type);
CREATE INDEX idx_daily_notes_user ON daily_notes(user_id);
CREATE INDEX idx_daily_notes_status ON daily_notes(status);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
