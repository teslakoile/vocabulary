/**
 * Vocabulary Worker.
 *
 * Three jobs, none of which involve a model. Generation happens once in a
 * Claude Code session and is loaded in, so there is no model API key here.
 *
 *   1. D1 access. The client cannot reach D1 directly.
 *   2. The 1pm nudge. A cron trigger POSTing to a push service.
 *   3. Auth. Validating the shared secret.
 *
 * The queue itself is computed in the browser, not here. The app has to work
 * with no network, so the client holds the whole corpus and decides what to
 * show next; this Worker moves data and settles the schedule.
 */
import { applyGrade } from '../shared/scheduler';
import { sendPush, type PushSubscriptionJson } from './push';
import type { Card, Entry, Grade, PullResponse, ReviewEvent, Sense } from '../shared/types';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  LOGIN_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

/**
 * Shortest key the Worker will accept.
 *
 * Eight, not the sixteen this started at. Sixteen was a round number picked in
 * a hurry; the bug it was written for was the *empty* case, where a zero-length
 * comparison loop leaves diff === 0 and authenticates anyone. That case is
 * handled on its own line below and needs no length floor at all.
 *
 * What makes eight enough is LOGIN_LIMITER: ten wrong guesses a minute per IP
 * turns even a short key into centuries of work. Without the limiter, length
 * would have to carry the whole burden.
 */
const MIN_SECRET_LENGTH = 8;

/** Wrong keys allowed per IP per minute, counted exactly. */
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 60_000;

/**
 * Count a wrong key and say whether the caller has run out.
 *
 * Two layers, cheapest first. LOGIN_LIMITER absorbs the bulk of a flood without
 * touching the database, but it counts per Worker instance, so a parallel burst
 * slips most of the way through: 40 concurrent wrong keys got 38 past it. D1 has
 * a single primary, so the count here is exact, and it is the one that makes an
 * eight-character key safe rather than merely short.
 *
 * The whole thing is a single upsert. `RETURNING` hands back the running count,
 * and the CASE resets it when the previous window has expired.
 */
async function tooManyFailures(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';

  const cheap = await env.LOGIN_LIMITER?.limit({ key: ip });
  if (cheap && !cheap.success) return true;

  const now = new Date();
  const opened = now.toISOString();
  const expiry = new Date(now.getTime() - FAILURE_WINDOW_MS).toISOString();

  try {
    const row = await env.DB.prepare(
      `INSERT INTO auth_failures (ip, count, window_start) VALUES (?1, 1, ?2)
         ON CONFLICT(ip) DO UPDATE SET
           count        = CASE WHEN auth_failures.window_start < ?3 THEN 1   ELSE auth_failures.count + 1 END,
           window_start = CASE WHEN auth_failures.window_start < ?3 THEN ?2  ELSE auth_failures.window_start END
       RETURNING count`
    )
      .bind(ip, opened, expiry)
      .first<{ count: number }>();
    return (row?.count ?? 0) > MAX_FAILURES;
  } catch {
    // A database that will not answer must not become a way through.
    return true;
  }
}

/**
 * D1 allows 50 queries per invocation on the free plan. One batch costs
 * 1 read + 1 update per card + 1 insert, so 20 events is the safe ceiling.
 * The client chunks anything larger.
 */
const MAX_EVENTS_PER_REQUEST = 20;

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });

/**
 * Constant-time compare, so the shared secret cannot be guessed by timing.
 *
 * The first guard is not paranoia. A misconfigured deploy that left AUTH_SECRET
 * empty would otherwise make this return true for an empty header, because a
 * zero-length loop produces diff === 0. Fail closed instead: an unset or
 * implausibly short secret authenticates nobody.
 */
function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!expected || expected.length < MIN_SECRET_LENGTH) return false;
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/** The day boundary that intake is counted against, in Kyle's timezone. */
const localDay = (timezone: string, at = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }).format(at);

type EntryRow = {
  id: string;
  headword: string;
  capture_note: string | null;
  tags: string | null;
  status: string | null;
  archived_at: string | null;
  updated_at: string;
};

type SenseRow = {
  id: string;
  entry_id: string;
  position: number;
  term: string;
  accepted: string | null;
  definition: string | null;
  caution: string | null;
  example: string | null;
  cues: string | null;
  distractors: string | null;
  word_distractors: string | null;
  prompt_version: number | null;
  updated_at: string;
};

type CardRow = {
  id: string;
  sense_id: string;
  type: string;
  fsrs_state: string | null;
  due_at: string | null;
  last_event_at: string | null;
  intake_order: number | null;
};

