# Build the app

Type: task
Status: resolved
Blocked by: 13, 14

## Question

Every decision ticket is resolved and the corpus is loaded. Build the thing they describe: the review loop, sync, browse, capture, and the nudge.

## Answer

**Built and deployed at the private `workers.dev` origin.** Everything except the push send is verified running.

### Where the queue lives

**In the browser, not the Worker.** [iOS PWA capability constraints](02-ios-pwa-capability-constraints.md) forced offline-first, so the phone holds the whole corpus and decides what to show next. The Worker moves data and settles the schedule. Both sides import the same `shared/scheduler.ts`, so an answer given offline and the same answer replayed on the server reach the same interval.

### The queue rules, as implemented

`src/queue.ts` builds one continuous list: due cards first, new cards let in at 6 a day, then free play forever. Three constants carry the decisions:

- `NEW_CARD_EVERY = 5` — a new card is interleaved every fifth due card, so a backlog cannot starve new words for weeks.
- `REQUEUE_MIN = 8`, `REQUEUE_SPREAD = 3` — a wrong answer comes back 8 to 10 cards later, inside the same app-open, and **the repeat never counts**: the same question two minutes later says nothing about tomorrow.
- `SENSE_GAP = 8` — minimum distance between two views of the same sense.

**`SENSE_GAP` was not in any decision ticket and had to be added after watching the app run.** The three cards of a word enter intake together, so the first build served `hyperscaler` recognition, reverse, and production back to back. The second and third were answered off the screen just read, which is a worse rep and a lie to FSRS. Two things had to change: a spacing pass over the queue, and a rebuild trigger, because the queue was being rebuilt after *every answer* and throwing the spacing away each time. It now rebuilds only when the server has said something new. The gap survives a rebuild via a `history` of senses actually shown.

### Sync

`GET /api/corpus` and `GET /api/state`, deliberately split. The corpus is 250 KB that moves only when a word is edited; the schedule is 48 KB that moves on every answer. Sending them together made a routine app-open **80 KB gzipped**, of which 84% was text the phone already had. The corpus is now ETagged on row counts and max `updated_at`, so a normal open is **3.7 KB** and a 304. That is 22× less traffic on the thing that happens several times a day.

Answers go to IndexedDB before the UI advances and are deleted only once the server has them. `POST /api/events` takes at most 20 at a time, which keeps it under D1's 50-queries-per-invocation ceiling on the free plan.

**One real bug found by testing it in production:** the event log deduplicates on the client UUID, but that protected only the log. A resent batch was applying FSRS a second time and silently double-advancing the schedule, and a resend is the *normal* case when a client loses a response. Fixed by reading which event ids already exist and skipping them. Verified: replaying an event now leaves `due_at` untouched.

**A second real bug, in the service worker:** it was cache-first for everything including `index.html`. Since Vite fingerprints asset filenames but not the document, an installed app would have pinned itself to whatever bundle it saw on install day and **no deploy would ever have reached the phone**. Now network-first for the document, cache-first for fingerprinted assets.

### Screens

- **Review** (`src/Review.tsx`) — one card, no counters, no streak, no done state. The only status on screen is a small gold dot marking a card whose answer moves the schedule. The answer side shows definition, caution, example, and Kyle's own note, with `Fix this` for inline correction that keeps your place.
- **Browse** (`src/Browse.tsx`) — a row is an entry, all 84. Search reaches definitions and cautions, so searching `watched` finds `panopticon`. Filters are All, Recent, Struggling, Pending, Archived. No per-row progress badge.
- **Capture** (`src/Capture.tsx`) — one field, one button, stays open for the next word, one tap from practising. It is competing with typing a line into Keep.
- **Key** (`src/SecretGate.tsx`) — paste once per device.

Typed answers accept a single-character slip in words of 8 or more, because spelling is not what is being tested and a phone-keyboard typo is not a memory failure.

### The nudge, and what is not verified

