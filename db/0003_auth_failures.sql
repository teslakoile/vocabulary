-- Authoritative guessing counter.
--
-- The Workers rate-limit binding is best-effort and counted per instance: a
-- burst of 40 wrong keys got 38 of them through. That is fine as a cheap first
-- line but it cannot be the guarantee, and the guarantee is what lets the
-- shared key be short. D1 has a single primary, so this count is exact.
CREATE TABLE IF NOT EXISTS auth_failures (
  ip           TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_failures_window ON auth_failures (window_start);
