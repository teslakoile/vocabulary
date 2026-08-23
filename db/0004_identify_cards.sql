-- Adds a fourth card type: the definition is shown and you pick the word from
-- six options. It sits between `recognition` (pick the definition) and
-- `reverse` (type the word), because choosing is easier than recalling.
--
-- `cards.type` carries a CHECK constraint naming the three original types and
-- SQLite cannot alter a constraint, so the table is rebuilt.
--
-- THE HAZARD, found by running this against production:
-- `review_events.card_id` is declared REFERENCES cards(id) ON DELETE CASCADE,
-- and D1 does not honour a connection-level `PRAGMA foreign_keys = OFF` across
-- the statements of a file. Dropping `cards` therefore deletes every review
-- event. The first run of this migration lost a 7-row log that way. Card state
-- survived, because fsrs_state and due_at live on the card, so the schedule was
-- never at risk; the append-only history was.
--
-- So the log is copied out and put back. There is no BEGIN/COMMIT because
-- remote D1 rejects SQL transaction statements, which is also why the copy is a
-- real table rather than a temp one.

-- Wrong words for the new card, five per sense, drawn from other entries.
ALTER TABLE senses ADD COLUMN word_distractors TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS review_events_carry AS SELECT * FROM review_events;

CREATE TABLE cards_next (
  id          TEXT PRIMARY KEY,
  sense_id    TEXT NOT NULL REFERENCES senses(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
              CHECK (type IN ('recognition','identify','reverse','production')),

  -- ts-fsrs state. AUTHORITATIVE between syncs, not a rebuildable cache:
  -- Workers Free allows 10ms CPU per invocation and full log replay is
  -- unbounded CPU. Events apply incrementally to this. See ticket 13.
  fsrs_state  TEXT,

  due_at      TEXT,     -- NULL until the card enters rotation (6/day intake)
  last_event_at TEXT,   -- watermark for incremental application

  intake_order INTEGER,

  created_at  TEXT NOT NULL,

  UNIQUE (sense_id, type)
);

INSERT INTO cards_next (id, sense_id, type, fsrs_state, due_at, last_event_at, intake_order, created_at)
  SELECT id, sense_id, type, fsrs_state, due_at, last_event_at, intake_order, created_at FROM cards;

DROP TABLE cards;

ALTER TABLE cards_next RENAME TO cards;

CREATE INDEX IF NOT EXISTS idx_cards_due    ON cards (due_at);
CREATE INDEX IF NOT EXISTS idx_cards_intake ON cards (intake_order) WHERE due_at IS NULL;

-- Put the log back. The cascade emptied it while `cards` was gone.
INSERT OR IGNORE INTO review_events (id, card_id, graded_at, grade, counts_toward_schedule, device, applied_at)
  SELECT id, card_id, graded_at, grade, counts_toward_schedule, device, applied_at FROM review_events_carry;

DROP TABLE review_events_carry;