type SettingsRow = {
  timezone: string;
  nudge_hour: number;
  new_cards_per_day: number;
  push_subscription: string | null;
};

const loadSettings = async (env: Env): Promise<SettingsRow> =>
  (await env.DB.prepare(
    'SELECT timezone, nudge_hour, new_cards_per_day, push_subscription FROM settings WHERE id = 1'
  ).first<SettingsRow>()) ?? {
    timezone: 'UTC',
    nudge_hour: 13,
    new_cards_per_day: 6,
    push_subscription: null,
  };

/**
 * The corpus: every entry and sense.
 *
 * Split from the schedule because the two change at completely different rates.
 * This is 250 KB of JSON that only moves when a word is edited or captured,
 * while the schedule moves on every answer. Sending both together made a
 * routine app-open 80 KB gzipped, of which 84% was text the phone already had.
 *
 * Served with an ETag so an unchanged corpus costs one 304 instead.
 */
async function corpus(request: Request, env: Env): Promise<Response> {
  const stamp = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM entries) ec, (SELECT MAX(updated_at) FROM entries) em,
            (SELECT COUNT(*) FROM senses)  sc, (SELECT MAX(updated_at) FROM senses)  sm`
  ).first<{ ec: number; em: string | null; sc: number; sm: string | null }>();

  // Counts catch deletion, timestamps catch edits. Together they miss only an
  // edit that removes one row and adds another in the same millisecond.
  const etag = `"${stamp?.ec ?? 0}-${stamp?.em ?? ''}-${stamp?.sc ?? 0}-${stamp?.sm ?? ''}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  const [entryRows, senseRows] = await Promise.all([
    env.DB.prepare(
      'SELECT id, headword, capture_note, tags, status, archived_at, updated_at FROM entries'
    ).all<EntryRow>(),
    env.DB.prepare(
      `SELECT id, entry_id, position, term, accepted, definition, caution, example,
              cues, distractors, word_distractors, prompt_version, updated_at
         FROM senses ORDER BY entry_id, position`
    ).all<SenseRow>(),
  ]);

  const sensesByEntry = new Map<string, Sense[]>();
  for (const row of senseRows.results) {
    const sense: Sense = {
      id: row.id,
      entry_id: row.entry_id,
      position: Number(row.position),
      term: row.term,
      accepted: parseJson<string[]>(row.accepted, []),
      definition: row.definition ?? '',
      caution: row.caution ?? '',
      example: row.example ?? '',
      cues: parseJson<Sense['cues']>(row.cues, []),
      distractors: parseJson<string[]>(row.distractors, []),
      word_distractors: parseJson<string[]>(row.word_distractors, []),
      prompt_version: row.prompt_version === null ? null : Number(row.prompt_version),
      updated_at: row.updated_at,
    };
    const list = sensesByEntry.get(sense.entry_id);
    if (list) list.push(sense);
    else sensesByEntry.set(sense.entry_id, [sense]);
  }

  const entries: Entry[] = entryRows.results.map((row) => ({
    id: row.id,
    headword: row.headword,
    capture_note: row.capture_note,
    tags: parseJson<string[]>(row.tags, []),
    status: (row.status as Entry['status']) ?? 'bare',
    archived_at: row.archived_at,
    updated_at: row.updated_at,
    senses: sensesByEntry.get(row.id) ?? [],
  }));

  return new Response(JSON.stringify({ entries }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-cache', etag },
  });
}

/**
 * The schedule: every card's state, the settings, and how much of today's
 * new-card allowance is already spent. Around 48 KB, and it genuinely does
 * change on every answer, so it is fetched fresh each time.
 */
async function state(env: Env): Promise<Response> {
  const settings = await loadSettings(env);
  const [cardRows, intakeRow] = await Promise.all([
    env.DB.prepare(
      'SELECT id, sense_id, type, fsrs_state, due_at, last_event_at, intake_order FROM cards ORDER BY intake_order'
    ).all<CardRow>(),
    env.DB.prepare('SELECT card_count FROM intake_log WHERE day = ?')
      .bind(localDay(settings.timezone))
      .first<{ card_count: number }>(),
  ]);

  const cards: Card[] = cardRows.results.map((row) => ({
    id: row.id,
    sense_id: row.sense_id,
    type: row.type as Card['type'],
    fsrs_state: row.fsrs_state,
    due_at: row.due_at,
    last_event_at: row.last_event_at,
    intake_order: row.intake_order === null ? null : Number(row.intake_order),
  }));

  const body: Omit<PullResponse, 'entries'> = {
    cards,
    settings: {
      timezone: settings.timezone,
      nudge_hour: settings.nudge_hour,
      new_cards_per_day: settings.new_cards_per_day,
    },
    intake_today: intakeRow?.card_count ?? 0,
    server_time: new Date().toISOString(),
  };
  return json(body);
}

