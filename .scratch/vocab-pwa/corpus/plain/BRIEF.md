# Plain wording brief: glosses and cautions

You are rewriting a personal vocabulary corpus so it reads plainly. The owner
said the wording is too complicated. Plain English, everyday words, the way a
good learner's dictionary talks. No figures of speech, no clever phrasing.

For every sense in your input, write four things. Do not touch `example` or
anything else.

## 1. `gloss` (new)

The dictionary-plain meaning in 2 to 6 words, 40 characters or fewer. It is what
the app shows after "*bolster* means ...".

- Use the form a dictionary uses for that part of speech:
  verb: `to strengthen`; noun: `a huge, basic change`; adjective: `easy to ignore`.
- Never use the headword itself or a word from the same root.
- Pick the most common everyday meaning. Precision over nuance.

Examples: `bolster` → `to strengthen`; `exacerbate` → `to make worse`;
`eschew` → `to avoid on purpose`; `verbose` → `using too many words`;
`hyperscaler` → `a giant cloud provider`; `top brass` → `the most senior people`.

## 2. `gloss_distractors` (new)

Exactly 3 wrong glosses, shown next to the right one as a 4-option question.

- **Same grammatical form as the gloss.** If the gloss starts with "to", all 3
  start with "to". If it is a noun phrase, all 3 are noun phrases. A different
  form gives the answer away.
- Each is a plain, real meaning of some other concept, 2 to 6 words, 40
  characters or fewer.
- None may be arguable as a meaning of the target word. Wrong for a clear reason.
- If the entry has a sibling sense with the same form (for example `trivial` and
  `nontrivial`), use that sibling's gloss verbatim as one of the three.
- Length rule: at least 1 distractor at or above the gloss's character count,
  and at least 1 below it, so the answer never stands out by length.

## 3. `caution` (rewrite)

When not to use the word, or how it lands on people. Keep the same point the
current caution makes, said plainly.

- 1 or 2 sentences, 180 characters or fewer.
- No figures of speech or metaphors ("in gym clothes", "inflates on contact",
  "swallowed a style guide" are all out).
- No "it is not X, it is Y" constructions. Say the positive fact.
- No dashes used as asides, no semicolons.

Example, `tectonic shift`:
current: "It is an enormous word and it inflates on contact with quarterly news..."
plain: "Use it only for large, lasting change. Senior readers distrust it, because people often use it for ordinary news."

## 4. `definition` (usually unchanged)

Copy the current definition verbatim, unless it contains a figure of speech or
writerly phrasing (for example "big enough to rearrange the landscape", "never
got around to writing down"). Then rewrite it: one sentence, 90 characters or
fewer, plain words, no colon, semicolon, or dash. Set `"definition_changed": true`
on any sense you rewrote.

## Output

For each entry, write `.scratch/vocab-pwa/corpus/plain/<file>`:

```json
{
  "headword": "bolster",
  "senses": [
    {
      "term": "bolster",
      "gloss": "to strengthen",
      "gloss_distractors": ["to make worse", "to avoid on purpose", "to explain in detail"],
      "caution": "...",
      "definition": "..."
    }
  ]
}
```

Match `headword` and `term` exactly. Use scratch files named with your batch
number (for example `plain-b2-*.mjs`) because other agents share the scratchpad.

Then run and fix everything it reports:

    node scripts/validate-plain.mjs <your files>
