# Output contract

The generation prompt (`generate-entry.md`) says what to write. This says what shape to write it in.

Write **one JSON file** containing every entry in your batch. Nothing else in the file, no markdown fence, no prose.

```json
{
  "batch": 1,
  "prompt_version": 2,
  "entries": [
    {
      "headword": "scaffolding/harness/sandbox",
      "senses": [
        {
          "term": "scaffolding",
          "accepted": [],
          "definition": "Temporary structure that holds work up until the real thing can stand on its own. It is meant to come down.",
          "caution": "The word commits you to removal. Call something scaffolding and people will remember that you said it was temporary.",
          "example": "The manual review step is scaffolding. Once the classifier is calibrated it comes out.",
          "cues": [
            { "text": "You hardcoded a lookup to unblock a demo and want your tech lead to know it is not meant to survive.", "setting": "work" },
            { "text": "A sponsor asks why an automated pipeline still has a person in the middle of it.", "setting": "work" },
            { "text": "A friend is propping up a bookshelf with a stack of magazines until the brackets arrive.", "setting": "life" }
          ],
          "distractors": [
            "A permanent supporting layer other systems are built on",
            "A checklist followed at each stage of a project",
            "An outer shell that hides internal complexity",
            "A staged rollout to progressively larger groups",
            "A reference implementation others copy"
          ]
        }
      ]
    }
  ]
}
```

## Field rules

| Field | Type | Rule |
| --- | --- | --- |
| `headword` | string | **Exactly** as given in your list, character for character, including typos and slashes. This is Kyle's own text and the loader matches on it. |
| `senses` | array | 1 or more. Order matters: it becomes `position`. |
| `term` | string | Canonical form. Corrected spelling goes here, not in `headword`. |
| `accepted` | string[] | Other forms counting as the same answer. Usually `[]`. |
| `definition` | string | 1-2 sentences. |
| `caution` | string | Required. Never a restatement of the definition. |
| `example` | string | One sentence of natural speech. No surrounding quote marks. |
| `cues` | object[] | 3 to 5. Each `{ "text": ..., "setting": "work" | "life" }`. |
| `distractors` | string[] | Exactly 5. Definition-shaped fragments, not sentences. No trailing full stop. |

## Hard constraints the validator enforces

Your file is checked by a script before it reaches the database. These fail the batch:

1. `headword` not matching your assigned list verbatim, or a missing/duplicate headword.
2. Fewer than 3 or more than 5 cues on any sense.
3. Not exactly 5 distractors on any sense.
4. Any of `term`, `definition`, `caution`, `example` empty.
5. **The term, or an obvious cognate of it, appearing inside its own cue text.** The check is case-insensitive and stems crudely: for term `elucidate`, the strings `elucidat`, `lucid` are caught. Write around it.
6. A `setting` value other than `work` or `life`.
7. Duplicate `term` inside one entry.

## Aim for the mix, do not force it

Roughly 60% of all cues in your batch should be `work` and 40% `life`. This is a batch-level target, not a per-entry quota. A word that only lives at work (`idempotent`, `semantic layer`, `hyperscaler`) takes all-work cues; a word that never appears at work takes the reverse. Judge each word honestly and let the batch average land where it lands.