/**
 * Accept a batch of review events and settle the schedule.
 *
 * The log is append-only and deduplicated on the client's UUID, so a client
 * that loses the response can resend the same batch without double-counting.
 * Free-play events are stored but never move a schedule: they are history, not
 * evidence about recall timing.
 *
 * Applied incrementally rather than by replaying the whole log, because the
 * free plan allows 10 ms of CPU per invocation.
 */
async function submitEvents(request: Request, env: Env): Promise<Response> {
  const payload = (await request.json().catch(() => null)) as { events?: ReviewEvent[] } | null;
  const events = payload?.events;
  if (!Array.isArray(events) || events.length === 0) {
    return json({ error: 'no events' }, 400);
  }
  if (events.length > MAX_EVENTS_PER_REQUEST) {
    return json({ error: `at most ${MAX_EVENTS_PER_REQUEST} events per request` }, 413);
  }
  for (const e of events) {
    if (!e?.id || !e.card_id || !e.graded_at || ![1, 2, 3, 4].includes(e.grade)) {
      return json({ error: `malformed event ${e?.id ?? '(no id)'}` }, 400);
    }
  }

  const settings = await loadSettings(env);
  const cardIds = [...new Set(events.map((e) => e.card_id))];
  const cardSlots = cardIds.map(() => '?').join(',');
  const eventSlots = events.map(() => '?').join(',');

  const [existing, alreadyApplied] = await Promise.all([
    env.DB.prepare(`SELECT id, fsrs_state FROM cards WHERE id IN (${cardSlots})`)
      .bind(...cardIds)
      .all<{ id: string; fsrs_state: string | null }>(),
    // The insert deduplicates the log on its own, but that does not protect the
    // schedule: replaying an event would advance FSRS a second time. A client
    // that loses the response resends, so this is a normal case, not an edge one.
    env.DB.prepare(`SELECT id FROM review_events WHERE id IN (${eventSlots})`)
      .bind(...events.map((e) => e.id))
      .all<{ id: string }>(),
  ]);

  const state = new Map(existing.results.map((r) => [r.id, r.fsrs_state]));
  const unknown = cardIds.filter((id) => !state.has(id));
  if (unknown.length) return json({ error: 'unknown card', cards: unknown }, 404);

  const seen = new Set(alreadyApplied.results.map((r) => r.id));

  // A card being seen for the first time is what spends today's new-card
  // allowance. Recording it here means intake needs no separate bookkeeping.
  const firstSeen = new Set<string>();
  const statements: D1PreparedStatement[] = [];
  const now = new Date().toISOString();

  // Oldest first: FSRS is order-dependent, and a phone that was offline may
  // hand over yesterday's answers after today's.
  const ordered = [...events].sort((a, b) => a.graded_at.localeCompare(b.graded_at));

  for (const event of ordered) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO review_events (id, card_id, graded_at, grade, counts_toward_schedule, device, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`
      ).bind(
        event.id,
        event.card_id,
        event.graded_at,
        event.grade,
        event.counts_toward_schedule ? 1 : 0,
        event.device ?? null,
        now
      )
    );

    if (!event.counts_toward_schedule || seen.has(event.id)) continue;

    const before = state.get(event.card_id) ?? null;
    if (before === null) firstSeen.add(event.card_id);

    const next = applyGrade(before, event.grade as Grade, new Date(event.graded_at));
    state.set(event.card_id, next.fsrs_state);
    statements.push(
      env.DB.prepare(
        'UPDATE cards SET fsrs_state = ?, due_at = ?, last_event_at = ? WHERE id = ?'
      ).bind(next.fsrs_state, next.due_at, event.graded_at, event.card_id)
    );
  }

  if (firstSeen.size) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO intake_log (day, card_count) VALUES (?, ?)
         ON CONFLICT(day) DO UPDATE SET card_count = card_count + excluded.card_count`
      ).bind(localDay(settings.timezone), firstSeen.size)
    );
  }

  await env.DB.batch(statements);

  const schedules = Object.fromEntries(
    [...state].map(([id, fsrs_state]) => [
      id,
      { fsrs_state, due_at: fsrs_state ? (JSON.parse(fsrs_state).due as string) : null },
    ])
  );
  return json({ accepted: events.length, replayed: seen.size, schedules });
}

