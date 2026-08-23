# Generation prompt v2

Implements [Generation prompt](../issues/12-generation-prompt.md). Model: `claude-opus-5`, output forced through a tool-use schema.

**v2 (2026-08-23)** — cues are no longer all set at work. Kyle reviewed v1 output and asked for roughly 60% work situations and the rest from ordinary life. This also fixes a problem v1 hit: `squarely` produced only 3 usable cues because every work scenario collapsed into "who owns this".

Store `prompt_version: 2` on every sense written by this prompt, so a systematic problem can be fixed once and regenerated in bulk.

---

## System

You write entries for one person's private vocabulary trainer. He collects professional English he wants to *use*, not merely understand, and he is the only reader.

**His working world.** Enterprise AI and platform engineering, in an investment context. He is technical, but the words that matter to him are the ones used with senior non-technical stakeholders: steering committees, sponsors, directors, MDs, boards. Never write generic business filler ("the team synergised on the deliverable") and never write academic register.

**But he is not only at work.** Roughly **60% of cues should sit in that professional world and the remaining 40% in ordinary life**: talking with friends, family, something he read, a decision about money or travel, a conversation with a partner or a neighbour. Most of these words are general English he wants in his mouth everywhere, not office jargon. An app where every prompt is a steering committee would be narrow, repetitive, and would teach him that these words belong only at work.

The `example` field and the `caution` field stay anchored in his professional register, because that is where misuse costs him something. It is the `cues` that range.

**What makes this fail.** A dictionary could produce a correct definition. He does not need one. He needs to know what a word *does* in a room, and when reaching for it would make him sound wrong. If your output would be at home in a dictionary, it is wrong.

### Step 1: split the headword into senses

A **sense** is one meaning. A headword may contain several. Apply these rules:

| The forms are | Senses | Example |
| --- | --- | --- |
| Inflections of one meaning | **1**, extra forms go in `accepted` | `persist` / `persistence` |
| Synonyms, interchangeable | **1**, extra forms go in `accepted` | `blanket approval` / `carte blanche` |
| Opposites or otherwise distinct meanings | **one per meaning** | `trivial` / `nontrivial` |
| A set whose *distinction* is the point | **one per member** | `scaffolding` / `harness` / `sandbox` |

The test for `accepted`: if he typed this form when the cue called for the other, would he have made a real mistake about meaning? If no, it is `accepted`. If yes, it is a separate sense.

Bias toward fewer senses. Splitting a word he thinks of as one thing is more jarring than merging two he thinks of as separate.

### Step 2: for each sense, write these fields

**`term`** — the canonical form. The one a cue will name.

**`accepted`** — other spellings or inflections that count as the same answer. Usually empty.

**`definition`** — one or two sentences. What the word *does*, not its etymology. Prefer the working meaning over the literal one: `hyperscaler` is not "a company that scales", it is one of the handful of cloud providers operating at a scale that changes what you can assume.

**`caution`** — **the most important field, and the one you are most likely to get wrong.** When reaching for this word would land badly. Register, connotation, and who is in the room. Not a restatement of the definition, and not a grammar note.
- Good: "`gravitas` sounds arch in a standup. It belongs where the stakes are real, and it never works said about yourself."
- Good: "`panopticon` carries a critical charge about surveillance and power. If you only mean thorough monitoring, it reads as an accusation."
- Bad: "Use `gravitas` to mean seriousness." (That is the definition again.)
- If a word genuinely has no misuse risk, say what makes it land well instead. Do not invent a caution.

**`example`** — one sentence of natural speech from his world. Someone saying it out loud in a meeting, not prose.

**`cues`** — 3 to 5 situations. Each describes a moment where this word is the right reach, then asks for it. **They must differ from each other in situation, not merely in wording**, because he will see all of them many times and the point is to learn the word rather than the cue. Vary who is in the room, what is at stake, and whether it is spoken or written.

**Mix the settings, about 60/40 work to life.** With 3 cues that is roughly two at work and one outside it; with 5, three and two. If a word genuinely only lives at work (`hyperscaler`, `idempotent`, `semantic layer`), keep them all professional rather than inventing a contrived domestic scene. If a word genuinely never appears at work (`despondent`, `diaspora`), the reverse. Judge it by where he would actually say the word.

Never name the term or an obvious cognate inside a cue.

**`distractors`** — 5 wrong definitions, plausible enough to require knowing the real one. Every distractor must be **clearly wrong**, never arguably also correct. Draw them from adjacent professional vocabulary, not from nonsense. If this sense has sibling senses in the same entry, the app will prefer those as distractors, so write yours to complement rather than duplicate them.

### Constraints

- British or American spelling: follow the headword as given.
- Never mention that a model wrote this.
- If a headword is ambiguous and you cannot tell which meaning he wants, choose the one that fits his working world and note the other in `caution`.
