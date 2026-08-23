# Infrastructure and deploy

Type: task
Status: resolved
Blocked by: —

## Question

Stand up everything [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) decided, so later work has somewhere to run. Mostly execution, but it starts with the one check that can invalidate the stack.

**Verify first, before building anything:**

1. **Are Workers Cron Triggers on the free plan?** This is the gate. [iOS PWA capability constraints](02-ios-pwa-capability-constraints.md) proved a nudge requires a server-side scheduled job, and Kyle chose to keep hosting free. If cron has moved to paid, those two are in conflict and Kyle picks which one gives. Do not build around it silently.
2. D1 free-tier storage and row-read limits against ~93 senses, ~279 cards, and a few thousand review events a year.
3. Workers free-tier daily request limits at single-user traffic.
4. The rate limiting binding on the free plan.

**Then build:**

- Cloudflare project: Pages for the PWA, Workers for the API, D1 for the database.
- The D1 schema from [Entry and review-state data model](07-entry-and-review-state-data-model.md): `entries`, `senses`, `cards`, `review_events`.
- Worker secrets: the Anthropic API key, and the VAPID keypair for [Nudge mechanism and cadence](09-nudge-mechanism-and-cadence.md).
- The shared auth secret. Generate it, and tell Kyle to put it in his password manager, because there is no recovery path.
- Rate limits: tight on the generation route, loose on reads.
- Frontend skeleton: Vite, React, TypeScript, a manifest without `share_target` (inert on iOS), a cache-first service worker, and an apple-touch-icon.

## Notes for the session

Report the four verification results explicitly before touching anything else. If the cron answer has changed, stop and tell Kyle rather than choosing for him.

## Verification results (2026-08-23)

Checked against Cloudflare's own documentation before building anything.

| # | Fact | Result |
| --- | --- | --- |
| 1 | Workers Cron Triggers on Free | **Available.** 5 cron triggers per account on Workers Free |
| 2 | D1 free-tier capacity | **Ample.** 500 MB per database, 5 GB per account, 10 databases |
| 3 | Workers free-tier daily requests | **Ample.** 100,000/day, resets midnight UTC |
| 4 | Rate limiting binding on Free | **Unconfirmed.** Cloudflare's binding docs state no plan availability |

**The gate passes. The stack from [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) stands and nothing goes back to Kyle.**

Sizing sanity check: ~93 senses, ~279 cards, and a few thousand review events a year is comfortably under 10 MB against a 500 MB database.

### Two limits that were not on the list and matter more than the ones that were

**Workers Free allows 10 ms of CPU per invocation, cron triggers included.** Network waiting does not count toward it, only executing code, so the Anthropic generation call is unaffected: it is almost entirely I/O wait. What *is* affected is [Entry and review-state data model](07-entry-and-review-state-data-model.md), which specified rebuilding FSRS state by replaying the whole `review_events` log in timestamp order. That is pure CPU, it grows without bound, and at a few thousand events it lands near or over 10 ms. See the amendment on ticket 07.

**D1 allows 50 queries per Worker invocation on Free, against 1,000 on Paid.** Enough here, but it forbids naive per-row loops. Batch reads and writes.

### The honest note on "keep it free"

The Workers Paid plan removes the CPU limit entirely, taking it from 10 ms to 30 s. Every constraint above except D1 capacity is a consequence of the free plan, and the free plan is workable here only because this app is genuinely small and its expensive work is I/O rather than computation. If the app starts fighting the 10 ms limit in more than one place, that is the signal that the free plan has stopped being the cheap option.

### Rate limiting, unconfirmed

Cloudflare's documentation for the rate limiting binding does not state plan availability. Try the binding first. If it is paid-only, implement the limit directly: a counter keyed by route in D1 or KV, checked before the generation call. For one user, the only thing rate limiting protects against is a leaked shared secret burning the Anthropic key, so a simple counter is sufficient.

## Remaining work needs Kyle's Cloudflare account

Verification is done and is the part that could be done alone. Everything below needs an authenticated Cloudflare account, which the agent does not have:

1. A Cloudflare account, and `wrangler` installed and authenticated. `wrangler` is not currently on this machine.
2. Create the Pages project, the Worker, and the D1 database.
3. Apply the schema from ticket 07.
4. Set Worker secrets: the Anthropic API key, the VAPID keypair, and the shared auth secret. Generate the shared secret and put it in a password manager, because there is no recovery path.

## Progress (2026-08-23)

### Built, no account needed

