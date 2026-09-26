-- A flag puts a word back in the refine backlog without taking it out of
-- practice. `bare` entries are words captured on the phone with no content yet;
-- flagged entries have content Kyle wants looked at, and the note says why.
-- A refine session clears both when it publishes the entry.
ALTER TABLE entries ADD COLUMN flagged_at TEXT;
ALTER TABLE entries ADD COLUMN flag_note TEXT;
