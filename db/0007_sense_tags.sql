-- A topic belongs to a meaning, not to a word. `ephemeral` in software, where
-- it means created for one run and then deleted, is not the everyday word, and
-- practising "tech" should ask the software meaning. The entry keeps its own
-- `tags` as the union of its senses, so a list can still filter whole words.
--
-- Existing senses start with their entry's tags. A plain ALTER, so nothing
-- cascades.
ALTER TABLE senses ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
UPDATE senses SET tags = COALESCE((SELECT tags FROM entries WHERE entries.id = senses.entry_id), '[]');
