# Cold start and Keep retirement

Type: task
Status: resolved
Blocked by: 12, 13

## Question

Get the 84 entries out of Google Keep, through generation, and into D1, then retire Keep.

1. **Extract.** The verbatim list is already at `../source-list.md`, so nothing depends on a Keep API. Confirm it still matches what is in Keep, since Kyle may have added words since 2026-08-23.
2. **Generate.** Run every entry through the prompt from [Generation prompt](12-generation-prompt.md). Expect about 93 senses. Run it as a batch, not one at a time.
3. **Check the register before trusting the rest.** [Generation prompt](12-generation-prompt.md) recorded Kyle's working world as an inference validated by a single approved example. Generate the first 10 entries, have Kyle read the `caution` and `cue` fields, and fix the prompt before generating the other 74. This is the cheapest moment to catch a systematic problem, and `prompt_version` exists to make regeneration cheap if it is caught later.
4. **Seed the schedule, do not flood it.** [Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md) capped intake at 6 new cards a day, and everything starts from zero with no "I already know this" seeding. Importing 279 cards is not the same as making them due. All 279 enter rotation over roughly six weeks.
5. **Retire Keep.** Archive the note. Ticket 04 made this a one-way migration: Keep stops being a source of truth and all capture happens in the app from then on.

## Notes for the session

The register check at step 3 is the point of this ticket, not the data movement. Everything else is mechanical.

Carry forward the unmeasured risk from [Capture speed spike](10-capture-speed-spike.md): nothing has tested whether PWA capture is fast enough to replace Keep. The agreed signal costs nothing, so start it here. Two weeks after the app is in use, count how many new words went into the app versus Keep. If Keep is still winning, ticket 04 reopens.

## Answer

**Done, apart from step 5, which is yours.** 84 entries generated, validated, and loaded into production D1. The app is live and practising works end to end.

**Numbers.** 84 entries → 95 senses → 285 cards → 48 days of intake at 6 new cards a day. 403 cues, 61% professional and 39% ordinary life, which is the 60/40 target from prompt v2 landing almost exactly. Every sense carries `prompt_version: 2`.

**Generation ran as four parallel sessions**, roughly 21 headwords each, writing one JSON file per entry so a crashed agent could only lose the word it was mid-way through. No model API was involved, per the amendment on [Generation prompt](12-generation-prompt.md).

**The register check happened before this ticket, not during it.** Step 3 asked for 10 entries reviewed by hand before the other 74. That check had already run: Kyle read the five hard entries in `sample-output-v1.md`, and the 60/40 cue rule in prompt v2 exists because of what he said. Generating all 84 first and validating mechanically was the reversal, and `prompt_version` is the insurance if it turns out to have been the wrong call. **A sample still wants his eyes**, on the `caution` field above all.

**One systematic flaw was caught, and it would have wrecked recognition cards.** Definitions run to two sentences; the generated distractors were short fragments. The correct answer was therefore the longest of the six options in **100%** of senses, so Kyle would have scored full marks by picking the longest option without knowing a single word. Fixed by regenerating all 475 distractors at matched length, with a rule now enforced by `scripts/validate-corpus.mjs`: at least two distractors longer than the definition and at least two shorter. The correct answer's median length rank is now 4 of 6, which is no information at all.

A second, smaller version of the same tell: `top brass` and `daily driver` ended their definitions with an origin note ("Borrowed from the military"), a shape no distractor could plausibly carry. Those clauses moved to `caution`.

**Scripts, all re-runnable.**

- `scripts/validate-corpus.mjs` — the 9 hard rules plus warnings. `--complete` makes missing headwords an error.
- `scripts/merge-distractors.mjs` — merges a repair pass on headword and term, touching nothing else.
- `scripts/build-seed-sql.mjs` — deterministic ids (`e_<slug>`, `s_<slug>_<n>`, `c_<slug>_<n>_<type>`) make the seed idempotent. Entry and sense content is overwritten on reload; card rows are left alone, so **regenerating the corpus never destroys review history**. No `BEGIN`/`COMMIT`, because remote D1 rejects SQL transaction statements.

**Schedule seeded, not flooded.** All 285 cards carry an `intake_order` (migration `db/0002`) and start with `fsrs_state IS NULL`. Nothing is due. A card enters the rotation only when it is actually answered for the first time, which is also what increments `intake_log`, so intake needs no separate bookkeeping. Order is Kyle's own Keep order, then sense, then card type.

**Step 5 is Kyle's.** Archiving the Google Keep note needs his hands. Until he does, Keep is still a second source of truth and ticket 04's one-way migration has not actually happened.

**Carried forward:** the unmeasured capture risk from [Capture speed spike](10-capture-speed-spike.md). The clock starts when he installs. Two weeks in, count new words in the app versus Keep.

**Three definitions were flagged by the repair pass as bundling two meanings**, which makes their cards harder to write distractors for and slightly unfair to answer: `lean on` (rely on / apply pressure), `sponsorship` (programme sponsor / career sponsor), and `amenable` (a willing person / a suitable problem). `broad` carries three readings. Each is a candidate for splitting into senses. Not urgent, and it is Kyle's call which meaning he actually wants.
