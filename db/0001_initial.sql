-- Vocabulary PWA — initial schema
-- Target: Cloudflare D1 (SQLite). Portable to any SQLite if the stack changes.
-- Implements .scratch/vocab-pwa/issues/07-entry-and-review-state-data-model.md

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- entries — what Kyle captured. Browse counts these (84), not senses.
-- ---------------------------------------------------------------------------
CREATE TABLE entries (
  id            TEXT PRIMARY KEY,
  headword      TEXT NOT NULL,

  -- Kyle's own words at capture, e.g. "heard it about the new MD".
  -- Optional and never blocking: capture takes the headword alone.
  capture_note  TEXT,

  tags          TEXT NOT NULL DEFAULT '[]',   -- JSON array

  -- Generation lifecycle. Anything but 'ready' stays out of review and
  -- counts toward the pending badge.
  status        TEXT NOT NULL DEFAULT 'bare'
                CHECK (status IN ('bare','generating','ready','failed')),
  gen_attempts  INTEGER NOT NULL DEFAULT 0,   -- capped at 3, then 'failed'
  gen_error     TEXT,

  -- Archive, not delete. Out of review and default browse, history intact.
  archived_at   TEXT,

  created_at    TEXT NOT NULL,
  -- Conflict resolution is whole-entry last-write-wins on this column.
  updated_at    TEXT NOT NULL
);

CREATE INDEX idx_entries_status   ON entries(status) WHERE archived_at IS NULL;
CREATE INDEX idx_entries_archived ON entries(archived_at);

-- ---------------------------------------------------------------------------
-- senses — one meaning. Cards hang off these, not off entries.
-- An entry with several senses IS the contrast group: siblings supply each
-- other's multiple-choice distractors.
-- ---------------------------------------------------------------------------
CREATE TABLE senses (
  id             TEXT PRIMARY KEY,
  entry_id       TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,

  term           TEXT NOT NULL,               -- the form a cue names
  accepted       TEXT NOT NULL DEFAULT '[]',  -- JSON array; variants that also count

  definition     TEXT,
  caution        TEXT,                        -- when NOT to use it
  example        TEXT,
  cues           TEXT NOT NULL DEFAULT '[]',  -- JSON array, 3-5, rotated per showing
  distractors    TEXT NOT NULL DEFAULT '[]',  -- JSON array of 5 wrong definitions

  -- Lets a systematic prompt problem be fixed once and regenerated in bulk.
  prompt_version INTEGER,

  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,

  UNIQUE (entry_id, position)
);

CREATE INDEX idx_senses_entry ON senses(entry_id);

-- ---------------------------------------------------------------------------
-- cards — three per sense, each scheduled independently by FSRS-6.
-- One shared parameter set: per-preset params measurably buy nothing.
-- ---------------------------------------------------------------------------
CREATE TABLE cards (
  id          TEXT PRIMARY KEY,
  sense_id    TEXT NOT NULL REFERENCES senses(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
              CHECK (type IN ('recognition','reverse','production')),

  -- ts-fsrs state. AUTHORITATIVE between syncs, not a rebuildable cache:
  -- Workers Free allows 10ms CPU per invocation and full log replay is
  -- unbounded CPU. Events apply incrementally to this. See ticket 13.
  fsrs_state  TEXT,

  due_at      TEXT,     -- NULL until the card enters rotation (6/day intake)
  last_event_at TEXT,   -- watermark for incremental application

  created_at  TEXT NOT NULL,

  UNIQUE (sense_id, type)
);

-- The queue query: due cards first, then everything else as free play.
CREATE INDEX idx_cards_due ON cards(due_at);

-- ---------------------------------------------------------------------------
-- review_events — append-only log, deduplicated by client-generated id.
-- Two devices answering the same card produce two rows; both survive and
-- apply once, in graded_at order. This is what makes two devices correct
-- by construction rather than by a rule.
-- ---------------------------------------------------------------------------
CREATE TABLE review_events (
  id                     TEXT PRIMARY KEY,   -- client-generated UUID; dedupe key
  card_id                TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  graded_at              TEXT NOT NULL,

  -- Binary grading: wrong -> Again (1), right -> Good (3). No self-grading.
  grade                  INTEGER NOT NULL CHECK (grade IN (1,2,3,4)),

  -- Free play answers are recorded but never touch a schedule.
  counts_toward_schedule INTEGER NOT NULL DEFAULT 1 CHECK (counts_toward_schedule IN (0,1)),

  device                 TEXT,
  applied_at             TEXT   -- NULL until folded into cards.fsrs_state
);

CREATE INDEX idx_events_card    ON review_events(card_id, graded_at);
CREATE INDEX idx_events_pending ON review_events(applied_at) WHERE applied_at IS NULL;

-- ---------------------------------------------------------------------------
-- settings — single row. Timezone drives the 1pm nudge: cron runs hourly and
-- the Worker sends only when it is 13:00 local, so travel and DST cannot
-- break it. push_subscription holds the Web Push endpoint.
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  timezone           TEXT NOT NULL DEFAULT 'UTC',
  nudge_hour         INTEGER NOT NULL DEFAULT 13,
  new_cards_per_day  INTEGER NOT NULL DEFAULT 6,
  fsrs_params        TEXT,     -- JSON; ts-fsrs defaults, never optimised at this size
  push_subscription  TEXT,     -- JSON
  updated_at         TEXT NOT NULL
);

INSERT INTO settings (id, updated_at) VALUES (1, datetime('now'));

-- ---------------------------------------------------------------------------
-- intake_log — enforces the 6-new-cards-per-day cap that keeps the ramp
-- inside 17-43 presses/day instead of 58-79.
-- ---------------------------------------------------------------------------
CREATE TABLE intake_log (
  day        TEXT PRIMARY KEY,   -- YYYY-MM-DD, local
  card_count INTEGER NOT NULL DEFAULT 0
);
