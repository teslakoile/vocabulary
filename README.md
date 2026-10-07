# Vocabulary

A single-user progressive web app that drills an 84-word professional vocabulary list with spaced repetition, runs on Cloudflare's free tier, and works offline.

The corpus holds 84 entries, 95 senses, and 380 cards across four card types. One Cloudflare Worker serves both the app and the API, backed by D1.

This is a personal tool built for one person's word list. Read it as a worked example rather than a product you sign up for.

## Design constraints

- The app is an endless queue with no session, no daily count, and no completion state. Cards that are due move the schedule, and everything after them is free play that does not.
- D1 is the system of record and IndexedDB is a cache, so clearing site data costs you nothing beyond a re-download.
- Content generation runs once in a Claude Code session and loads in as SQL. The app calls no model API at runtime, so it has no model API key.
- Authentication is one shared secret with a minimum length of 8 characters, guarded by two layers of rate limiting. It suits a single user and suits nothing else.

## Stack

| Layer | Choice | Why this one | Cost |
| --- | --- | --- | --- |
| Frontend | Vite 7, React 19, TypeScript 5.9 | `noUncheckedIndexedAccess` catches the D1 row bugs at compile time | Free |
| Hosting and API | One Worker with an `assets` binding | Serves the PWA and `/api/` from one origin, so there is no separate Pages project | Free |
| Database | Cloudflare D1 | Six tables, and the review log is append-only | Free |
| Scheduling | `ts-fsrs` 5.4.1 (FSRS-6) | 13.4 KB gzipped, and the same module runs on both the Worker and the client | Free |
| Nudge | Workers Cron plus Web Push | 5 cron triggers per account on the free plan | Free |

## Setup

You need a Cloudflare account, Node.js 20 or later, and `npx`.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the D1 database and copy the id it prints into `database_id` in `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create vocabulary
   ```

3. Apply the seven migrations in order. They run through `d1 execute` because
   `wrangler d1 migrations` expects a `migrations/` directory and this project
   keeps its SQL in `db/`:

   ```bash
   for f in db/000*.sql; do npx wrangler d1 execute vocabulary --remote --file "$f"; done
   ```

4. Load the corpus. The seed is idempotent, and card rows use `ON CONFLICT DO NOTHING` so review history survives a reload:

   ```bash
   npx wrangler d1 execute vocabulary --remote --file .scratch/vocab-pwa/corpus/seed.sql
   ```

5. Generate a VAPID keypair for Web Push:

   ```bash
   npx web-push generate-vapid-keys
   ```

