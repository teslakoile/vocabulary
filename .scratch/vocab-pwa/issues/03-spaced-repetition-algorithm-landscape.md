# Spaced repetition algorithm landscape

Type: research
Status: resolved
Blocked by: —

## Question

What are the real options for the scheduling algorithm, and what does each cost to adopt?

1. **The algorithms.** FSRS (current version and what changed), SM-2 as used by Anki, and plain Leitner boxes. For each: what state it stores per item, what inputs a review must supply, and what it assumes about the item.
2. **Implementations.** Which maintained JavaScript or TypeScript libraries implement them? For each, note the license, bundle size, whether it runs in a browser with no native dependencies, and how actively it is maintained.
3. **The variable-difficulty question.** FSRS is calibrated on one-card-one-schedule. If a single scheduled item is drilled by three different card types of escalating difficulty (recognition, then reverse recognition, then cued production), what breaks? Is there prior art for this, in Anki or elsewhere, and what do practitioners report? This is the crux: does an escalating-difficulty single schedule invalidate the model's interval predictions?
4. **Load at this size.** For a collection of roughly 84 items, what does steady-state daily review load look like under each algorithm, and how heavy is the initial learning ramp? Give numbers, not adjectives.

Cite primary sources: the FSRS repository and papers, Anki's manual and source, and any published analysis. Distinguish what is measured from what is asserted.

## Why this blocks

[Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md) is a decision that should be made with these facts in hand, not from intuition.

## Answer

Full findings, with every claim cited and labelled MEASURED / ASSERTED / CALCULATED-BY-ME:
[research/srs-algorithms.md](../research/srs-algorithms.md).

### Recommendation

**Algorithm: FSRS-6.** It is what shipped Anki actually runs today (Anki 26.08, released 2026-08-01,
bundles fsrs-rs 6.6.1). FSRS-7 exists in the open-spaced-repetition benchmark with better numbers but
is in no shipped release — do not build on it.

**Library: `ts-fsrs` 5.4.1** (MIT, zero runtime dependencies, pure JavaScript, **13.4 KB gzipped**
ESM, no WASM and no native binding, actively maintained — repo pushed 2026-08-23, 763 stars, 5 open
issues). It is the official open-spaced-repetition TypeScript implementation.

Two caveats that matter more than the choice itself:

- **`ts-fsrs` 5.x implements FSRS-6, not FSRS-5.** Library version and algorithm version are off by
  one. Verified from the published tarball: its default parameter array is the exact 21-element
  FSRS-6 default set from `fsrs-rs`.
- **`ts-fsrs` ships no optimizer.** It schedules; it cannot fit parameters. Fitting needs
  `fsrs-browser` (WASM, BSD-3-Clause) or a Node-only native binding. **This does not matter here**:
  Anki's own manual names "less than a few hundred" reviews as the point where FSRS optimisation
  fails, and the benchmark measures unoptimised FSRS at roughly FSRS-4.5-level accuracy. At this
  collection size, plan on running default parameters forever.

### Verdict on the variable-difficulty question

**Do not put three card types under one schedule. Use 252 independent cards.**

- **There is no direct evidence** — nobody has measured one FSRS item drilled by rotating card types.
  Saying otherwise would be inventing a result. But the absence cuts against the idea, not for it.
- **FSRS structurally cannot absorb it.** Difficulty is one scalar per card, initialised from the
  first grade (`D_0(G) = w_4 - e^(w_5(G-1)) + 1`) and updated per review by `-w_6(G-3)` with mean
  reversion toward `D_0(4)`. FSRS-6's declared inputs are interval length, grade, and same-day-review
  flags — **there is no card-type feature anywhere in the model.** A single D converges on the
  *mixture's mean* difficulty, so the interval comes out too long for cued production and too short
  for recognition. D absorbs *between-item* variation, which is what it was built for; within-item,
  between-task variation is out of model.
- **Every authority points the same way.** The FSRS author's own advice for card types that "vary a
  lot in difficulty" is to split them into separate decks with separate presets
  ([fsrs4anki#537](https://github.com/open-spaced-repetition/fsrs4anki/issues/537)). Anki's manual
  says the same for material that varies "wildly in subjective difficulty." SuperMemo's minimum
  information principle names precisely this failure: complex memories "have their concepts activated
  in an incomplete fashion... it is hard to produce a uniform increase in memory stability at review."
- **Do not then over-engineer the split.** MEASURED, from the open-spaced-repetition benchmark (9,999
  collections, 349.9M reviews): fitting separate parameters per preset buys nothing (log loss 0.3438
  vs 0.3437 for shared), and per-deck parameters are measurably *worse* (0.3514). Three separate
  cards, **one shared parameter set**.
- **One-schedule-many-question-types does have a working precedent — but not with FSRS.** WaniKani
  keeps a single `srs_stage` per subject while asking both meaning and reading, and resolves the
  difficulty conflict by requiring *both* correct to advance (min-over-card-types, not average). It
  achieves that by using a fixed Leitner ladder with no fitted memory model to corrupt. If the
  one-schedule design is ever revisited, that is the shape it has to take — and it means abandoning
  FSRS, and reviewing the easy card type on the hard card type's cadence.

### Daily load

Steady-state review count for a **closed** collection is exactly `N / mean_interval` — load is
**perfectly linear in N**, so 252 cards is exactly 3× the daily work of 84. (Anki's published
"20 new cards/day → ~200 reviews/day" describes a *continuously growing* collection and does not
apply here; a closed collection's load declines monotonically after intake.)

Simulated with py-fsrs 6.3.2, FSRS-6 defaults, desired retention 0.9, fuzz off, 6 new/day intake.
Mean button-presses per day. "Optimistic" assumes FSRS is perfectly calibrated; "realistic" assumes
the material is 10 percentage points harder than FSRS predicts — **use the realistic column**.
CALCULATED-BY-ME; method and assumptions in the findings file.

| Period | 84 items, optimistic | 84 items, realistic | 252 cards, optimistic | 252 cards, realistic |
| --- | --- | --- | --- | --- |
| Week 1 | 17 | 17 | 17 | 17 |
| Week 2 | 23 | 27 | 23 | 27 |
| Weeks 3-4 | ~6 | 15 | 30 | 39 |
| Month 2 | 5 | 10 | 24 | 41 (peak 62) |
| Month 3 | 1 | 8 | 11 | 26 |
| Months 4-6 | 2 | 6 | 3 | 17 |
| Months 7-12 | 1 | 3 | 3 | 17 |
| Year 2 | 1 | 4 | 2 | 14 |
| **Total year 1** | **~944** | **~2,325** | **~2,586** | **~7,527** |

Reading it: **84 items is trivially light** after the ramp — under 7 presses/day even pessimistically.
**252 cards costs ~15 presses/day at steady state**, roughly 1.5-2.5 minutes at 6-10 s/card. That
still fits the 3-minute daily habit, but with much less headroom.

The binding constraint is the **intake ramp, not the steady state**, and it is set by the new-cards-
per-day rate rather than collection size: at 12 new/day the peak hits 58-79 presses/day, at 6 new/day
it stays at 17-43. **Cap intake at about 6 new cards/day.** That introduces all 252 cards over 6
weeks and keeps the worst day inside a realistic session.
