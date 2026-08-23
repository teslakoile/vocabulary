# Rewrite brief: plain definitions, matched distractors, word distractors

You are rewriting three fields on each sense of a personal vocabulary corpus.
You touch nothing else. `caution`, `example`, and `cues` stay exactly as they are.

## Why this rewrite exists

The corpus was generated under a rule that said "never a dictionary gloss",
because `gravitas` is not "seriousness". The rule was right and the execution
overshot it. Definitions now avoid the plain word entirely, open with an
abstract paraphrase, and add a second sentence explaining their own nuance.
94% of the 95 definitions carry that second sentence and 43% use a colon,
a semicolon, or a dash aside before the reader reaches the meaning.

The owner read them and said they sound more complicated than a standard
straightforward definition. He is right.

The connotation work is not lost. It already lives in the `caution` field,
which is staying, and which does that job better than the definition did.

## Field 1: `definition`

**One sentence. 90 characters or fewer. Plain words.**

- State what the word means. If an ordinary English word carries the meaning,
  use it. `bolster` is allowed to say "strengthen".
- No colon, no semicolon, no parenthetical, no dash aside.
- No sentence about the definition itself. Nothing that starts "The emphasis
  is", "What matters is", "The point is", "It describes both".
- No second sentence. If you are certain a sense cannot be stated in one,
  add `"needs_two": true` to that sense and write two, and expect to justify it.
  Fewer than 1 in 4 senses should need this, and most should need none.

Calibration, approved by the owner:

| Word | Rejected | Approved |
| --- | --- | --- |
| `bolster` | To add support to something that already stands but is not standing well enough on its own: a case, a claim, a balance, morale. What was there stays; you are putting weight behind it. | To strengthen something that is already there but is not strong enough on its own. |
| `esoteric` | Understood by a small circle and effectively closed to everyone else. The barrier is being on the inside rather than being clever: the knowledge assumes a background most people have no reason to have. | Understood by only a small group, because it assumes background that most people lack. |
| `build that muscle` | To develop a capability by doing the thing repeatedly, on the view that it grows with practice rather than being something a team either has or lacks. The phrase promises reps, not a training course. | To build a skill through repeated practice instead of one-off training. |

Plain does not mean generic. `hyperscaler` still means a company that runs
compute at planetary scale, and not "a large company". Say the real thing in
ordinary words.

## Field 2: `distractors`

Five wrong definitions for a multiple-choice card that shows the word and
asks the reader to pick its meaning.

- Same register and same shape as the new `definition`. One sentence each.
- Each must be a genuine definition of some *other* concept. Never nonsense,
  never a scrambled version of the right answer.
- None may be defensible as a reading of the target word.
- **Length rule.** Count the characters in your new `definition`. At least two
  distractors must be at or above that count, and at least two must be below.
  This exists because the previous corpus made the correct answer the longest
  of six options in 100% of senses, so the card could be scored without knowing
  the word. The validator enforces this and will reject the batch.

## Field 3: `word_distractors`

Five wrong *words* for a new card type that shows the definition and asks the
reader to pick the word.

- Take all five verbatim from `REFERENCE.md`, matching the `**term**` spelling
  exactly. Nothing invented, nothing from outside that file.
- Never the target term. Never another sense of the same headword.
- **None may be a defensible answer to your new definition.** This is the rule
  that matters. `esoteric` and `obscure` are close enough that a short plain
  definition of one can be argued to fit the other, so they must not appear in
  each other's option list. Read the gists in `REFERENCE.md` and check.
- Prefer words that are wrong for a clear reason: a different domain, a
  different part of speech, an opposite. Avoid words a reader could talk
  themselves into.

## Output

For each entry in your input file, write
`.scratch/vocab-pwa/corpus/rewrite/<file>` where `<file>` is the `file` value
from the input, with exactly this shape:

```json
{
  "headword": "bolster",
  "senses": [
    {
      "term": "bolster",
      "definition": "To strengthen something that is already there but is not strong enough on its own.",
      "distractors": ["...", "...", "...", "...", "..."],
      "word_distractors": ["eschew", "fan-out", "diaspora", "idempotent", "top brass"]
    }
  ]
}
```

Match `headword` and `term` exactly as given in your input, because the merge
step joins on those two fields.

## Before you finish

Run this on your own output and fix anything it reports:

```bash
node scripts/validate-rewrite.mjs .scratch/vocab-pwa/corpus/rewrite/<your files>
```

Report back: how many senses you wrote, how many needed two sentences and why,
and any word pair you judged too close to use.
