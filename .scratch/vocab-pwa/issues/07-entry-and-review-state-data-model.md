# Entry and review-state data model

Type: grilling
Status: resolved
Blocked by: 04, 05

## Question

Write the schema. What exactly is stored for an entry, and what is stored for its review state?

**The entry.** Known from charting: a headword, a `forms` array, and a contrast flag. Open questions:

- How do three card types get their content? Does one entry hold three prompts (a definition, a meaning-to-word prompt, and a situation cue), or is the cue generated from the definition, or does an entry hold several cues so the same situation does not repeat every time?
- What captures register and connotation, which is the point of this list? `gravitas` needs a note about when it lands and when it sounds pompous. Is that a field, or part of the definition?
- Do example sentences exist as a field, and are they separate from cues?
- What does the contrast flag actually carry for `scaffolding/harness/sandbox`? A flag alone does not say what distinguishes them, so there is probably a structure here.
- Metadata: tags, where the word came from, created and updated timestamps, and whatever the sync design from [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) requires.
- Enrichment status. An entry captured on a phone with nothing but a headword needs to be distinguishable from a finished one, both for the app and for a batch enrichment pass.

**The review state.** Shaped by whatever [Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md) settles: whether state hangs off the entry or off each card, which scheduler fields it stores, and whether individual review events are kept as history or only the current state.

## Notes for the session

Invoke `/grill-me` and `/mattpocock-skills:domain-modeling`. This is the ticket that writes `CONTEXT.md` for the project. Stress-test the schema against the awkward real entries, not the easy ones: `community of practice vs center of excellence`, `scaffolding/harness/sandbox`, `long-horizon (task)`, `first/second order effects`, and `run it by you`.

## Added by ticket 05

**Multiple-choice distractors.** [Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md) made recognition a multiple-choice card, so every recognition card needs plausible wrong answers. Decide where they come from: other entries' definitions picked at random, picked by similarity so they are actually hard, or authored per entry at generation time. Random distractors make the card trivially easy, since a definition from an unrelated word is obviously wrong. Similarity-based selection needs something to compare on, which is a field on the entry.

**Review state is per card, not per entry.** 252 independent FSRS states, three per entry, sharing one parameter set. Store what `ts-fsrs` needs and nothing more.

**Free play must not write schedule state.** Answers given in free play are not reviews. Decide whether they are recorded at all, and if so, where they go so they cannot contaminate scheduling.

## Added by ticket 06

**Two devices, so conflicts are real.** Kyle uses both phone and laptop. Both hold an IndexedDB cache, neither syncs while closed, and nothing runs in the background on iOS. Two things can now diverge, and they need different rules:

- **Entry content.** The same entry edited on both devices before either flushes. Last-write-wins on the whole entry, or per-field merge on field timestamps. Per-field is more forgiving and costs a timestamp per field.
- **Review events.** The same card answered on both devices produces two review events for one card. The scheduler must not apply both. Decide whether review events are an append-only log the server replays in timestamp order, or whether the client sends resulting state and the server takes the latest. The log is more storage and much easier to reason about.

The database is Cloudflare D1, which is SQLite, so model this relationally.

## Answer

### The refinement: an entry holds senses

[Practice model and scope](01-practice-model-and-scope.md) settled "one entry, a `forms` array, an optional contrast flag". Working through the real list, `forms` turned out to be four different relationships wearing one name:

| Relationship | Example | Same meaning? |
| --- | --- | --- |
| Inflection | `persist` / `persistence` | Yes |
| Synonym | `blanket approval` / `carte blanche` | Yes |
| Polar pair | `trivial` / `nontrivial` | **No, opposite** |
| Contrast set | `scaffolding` / `harness` / `sandbox` | **No, that is the point** |

A flat `forms` array cannot tell these apart, and the difference decides whether a typed answer is right. So the unit below an entry is a **sense**: one meaning, one canonical `term`, and optional `accepted` variants that mean the same thing.

- `trivial/nontrivial` becomes **two senses**, because they mean opposite things. Kyle's Q3 answer is then satisfied structurally: typing `trivial` for a cue that wanted `nontrivial` is answering a different card, not a different form.
- `persist/persistence` is **one sense**, term `persist`, accepted `persistence`. The grammar is decided by the sentence, not by knowledge, so marking it wrong would punish nothing.
- `scaffolding/harness/sandbox` is **one entry with three senses**, and the entry *is* the contrast group. No separate flag and no separate table.

