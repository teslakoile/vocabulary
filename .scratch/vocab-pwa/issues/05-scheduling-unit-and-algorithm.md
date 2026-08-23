# Scheduling unit and algorithm

Type: grilling
Status: resolved
Blocked by: 03

## Question

[Spaced repetition algorithm landscape](03-spaced-repetition-algorithm-landscape.md) has reported. Read its Answer before deciding; it contradicts the recommendation this ticket originally carried, and it changes what is actually being decided here.

### What the research settled

- **The algorithm is FSRS-6, via `ts-fsrs` 5.4.1** (MIT, zero dependencies, 13.4 KB gzipped, no WASM). Two traps: library 5.x implements FSRS-6, not FSRS-5, and it ships no optimizer. The missing optimizer does not matter, because Anki's own manual puts the point where FSRS fitting fails at "less than a few hundred" reviews. Plan on default parameters permanently.
- **Three card types under one schedule does not work with FSRS.** Difficulty is a single scalar per card with no card-type input feature anywhere in the model, so one schedule converges on the mixture's mean difficulty: intervals come out too long for cued production and too short for recognition. The FSRS author, the Anki manual, and SuperMemo's minimum information principle all independently say split. No one has measured this directly, and the research says so plainly rather than inventing a result.
- **Do not over-engineer the split.** Measured across 9,999 collections and 349.9M reviews: per-preset parameters buy nothing and per-deck parameters are measurably worse. Split the cards, share one parameter set.
- **Load is exactly linear in card count.** 252 cards is precisely 3× the daily work of 84.

### What is actually left to decide

**The trade is correctness against habit, and it is yours to make.** The evidence says 252 independent cards. The cost is roughly 15 to 17 presses a day at steady state, about 1.5 to 2.5 minutes, against 3 to 7 presses a day for 84 items. Both fit a 3-minute daily habit, but 252 has far less headroom, and habit failure is the top residual risk on this whole map. Three ways to resolve it:

1. **Take the evidence.** 252 cards, FSRS-6, shared parameters. Correct scheduling, triple the load.
2. **Keep one schedule per entry anyway, and abandon FSRS for it.** The one working precedent is WaniKani: a single stage per subject, both question types must pass to advance, on a fixed Leitner ladder with no fitted memory model to corrupt. This is coherent, but it means giving up FSRS entirely and reviewing the easy card type at the hard card type's cadence. Do not attempt the hybrid, which is one FSRS schedule with a rotating card type; that is the option the research ruled out.
3. **Cut a card type.** Reverse recognition (meaning to word) and cued production (situation to word) overlap heavily; both are production. Dropping one gives 168 cards, roughly 10 to 11 presses a day, and keeps FSRS correct. Ticket 01 settled all three, so this reopens a settled decision and needs a deliberate reason.

**Intake cap.** The binding constraint is the ramp, not the steady state. At 12 new cards a day the peak hits 58 to 79 presses; at 6 a day it stays inside 17 to 43. Decide the cap, and note that 6 a day introduces 252 cards over about 6 weeks. This directly shapes cold start.

**Grade scale.** FSRS needs four grades: Again, Hard, Good, Easy. A cued-production card graded by string match naturally yields a binary right or wrong. Decide how binary input maps onto four grades, or whether the review screen asks for a self-graded confidence after revealing the answer. Getting this wrong feeds garbage to the scheduler.

## Notes for the session

Invoke `/grill-me`. One number is worth holding onto while deciding: the research also measured a zero-parameter moving average beating FSRS-6 on log loss (0.3369 vs 0.3460). Scheduler sophistication is not where this app succeeds or fails.

## Answer

**All three card types, as 252 independent cards, sharing one FSRS parameter set.** The research's split verdict is taken. The load objection dissolved once card formats were separated: a multiple-choice recognition card is one tap, and only the two production cards need typing.

| Card type | Format | Approx. time | Graded |
| --- | --- | --- | --- |
| Recognition | Multiple choice, pick the meaning | ~3 s | yes |
| Reverse recognition | Typed, meaning to word | ~8 s | yes |
| Cued production | Typed, situation to word | ~10 s | yes |

At steady state that is roughly 5 of each per day, about **2 minutes total**. Keeping recognition costs about 15 seconds a day more than demoting it, so the demotion idea is dropped and ticket 01's three card types stand unchanged.

**Recognition is multiple choice, not free recall.** Kyle's call. This creates a requirement nothing else on the map had: every recognition card needs plausible wrong answers. Distractors come from other entries' definitions, which makes distractor selection a data-model and generation concern. Passed to [Entry and review-state data model](07-entry-and-review-state-data-model.md).

**Algorithm: FSRS-6 via `ts-fsrs` 5.4.1**, default parameters permanently. The library ships no optimizer, and Anki's manual puts the point where FSRS fitting fails at fewer than a few hundred reviews, so there is nothing to optimize at this size. Do not fit per-card-type parameters: measured across 9,999 collections, per-preset parameters buy nothing and per-deck parameters are worse.

**Grades map from a binary.** Wrong becomes Again, right becomes Good. No self-grading, no extra tap after answering. The same research measured a zero-parameter moving average beating FSRS-6 on log loss, so paying an interaction per card to feed the model is a bad trade. Adding a four-button self-grade later requires no data migration.

**Intake caps at 6 new cards a day.** The ramp is the binding constraint, not steady state: at 12 a day the peak hits 58 to 79 presses, at 6 it stays inside 17 to 43. Six a day puts all 252 cards in rotation in about six weeks.

**Everything starts from zero.** *(Decided at resolution, not asked.)* No "I already know this" seeding at import. Self-assessed familiarity is unreliable, and the feeling of knowing a word is exactly what recognition-without-production produces, so seeding would bake wrong intervals into words Kyle cannot actually produce. The cost is a six-week ramp instead of a shorter one, and multiple-choice recognition makes the early cards cheap enough that this is affordable.

### The app is an endless game, not a daily queue

Kyle's framing, and it overrides the normal SRS session model:

- **No session boundaries.** No "done for today", no completion screen, no streaks, no guilt.
- **Closing the app is pausing.** Every answer persists the moment it is given, so there is no session state to resume or lose.
- **The queue never runs dry.** When everything due has been practiced, the app enters **free play**: it keeps serving the same cards and the same questions, but answers in free play **do not update any FSRS schedule**. This gives an endless loop without lying to the scheduler by reviewing real cards early, which would tell FSRS you remembered something it never doubted.

Free play must be **visibly distinct** from real review, or Kyle will not know why one moved his progress and the other did not. That is a UX problem, passed to [Review session UX](08-review-session-ux.md).

### Residual risks

- **Free play may feel pointless** if practice that "does not count" looks identical to practice that does. The mitigation is entirely visual and lives in ticket 08.
- **Binary grading means difficulty never differentiates.** Every correct answer looks the same to FSRS, so `idempotent` and `broad` get identical treatment. This gives up the one thing FSRS is genuinely good at, accepted because the measured gain over a moving average is small.
- **Multiple-choice recognition is the easiest card type and the least like real use.** If it dominates your sense of progress, you may feel fluent in words you cannot produce. The two typed card types are the honest signal.
