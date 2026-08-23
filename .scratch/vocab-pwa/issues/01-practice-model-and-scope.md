# Practice model and scope

Type: grilling
Status: resolved
Blocked by: —

## Question

What is this effort finding its way to, what does one practice rep look like, what is a single entry, and where does the content come from?

## Answer

Settled across two grilling rounds during charting.

**Destination is a working PWA in daily use.** Not a spec, not a locked decision. This map carries execution.

**Three card types per entry**: recognition (word to meaning), reverse recognition (meaning to word), and cued production (a situation to the word that fits it). Cued production is the mode that trains retrieval-for-speech, which is the actual goal; recognition and reverse recognition are the on-ramp to it.

**One entry type.** An entry has a headword plus a `forms` array and an optional contrast flag. `trivial/nontrivial` is one entry with two forms. `scaffolding/harness/sandbox` is one entry whose point is the distinction, marked by the flag. There is no separate "distinction" entry type.

**Content is CRUD-able in the app, and the LLM operates on live data.** This rules out baking a static JSON at build time. Content is mutable at runtime, so the LLM must be able to reach whatever store holds it.

**Storage is cloud-synced.** Rules out the pure device-local, no-server design. Kyle wants the list to survive device loss and to be reachable from more than one place.

**Nudges are scheduled reminders**, described as "for now", so the bar is a working daily prompt rather than a sophisticated notification system.

### Deliberately deferred

- What CRUD is for in the app: capture, correction, bulk enrichment, or some subset. Moved to [CRUD scope inside the app](04-crud-scope-inside-the-app.md).
- Whether the scheduler tracks entries or individual cards. Moved to [Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md).
- What "some cloud storage" concretely means, and where an LLM API key lives. Moved to [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md).

### Residual risks

- **Cued production may train the cue, not the word.** If a cue always mentions a migration, you may learn "the migration one is `idempotent`" without owning the concept. Earliest cheap signal: after a few weeks, try to use five mature words in writing without prompts and see whether they come.
- **Three card types over 84 entries is 252 items.** If the scheduler treats them independently, the daily load may be heavy enough that the habit fails. This is what [Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md) exists to prevent.
- **Content quality is the whole product.** Cloud sync and a nice review screen are worthless if the definitions read like a dictionary. The register constraint in the map's Notes is the mitigation, and it needs a human review pass to hold.

## Amendment history

**"Nudges are scheduled reminders" stands.** It was dropped on 2026-08-23 and reinstated the same day. Kyle removed nudges believing the required server was a cost the project would otherwise avoid, then reinstated them once it was clear the server already exists for the Anthropic key and server-side generation, making push roughly a VAPID keypair, a subscription endpoint, a POST to APNs, and a cron trigger on top. See [Nudge mechanism and cadence](09-nudge-mechanism-and-cadence.md).
