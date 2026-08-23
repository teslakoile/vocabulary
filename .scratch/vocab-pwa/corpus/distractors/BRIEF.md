# Distractor repair

## The bug

Every recognition card is a multiple choice: one correct definition and five wrong
ones. The corpus as generated has short fragment distractors against two-sentence
definitions, so **the correct answer is the longest option in 100% of cases**. You
could score full marks without knowing a single word. That makes the whole card type
worthless.

## The fix

Rewrite all five distractors for each sense so that length carries no information.

**The hard rule, which a script enforces:**

- At least **2 distractors at or above** the definition's character count.
- At least **2 distractors below** it.
- The fifth can go either way.

So a 168-character definition needs at least two distractors of 168+ characters and
at least two under 168. Aim to spread them, roughly 60% / 85% / 105% / 130% / 150%
of the definition's length, rather than clustering at two extremes.

**Match the shape, not just the length.** The definitions are built as a core
statement plus a sharpening clause: *"One of the handful of cloud providers operating
at a size where compute, storage and networking are effectively unlimited to you. It
names a class of vendor, not a company that happens to be growing fast."* A long
distractor should have that same two-part build. Padding a short fragment with filler
words is obvious and fails the point of the exercise.

**Punctuation follows the definition.** Definitions end with a full stop, so
distractors do too. Consistent punctuation across all six options, since an odd one
out is another tell.

## What makes a good distractor

- **Clearly wrong, never arguably also correct.** This is the constraint that matters
  most. If a reasonable person could defend the distractor as a second meaning of the
  word, it is a broken card, not a hard one.
- **Drawn from adjacent professional vocabulary**, not nonsense. The reader's working
  world is enterprise AI and platform engineering in an investment context.
- **Wrong in an interesting way.** The best distractor is a real concept that sits
  next to the word and is genuinely a different thing: the near miss someone would
  make if they half-knew the term.
- **Do not reuse the sibling senses' definitions.** Where an entry has several senses,
  the app already prefers real siblings as distractors, so yours must add to that set
  rather than duplicate it.
- **Never name the term or an obvious cognate** inside a distractor.

You may keep a current distractor if it is good and already the right length, but most
will need rewriting or extending.

## Output

One file per input entry, at
`.scratch/vocab-pwa/corpus/distractors/NN-slug.json`, using the **same NN-slug name as
the source file** shown in your input. Write each file the moment you finish that entry.

```json
{
  "headword": "hyperscaler",
  "senses": [
    { "term": "hyperscaler", "distractors": ["...", "...", "...", "...", "..."] }
  ]
}
```

`headword` and `term` must match the input exactly: they are the merge keys. Senses in
the same order as the input. Nothing else in the file, no markdown fence, no prose.
