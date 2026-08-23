# Spaced repetition algorithm landscape

Research for ticket [03-spaced-repetition-algorithm-landscape](../issues/03-spaced-repetition-algorithm-landscape.md).

Research date: 2026-08-23. Versions stated inline; where a version is not stated, treat the
claim as undated and re-check before relying on it.

**Evidence labels used throughout:**
- **MEASURED** — a number produced by an experiment or benchmark run by the source, on real data.
- **ASSERTED** — a claim made by a maintainer, manual, or practitioner without accompanying data.
- **CALCULATED-BY-ME** — arithmetic I performed. Working shown. Not a source claim.
- **NOT ESTABLISHED** — I looked and could not find evidence either way.

---

## 1. The variable-difficulty question (three card types, one schedule)

### 1a. What Anki/FSRS actually is: one card, one schedule. No exceptions.

Anki's unit of scheduling is the **card**, not the note. A note (one vocabulary entry) generates
one or more cards; each card carries its own independent memory state and its own due date.
The manual: cards generated from one note "are called 'siblings'"
([Anki manual, Studying](https://docs.ankiweb.net/studying.html)). MEASURED/DOCUMENTED — this is
the documented data model, not an inference.

So there is **no built-in prior art for "one schedule drilled by N card types"** in Anki. Anki does
the opposite: N cards, N schedules, and then it works to keep them *apart*.

### 1b. The FSRS maintainer's own answer to "my card types differ in difficulty"

open-spaced-repetition/fsrs4anki issue #537, "[Feature Request] Optimize scheduling based on Card
Types (not Note Types)". The requester's situation is close to Kyle's: "I study languages. All of my
notes have several different card types that vary a lot in difficulty."

L-M-Sherlock (Jarrett Ye, FSRS author, repo member) first reply:

> I recommend moving the easier type of cards into another deck. Then, you can apply a different
> preset to the deck.

ASSERTED (maintainer recommendation, no data attached). The remedy proposed by the algorithm's
author for card types of differing difficulty is **separate FSRS parameter sets per card type**,
achieved by splitting card types into different decks. Not one shared schedule; not "difficulty will
absorb it".

Also established in that thread (by maintainer and confirmed by the requester): siblings of one note
*can* live in different decks, and each card is scheduled by the preset of the deck it is in. FSRS
parameters are per-deck-preset. There is no per-card-type parameter override; the maintainer
redirected the request for one to the Anki forums as an Anki-framework matter, and it was not
implemented as of this research date.

Source: https://github.com/open-spaced-repetition/fsrs4anki/issues/537

### 1c. What sibling burying is actually doing

Anki manual, Studying > Siblings and burying:

> When you answer a card that has siblings, Anki can prevent the card's siblings from being shown in
> the same session by automatically "burying" them.

Mechanics, from the manual: buried cards stay hidden until the day rolls over or you manually
unbury. Anki only buries siblings that are **new or review** cards; it will not hide cards in
learning ("time is of the essence for those"), but studying a learning card *will* bury its
new/review siblings.

Gathering order (Anki manual, Deck Options > Burying): intraday learning, then interday learning,
then review, then new. "If you have all burying options enabled, the sibling that comes earliest in
that list will be shown." Three separate toggles exist: **Bury new siblings**, **Bury review
siblings**, **Bury interday learning siblings**.

Important accuracy note: **the Anki manual does not state a mechanism or a justification.** It
describes only the behaviour. The widely-repeated explanation — that seeing a sibling in the same
session leaks the answer and turns a retrieval attempt into a recognition, contaminating the grade
that FSRS then learns from — is *practitioner folklore relative to the manual*, however plausible.
I did not find that rationale stated in the manual itself. Treat it as ASSERTED-BY-COMMUNITY unless
a maintainer statement turns up.

What burying is NOT: it is not a scheduling adjustment. It defers a card's *presentation* by at
least a day; it does not alter stability or difficulty. (Separately, the fsrs4anki-helper add-on has
a "Disperse Siblings" feature that *does* adjust intervals to spread siblings apart — a different
mechanism, covered below.)

Sources: https://docs.ankiweb.net/studying.html , https://docs.ankiweb.net/deck-options.html

### 1d. FSRS-6 mechanics: what the difficulty parameter can and cannot absorb

FSRS state per card is two numbers: **Stability (S)**, "interval when R=90%", and **Difficulty (D)**,
on a 1-10 scale. Retrievability R is computed on the fly from elapsed time and S; it is not stored.

FSRS-6 difficulty formulas (from the FSRS wiki, [The Algorithm](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)):

- Initialisation, from the **first grade only**: `D_0(G) = w_4 - e^(w_5 * (G-1)) + 1`
- Per-review update: `D' = D + ΔD * (10 - D)/9`, where `ΔD = -w_6 * (G - 3)`
- Then mean reversion: `D'' = w_7 * D_0(4) + (1 - w_7) * D'`

Three properties of this follow directly from the formulas (DOCUMENTED mechanism, not my speculation):

1. **D is a single scalar per card.** It has no slot for "which question was asked". FSRS-6's input
   features, per the benchmark's own table, are `IL, G, SR` — interval lengths, grades, same-day
   reviews. No card-type feature exists.
2. **D is a leaky running average of grades.** Every review nudges D by an amount proportional to
   `(G - 3)`, then pulls it back toward `D_0(4)` by the mean-reversion weight `w_7`. Feed it an
   alternating stream of easy grades (recognition) and hard grades (production) and D converges to
   something like a *weighted mean difficulty of the mixture*, not to any one card type's difficulty.
3. **S, and therefore the next interval, is a function of D.** So a mixture-averaged D produces a
   mixture-averaged interval: too long for the hardest card type, too short for the easiest.

I am labelling point 3 **CALCULATED-BY-ME / inference from documented formulas**, not a finding. The
formulas are primary-source; the consequence is arithmetic on them; but I found **no source that
measures the size of the error** this introduces. See §1g.

### 1e. MEASURED: splitting parameters by subgroup does not improve calibration

This is the most useful hard number I found for the decision, and it is measured, not asserted.

The [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark) (9,999 Anki collections,
349,923,850 reviews used for evaluation, time-series split so no future leakage) includes two
variants that fit *separate parameter sets per subgroup* of a user's cards:

- **FSRS-7 preset**: "FSRS-7 where different presets have different parameters."
- **FSRS-7 deck**: "similar to above, but with different parameters for each deck."

Results, "Without same-day reviews" table (mean ± 99% CI):

| Algorithm | Params | Log Loss ↓ | RMSE(bins) ↓ | AUC ↑ |
| --- | --- | --- | --- | --- |
| FSRS-7 recency | 35 | 0.3414±0.0043 | 0.0627±0.0010 | 0.7097±0.0022 |
| FSRS-7 | 35 | 0.3437±0.0043 | 0.0655±0.0011 | 0.7069±0.0023 |
| **FSRS-7 preset** | 35 | 0.3438±0.0043 | 0.0650±0.0011 | 0.7079±0.0023 |
| FSRS-rs | 21 | 0.3443±0.0041 | 0.0635±0.0011 | 0.7074±0.0022 |
| FSRS-6 | 21 | 0.3460±0.0042 | 0.0653±0.0011 | 0.7034±0.0023 |
| **FSRS-7 deck** | 35 | 0.3514±0.0044 | 0.0725±0.0013 | 0.7016±0.0022 |
| FSRS-5 | 19 | 0.3560±0.0045 | 0.0741±0.0013 | 0.7011±0.0023 |
| FSRS-4.5 | 17 | 0.3624±0.0046 | 0.0764±0.0013 | 0.6893±0.0023 |
| FSRS-7 default param. | 0 | 0.3629±0.0044 | 0.0910±0.0014 | 0.6944±0.0024 |

Read that carefully:

- **Per-preset parameters buy nothing.** FSRS-7 preset (0.3438) vs plain FSRS-7 (0.3437) — identical
  within noise, and both CIs overlap almost entirely.
- **Per-deck parameters make it measurably worse.** FSRS-7 deck (0.3514) is worse than plain FSRS-7
  (0.3437) on all three metrics, and the gap (0.0077) is larger than the CI half-width (0.0043-0.0044).
  Fitting a separate parameter set per deck *degrades* predictions, presumably because each subgroup
  gets less data to fit on.

This is the closest thing to direct measured evidence on Kyle's question that exists. It says: the
"split the three card types into three separately-parameterised schedules" strategy — the maintainer's
own recommendation in §1b — is **not measured to improve calibration**, and when the split is fine-
grained it hurts. Caveat, and it matters: this measures *parameter fitting*, not *state separation*.
It does not tell you whether three separate cards-with-separate-S-and-D beats one shared schedule. It
tells you that three separate *trained parameter sets* is not the win it sounds like.

### 1f. A sobering calibration baseline from the same table

In the same benchmark, the trivial baseline **MOVING-AVG** (0 parameters, just "predict higher if
recent reviews succeeded") scores Log Loss 0.3369 — **better than FSRS-6's 0.3460 and better than
FSRS-7's 0.3437**. FSRS wins on AUC (0.7034 vs 0.7001 for FSRS-6 vs MOVING-AVG) — i.e. on
discrimination — but on raw calibration a zero-parameter moving average is competitive. The
benchmark itself notes "AUC can be good (high) even if Log Loss and RMSE are poor," and the reverse
holds here. MEASURED.

Relevance: at 84 items, the absolute accuracy difference between a well-tuned FSRS and something much
simpler is small in a way the marketing does not convey. This should temper how much engineering
budget goes into scheduler sophistication.

### 1g. Prior art for "one schedule, several question types": WaniKani

This exists, and it is the closest structural match to Kyle's proposal that I found.

**WaniKani** (Japanese kanji/vocabulary SRS, commercial, ~2012-present) schedules one **subject** per
SRS stage, but asks **two different question types** for most subjects: meaning and reading. From the
[WaniKani API documentation](https://docs.api.wanikani.com/):

- An **Assignment** has a single `srs_stage` per subject ("The current SRS stage interval. The
  interval range is determined by the related subject's spaced repetition system"), integer 0-9.
- A **Review** record carries *separate* counters — "The number of times the user has answered the
  meaning incorrectly" and "The number of times the user has answered the reading incorrectly" —
  plus a single `starting_srs_stage` and a single `ending_srs_stage`.

So: one schedule, two question types, one stage transition computed from the combined error count.
DOCUMENTED (API schema, primary source).

How WaniKani resolves the variable-difficulty problem is the interesting part. Per
[WaniKani Knowledge, SRS Stages](https://knowledge.wanikani.com/wanikani/srs-stages/), the stage
demotion is `new_srs_stage = current_srs_stage - (incorrect_adjustment_count × srs_penalty_factor)`,
where `incorrect_adjustment_count` is incorrect answers divided by two, rounded up, and the penalty
factor is 2 at stage 5+ and 1 below. Both question types must be answered correctly in the same
review for the item to advance; either one wrong pulls the item back.

**The design pattern: the item's schedule is governed by its hardest component, not its average.**
"All correct → advance; any wrong → demote" is a min-over-card-types rule. That is a coherent way to
run one schedule over heterogeneous question types — but note what it costs: the easy question type
is now reviewed on the hard type's cadence, i.e. far more often than it needs. WaniKani accepts that
waste deliberately.

Also note WaniKani does **not** use FSRS, SM-2, or any fitted memory model. It uses fixed stage
intervals (4h, 8h, 1d, 2d, 1w, 2w, 1mo, 4mo), i.e. a Leitner ladder. The one-schedule-many-questions
design and the fitted-memory-model design do not appear together anywhere I could find.

### 1h. What Wozniak says, and why it is the sharpest statement of the problem

SuperMemo's **minimum information principle** — the foundational guidance behind the DSR memory model
that FSRS descends from — states:

> "Simple questions formulated for active recall in learning bring much better memory outcomes than
> complex questions even though one complex question may be equivalent to a large number of simpler
> questions."

The stated reason is directly the mechanism at issue here
([supermemo.guru, Minimum information principle](https://supermemo.guru/wiki/Minimum_information_principle)):
simple connections can be "uniformly refresh[ed]" at review, whereas

> "complex memories may have their concepts activated in an incomplete fashion, or in a different
> sequence that depends on the context. As a result, it is hard to produce a uniform increase in
> memory stability at review."

ASSERTED (Wozniak; no data on that page). But read it against Kyle's design: if one scheduled entry is
sometimes drilled by recognition and sometimes by cued production, then each review activates a
*different* retrieval path, and the stability increase from a review is not uniform across reviews.
That is exactly the condition Wozniak names as the thing that breaks stability estimation. FSRS's S
and D are the direct descendants of that stability model.

### 1i. Practitioner reports: the predicted failure mode, observed

Anki forum thread ["FSRS parameters for different card types"](https://forums.ankiweb.net/t/fsrs-parameters-for-different-card-types/46520).
User *Remline* runs Spanish vocabulary notes generating Word→Picture and Picture→Word cards from one
note. Their reported conclusion after a month of monitoring: it "was beneficial to split these cards
into a separate deck/preset" because **"FSRS could not schedule these cards for sufficiently frequent
review"** when the harder card type shared a parameter set with the easier one.

ASSERTED, n=1, self-reported, no controlled comparison. But it is precisely the failure the formulas
in §1d predict: the harder retrieval task gets intervals set by a difficulty estimate diluted by the
easier one, and is therefore under-reviewed.

Note this thread is about *shared parameters across separate cards* — a much weaker form of mixing
than Kyle's *shared state on one card*. If shared parameters alone are enough to produce a noticeable
problem, shared S and D is a stronger version of the same thing.

Corroborating official guidance, [Anki manual, Deck Options > FSRS](https://docs.ankiweb.net/deck-options.html):

> "If you have decks that vary wildly in subjective difficulty, it is recommended to assign them
> separate presets, as the parameters for easier decks will be different from harder decks."

ASSERTED (manual, no data). And FSRS contributor **Expertium** in
["When/How to separate presets for FSRS"](https://forums.ankiweb.net/t/when-how-to-separate-presets-for-fsrs/45317):
"If you feel like the material is different — make a different preset." In the same thread Expertium
reports a benchmark analysis across the 9,999 collections finding per-preset optimisation only "very
mildly better" than collection-wide, by "an imperceptible-in-practice amount," with correlation
between preset count and performance of −0.056. That number is consistent with the FSRS-7 preset row
in §1e.

### 1j. VERDICT on the variable-difficulty question

**What I can say with cited evidence:**

1. **There is no direct evidence.** I found no study, benchmark, maintainer statement, or dataset that
   measures what happens when one FSRS-scheduled item is drilled by rotating card types of escalating
   difficulty. No FSRS version has a card-type input feature; the question has apparently not been
   asked of the model. **NOT ESTABLISHED** — and I am declining to manufacture a number for it.
2. **Every authority in this tradition points the other way.** Anki's data model (one card, one
   schedule), the FSRS author's own advice for varying card-type difficulty (split them, §1b), the
   Anki manual's preset guidance (§1i), and SuperMemo's minimum information principle (§1h) all
   converge on: *do not put heterogeneous retrieval tasks under one schedule*. All ASSERTED, none
   measured against the specific alternative.
3. **The mechanism by which it would break is documented, even though the magnitude is not.** D is a
   single scalar updated from grades with mean reversion (§1d), so it converges on the mixture's mean
   difficulty. S is a function of D. The resulting interval is therefore too long for cued production
   and too short for recognition. This is arithmetic on published formulas — CALCULATED-BY-ME, not a
   measured effect size.
4. **Does difficulty "absorb" it? No — for a specific structural reason.** Absorbing it would require
   D to be conditioned on which card type is about to be shown. It is not: FSRS-6's inputs are
   interval length, grade, and same-day-review flags. A single D cannot express "easy as recognition,
   hard as production" because it is one number. What D actually absorbs is *between-item* difficulty
   variation, which is what it was built for. Within-item, between-task variation is out of model.
5. **The "just use three presets" escape hatch is measured to be worth roughly nothing.** §1e: per-
   preset parameters are within noise of shared parameters (0.3438 vs 0.3437 log loss), and per-deck
   parameters are measurably *worse* (0.3514). So if you do split into 252 cards, do not also expect
   to gain from fitting three separate parameter sets. MEASURED.
6. **At 84 items you may not get to fit parameters at all.** The Anki manual's own health-check
   guidance names "Low number of reviews (less than a few hundred)" as a reason FSRS performs badly:
   "As a machine learning algorithm, FSRS needs data to learn from." Splitting into three presets
   splits that already-thin data three ways. DOCUMENTED.

**The honest bottom line:** the one-schedule design is not *disproven* — nobody has run the
experiment. It is *unsupported*, mechanically implausible given the published formulas, and contrary
to the unanimous advice of every maintainer and manual in the space. The one working precedent for
one-schedule-many-question-types (WaniKani, §1g) achieves it by abandoning the fitted memory model
entirely and using a fixed Leitner ladder governed by the hardest component. That combination — fixed
ladder + min-over-card-types — is coherent. "FSRS + one schedule + rotating card types" is the
combination with no precedent and no supporting evidence.

## 2. Load at this size (84 vs 252 items)

### 2a. The one number Anki publishes, and why it does not apply here

[Anki manual, Deck Options > Daily Limits](https://docs.ankiweb.net/deck-options.html), verbatim:

> "If you are consistently learning 20 new cards a day, you can expect your daily reviews to be
> roughly about 200 cards/day."

ASSERTED (no data or derivation given in the manual). A 10:1 reviews-to-new-cards ratio.

**This does not transfer to Kyle's case, and the reason matters.** That figure describes a
*continuously growing* collection — someone adding 20 new cards every day, forever. Kyle has a
**closed collection**: 84 entries (or 252 cards), introduced once, then never grown. In a closed
collection the review load *monotonically declines* after the intake ramp, because every successful
review lengthens that card's interval and nothing new arrives to replace it. There is no steady state
in the Anki-manual sense. Anyone quoting "200 reviews/day" at this project has mis-transferred the
number by roughly two orders of magnitude.

### 2b. The exact steady-state relationship (transparent arithmetic)

For a closed collection of N cards with mean review interval I days, the daily review count is
exactly `N / I`. Each card contributes one review every I days. **CALCULATED-BY-ME**, but this is a
definition, not a model.

| mean interval | reviews/day, N=84 | reviews/day, N=252 |
| --- | --- | --- |
| 7 d | 12.0 | 36.0 |
| 14 d | 6.0 | 18.0 |
| 30 d | 2.8 | 8.4 |
| 60 d | 1.4 | 4.2 |
| 90 d | 0.93 | 2.8 |
| 180 d | 0.47 | 1.4 |
| 365 d | 0.23 | 0.69 |
| 730 d | 0.12 | 0.35 |

**Load is exactly linear in N.** 252 items is exactly 3× the daily load of 84 items at any given mean
interval. The scheduling-unit decision is a straight 3× multiplier on daily work; it is not a
question with a hidden nonlinearity in it.

Note also: at DR = 0.9, FSRS sets the interval ≈ the stability, because stability is *defined* as
"interval when R = 90%". So "mean interval" and "mean stability" are interchangeable here.

### 2c. Simulated load (CALCULATED-BY-ME — method and assumptions stated)

**Method.** I ran the official reference implementation
[py-fsrs 6.3.2](https://pypi.org/project/fsrs/) (open-spaced-repetition), FSRS-6, **default
un-optimised parameters** (identical in py-fsrs and
[fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/inference.rs):
`[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]`), desired retention 0.9,
default learning steps 1m/10m, fuzzing off for determinism, maximum interval 36500.

**Assumptions, stated because they drive the answer:**
- Default parameters are the right choice here, because at 84 items there will never be enough
  reviews to optimise. The Anki manual's own health check names "Low number of reviews (less than a
  few hundred)" as a reason FSRS performs badly: "As a machine learning algorithm, FSRS needs data to
  learn from."
- Ground truth for whether a recall succeeds = the model's own predicted retrievability R. That
  assumes FSRS is perfectly calibrated for Kyle, which is generous. I therefore also ran a pessimistic
  variant where true recall = R − 0.10 (material 10 percentage points harder than FSRS predicts).
- Successful reviews are graded **Good**; failures **Again**. No Hard/Easy. Real grading would differ.
- "Presses" counts every button press, which is what Anki's review-count graph counts (so a new card
  costs 2 presses on day 0 for the 1m/10m learning steps). "Cards seen" counts distinct cards.

**The interval ladder, always-Good, FSRS-6 defaults, DR = 0.9:**

| step | interval (days) | stability | difficulty |
| --- | --- | --- | --- |
| graduate | 2 | 2.31 | 2.11 |
| review 2 | 11 | 10.97 | 2.10 |
| review 3 | 46 | 46.32 | 2.10 |
| review 4 | 163 | 163.0 | 2.09 |
| review 5 | 498 | 497.9 | 2.08 |
| review 6 | 1348 | 1347.9 | 2.08 |

A card that is never failed comes due on days 2, 13, 59, 222, 720 — **about 5 presses in the entire
first year** (2 learning + 3 reviews). This is why closed-collection load collapses so fast.

Note the difficulty column: pressing Good on a *new* card initialises D at 2.11 on the 1-10 scale
(`D_0(3) = 6.4133 − e^(0.8334×2) + 1 = 2.118`), i.e. FSRS treats consistently-Good material as very
easy and grows intervals ~4.5× per review. If Kyle's professional-register vocabulary is genuinely
hard, real grading will include Again presses, D will rise, and intervals will grow far more slowly
than this ladder. **The ladder is the optimistic bound, not the expectation.**

**Simulated daily load, closed collection.** Mean presses/day (peak in parentheses):

*Optimistic case — FSRS perfectly calibrated:*

| period | 84 items, 12/day intake | 252 cards, 12/day intake | 252 cards, 6/day intake |
| --- | --- | --- | --- |
| week 1 | 33.7 (39) | 33.7 (39) | 17.0 (20) |
| week 2 | 14.1 (15) | 49.0 (57) | 23.4 (26) |
| weeks 3-4 | 5.6 (20) | 40.4 (58) | 30.3 (35) |
| month 2 | 5.1 (17) | 14.9 (24) | 23.6 (36) |
| month 3 | 1.3 (5) | 5.9 (17) | 10.7 (21) |
| months 4-6 | 1.7 (12) | 4.6 (19) | 3.4 (10) |
| months 7-12 | 1.0 (5) | 2.1 (9) | 2.7 (13) |
| year 2 | 1.0 (12) | 1.7 (15) | 1.9 (10) |
| **total presses, year 1** | **944** | **2,596** | **2,586** |

*Pessimistic case — material 10 pp harder than FSRS predicts (true R = predicted R − 0.10):*

| period | 84 items, 12/day intake | 252 cards, 12/day intake | 252 cards, 6/day intake |
| --- | --- | --- | --- |
| week 1 | 34.7 (41) | 34.7 (41) | 17.3 (21) |
| week 2 | 20.0 (28) | 58.9 (74) | 27.1 (32) |
| weeks 3-4 | 13.4 (30) | 63.4 (79) | 38.6 (43) |
| month 2 | 9.4 (22) | 29.2 (46) | 40.7 (62) |
| month 3 | 6.3 (11) | 23.4 (40) | 25.9 (32) |
| months 4-6 | 6.3 (14) | 14.8 (28) | 16.5 (29) |
| months 7-12 | 3.8 (9) | 14.9 (30) | 16.8 (34) |
| year 2 | 4.0 (16) | 13.8 (32) | 14.2 (27) |
| **total presses, year 1** | **2,325** | **7,265** | **7,527** |

Reproduce with the script written during this research (kept only in the session scratchpad, not the
repo).

### 2d. What the numbers say for the decision

1. **The ramp, not the steady state, is the constraint.** Peak daily load happens in weeks 1-4 and is
   set almost entirely by the **intake rate**, not by collection size. At 12 new/day the peak is
   34-79 presses/day; at 6 new/day it is 17-43. For a stated 3-minute daily habit at roughly
   5-10 seconds per card, the ceiling is on the order of 20-35 presses/day. **6 new/day is inside
   budget; 12 new/day is not, for the 252-card option.**
2. **84 items is trivially light after the ramp.** Under 2 presses/day from month 3 onwards in the
   optimistic case, under 7 in the pessimistic case. A 3-minute habit is comfortable.
3. **252 cards is roughly 3× that** — exactly 3×, per §2b. Pessimistic case months 7-12: ~15
   presses/day. That is 1.5-2.5 minutes of review at 6-10 s/card. Still inside a 3-minute habit, but
   with much less headroom, and the intake ramp at 252 stretches to 6 weeks at 6/day.
4. **Time to introduce everything:** N / (new per day). 84 at 6/day = 14 days. 252 at 6/day = 42 days.
   252 at 12/day = 21 days.
5. **Load is essentially insensitive to intake rate in the long run** — same total work, spread
   differently. Intake rate is purely a peak-smoothing lever.

### 2e. Confidence and disagreement

- §2a and the interval ladder are DOCUMENTED / reference-implementation output — high confidence.
- §2b is definitional arithmetic — certain.
- §2c simulated tables depend on my grading assumptions and on default parameters. The optimistic and
  pessimistic columns differ by ~2.5-3× in year-1 total presses. **Treat the pessimistic column as
  the planning number** — it is the one that assumes the material is actually hard, which
  professional-register vocabulary chosen for connotation probably is.
- I could not find published FSRS simulator output or benchmark data for closed collections at this
  size to cross-check against. Anki has a built-in simulator ("You can use the simulator to get an
  estimate of your workload, either in reviews per day or in minutes of studying per day") but its
  outputs are per-user and not published. **NOT ESTABLISHED**: any independent confirmation of my
  simulated numbers.

## 3. The algorithms

### 3a. FSRS — current version, and what changed across versions

**Which version is current, precisely (as of 2026-08-23):**

- **Shipping in Anki: FSRS-6.** Anki 26.08 (released 2026-08-01) and 26.08.1 (2026-08-05) are the
  current stable releases. The 26.08 release notes: "Update to fsrs-rs 6.6.1, bringing performance
  improvements." `fsrs-rs` is at v6.6.0/6.6.1. So **FSRS-6, 21 parameters**, is what a user actually
  gets today.
- **FSRS-7 exists but is research-only.** It appears in the srs-benchmark with 35 parameters and
  beats FSRS-6, but it is not in any shipped Anki release. Do not build on it.
- The Anki manual's deck-options page still refers to "FSRS-5" in places (the manual lags the code).
  **Source disagreement, flagged**: manual text vs shipped fsrs-rs version. Trust the code and the
  release notes.

**Version history**, quoting the [srs-benchmark README](https://github.com/open-spaced-repetition/srs-benchmark)
(written by the FSRS maintainers, so this is primary):

| Version | Params | What changed |
| --- | --- | --- |
| v1, v2 | 7, 14 | "the initial experimental versions of FSRS, used only by Jarrett Ye" |
| v3 | 13 | "the first official release", as a custom scheduling script |
| v4 | 17 | "upgraded... with help from the community. It is the first version that was integrated into Anki" |
| 4.5 | 17 | "The shape of the forgetting curve has been changed." |
| 5 | 19 | "uses the same-day review data to refine its prediction for the next review" |
| **6** | **21** | "the formula for handling same-day reviews has been improved. More importantly, FSRS-6 has an optimizable parameter that controls the flatness of the forgetting curve, meaning that the shape of the curve is different for different users." |
| 7 | 35 | "designed to work with fractional interval lengths... the only version that can give realistic predictions of probability of recall for same-day reviews. The biggest change is that the forgetting curve now has 8 optimizable parameters" |

Measured improvement across versions (Log Loss ↓, from the benchmark table in §1e): 4.5 = 0.3624,
5 = 0.3560, 6 = 0.3460, 7 = 0.3437. MEASURED. The version-to-version gains are real but small; the
whole span from FSRS-4.5 to FSRS-7 is ~0.019 log loss.

**State stored per card:** two floats.
- **Stability (S)** — "interval when R=90%", in days. Range clipped to [0.001, 36500].
- **Difficulty (D)** — 1 to 10.
- Plus bookkeeping Anki carries anyway: due date, last review date, card state, learning step index.
- **Retrievability (R) is NOT stored** — it is computed from S and days elapsed at query time.

That is genuinely all. Two floats and a date is the entire persistent memory model.

**Grade scale a review must supply:** four ratings — `1 = Again` (the only failing grade),
`2 = Hard`, `3 = Good`, `4 = Easy`. Plus the elapsed time since last review. FSRS-6's declared input
features in the benchmark are `IL, G, SR` = interval lengths (integer days), grades, same-day reviews.

Anki manual is emphatic that Hard is not a fail: "Hard should **not** be used when you forgot the
answer; it is a passing grade, not a failing grade," and misusing it is listed as a top reason FSRS
performs badly.

**What it assumes about the item:**
- One item = one retrieval task with one memory trace. There is no card-type or content feature
  anywhere in the model.
- The item is atomic enough that a single scalar difficulty describes it.
- Grades are honest and consistently applied (see the Hard-misuse warning above).
- **Enough review data exists to fit 21 parameters.** Anki manual health check: FSRS performs badly
  with a "Low number of reviews (less than a few hundred). As a machine learning algorithm, FSRS
  needs data to learn from." Below that threshold you are running default parameters, which the
  benchmark measures at Log Loss 0.3629 (FSRS-7 default param., 0 fitted) versus 0.3437 fitted —
  i.e. **unoptimised FSRS is roughly as good as FSRS-4.5, no better.** MEASURED, and directly
  relevant at 84-252 cards.

### 3b. SM-2 as used by Anki

**Original SM-2** ([SuperMemo, super-memory.com](https://super-memory.com/english/ol/sm2.htm),
Wozniak 1987):

- **State per item:** repetition number `n`, E-Factor `EF` (starts 2.5, floor 1.3), interval `I`.
- **Grade scale: 0-5.** Verbatim: "5 - perfect response, 4 - correct response after a hesitation,
  3 - correct response recalled with serious difficulty, 2 - incorrect response; where the correct
  one seemed easy to recall, 1 - incorrect response; the correct one remembered, 0 - complete
  blackout."
- **Intervals:** `I(1):=1, I(2):=6, for n>2: I(n):=I(n-1)*EF`.
- **E-Factor update:** `EF' := EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))`, floor 1.3.
- **Failure:** "If the quality response was lower than 3 then start repetitions for the item from the
  beginning" — without resetting EF.
- **Assumption, stated as rule 1 of the algorithm:** "Split the knowledge into smallest possible
  items." SM-2 assumes atomic items, explicitly and in the spec itself.

**Anki's variant differs** ([Anki FAQ](https://faqs.ankiweb.net/what-spaced-repetition-algorithm)):

- **4 buttons, not 6**, with only one failing choice (Again / Hard / Good / Easy).
- Configurable learning steps instead of the fixed 1-day-then-6-days: "SM-2 defines an initial
  interval of 1 day then 6 days. With Anki, you have full control over the length of the initial
  learning steps."
- Late reviews credited: "Answering cards later than scheduled will be factored into the next
  interval calculation, so you receive a boost to cards that you were late in answering but still
  remembered."
- "Successive failures while cards are in learning do not result in further decreases to the card's
  ease."

**Anki SM-2 tunables and their defaults** ([Anki manual, Deck Options](https://docs.ankiweb.net/deck-options.html)):
Starting Ease 2.50 ("answering **Good** on subsequent reviews will increase the delay by
approximately 2.5x"); Easy Bonus 1.30; Hard Interval 1.20 ("a card with a 10-day interval will be
given 12 days"); New Interval 0.00 (Again resets the interval to zero, then the 1-day Minimum
Interval applies); Interval Modifier 1.00; Maximum Interval 100 years; Minimum Interval 1 day.

**State per card in Anki's SM-2:** ease factor (default 2.50), current interval, due date, repetition
/ lapse counters, card queue state.

**What it assumes:** the same atomicity assumption as original SM-2, plus that a single ease
multiplier captures item difficulty. Known failure mode the community named **"ease hell"** —
repeated lapses drive EF to the 1.3 floor and the card never escapes short intervals. The Anki manual
says FSRS does not have this problem: "(Re)learning steps of 1 day or greater are not recommended
when using FSRS. The main reason they were popular with the legacy SM-2 algorithm is because
repeatedly failing a card after it has graduated from the learning phase could reduce its ease a lot,
leading to what some people called 'ease hell'. This is not a problem that FSRS suffers from."

SM-2 does not appear in the current srs-benchmark results table (it was present in earlier revisions
and has since been dropped from the published table; the runner still supports `--algo SM2`).
**NOT ESTABLISHED**: a current head-to-head SM-2 vs FSRS-6 number from the maintained benchmark. The
Anki FAQ asserts, without attached data on that page, that "FSRS aims to learn your memory patterns
and schedule reviews more efficiently than SM-2" and requires fewer reviews for equivalent retention.

### 3c. Leitner boxes

**Provenance:** proposed by German science journalist Sebastian Leitner in his 1972 book *So lernt
man lernen*. There is **no canonical algorithmic specification** the way SM-2 and FSRS have one — it
is a physical filing procedure that software has since formalised in many incompatible ways. I am
flagging this: every "Leitner spec" you find online is somebody's reconstruction. Treat interval
choices as a design decision you own, not as a spec you implement.

**State per item:** a single small integer — the box number. Typically 1-5. Optionally a due date.
That is it: **one integer per item.**

**Grade scale a review must supply:** binary. Correct or incorrect. Nothing finer is used.

**Rules:** correct → promote one box. Incorrect → demote to box 1 (the classic rule; some variants
demote by one box only). Each box has a fixed review frequency, expanding across boxes.

**What it assumes:** that a fixed, item-independent interval ladder is good enough; that item
difficulty is expressed only through where an item settles on the ladder, not through per-item
parameters; and that a binary grade is sufficient signal. It makes **no memory-model assumption at
all**, which is precisely why it is immune to the calibration problems in §1 — there is nothing to
mis-calibrate.

**Note for the decision:** WaniKani (§1g) is a Leitner ladder with 8 stages (4h, 8h, 1d, 2d, 1w, 2w,
1mo, 4mo) and it is the only working precedent found for one-schedule-many-question-types. That is
not a coincidence: a fixed ladder has no per-item memory model to corrupt with heterogeneous grades.

### 3d. Side-by-side

| | FSRS-6 | Anki SM-2 | Leitner |
| --- | --- | --- | --- |
| State per item | 2 floats (S, D) + due/last-review | ease factor + interval + due + counters | 1 integer (box) |
| Grade scale | 4 (Again/Hard/Good/Easy) | 4 in Anki (6 in original SM-2) | 2 (right/wrong) |
| Needs elapsed time? | Yes | Yes (late-review credit) | No |
| Fitted to user? | Yes, 21 params, needs "a few hundred" reviews minimum | No, hand-tuned constants | No |
| Item assumption | atomic, one retrieval task, one scalar difficulty | atomic ("smallest possible items"), one ease multiplier | none |
| Degrades gracefully with little data? | Poorly — defaults ≈ FSRS-4.5-level accuracy | Yes | Yes, trivially |
| Handles heterogeneous card types under one schedule? | No, out of model | No | Structurally yes — see WaniKani |

## 4. Implementations (JS/TS)

All package metadata below is from the **npm registry API** and the **GitHub API**, queried
2026-08-23. Gzip sizes are **MEASURED-BY-ME**: I downloaded the published tarball and ran `gzip -9`
on the shipped dist file. "unpacked" is npm's own `dist.unpackedSize` (whole tarball, includes
sourcemaps and typings, so it overstates what ships to a browser).

### 4a. FSRS

**`ts-fsrs` — the one to use.**

| | |
| --- | --- |
| Latest stable | **5.4.1**, published 2026-05-22 |
| Prerelease | 6.0.0-beta.7, 2026-08-18 |
| Algorithm version | **FSRS-6.0** — see the trap below |
| License | MIT |
| Runtime dependencies | **none** |
| Browser, no native/WASM | **Yes** — pure JS. ESM, CJS and UMD builds shipped. No `.wasm`, no `.node`, zero `require()` in the CJS bundle. |
| Size | ESM 60,657 B raw / **13,357 B gzipped**. CJS 61,882 B / 13,558 B gz. UMD 71,341 B / 14,707 B gz. (npm unpackedSize 700,470 B is dominated by sourcemaps.) |
| Repo | https://github.com/open-spaced-repetition/ts-fsrs |
| Maintenance | 763 stars, 71 forks, **5 open issues**, repo pushed 2026-08-23, last commit 2026-06-25, not archived, 93 published versions since 2023-03-05 |

Two things worth knowing:

1. **THE VERSION TRAP.** `ts-fsrs` **5.x implements FSRS-6**, not FSRS-5. The library's version number
   and the algorithm's version number are unrelated and currently off by one. I verified this two
   ways in the published 5.4.1 tarball: the bundle contains
   a `FSRSVersion` string built as "v<pkg version> using **FSRS-6.0**", and `default_w` is the exact 21-element FSRS-6
   default array from `fsrs-rs` (`0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 1e-3,
   1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
   FSRS6_DEFAULT_DECAY`). It is easy to conclude "ts-fsrs 5 = FSRS-5, therefore stale" and be wrong.
   MEASURED-BY-ME from the tarball.
2. **`ts-fsrs` has no optimizer.** Its exports cover scheduling only — `FSRS`, `FSRSAlgorithm`,
   `forgetting_curve`, `generatorParameters`, `clipParameters`, `createEmptyCard`, `Rating`, `State`
   and so on. There is no `optimize`, `train`, or `computeParameters` in the type definitions.
   MEASURED-BY-ME from `dist/index.d.ts`. **Parameter fitting requires a separate WASM or native
   package.** For an 84-item collection this is arguably fine (§3a: you will not have enough reviews
   to fit 21 parameters anyway), but it should be a conscious choice, not a surprise.

**Optimizer packages** (only needed if you want fitted rather than default parameters):

| Package | Version / date | License | Runs in browser? | Notes |
| --- | --- | --- | --- | --- |
| `fsrs-browser` | 6.6.0, 2026-06-13 | **BSD-3-Clause** (not MIT) | Yes, **via WASM** | "FSRS for the browser, including Optimizer and Scheduler". 387,173 B unpacked. 54 stars, last commit 2026-06-14. The only browser-capable optimizer. |
| `@open-spaced-repetition/binding` | 0.5.0, 2026-06-06 | MIT | **No** — Node/WASI | "Node.js bindings for the FSRS Optimizer implemented in Rust and compiled to WASI." Lives in the ts-fsrs repo. 111,657 B unpacked. |
| `fsrs-rs-nodejs` | 0.9.1, 2026-08-20 | MIT | **No** — native | napi bindings to fsrs-rs; platform-specific sub-packages (darwin-arm64, linux-x64-gnu/musl, win32, android). 13 stars but actively released. |

**FSRS packages to avoid:**

| Package | Version / date | Why not |
| --- | --- | --- |
| `fsrs.js` | 1.2.2, **2024-01-21** | MIT, zero deps, but ~2.5 years stale and pre-dates FSRS-5. No repository field in the manifest. Implements a superseded algorithm version. |
| `femto-fsrs` | 2.0.0, 2025-05-03 | MIT, 18,076 B, but self-described as "a minimalistic implementation of **FSRS 5**" — one algorithm generation behind what Anki ships. No repository field. |
| `@squeakyrobot/fsrs` | 1.0.0, 2025-12-08 | MIT, but exactly **one published version, ever**, and describes itself as "FSRS v4.5 algorithm with optional v6 support". No track record. |

### 4b. SM-2

**`supermemo`** — https://github.com/VienDinhCom/supermemo

| | |
| --- | --- |
| Latest | 2.0.23, published 2025-03-20 |
| License | MIT |
| Runtime dependencies | none |
| Browser, no native/WASM | Yes — a single pure function, ESM + CJS builds |
| Size | 1,292 B raw / **497 B gzipped**. npm unpackedSize 12,812 B. |
| Maintenance | 338 stars, 24 forks, **0 open issues**, last commit 2025-03-28 (~17 months before this research). Not archived. |

The whole library is one function. Its API is
`supermemo({interval, repetition, efactor}, grade: 0|1|2|3|4|5) => {interval, repetition, efactor}`,
implementing `I(1)=1, I(2)=6, I(n)=round(I(n-1)*EF)`, the standard
`EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02))` update with the 1.3 floor, and reset-to-1-day on
`grade < 3`.

**Important:** this is **original SM-2 with the 0-5 grade scale**, not Anki's 4-button variant. It has
no learning steps, no easy bonus, no hard multiplier, no late-review credit, no fuzz, no leech
handling. If you want Anki's SM-2 behaviour you are writing it yourself. Given the function is 30
lines, "adopt the library" and "write it yourself" are nearly the same decision here — the value of
the package is that someone else already got the formula right.

Being stale is not a real risk for SM-2: the algorithm was frozen in 1987 and there is nothing to
update.

### 4c. Leitner

**There is no maintained JS/TS Leitner library worth adopting.** The npm search surfaces:

| Package | Version / date | Verdict |
| --- | --- | --- |
| `leitner-box` | 1.0.6, 2024-03-25 | MIT, but **depends on `ramda`** — a large runtime dependency for what is a box counter. 100,111 B unpacked. Stale ~2.4 years. |
| `lt-spaced-repetition-js` | 2.0.6, **2021-12-06** | Abandoned, ~4.7 years stale. |
| `@leitner/common` | 1.0.4, 2022-01-01 | No description, abandoned. |

This is the correct state of the world rather than a gap: a Leitner scheduler is one integer per item
plus a promote/demote rule plus a fixed interval table. **Write it yourself in about twenty lines.**
Taking a `ramda` dependency to avoid writing those twenty lines is a bad trade for a PWA.

### 4d. Summary table

| Library | Algorithm | Version / date | License | Deps | Browser, no WASM/native | Gzipped | Maintenance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`ts-fsrs`** | **FSRS-6** | 5.4.1, 2026-05-22 | MIT | none | **Yes** | **13.4 KB** | Active (pushed 2026-08-23, 763★, 5 open issues) |
| `fsrs-browser` | FSRS-6 + optimizer | 6.6.0, 2026-06-13 | BSD-3-Clause | none | Yes, WASM | 387 KB unpacked | Active (2026-06-14) |
| `@open-spaced-repetition/binding` | FSRS optimizer | 0.5.0, 2026-06-06 | MIT | none | No (Node/WASI) | 112 KB unpacked | Active |
| `fsrs-rs-nodejs` | FSRS-6 | 0.9.1, 2026-08-20 | MIT | none | No (native) | 27 KB unpacked | Active |
| `supermemo` | original SM-2 | 2.0.23, 2025-03-20 | MIT | none | Yes | **0.5 KB** | Quiet but stable (2025-03-28, 338★, 0 open issues) |
| `fsrs.js` | FSRS ≤v4 | 1.2.2, 2024-01-21 | MIT | none | Yes | — | **Stale, avoid** |
| `femto-fsrs` | FSRS-5 | 2.0.0, 2025-05-03 | MIT | none | Yes | — | Behind current, avoid |
| `leitner-box` | Leitner | 1.0.6, 2024-03-25 | MIT | `ramda` | Yes | — | Stale; write your own instead |

## Open questions and things I could not establish

Listed plainly rather than smoothed over.

1. **No direct evidence on the crux question.** Nobody has measured what happens when one FSRS-
   scheduled item is drilled by rotating card types of escalating difficulty. No paper, no benchmark
   variant, no maintainer statement, no forum thread that measures it. Everything in §1 is either
   (a) documented mechanism, (b) measured evidence about the *adjacent* question of per-subgroup
   parameters, or (c) unanimous but unmeasured expert advice. I did not manufacture an effect size.
2. **No independent check on my load numbers.** §2c is my own simulation. Anki has a built-in
   workload simulator but its output is per-user and unpublished, and I found no published FSRS
   simulator runs for closed collections at 84-252 cards. The optimistic and pessimistic variants
   differ by ~3× in year-1 total presses, which is the honest width of the uncertainty band.
3. **No current SM-2 vs FSRS-6 head-to-head from the maintained benchmark.** SM-2 has been dropped
   from the published srs-benchmark results table (the runner still supports `--algo SM2`). The Anki
   FAQ's claim that FSRS "requires fewer reviews to achieve equivalent retention" is asserted on that
   page without attached data. Older FSRS-vs-SM2 comparisons exist but are against superseded FSRS
   versions.
4. **Source disagreement, unresolved: which FSRS version the docs describe.** The Anki manual's
   deck-options page refers to FSRS-5 in places while shipped Anki 26.08 bundles fsrs-rs 6.6.1
   (FSRS-6). The manual lags the code. I have gone with the code.
5. **The sibling-burying rationale is not stated by Anki.** The manual describes only the mechanism
   ("prevent the card's siblings from being shown in the same session"). The universal community
   explanation — that a sibling in the same session leaks the answer and corrupts the grade — is not
   in the manual. I could not find a maintainer statement giving the rationale. Plausible, widely
   believed, unsourced.
6. **FSRS-7 timing unknown.** FSRS-7 is in the benchmark with 35 parameters and better metrics, but
   is in no shipped Anki release as of 26.08.1. I found no roadmap or dated commitment. If it lands,
   `ts-fsrs` would need to follow it.
7. **Whether WaniKani's min-over-card-types rule is *better* than separate schedules.** WaniKani's
   design exists and works commercially, but I found no comparative study of it against a
   split-card design. Its existence is evidence of feasibility, not of superiority.
8. **Anki's "20 new → ~200 reviews/day" is unsourced.** The manual gives no derivation and no data.
   I have used it only as the thing to explain away (§2a), not as a load estimate.

## Sources

Primary, in rough order of weight.

**FSRS / open-spaced-repetition**
- srs-benchmark — https://github.com/open-spaced-repetition/srs-benchmark (benchmark tables, algorithm-family descriptions, metric definitions, dataset provenance)
- FSRS algorithm wiki — https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm (formulas; note the old `fsrs4anki/wiki` URL now redirects here)
- fsrs-rs — https://github.com/open-spaced-repetition/fsrs-rs (Rust reference; `src/inference.rs` holds `DEFAULT_PARAMETERS` and `FSRS6_DEFAULT_DECAY = 0.1542`; releases v6.6.0 2026-06-06)
- py-fsrs 6.3.2 — https://pypi.org/project/fsrs/ (Python reference implementation; used for the §2c simulation)
- fsrs4anki issue #537, "[Feature Request] Optimize scheduling based on Card Types (not Note Types)" — https://github.com/open-spaced-repetition/fsrs4anki/issues/537 (maintainer L-M-Sherlock's recommendation to split card types into separate decks/presets)
- ts-fsrs — https://github.com/open-spaced-repetition/ts-fsrs
- fsrs-browser — https://github.com/open-spaced-repetition/fsrs-browser

**Anki**
- Anki manual, Deck Options — https://docs.ankiweb.net/deck-options.html (desired retention, workload guidance, burying options, optimizer health check, SM-2 tunables, simulator)
- Anki manual, Studying — https://docs.ankiweb.net/studying.html (siblings and burying)
- Anki FAQ, "What spaced repetition algorithm does Anki use?" — https://faqs.ankiweb.net/what-spaced-repetition-algorithm (Anki SM-2 vs original SM-2)
- Anki releases — https://github.com/ankitects/anki/releases (26.08 released 2026-08-01, 26.08.1 2026-08-05; 26.08 notes: "Update to fsrs-rs 6.6.1")
- Anki manual source — https://github.com/ankitects/anki-manual (`src/deck-options.md`, for exact wording)

**SuperMemo**
- SM-2 specification — https://super-memory.com/english/ol/sm2.htm (grade scale, interval and E-Factor formulas, "Split the knowledge into smallest possible items")
- Minimum information principle — https://supermemo.guru/wiki/Minimum_information_principle

**WaniKani**
- WaniKani API documentation — https://docs.api.wanikani.com/ (Assignment `srs_stage`; Review `incorrect_meaning_answers` / `incorrect_reading_answers`, `starting_srs_stage`, `ending_srs_stage`)
- WaniKani Knowledge, SRS Stages — https://knowledge.wanikani.com/wanikani/srs-stages/ (stage intervals, demotion formula)

**Community (clearly secondary, used only where labelled ASSERTED)**
- Anki forums, "FSRS parameters for different card types" — https://forums.ankiweb.net/t/fsrs-parameters-for-different-card-types/46520
- Anki forums, "When/How to separate presets for FSRS" — https://forums.ankiweb.net/t/when-how-to-separate-presets-for-fsrs/45317
- Anki forums, "FSRS And different level of difficulty" — https://forums.ankiweb.net/t/fsrs-and-different-level-of-difficulty/48511

**Package/repo metadata**
- npm registry API (registry.npmjs.org) and GitHub API, both queried 2026-08-23, for every version, date, license, dependency and maintenance figure in §4. Gzip sizes measured locally from published tarballs.
