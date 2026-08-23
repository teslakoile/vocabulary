# Stack, hosting, and LLM key custody

Type: grilling
Status: resolved
Blocked by: 02

## Question

Pick the whole architecture in one sitting, because these parts are chosen together. [iOS PWA capability constraints](02-ios-pwa-capability-constraints.md) settled several things that were open when this ticket was written; read its Answer first. What it forced:

- **Cloud is the system of record, IndexedDB is an offline-first cache.** Home-screen installation exempts the app from Safari's 7-day storage cap, so local data is a durable working store, but app deletion, "Clear History and Website Data", and device loss all destroy it with no configuration that prevents that.
- **A backend with persistent scheduling is mandatory.** A scheduled nudge on iOS requires a server job holding VAPID keys that POSTs to APNs. There is no local timer, no service-worker alarm, and no calendar hack the app can drive. A purely static host is ruled out.
- **Key custody collapses.** Since a server exists regardless, the LLM API key belongs on it. Bring-your-own-key in device storage is no longer worth its downsides.
- **Sync is offline-first with opportunistic flush.** Background Sync is unimplemented on iOS and Periodic Background Sync is WONTFIX, so nothing leaves the device while the app is closed. Queue local writes and flush on app open, on `visibilitychange`, and on regained connectivity while open.

## What is still open

1. **The database and host.** A hosted Postgres (Supabase, Neon), SQLite at the edge (Turso, Cloudflare D1), or something else. The host must support a scheduled job (cron) for the nudge, plus whatever runtime the generation call needs. Judge candidates on: cron support, cost at single-user scale, and how much operational surface you are willing to keep alive for a personal app.
2. **Where generation runs.** [CRUD scope inside the app](04-crud-scope-inside-the-app.md) settled that capture never blocks and generation is queued and retried. Since nothing runs while the app is closed on iOS, the queue drains either server-side (capture POSTs the bare word, a server job generates and stores the result) or client-side on next app open. Server-side is the stronger default because it is the only option that makes progress while you are not looking, and the server already exists. Decide it here.
3. **Auth.** Single user. Find the minimum that keeps the data private without building an account system, and note that the deployed URL will be reachable by anyone who guesses it.
4. **Frontend stack.** Framework, build tool, service worker strategy, and manifest. Do not put `share_target` in the manifest; it is inert on iOS. Note also that WebKit's manifest parser reads a fixed set of members and silently ignores the rest.
5. **The install ritual.** Installation cannot be prompted programmatically and `beforeinstallprompt` will never ship on iOS. Decide what the app shows when `display-mode: standalone` is false, given this is a one-time thing for one user rather than an onboarding funnel.

## Notes for the session

Invoke `/grill-me`. The temptation here is to pick a stack you already like and back-fill the reasons. Push on operational surface specifically: this app has one user and 84 rows, and anything you have to maintain is a reason it dies.

## Answer

**Platform: Cloudflare, end to end.** Pages for the PWA, Workers for the API and the scheduled job, D1 for the database. One platform, one deploy story, and critically it is the free tier that includes a scheduled job, which [iOS PWA capability constraints](02-ios-pwa-capability-constraints.md) proved the nudge cannot exist without.

| Concern | Choice | Why |
| --- | --- | --- |
| Frontend host | Cloudflare Pages | Static, fast, free |
| Database | Cloudflare D1 (SQLite) | 84 entries, 252 cards, review history. Relational, tiny, free |
| API and generation | Cloudflare Workers | Holds every secret; the client never sees a key |
| Nudge scheduler | Workers Cron Triggers | The only free scheduled job that keeps the whole stack on one platform |
| Frontend stack | Vite, React, TypeScript | Reversible. The service worker caches the bundle, so size is a first-load-only cost |

**Generation runs server-side.** Capture POSTs the bare word and returns immediately. A Worker generates the content and writes it to D1. This is the only shape that makes progress while the app is closed, which matters because iOS runs nothing in the background: Background Sync is unimplemented and Periodic Background Sync is WONTFIX.

**Every key lives as a Worker secret.** The Anthropic API key and the VAPID keypair are never in the client bundle and never in device storage.

**Auth is a single shared secret.** Kyle's call: anyone holding the secret can use the app. The client sends it as a header and the Worker validates it. It is stored in device storage after first entry, so it is typed once per device. Note the failure mode: clearing Safari data wipes the secret and locks you out until you remember it, so keep it in a password manager.

**Rate limits sit on the API, weighted to the expensive routes.** Kyle's call, and the right instinct. The generation endpoint is the one that costs money, so it gets the tight limit. Read routes get a loose one. This is what stops a leaked secret from burning the Anthropic key.

**Sync is offline-first with opportunistic flush**, forced by ticket 02. IndexedDB is the working store, D1 is the system of record, and local writes flush on app open, on `visibilitychange`, and on regained connectivity while open.

**The install screen is a one-time instruction card** shown when `display-mode: standalone` is false. Installation cannot be prompted and `beforeinstallprompt` will never ship on iOS, where WebKit closed its standards position as `oppose` in May 2026.

### Free-tier facts to verify before building

These are load-bearing and my knowledge of Cloudflare's limits may be stale. Check all four against current Cloudflare documentation at build time, and if any has changed, this decision reopens.

1. Workers Cron Triggers are available on the free plan. **This is the critical one.** If cron is now paid, then "keep it free" and "scheduled nudges" are in direct conflict and Kyle has to give up one.
2. D1 free-tier storage and row-read limits comfortably exceed 252 cards plus review history.
3. Workers free-tier daily request limits cover single-user traffic.
4. The rate limiting binding is available on the free plan.