/** Capture. A new word goes in bare and stays out of review until it has senses. */
async function createEntry(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    headword?: string;
    capture_note?: string;
    tags?: string[];
  } | null;
  const headword = body?.headword?.trim();
  if (!headword) return json({ error: 'headword required' }, 400);

  const now = new Date().toISOString();
  const id = `e_${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO entries (id, headword, capture_note, tags, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'bare', ?, ?)`
  )
    .bind(id, headword, body?.capture_note?.trim() || null, JSON.stringify(body?.tags ?? []), now, now)
    .run();

  return json({ id, headword, status: 'bare', created_at: now }, 201);
}

/**
 * Inline edit, from a card's answer side or the browse screen.
 *
 * Whole-entry last-write-wins. Two devices editing the same entry within a
 * sync window is a scenario with exactly one user in it.
 */
async function updateEntry(id: string, request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Partial<Entry> | null;
  if (!body) return json({ error: 'malformed body' }, 400);

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  const entryFields: string[] = [];
  const entryValues: unknown[] = [];
  if (typeof body.headword === 'string') { entryFields.push('headword = ?'); entryValues.push(body.headword); }
  if ('capture_note' in body) { entryFields.push('capture_note = ?'); entryValues.push(body.capture_note || null); }
  if (Array.isArray(body.tags)) { entryFields.push('tags = ?'); entryValues.push(JSON.stringify(body.tags)); }
  if ('archived_at' in body) { entryFields.push('archived_at = ?'); entryValues.push(body.archived_at ?? null); }

  entryFields.push('updated_at = ?');
  entryValues.push(now, id);
  statements.push(
    env.DB.prepare(`UPDATE entries SET ${entryFields.join(', ')} WHERE id = ?`).bind(...entryValues)
  );

  for (const sense of body.senses ?? []) {
    if (!sense?.id) continue;
    if (typeof sense.term !== 'string' || typeof sense.definition !== 'string') continue;
    statements.push(
      env.DB.prepare(
        `UPDATE senses SET term = ?, accepted = ?, definition = ?, caution = ?, example = ?,
                           cues = ?, distractors = ?, word_distractors = ?, updated_at = ?
           WHERE id = ? AND entry_id = ?`
      ).bind(
        sense.term,
        JSON.stringify(sense.accepted ?? []),
        sense.definition,
        sense.caution ?? '',
        sense.example ?? '',
        JSON.stringify(sense.cues ?? []),
        JSON.stringify(sense.distractors ?? []),
        JSON.stringify(sense.word_distractors ?? []),
        now,
        sense.id,
        id
      )
    );
  }

  await env.DB.batch(statements);
  return json({ id, updated_at: now });
}

/** Archive, not delete. Ticket 04: history is retained. */
async function archiveEntry(id: string, archived: boolean, env: Env): Promise<Response> {
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE entries SET archived_at = ?, updated_at = ? WHERE id = ?')
    .bind(archived ? now : null, now, id)
    .run();
  return json({ id, archived_at: archived ? now : null });
}

/**
 * Subscriptions are a list, not a single value.
 *
 * Kyle practises on a phone and a laptop, and a single column meant that turning
 * the nudge on in one place silently switched it off in the other, with nothing
 * on screen to say so. Deduplicated on the endpoint, which is what identifies a
 * device to the push service.
 */
async function withSubscription(env: Env, incoming: PushSubscriptionJson): Promise<PushSubscriptionJson[]> {
  const settings = await loadSettings(env);
  const existing = readSubscriptions(settings.push_subscription);
  return [...existing.filter((s) => s.endpoint !== incoming.endpoint), incoming];
}

/** Tolerates the single-object shape an older client may have written. */
function readSubscriptions(raw: string | null): PushSubscriptionJson[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PushSubscriptionJson | PushSubscriptionJson[];
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((s) => typeof s?.endpoint === 'string');
  } catch {
    return [];
  }
}

