-- A short, dictionary-plain meaning per sense ("to strengthen"), and three wrong
-- ones in the same grammatical form. The recognition card now asks
-- "What does bolster mean?" and offers these four, so it reads at a glance.
-- The full `definition` stays for the answer side and the definition-prompt cards.
--
-- Plain ALTERs, no table rebuild, so nothing cascades.
ALTER TABLE senses ADD COLUMN gloss TEXT NOT NULL DEFAULT '';
ALTER TABLE senses ADD COLUMN gloss_distractors TEXT NOT NULL DEFAULT '[]';