6. Set the three secrets. Each command prompts for the value, so the value never enters your shell history:

   ```bash
   npx wrangler secret put AUTH_SECRET
   ```

   Repeat for `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. `AUTH_SECRET` must be at least 8 characters, and the Worker rejects every request if it is shorter.

7. Build and deploy:

   ```bash
   npm run build && npx wrangler deploy
   ```

Open the deployed URL, enter the secret once, and the app stores it in `localStorage`.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, fill in a local `AUTH_SECRET` and a throwaway VAPID keypair, then run:

```bash
npx wrangler dev --port 8787 --local
```

The `--local` flag uses a SQLite database under `.wrangler/`, so local work never touches production data. To set up that database, run the same migration and seed commands with `--local` in place of `--remote`.

To run the Vite dev server on its own without the Worker, use `npm run dev`. API calls fail in that mode because nothing serves `/api/`.

## Adding words

The app is where content lives. The repo keeps a snapshot of it.

1. On your phone, tap `+` and type the word. It saves as `bare` and stays out of practice. A line on the review screen counts the words waiting.
2. If a practised word reads wrong, tap **Flag** on its answer side and say why. It stays in practice and joins the backlog.
3. When you want, run `/refine` in Claude Code in this repo. The skill in `.claude/skills/refine/` pulls the live corpus, writes content for captured words, fixes flagged ones, validates everything, and publishes.

Publishing goes through the app's API with your shared key, so a refine session needs no Cloudflare login. `PUT /api/entries/:id/content` upserts one entry's senses and creates cards for new ones at the end of the intake queue. Existing cards are never touched, and the route refuses to remove a sense, because that would delete its review history.

| Script | Does |
| --- | --- |
| `scripts/pull-corpus.mjs` | Writes the live corpus into `corpus/raw/` and the backlog into `corpus/backlog.json` |
| `scripts/publish-corpus.mjs` | Publishes every entry whose content differs from the app, after the validator passes |

`corpus/seed.sql` is a one-time bootstrap for a new database. Reseeding a live database overwrites edits made in the app.

## Corpus generation

The corpus is written by hand and by model, once, and checked into `.scratch/vocab-pwa/corpus/`. Three scripts turn it into SQL:

| Script | Input | Output |
| --- | --- | --- |
| `scripts/validate-corpus.mjs` | `corpus/raw/*.json` | Pass or fail against 14 rules |
| `scripts/merge-distractors.mjs` | `corpus/raw/` and `corpus/distractors/` | Merged entries |
| `scripts/merge-rewrite.mjs` | `corpus/raw/` and `corpus/rewrite/` | Merged entries |
| `scripts/assign-word-distractors.mjs` | `corpus/raw/*.json` | Balanced wrong words, written in place |
| `scripts/build-seed-sql.mjs` | Merged entries | `corpus/seed.sql` |

Run the validator before you rebuild the seed:

```bash
node scripts/validate-corpus.mjs --complete
```

Two rules matter most, and each exists because the corpus failed it once.

Rule 7 is the length tell. In a multiple-choice card, the correct answer must not stand out by shape. The first generated corpus failed it completely: definitions ran to two sentences while distractors were short fragments, so the correct answer was the longest of six options in 100% of 95 senses and you could score full marks without knowing a single word. The validator now requires at least two distractors at or above the definition's length and at least two below, which puts the answer in the middle of the pack. After the repair, the correct answer is longest 0% of the time and sits at median rank 4 of 6.

Rules 10 to 12 are the plain definition. The first corpus opened with an abstract paraphrase and explained its own nuance in a second sentence, in 89 of 95 senses, with a colon, semicolon, or dash aside in 41. It read as harder than an ordinary dictionary line while saying less. The rewrite caps a definition at one sentence and 90 characters, and the median dropped from 183 characters to 76. The connotation moved to `caution`, which already carried it.

Rule 14 is the word-collision check for `identify` cards. A wrong word must not be arguable as the answer, and short definitions collide far more often than long ones did: once `esoteric` and `obscure` are one plain line each, either fits the other's definition. `scripts/assign-word-distractors.mjs` picks the wrong words for every sense at once rather than leaving it to a generation session, for two reasons. Sessions converge on the same safe words, and one measured batch used `wordsmith` as a wrong option in 12 of 23 senses, which teaches you that `wordsmith` is never the answer. Sessions also cannot see the whole corpus, so the script carries 99 pairs the agents reported as too close to use, alongside a mechanical overlap check. Every word now appears exactly 5 times.

## Data model

An entry is a headword. An entry holds one or more senses, and each sense carries the content you practice: `definition`, `caution`, `example`, `accepted` forms, `cues`, and `distractors`. `caution` records when the word is the wrong choice, which is the field a dictionary leaves out and the one that matters for register.

A definition is one plain sentence of 90 characters or fewer. The connotation, meaning when the word is the wrong choice, lives in `caution` instead, because a definition you have to parse twice is a worse prompt than a definition you read once.

Each sense produces four cards, in the order they enter intake:

| Card type | Prompt | Answer | Guess rate |
| --- | --- | --- | --- |
| `recognition` | "What Does *bolster* Mean?" | Pick 1 short meaning of 4, such as "to strengthen" | 25% |
| `identify` | "Definition" and the definition | Pick 1 word of 6 | 17% |
| `reverse` | "Definition", the definition, and the answer shape, such as `b······` | Type the word | 0% |
| `production` | "Situation", a situational cue, and the answer shape | Type the word | 0% |

Each sense also carries a `gloss`: the dictionary-plain meaning in 2 to 6 words. The recognition card offers the gloss and 3 wrong glosses written in the same grammatical form, so the answer cannot be spotted as the only verb. The full definition still appears on the answer side and on the two cards that show the definition.

`identify` offers six options where `recognition` offers four, because a word takes two seconds to read and a sentence does not.

Splitting on senses rather than entries means `trivial` and `nontrivial` are separate cards instead of one card with a harsh grading rule.

Review events are append-only and deduplicated by a client-generated UUID. The Worker reads which event ids it has already applied before it advances any schedule, so a resent batch changes nothing.

## Scheduling

`shared/scheduler.ts` is the only place FSRS is configured, and both the Worker and the browser import it. Both sides run the same code on the same default parameters with fuzz enabled, so the interval the app shows you the moment you answer is the interval the server reaches on its own.

Grades are binary. A correct answer maps to 3 (`Good`) and a wrong answer maps to 1 (`Again`). There is no self-grading.

New cards enter at a rate of `new_cards_per_day`, which defaults to 6. Seeded cards start with `due_at` set to `NULL` and an `intake_order`, so nothing is due until you answer it and the 380 cards take 64 days to enter rotation.

## Queue order

`src/queue.ts` builds the order in the browser, because offline practice requires it. Five constants set the behaviour:

| Constant | Value | Effect |
| --- | --- | --- |
| `NEW_CARD_EVERY` | 5 | Interleaves one new card after every 5 due cards |
| `SENSE_GAP` | 8 | Keeps two cards of the same sense at least 8 apart |
| `REQUEUE_MIN` | 8 | Returns a wrong card 8 to 10 cards later |
| `REQUEUE_SPREAD` | 3 | Randomises that gap |
| `PROMPT_GAP` | 24 | Keeps two cards with the same prompt at least 24 apart |
| `LOOKAHEAD` | 24 | Bounds how far the spacer looks forward |

`PROMPT_GAP` exists because `identify` and `reverse` both show the definition and differ only in whether you pick the word or type it. Eight apart is enough for two different questions about one sense and nowhere near enough for the same question twice.

`SENSE_GAP` exists because of what happened without it. A new word's cards entered intake together and arrived back to back, so you answered the second and third from the screen you had read a moment earlier. The queue also keeps its history across rebuilds and rebuilds only when `snapshot.fetched_at` changes, because rebuilding after every answer threw the spacing away.

Typed answers accept one edit distance on words of 8 characters or more, so a typo on `surreptitiously` does not count against you.

## Sync

The client flushes pending events first, then pulls. That order matters: pulling first would overwrite local schedules with server state that has not yet heard about the answers waiting in IndexedDB.

The pull splits into two requests. `GET /api/corpus` is ETagged and returns 304 on a normal open, and `GET /api/state` returns the schedule alone. The split cuts a routine open from 80 KB to 3.7 KB.

Flushing is opportunistic, on app open, after each answer, and on regaining connectivity. iOS has no Background Sync and Periodic Background Sync is WONTFIX, so there is no alternative.

## Push notifications

The Worker signs a VAPID ES256 JWT with Web Crypto and sends a push with no payload. The service worker then reads the cached corpus from IndexedDB, picks a card, and shows the question side. Sending no payload avoids ECDH and AES-GCM content encryption entirely, which keeps `worker/push.ts` at a size you can read in one sitting.

The cron trigger runs hourly and the Worker sends only when the local time is 13:00 in the timezone stored in `settings`, so travel and daylight saving do not break the nudge.

Subscriptions are stored as a list, one per device. On iOS, Web Push works only after you add the app to your Home Screen.

## Authentication

Every `/api/` route requires an `x-vocab-secret` header that matches `AUTH_SECRET`. The comparison is constant-time and rejects any secret shorter than 8 characters.

Two layers guard against guessing, and both count only failed attempts, so a device holding the right secret never meets either one:

1. The Workers `ratelimit` binding at 10 attempts per 60 seconds. It is best-effort and per-instance. A measured burst of 40 concurrent wrong keys got 38 through, which is why it is not the only layer.
2. A D1 counter keyed on the client IP, with an exact 10-failure window of 60 seconds. If the database fails to answer, the request is refused, because a database that will not answer must not become a way through.

The effective ceiling is about 30 guesses per minute.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | The React app: review, browse, capture, and the secret gate |
| `worker/` | The Worker: API routes, cron handler, and VAPID signing |
| `shared/` | Types and the single FSRS configuration, imported by both sides |
| `db/` | Seven SQL migrations |
| `scripts/` | Corpus validation, distractor merging, and seed generation |
| `public/` | Service worker, manifest, and icons |
| `.scratch/vocab-pwa/` | The decision record: map, 16 tickets, research, and corpus |

## Decision record

`.scratch/vocab-pwa/map.md` holds the wayfinder map for this project, and `.scratch/vocab-pwa/issues/` holds the 16 tickets behind it. Each ticket records a question, the answer, and any later amendment. If you want to know why something is built the way it is, read the ticket rather than the code.

Four questions remain open, and the map lists them under "Not yet specified".

## License

MIT. See [LICENSE](LICENSE).

The vocabulary corpus under `.scratch/vocab-pwa/corpus/` is written content rather than code, and it is specific to one person's professional register. Take the code; write your own words.