async function updateSettings(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    timezone?: string;
    nudge_hour?: number;
    new_cards_per_day?: number;
    push_subscription?: unknown;
  } | null;
  if (!body) return json({ error: 'malformed body' }, 400);

  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body.timezone === 'string') { fields.push('timezone = ?'); values.push(body.timezone); }
  if (typeof body.nudge_hour === 'number') { fields.push('nudge_hour = ?'); values.push(body.nudge_hour); }
  if (typeof body.new_cards_per_day === 'number') { fields.push('new_cards_per_day = ?'); values.push(body.new_cards_per_day); }
  if ('push_subscription' in body) {
    fields.push('push_subscription = ?');
    values.push(
      body.push_subscription
        ? JSON.stringify(await withSubscription(env, body.push_subscription as PushSubscriptionJson))
        : null
    );
  }
  if (!fields.length) return json({ error: 'nothing to update' }, 400);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  await env.DB.prepare(
    `INSERT INTO settings (id, updated_at) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET ${fields.join(', ')}`
  )
    .bind(values[values.length - 1], ...values)
    .run();

  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Everything that is not /api/ is the PWA itself.
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (!secretMatches(request.headers.get('x-vocab-secret'), env.AUTH_SECRET)) {
      // Counted only on failure, so a device holding the right key never meets
      // the limiter no matter how often it syncs.
      if (await tooManyFailures(request, env)) {
        return json({ error: 'too many attempts' }, 429, { 'retry-after': '60' });
      }
      return json({ error: 'unauthorised' }, 401);
    }

    const route = `${request.method} ${url.pathname}`;

    // /api/entries/:id and /api/entries/:id/archive
    const entryMatch = url.pathname.match(/^\/api\/entries\/([^/]+)(\/archive)?$/);
    if (entryMatch?.[1]) {
      const id = entryMatch[1];
      const archiveSuffix = entryMatch[2];
      if (archiveSuffix && request.method === 'POST') return archiveEntry(id, true, env);
      if (archiveSuffix && request.method === 'DELETE') return archiveEntry(id, false, env);
      if (request.method === 'PATCH') return updateEntry(id, request, env);
      return json({ error: 'method not allowed' }, 405);
    }

    switch (route) {
      case 'GET /api/health': {
        const row = await env.DB.prepare(
          'SELECT COUNT(*) AS entries FROM entries WHERE archived_at IS NULL'
        ).first<{ entries: number }>();
        // `limiter` reports whether the guessing defence is actually bound.
        // It sits behind auth so it tells an attacker nothing.
        return json({
          ok: true,
          entries: row?.entries ?? 0,
          limiter: typeof env.LOGIN_LIMITER?.limit === 'function',
          min_secret_length: MIN_SECRET_LENGTH,
        });
      }
      case 'GET /api/corpus':
        return corpus(request, env);
      case 'GET /api/state':
        return state(env);
      case 'POST /api/events':
        return submitEvents(request, env);
      case 'POST /api/entries':
        return createEntry(request, env);
      case 'PUT /api/settings':
        return updateSettings(request, env);
      case 'GET /api/vapid-key':
        return json({ key: env.VAPID_PUBLIC_KEY });
      default:
        return json({ error: 'not found' }, 404);
    }
  },

  /**
   * Runs hourly. Sends only at 13:00 local. Every push must display a visible
   * notification or Safari revokes the subscription, so this never sends a
   * silent one, and there is no such thing as a zero-due day: if nothing is
   * due it sends a free-play card.
   */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    // Keyed on IP, so an attacker rotating addresses would grow this without
    // bound. Nothing older than an hour is still counting against anyone.
    await env.DB.prepare('DELETE FROM auth_failures WHERE window_start < ?')
      .bind(new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .run()
      .catch(() => undefined);

    const settings = await loadSettings(env);
    if (!settings.push_subscription) return;

    const localHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: settings.timezone,
        hour: 'numeric',
        hour12: false,
      }).format(new Date())
    );
    if (localHour !== settings.nudge_hour) return;

    // The push carries no payload. The installed app already holds the whole
    // corpus, so the service worker picks the card itself; that keeps content
    // encryption out of this Worker entirely.
    const subscriptions = readSubscriptions(settings.push_subscription);
    if (!subscriptions.length) return;

    const results = await Promise.all(
      subscriptions.map((s) => sendPush(s, env).catch(() => 0))
    );

    // 404 and 410 mean that device is gone for good. Dropping it stops every
    // later nudge failing silently against a dead endpoint.
    const alive = subscriptions.filter((_, i) => results[i] !== 404 && results[i] !== 410);
    if (alive.length !== subscriptions.length) {
      await env.DB.prepare('UPDATE settings SET push_subscription = ?, updated_at = ? WHERE id = 1')
        .bind(alive.length ? JSON.stringify(alive) : null, new Date().toISOString())
        .run();
    }
  },
} satisfies ExportedHandler<Env>;