`worker/push.ts` signs a VAPID ES256 JWT with Web Crypto and posts to the push service. **The push carries no payload**: the installed app already holds the corpus, so the service worker picks a card itself and shows its question side, which keeps ECDH and AES-GCM content encryption out of the Worker entirely. Tapping opens that card via `?card=`, which `Queue.pin` serves first. A 404 or 410 clears the dead subscription.

**None of that has been exercised.** It needs a real device, a real subscription, and a 1pm that has not happened yet. Everything else in this ticket was verified running.

The permission ask is a button, not automatic: iOS ignores `requestPermission` that is not tied to a tap, which is a detail [Nudge mechanism and cadence](09-nudge-mechanism-and-cadence.md) did not anticipate.

## Amendment: the browser is a first-class client

The first build made home-screen installation a **hard gate**, showing an instruction page instead of the app to anyone in a tab. That was wrong, and [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) already said why: Kyle uses a phone **and a laptop**, and a laptop is never standalone.

It was also wrong on its own terms. D1 is the system of record, IndexedDB is only a cache, and answers flush after every card, so a browser clearing site data costs nothing but a re-download. Installing buys exactly two things, both iOS-only: Web Push, which does not work from a Safari tab at all, and exemption from Safari's 7-day cap on script-writable storage.

So the app now runs anywhere, and the install prompt is a dismissible hint shown only on iOS in a tab, where it is the only place it means anything.

**Desktop got the affordances a keyboard deserves.** Number keys pick a recognition option, which is the difference between practising and operating a mouse. The shell stops stretching a single card down a 900px page. Hover states exist on pointer devices and nowhere else.

**The schedule marker moved.** It was a dot in the top-right corner, which after the nav bar arrived put it directly under the search icon, where it read as a badge on that button. It is now a short gold rule above the card, in the flow.

**A footgun closed while testing this.** `settings.push_subscription` held one subscription, so turning the nudge on in a second place silently switched off the first, with nothing on screen to say so. For a two-device user that is not an edge case, it is the expected sequence. Subscriptions are now a list deduplicated on endpoint, the cron sends to each, and only the devices that answer 404 or 410 are dropped. Verified: subscribing A, then B, then A again leaves two devices with A's keys refreshed.

## Amendment: the key floor is 8, and rate limiting finally exists

Kyle asked to choose his own key. The Worker required 16 characters, which was a round number picked in a hurry: the bug that guard was written for was the **empty** case, where a zero-length comparison loop leaves `diff === 0` and authenticates anyone. That case needs no length floor, only its own line.

Lowering the floor meant the guessing defence had to become real, which is the rate limiting [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) asked for and this build never had.

**Two layers, cheapest first.** `LOGIN_LIMITER`, the Workers rate-limit binding, absorbs a flood without touching the database. It is not the guarantee: measured against production, **a burst of 40 concurrent wrong keys got 38 through**, because it counts per Worker instance. Behind it, `auth_failures` in D1 counts exactly, because D1 has a single primary. One upsert with `RETURNING` does the whole thing, and a `CASE` resets the count when the window has expired.

Both run only on a failed attempt, so a device holding the right key never meets either no matter how often it syncs. Verified against production: attempts 1 to 9 return 401, everything after returns 429, and the correct key returns 200 throughout.

True concurrency still leaks a little, since requests already in flight have not yet seen each other's count. Measured, the effective ceiling is roughly 30 attempts a minute rather than 10. That is 15.8 million a year, against 2.18 × 10¹⁴ combinations for eight mixed-case alphanumeric characters: about **7 million years** to an even chance. Six characters would still take 1,800 years. Eight is the floor because it leaves room for a key that is not random.

Under sustained attack the app stops answering before it is broken into: the free tier's 100k daily requests and D1 writes run out. That is a denial of service, not a breach, and the cheap limiter is what keeps most of a flood away from the database.

`GET /api/health` now reports `limiter` and `min_secret_length` so a deploy can be checked without guessing. It sits behind auth, so it tells an attacker nothing.
