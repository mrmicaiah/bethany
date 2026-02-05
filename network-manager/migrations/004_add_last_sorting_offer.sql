-- Migration: Add last_sorting_offer to users table
-- TASK-eaeac267-0: Weekly sorting check-in trigger
--
-- Tracks when we last offered to help the user sort their contacts.
-- Prevents spamming users with repeated offers.

ALTER TABLE users ADD COLUMN last_sorting_offer TEXT DEFAULT NULL;

-- Index for efficient cron query (find users who haven't been offered recently)
CREATE INDEX IF NOT EXISTS idx_users_sorting_offer ON users(last_sorting_offer);
