# Generation prompt

Type: grilling
Status: resolved
Blocked by: —

## Question

This is the highest-risk piece of work left on the map. [CRUD scope inside the app](04-crud-scope-inside-the-app.md) settled that content is generated per entry at capture time with **no human review gate**, so this prompt is the only thing standing between a model and Kyle's review rotation. [Entry and review-state data model](07-entry-and-review-state-data-model.md) settled exactly what it must produce.

**Its output, per entry:** a split into senses, and for each sense a `term`, its `accepted` variants, a `definition`, a `caution`, an `example`, a `cue`, and 5 `distractors`.

Four things make it hard:

1. **Sense-splitting is a judgment call, made per entry, and it decides grading.** Whether `deliberate/intentional` is one sense or two decides whether Kyle is marked wrong for typing the other. `persist/persistence` must come out as one sense; `trivial/nontrivial` must come out as two. Get this wrong across many entries and the app feels arbitrary. The prompt needs criteria sharp enough to be applied consistently, and the four relationship types in ticket 07 are the starting point.
2. **The cue must teach the word, not the cue.** This is the hardest single output. A situation cue that always mentions a migration teaches Kyle that "the migration one" is `idempotent`, which is memorising a prompt rather than owning a concept. Decide whether an entry stores several cues that rotate, whether cues are regenerated periodically, or whether one good cue is enough.
3. **`caution` needs Kyle's workplace, not English.** When *not* to use a word is the field that makes this his app rather than a dictionary, and it is the field a model is worst at, because it requires knowing that `gravitas` is wrong in a standup and `panopticon` carries a critical connotation. The prompt has to carry enough context about his register (enterprise AI, investment, platform engineering) to have a chance. Ticket 07 flagged this as the field he will rewrite most.
4. **Distractors must be genuinely close without being ambiguous.** Where an entry has sibling senses they supply real confusable definitions for free. Where it does not, the 5 generated distractors have to be wrong but plausible, and a distractor that is arguably also correct is worse than an easy one.

Also decide: which model runs this, what happens when generation fails or returns malformed output, and how a systematically bad output gets fixed at the source rather than one entry at a time through inline editing.

## Notes for the session

Invoke `/grill-me`. Build this against the awkward real entries, not the easy ones: `community of practice vs center of excellence`, `scaffolding/harness/sandbox`, `long-horizon (task)`, `run it by you`, `by and large`, `squarely`, `broad`. If the prompt handles those, the plain nouns take care of themselves. Test sense-splitting against all 13 slash entries in `../source-list.md` before trusting it.

## Answer

### Register

The `caution` and `cue` fields only work if the prompt knows what rooms Kyle is in. Recorded, and **validated by his approval of one worked entry rather than stated directly**, so treat it as a good inference and check it against the first real batch:

> Enterprise AI and platform engineering, in an investment context. Technical himself, but the words that matter are the ones used with senior non-technical stakeholders: steering committees, sponsors, directors, MDs, boards.

The worked `gravitas` entry that carried this furniture was approved as written, which is the evidence. If the first 10 generated entries feel like someone else's job, this is the thing to fix, and it is one edit rather than 84.

### Cues: 3 to 5 per sense, rotating

Kyle's call. They cost one generation call either way, since the model writes them in the same pass. This is the mitigation for the memorisation risk: if `idempotent` is always the migration, the cue gets learned instead of the word.

The accepted downside is that five cues are five chances to write a weak one, and with no human review gate a weak cue enters rotation unnoticed. The inline-edit path on the answer side is the only correction, so a cue must be editable there like any other field.

### Sense splitting

Approved as proposed. The 13 multi-form entries become 22 senses, taking the collection to about 93 senses and 279 cards.

Two splits Kyle accepted over a stated objection, worth revisiting if the app feels wrong:

- **`deliberate/intentional` kept as one sense.** They do carry different connotations in practice (deliberate suggests care taken, intentional suggests it was not an accident), and collapsing them means Kyle is never asked to tell them apart.
- **`tacit/institutional knowledge` split into two.** They overlap heavily, and two senses may produce two cards that cannot be reliably distinguished, which is worse than either alternative.

The full table is in the conversation; the four relationship types in [Entry and review-state data model](07-entry-and-review-state-data-model.md) are the criteria the prompt must apply.

### `capture_note` is optional and never blocks

Kyle's own words at capture, like `heard it about the new MD, want to use it`. It is the only content a model cannot produce, because it records why *he* wanted the word.

**Correction of record:** this field was carried into the ticket 07 schema from a recommendation Kyle did not choose. In the CRUD grilling he selected LLM generation at capture over the one-line note. It stays, as an optional field that capture never requires, addable later through the same inline edit that fixes any other field. This keeps ticket 04's rule that capture never blocks.

### Decided without asking

**Model: Claude Opus 5** (`claude-opus-5`). This is 84 entries generated once plus the occasional new word, so cost is negligible and quality is the only axis that matters. Generation is asynchronous and non-blocking by ticket 04's rule, so latency does not bear on capture.

**Schema is forced, not requested.** Use tool-use structured output so the model must return the exact sense and field shape, and validate before writing. A malformed response is retried rather than stored.

**Failures are visible.** Entry status moves `bare` → `generating` → `ready`, or `failed` after three retries with backoff. Anything not `ready` stays out of review and counts toward the pending badge from [CRUD scope inside the app](04-crud-scope-inside-the-app.md), with a manual retry from browse.

**Prompts are versioned, so a systematic problem gets fixed once.** Store `prompt_version` on each sense. When the prompt changes, entries generated by an older version can be regenerated in bulk. This is the answer to "how does a bad `caution` style get fixed at the source rather than one entry at a time", and it is what makes the no-review-gate decision survivable.

### Residual risks

- **The register is inferred from one approved example.** Every `caution` and `cue` rests on it. First real batch is the test.
- **No review gate plus rotating cues means five unreviewed cues per sense enter rotation.** Versioned prompts make a systematic fix cheap; they do nothing for a single bad cue, which needs inline editing.
- **Sense-splitting is applied per entry by a model**, not by a rule. Consistency across 84 entries is an assumption, and inconsistency reads as the app being arbitrary about when Kyle is wrong.

## Amended: no API, session-generated (2026-08-23)

Kyle's call: **do not call a model API from the app. Generate the corpus once, in a Claude Code session or with subagents, and load it in.**

This is the option originally recommended during the [CRUD scope inside the app](04-crud-scope-inside-the-app.md) grilling and rejected there in favour of capture-time generation. It is now chosen.

**What stays.** The prompt at `../prompts/generate-entry.md` (v2), the field shape, the sense-splitting rules, the 60/40 cue mix, and `prompt_version` per sense. A prompt written for a tool-use-forced API call works unchanged as instructions to an agent, and versioning still lets a systematic problem be fixed once and regenerated in bulk.

**What goes.** The Anthropic API key, the generation Worker route, tool-use schema forcing, retry-with-backoff, and per-entry cost. The `~$4` corpus figure from [Browser-based LLM feasibility](15-browser-based-llm-feasibility.md) becomes moot: generation is now session work, not metered API work.

**Validation moves to the loader.** With no tool-use schema forcing the output shape, the import step must validate it: every sense has a `term`, `cues` has 3 to 5 entries, `distractors` has 5, and no distractor duplicates a sibling sense's real definition. A malformed entry fails the import rather than reaching the database.