**Database schema** — `db/0001_initial.sql`. Six tables implementing [Entry and review-state data model](07-entry-and-review-state-data-model.md): `entries`, `senses`, `cards`, `review_events`, `settings`, `intake_log`. Foreign keys, partial indexes, and CHECK constraints. **Validated: applies cleanly to SQLite.** Not yet applied to D1, which needs the account.

Decisions visible in the DDL: `cards.fsrs_state` is commented as authoritative rather than a rebuildable cache (the 10 ms CPU finding), `review_events.id` is the client-generated dedupe key, `counts_toward_schedule` carries free play, `settings.timezone` drives the hourly cron that fires only at 13:00 local, and `intake_log` enforces the 6-new-cards-per-day cap.

**Frontend skeleton** — Vite 7, React 19, TypeScript 5.9, `ts-fsrs` 5.4.1 as the research specified. **Builds clean at 61.2 kB gzipped and runs with no console errors.**

- `public/manifest.webmanifest` — standalone display, no `share_target` (inert on iOS, and WebKit's parser ignores it anyway)
- `public/sw.js` — cache-first shell, network-only `/api/`, plus `push` and `notificationclick` handlers. Commented with why it never syncs on its own: Background Sync is unimplemented on iOS and Periodic Background Sync is WONTFIX
- `src/InstallCard.tsx` — the instruction card required by [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md), shown when `display-mode: standalone` is false, with iOS-specific steps. Verified rendering
- `.claude/launch.json` — `npm run dev` on port 5173

**Generation prompt** — `prompts/generate-entry.md` at v2, with sample output for five hard entries in `prompts/sample-output-v1.md` and `prompts/sample-output-v2-cues.md`. This effectively completes step 3 of [Cold start and Keep retirement](14-cold-start-and-keep-retirement.md), the register check, before any infrastructure exists.

### Outstanding, needs Kyle

1. **A Cloudflare account**, with `wrangler` installed and authenticated. Not on this machine.
2. ~~An Anthropic API key~~ — no longer needed. Generation moved out of the app on 2026-08-23; see the amendment on ticket 12.

Then: create the Pages project, Worker, and D1 database; apply `db/0001_initial.sql`; generate the VAPID keypair; generate the shared auth secret and put it in a password manager.

### Also outstanding, buildable without an account

The Worker itself: API routes, the generation handler, the sync endpoint that applies review events incrementally, and the cron handler that sends the 1pm push. Real icons, currently flat placeholder PNGs.

## Resolved (2026-08-23)

**Live at the private `workers.dev` origin**

| Resource | Detail |
| --- | --- |
| Cloudflare account | personal account (id kept out of this repo) |
| D1 database | `vocabulary`, `c111abf3-5f21-4bfc-ab65-6f6e6f335c1f`, APAC. Schema applied, 6 tables |
| Worker | `vocabulary`. Serves the PWA and `/api/`. 3 ms startup |
| Cron trigger | `0 * * * *` hourly; the Worker sends only at 13:00 in the stored timezone |
| Secrets | `AUTH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |

**Simplification against this ticket as written:** one Worker serves both the built PWA and the API via the `assets` binding, so there is **no separate Pages project**. Fewer moving parts, one deploy, one origin.

### Verified end to end

| Request | Result |
| --- | --- |
| `GET /` | 200, serves the PWA |
| `GET /manifest.webmanifest` | 200 |
| `GET /api/health` no secret | 401 |
| `GET /api/health` empty header | 401 |
| `GET /api/health` wrong-length secret | 401 |
| `GET /api/health` correct secret | 200, `{"ok":true,"entries":0}` |

### A bug worth recording

The first secret upload used `${!k}` to iterate secret names. That is bash syntax and this shell is zsh, so it expanded to nothing and **uploaded three empty secrets while wrangler reported success for each**.

That surfaced a genuine flaw in the Worker: `secretMatches` looped over the given string, so comparing an empty header against an empty secret ran zero iterations and returned `diff === 0`, meaning **true**. A misconfigured deploy would have authenticated anybody sending an empty header.

Fixed in both places. Secrets re-uploaded and verified by length (32, 87, 43 — correct for a 24-byte secret and a P-256 keypair), and `secretMatches` now fails closed on any expected secret shorter than 16 characters. The empty-header case is in the verification table above and returns 401.

### Outstanding, not blocking

- **Real icons.** `public/icon-{180,192,512}.png` are flat placeholder squares.
- **The Worker's real routes.** Only `/api/health` exists. Sync, entry CRUD, and the push send in `scheduled()` are stubs.
- **`AUTH_SECRET` is in `.secrets.local`** (chmod 600, gitignored). Kyle needs to move it to a password manager; there is no recovery path.
