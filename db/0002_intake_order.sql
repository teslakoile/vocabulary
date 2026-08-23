-- Cards enter the rotation in a fixed order, capped per day by intake_log.
-- Order is: entry position in Kyle's original list, then sense, then card type.
-- At 6 new cards a day that is exactly 2 new senses a day.
--
-- idx_cards_due already exists from 0001, unfiltered. Left alone.
ALTER TABLE cards ADD COLUMN intake_order INTEGER;
CREATE INDEX IF NOT EXISTS idx_cards_intake ON cards (intake_order) WHERE due_at IS NULL;
