-- Seed data: People Bethany should know about
-- Run with: wrangler d1 execute productivity --file=./seed-people.sql

-- Family
INSERT OR IGNORE INTO people (id, name, relationship, contact_frequency, notes)
VALUES 
  ('p-maya', 'Maya', 'daughter', 'daily', 'Daughter'),
  ('p-amber', 'Amber', 'girlfriend', 'daily', 'Girlfriend, lives in Virginia');

-- Friends and colleagues  
INSERT OR IGNORE INTO people (id, name, relationship, contact_frequency, notes)
VALUES
  ('p-irene', 'Irene', 'colleague', 'daily', 'Business partner at Untitled Publishers'),
  ('p-sean', 'Sean', 'friend', 'weekly', 'Friend'),
  ('p-richmond', 'Richmond', 'friend', 'weekly', 'Friend'),
  ('p-elliot', 'Elliot', 'colleague', 'weekly', 'Colleague'),
  ('p-isaac', 'Isaac', 'colleague', 'weekly', 'Colleague - has pending requests');

-- Work contacts
INSERT OR IGNORE INTO people (id, name, relationship, contact_frequency, notes)
VALUES
  ('p-alex', 'Alex', 'colleague', 'monthly', 'Owns Eveready Home Care with Priscilla'),
  ('p-priscilla', 'Priscilla', 'colleague', 'monthly', 'Owns Eveready Home Care - MediVault client');

-- NOTE: Update birthdays as you learn them
-- UPDATE people SET birthday = '03-15' WHERE name = 'Maya';
