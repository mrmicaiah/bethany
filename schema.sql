-- Bethany's Tables
-- Run with: wrangler d1 execute productivity --file=./schema.sql

-- People in your life
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,  -- daughter, girlfriend, friend, colleague, family
  birthday TEXT,               -- MM-DD format for annual reminders
  last_contact TEXT,           -- ISO date
  contact_frequency TEXT DEFAULT 'weekly',  -- daily, weekly, monthly, quarterly
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Her memory of your conversations
CREATE TABLE IF NOT EXISTS bethany_conversations (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,           -- 'bethany' or 'micaiah'
  content TEXT NOT NULL,
  channel TEXT DEFAULT 'sms',   -- sms, claude, etc
  created_at TEXT DEFAULT (datetime('now'))
);

-- Things she's learned about you
CREATE TABLE IF NOT EXISTS bethany_context (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,       -- preference, pattern, boundary, fact
  content TEXT NOT NULL,
  source TEXT,                  -- how she learned it
  created_at TEXT DEFAULT (datetime('now'))
);

-- Things she wants to bring up
CREATE TABLE IF NOT EXISTS bethany_queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- nudge, question, reminder, thought
  content TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  earliest_at TEXT,             -- don't bring up before this time
  expires_at TEXT,              -- no longer relevant after this
  delivered_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_people_relationship ON people(relationship);
CREATE INDEX IF NOT EXISTS idx_people_last_contact ON people(last_contact);
CREATE INDEX IF NOT EXISTS idx_bethany_conversations_created ON bethany_conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_bethany_context_category ON bethany_context(category);
CREATE INDEX IF NOT EXISTS idx_bethany_queue_delivered ON bethany_queue(delivered_at);
CREATE INDEX IF NOT EXISTS idx_bethany_queue_earliest ON bethany_queue(earliest_at);