**Cards hang off senses, not entries.** Roughly 94 to 97 senses across the 84 entries, times three card types, so around 285 cards rather than 252. At the rates in ticket 05 that is about 2.2 minutes a day rather than 2.

### Schema

Cloudflare D1, so SQLite.

**`entries`** — `id`, `headword`, `capture_note` (Kyle's few words at capture; the one thing no model can write), `tags`, `status`, `archived_at`, `created_at`, `updated_at`

**`senses`** — `id`, `entry_id`, `position`, `term`, `accepted` (JSON array of variants that also count), `definition`, `caution`, `example`, `cue`, `distractors` (JSON array of 5 generated wrong definitions)

**`cards`** — `id`, `sense_id`, `type` (`recognition` | `reverse` | `production`), `fsrs_state` (JSON, a cache), `due_at`

**`review_events`** — `id` (client-generated UUID), `card_id`, `graded_at`, `grade`, `counts_toward_schedule`, `device`

### Decided without asking

**Distractors are close, per Kyle's Q1**, and come from two places. Sibling senses in the same entry supply real, genuinely confusable definitions, which is precisely what makes the `scaffolding` / `harness` / `sandbox` card teach the distinction. Where an entry has one sense, the generated `distractors` array fills in. Generate 5, sample 3 per showing, so the option set varies and you cannot memorise the shape of the answer.

**`caution` is its own field, per Kyle's Q2**, shown on the answer side. When not to use the word: `gravitas` in a standup, `panopticon` when you only meant heavy monitoring. Flagged as the field a model is worst at generating, because it needs Kyle's workplace rather than English.

**Entry conflicts resolve by whole-entry last-write-wins** on `updated_at`. Per-field merge was considered and rejected as over-engineering: one user, rare edits, and the only losing case is editing two different fields of one entry on two devices inside a single offline window.

**Review events are an append-only log, deduplicated by client UUID.** Current FSRS state is a cache recomputed by replaying the log in `graded_at` order. This makes the two-device problem correct by construction: the same card answered on phone and laptop produces two events that both survive, and replay applies them in order once. A few thousand events a year is nothing to replay.

**Free play is `counts_toward_schedule = false`.** Same table, excluded from replay. The practice is recorded without touching any schedule, which is what ticket 05 required.

**Enrichment status is on the entry**: `bare`, `generating`, `ready`, `failed`. Anything but `ready` stays out of review and counts toward the pending badge from ticket 04.

**Archive is `archived_at`**, nullable. Out of review, out of default browse, history intact, restorable.

### Residual risks

- **Sense-splitting is a judgment call made at generation time.** Whether `deliberate/intentional` is one sense or two decides whether Kyle gets marked wrong for using the other. Get this wrong across many entries and the app feels arbitrary.
- **`caution` may be the field Kyle rewrites most.** That either proves it valuable or proves the generation prompt cannot reach his register, and the second would be worth knowing early.
- **Close distractors make the fast card slower.** Ticket 05 kept recognition because it was a 3-second tap. Genuinely confusable options make it a read, which erodes that reasoning.

## Amended by ticket 13 (2026-08-23)

**Never replay the full `review_events` log in a request path.** [Infrastructure and deploy](13-infrastructure-and-deploy.md) found that Workers Free allows 10 ms of CPU per invocation. Network waiting does not count, but log replay is pure computation, it grows without bound, and at a few thousand events it lands near or over the limit.

The append-only log stays, and so does its correctness guarantee for the two-device case. What changes is how state is derived:

- `cards.fsrs_state` is **authoritative between syncs**, not a cache to be rebuilt on demand.
- Incoming events are **applied incrementally** to that state, in `graded_at` order, deduplicated by client UUID.
- Late-arriving events, which happen when a device has been offline, replay only from the affected card's last consistent point rather than from the beginning of time.
- A full replay from zero remains possible as a repair tool, run deliberately and never inside a request.

This preserves why the log was chosen (two devices answering the same card is correct by construction) while keeping per-invocation CPU bounded regardless of how much history accumulates.
