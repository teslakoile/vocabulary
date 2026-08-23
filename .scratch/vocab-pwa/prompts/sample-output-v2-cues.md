# Sample cues, prompt v2

Only the `cues` changed between v1 and v2. Definitions, cautions, examples, and distractors are unchanged, so this file shows cues alone. Full v1 entries are in [sample-output-v1.md](sample-output-v1.md).

Target mix is roughly 60% professional, 40% ordinary life, judged by where Kyle would actually say the word.

---

## squarely  ·  3 → 5 cues

The word that forced the change. Under v1 every situation collapsed into "who owns this" and only 3 survived. Letting cues leave the office gave it two more.

1. **work** — A director asks who owns model evaluation. It is the platform team, and you want to say so in a way that ends the question.
2. **work** — Legal asks whether the new regulation covers your product. It does, entirely, and you want one adverb that removes the wiggle room.
3. **work** — You are writing a post-incident memo and need to place accountability without softening it.
4. **life** — You forgot a friend's birthday. You want to take the blame without excuses or explanation.
5. **life** — Someone asks whether a film counts as science fiction. It does, unambiguously, and you want to say so without qualifying.

## by and large  ·  5 cues

1. **work** — Your sponsor asks how the rollout went. It went well, and there were two ugly cases you would rather not itemise right now.
2. **work** — You are summarising six months of model performance to a board and do not want to caveat every quarter.
3. **life** — Someone asks how your holiday was. Good, apart from one bad day you do not want to dwell on.
4. **life** — A friend asks whether you liked a long novel. You did, with reservations you are not going to list over dinner.
5. **work** — A colleague asks whether the new review process is working. It is, for most teams, and you do not want to claim it is universal.

## panopticon  ·  4 cues

1. **work** — You are arguing against logging every internal AI interaction, and your point is that people behave differently when they might be watched.
2. **work** — A colleague proposes recording all agent sessions for quality review. You want a word for what that does to how people use the tool.
3. **life** — You are describing a neighbourhood where every corner has a camera, and how differently people carry themselves there.
4. **life** — Talking about social media with a friend, you want the word for a place whose power comes from the possibility of being watched rather than the fact of it.

## run it by you  ·  4 cues

1. **work** — You have drafted a recommendation and want your manager's reaction before it goes further, without making it a formal approval request.
2. **work** — You are about to propose a change touching another team's system and want to show their lead first as a courtesy.
3. **life** — You are planning a surprise for your partner and want to check the idea with their sibling before booking anything.
4. **life** — You have picked a restaurant for a group dinner and want to float it before committing everyone.

## scaffolding / harness / sandbox  ·  unchanged

All three stay fully professional. These are terms Kyle would only say at work, and inventing a domestic scene for `harness` would be contrived. The prompt explicitly allows this: judge by where the word actually lives.

---

## What v2 changed

- **Cue count went up where the word supports it.** `squarely` went from 3 to 5 without repeating a situation, because the constraint was the setting rather than the word.
- **Nothing changed for domain terms.** `scaffolding`, `harness`, and `sandbox` stayed professional by the prompt's own rule, which is the check that the 60/40 target is a guide and not a quota.
- **`caution` and `example` stay anchored at work.** Misuse costs Kyle something in a meeting and nothing at dinner, so the field that warns about it stays where the stakes are.