### Consequences for other tickets

- **Two devices means sync conflicts are now real.** Kyle practices on both phone and laptop, both hold an IndexedDB cache, and neither syncs while closed. Editing the same entry on both before either flushes needs a rule. Passed to [Entry and review-state data model](07-entry-and-review-state-data-model.md).
- **Review history can diverge, not only entry content.** Answering the same card on both devices produces two review events for one card. The scheduler must not apply both.
- [Nudge mechanism and cadence](09-nudge-mechanism-and-cadence.md) is unblocked. Its scheduler is a Workers Cron Trigger.

### Residual risks

- **Free tier is a moving target.** Cloudflare can change limits, and a nudge that silently stops firing is exactly the failure you would not notice for weeks. Worth a check that the cron actually ran.
- **The shared secret has no recovery path.** No email reset, no account. Lose it and you rebuild or redeploy.
- **One platform is one dependency.** If Cloudflare's free tier stops working for you, the frontend, database, API, and scheduler all move at once.


## Amended by dropping nudges (2026-08-23)

Kyle removed nudges from the project, which removes the only requirement for a scheduled job.

- **The free-tier risk largely evaporates.** Workers Cron Triggers being free was flagged as the critical fact to verify, because without cron there could be no nudge. There is no cron now, so that check no longer gates anything.
- **VAPID keys are gone.** Web Push is not being built, so the only remaining Worker secret is the Anthropic API key.
- **The stack does not change.** A server is still required, because the Anthropic key cannot live in the client and generation must run server-side to progress while the app is closed. A database and static hosting are still required. Cloudflare still fits, now with no risky assumption underneath it.
- **Still verify before building:** D1 free-tier storage and row limits, Workers free-tier daily requests, and the rate limiting binding on the free plan. All three are far less likely to bite than cron was.


## Amendment reverted (2026-08-23)

Nudges are back in scope, so the amendment above is void and the original Answer stands in full.

- **Workers Cron Triggers are required again**, and whether they are on the free plan is once more the critical fact to verify. If cron has moved to paid, "keep it free" and "scheduled nudges" conflict and Kyle has to give up one.
- **VAPID keys are required again**, alongside the Anthropic API key, as Worker secrets.

## GCP evaluated and rejected (2026-08-23)

Kyle asked whether GCP could replace Cloudflare. Compared and rejected; the original Answer stands. Do not relitigate without new information.

| | Cloudflare | GCP |
| --- | --- | --- |
| Payment method required for free tier | No | **Yes** (verified: "A Google Cloud billing account is required to access the Google Cloud Free Tier") |
| Scheduler on free tier | Yes, 5 Cron Triggers | Cloud Scheduler is **not listed** in the Always Free table |
| CPU limit per request | 10 ms | No millisecond cap; 180,000 vCPU-seconds/month |
| Cold start | Effectively none | Cloud Run scales to zero |
| Free database | D1, 500 MB/db, 5 GB/account | Firestore, 1 GiB, 50k reads/day |
| Setup | `wrangler login` plus four resources | Project, billing, APIs, IAM, service account |

**Deciding reasons:**

1. **"Keep it free" means different things on the two platforms.** Google requires a card on file to access Always Free. Cloudflare does not. Kyle's constraint was free hosting, and a payment method attached to an app he might abandon carries accident risk that Cloudflare's free tier does not.
2. **The scheduler gate is verified on one side and unverified on the other.** Workers Cron on Free is confirmed. Cloud Scheduler's absence from the Always Free list is not proof it costs money, but it is exactly the gate that nearly killed the nudge, and it would have to be re-verified.
3. **Cold start.** Kyle opens this app for 40 seconds at a time. Cloud Run's scale-to-zero wake is a meaningful fraction of that, and removing it means paying to keep an instance warm.
4. **The schema is relational and already written.** `db/0001_initial.sql` is six tables with foreign keys and partial indexes. D1 runs it as written. GCP's free option is Firestore, a document store, so the entry-sense-card-event structure and the dedupe-by-id event log would need reworking. Cloud SQL has no meaningful free tier.

**What GCP was genuinely better at, recorded so the trade is not forgotten:** Cloud Run has no per-request CPU cap, so the 10 ms limit that forced the incremental-application amendment on [Entry and review-state data model](07-entry-and-review-state-data-model.md) would not exist there. That amendment is a better design regardless, since replaying a whole log on every sync is wasteful on any platform, so GCP would remove a constraint already routed around.

**The one real argument for GCP** is that Kyle already lives in Google's world (Keep, Workspace, `gws`). Not enough against a card on file, an unverified scheduler, and a data-model rewrite.

## Amended: no model API, so no Anthropic key (2026-08-23)

Generation moved out of the app entirely (see [Generation prompt](12-generation-prompt.md)), so **the Anthropic API key is no longer a Worker secret and the generation route does not exist.**

The Worker still exists, and still must, for three unrelated reasons:

1. **D1 access.** The client cannot talk to D1 directly; only a Worker can.
2. **The 1pm nudge.** A Cron Trigger holding VAPID keys, POSTing to APNs. Still the only way to schedule anything on iOS.
3. **Auth.** Validating the shared secret.

Remaining Worker secrets: the **VAPID keypair** and the **shared auth secret**. Rate limiting loses its main justification, since the expensive route it was protecting is gone; keep a loose limit on writes, drop the tight one.
