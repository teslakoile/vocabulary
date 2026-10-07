---
name: refine
description: Turn the vocabulary app's backlog into practice-ready words. Use when Kyle says /refine, "refine my words", "process the backlog", or asks to add or fix words in the vocabulary bank. Pulls live content, writes senses for captured words, rewrites flagged ones, validates the whole corpus, and publishes through the app's API.
---

# Refine the vocabulary backlog

Kyle captures words on his phone. They land in the app as `bare` and stay out of
practice. He can also flag a word from a card's answer side when its wording
looks wrong. This session turns both into finished, validated content and
publishes it. D1 is where content lives; the repo holds a snapshot of it.

## Steps

1. **Pull.** Run `node scripts/pull-corpus.mjs`. It writes every live entry into
   `.scratch/vocab-pwa/corpus/raw/` and the backlog into
   `.scratch/vocab-pwa/corpus/backlog.json`. If it reports changed files, run
   `git diff` on them: those are edits Kyle made in the app. Keep them.
2. **Read the backlog.** Each item says whether it was `captured` (no content
   yet) or `flagged` (content exists, `flag_note` says what is wrong), plus the
   `file` to write. Show Kyle the list.
3. **Ask only what you cannot settle.** For a captured word with several common
   meanings, ask which one he means, using his `capture_note` as the first clue.
   Do not ask about wording; that is your job.
4. **Write content.** For a captured word, create the raw file named in the
   backlog with its `id` and `headword` exactly as given, and tag it. For a
   flagged word, change only what the note points at. Follow the field rules
   below.
5. **Assign wrong words.** Run `node scripts/assign-word-distractors.mjs`. If a
   new word is close in meaning to an existing one, add the pair to `BLOCKED` in
   that script first, so neither is offered as a wrong answer for the other.
6. **Validate.** Run `node scripts/validate-corpus.mjs --complete` and fix every
   failure. Warnings about cognate leaks are usually false positives; read them.
7. **Publish.** Run `node scripts/publish-corpus.mjs --dry`, check the list,
   then run it without `--dry`. Expect other words to appear: adding a word
   rebalances wrong-word options across the corpus. Schedules are untouched.
8. **Commit** the raw files and any script change on a branch, open a PR, and
   tell Kyle what was added or fixed.

Tags are published by `publish-corpus.mjs` through the entry's own endpoint, and
`pull-corpus.mjs` writes them back into the raw files. Run the pull first and
the publish before pulling again, or tags you wrote locally are overwritten by
what is live.

The scripts read `VOCAB_URL` and `AUTH_SECRET` from `.secrets.local`. No
Cloudflare login is needed.

## Field rules

Write plain English, the way a learner's dictionary talks. No figures of speech,
no clever phrasing, no "it is not X, it is Y". The owner's standing complaint is
wording that is more complicated than it needs to be.

| Field | Rule |
| --- | --- |
| `tags` | At the top of the entry, beside `headword`, not inside a sense. One or both of `general` (everyday and workplace English) and `tech` (software, data, and AI terms). Use both only when a word is common English and also a term of art, such as `adversarial`. The app filters practice and browse on these. |
| `term` | The canonical form. Fix spelling here, never in `headword`. |
| `accepted` | Other forms that count as correct when typed, often `[]`. |
| `gloss` | The meaning in 2 to 6 plain words, 40 characters or fewer, dictionary form: `to strengthen`, `a huge, lasting change`, `easy to ignore`. Never reuse the headword or its root. |
| `gloss_distractors` | Exactly 3 wrong glosses in the **same grammatical form** as `gloss`, 2 to 6 words each. At least 1 at or above the gloss's length and 1 below. None may be arguable. |
| `definition` | One sentence, 90 characters or fewer, no colon, semicolon, or dash. |
| `distractors` | Exactly 5 wrong definitions, one sentence each. At least 2 at or above the definition's length and 2 below. |
| `caution` | When not to use the word, or how it lands. 1 or 2 sentences, 180 characters or fewer. |
| `example` | One natural sentence of speech, no surrounding quote marks. |
| `cues` | 3 to 5 situations, each `{ "text", "setting": "work" \| "life" }`, about 60% work across the corpus. Never name the term or an obvious cognate. Each cue must show the meaning: see the cue test below. |
| `word_distractors` | Leave `[]`. The assigner fills it. |
| `prompt_version` | `4`. |

## Cue test

The production card shows "Type the word that fits." and one cue, nothing else.
Read each cue alone and ask what Kyle would type. A cue fails when:

- It asks an open question and gives no detail about the meaning, such as
  "A sponsor asks what is missing from the strongest candidate."
- It leads to a different, more common word. "Money sent home" leads to
  `remittances`, not `diaspora`.
- It asks for a different part of speech. "What the claim is missing" asks for a
  noun, so it does not lead to `substantiate`.
- It fits another word in the bank at least as well, and nothing in it tells the
  two apart.

Fix a failing cue by adding the detail that defines the word, or by saying what
kind of expression is wanted: "the verb for", "the informal two-word phrase for".

A sense is one meaning. Split a headword into several senses only when the forms
differ in meaning, such as `trivial` and `nontrivial`. At most 6 senses per entry.
A published entry cannot lose senses: removing one would delete its review
history, and the API refuses.

## Worked example

```json
{
  "id": "e_7e760c5f-0cc1-4312-9188-4694d7021dbd",
  "headword": "load-bearing",
  "capture_note": "heard in design review",
  "tags": ["tech"],
  "senses": [{
    "term": "load-bearing",
    "accepted": [],
    "gloss": "holding up other things",
    "gloss_distractors": ["purely for show", "ready to be removed soon", "added at the last minute"],
    "definition": "So important to a system that removing it would make other parts fail.",
    "caution": "Use it only when other work truly depends on the thing. Said of minor details, it sounds dramatic.",
    "example": "That spreadsheet is load-bearing, so nobody touches it until finance has a replacement.",
    "cues": [
      { "text": "A script everyone calls ugly turns out to feed three reports, and you warn a new hire not to delete it.", "setting": "work" },
      { "text": "You explain why one clause in a contract cannot be dropped without the deal falling apart.", "setting": "work" },
      { "text": "A friend wants to knock down a wall at home and you think the ceiling depends on it.", "setting": "life" }
    ],
    "distractors": [
      "Added late to a plan without much thought.",
      "Kept only because nobody has checked whether anyone still uses it at all today.",
      "Easy to swap out.",
      "Built as a quick test that was never meant to last for more than a week.",
      "Visible to customers."
    ],
    "word_distractors": [],
    "prompt_version": 4
  }]
}
```
