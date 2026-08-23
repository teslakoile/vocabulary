# Sample output, prompt v1

Five of the hardest entries, run through [generate-entry.md](generate-entry.md). This is the register check that [Cold start and Keep retirement](../issues/14-cold-start-and-keep-retirement.md) calls for, done before any infrastructure exists.

Chosen to stress different failure modes: a bare adverb, an idiom with no situation, a three-way contrast set, a word whose whole risk is connotation, and a phrasal verb.

---

## squarely  ·  1 sense

- **term** `squarely`
- **definition** Directly and without hedging, almost always about where something belongs or who owns it. It says the answer is not ambiguous.
- **caution** It works about accountability and category fit, and sounds odd about physical or genuinely uncertain things. If the thing really is contested, `squarely` overclaims and invites someone to push back on exactly that.
- **example** "Cost governance sits squarely with the platform team, not with each product."
- **cues** (3, because the word has one narrow use and padding to 5 would repeat the situation)
  1. A director asks who owns model evaluation. It is the platform team, and you want to say so in a way that ends the question.
  2. Legal asks whether the new regulation covers your product. It does, entirely, and you want one adverb that removes the wiggle room.
  3. You are writing a post-incident memo and need to place accountability without softening it.
- **distractors** Gradually over time · In a way that balances competing interests · Reluctantly, after other options failed · Fairly to everyone involved · Approximately, within a margin

## by and large  ·  1 sense

- **term** `by and large`
- **definition** On the whole, allowing for exceptions you are not going to list. It concedes counterexamples exist while saying they do not change the conclusion.
- **caution** It signals you have not checked the exceptions. Safe in conversation, risky in writing that will be scrutinised, because this is exactly where someone asks which cases you are excluding.
- **example** "By and large the migration went clean. Two services needed manual work."
- **cues**
  1. Your sponsor asks how the rollout went. It went well, and there were two ugly cases you would rather not itemise right now.
  2. You are summarising six months of model performance to a board and do not want to caveat every quarter.
  3. A colleague asks whether the new review process is working. It is, for most teams, and you do not want to claim it is universal.
- **distractors** In every case without exception · According to the majority opinion · At a high level, without detail · Over a long period · From an organisation-wide perspective

## scaffolding / harness / sandbox  ·  3 senses

Sibling senses supply each other's multiple-choice distractors, which is the entire reason these three were written down together.

### sense 1 — `scaffolding`
- **definition** Temporary structure that holds work up until the real thing can stand on its own. It is meant to come down.
- **caution** The word commits you to removal. Call something scaffolding and people will remember that you said it was temporary.
- **example** "The manual review step is scaffolding. Once the classifier is calibrated it comes out."
- **cues** (1) You hardcoded a lookup to unblock a demo and want your tech lead to know it is not meant to survive. (2) A sponsor asks why an automated pipeline has a manual step in it. (3) In design review you want a word for the parts that exist only to support the parts that matter.

### sense 2 — `harness`
- **definition** A rig that exercises a system to see how it behaves. Not part of the system; it drives it from outside.
- **caution** In an AI room this now usually means an evaluation harness, so people may hear "eval" when you meant "test rig". Say which you mean if the room is mixed.
- **example** "We need a harness that replays last quarter's queries against the new model."
- **cues** (1) You want something that fires realistic inputs at your agent and records what comes back, so you can compare two versions. (2) A director asks how you will know the new model is better, and you need a word for the apparatus that answers that.

### sense 3 — `sandbox`
- **definition** An isolated environment where something runs without being able to affect anything real.
- **caution** It promises containment. If the environment can actually reach production data or spend real money, calling it a sandbox is a claim someone will hold you to.
- **example** "Let it run in a sandbox first. I don't want it touching the live index."
- **cues** (1) You are letting an agent execute code it wrote itself and want somewhere it cannot do damage. (2) Compliance asks what stops the new tool reading customer records during testing.

## panopticon  ·  1 sense

- **term** `panopticon`
- **definition** A structure where everyone can be watched at any moment and nobody knows when they are, so they behave as though always observed. Used about surveillance systems and the self-censorship they produce.
- **caution** **This is a criticism, not a description.** It carries Foucault's argument about power. If you only mean thorough monitoring or good observability, `panopticon` reads as an accusation and changes the temperature of the room.
- **example** "If every prompt is logged and reviewed, we've built a panopticon and people will stop experimenting."
- **cues**
  1. You are arguing against logging every internal AI interaction, and your point is that people behave differently when they might be watched.
  2. A colleague proposes recording all agent sessions for quality review. You want a word for what that does to how people use the tool.
  3. You are writing about workplace monitoring and want the term for a system whose power comes from the possibility of being watched rather than the fact of it.
- **distractors** A dashboard bringing every metric into one view · An organisation where information flows freely in all directions · A system designed to be audited by outsiders · A single point through which all traffic passes · A comprehensive record kept for regulators

## run it by you  ·  1 sense

- **term** `run it by you`
- **accepted** `run it past you`, `run this by you`
- **definition** To show someone something before committing to it, seeking their reaction rather than their approval. Softer than asking permission.
- **caution** It implies you could proceed without them, which is why it works upward as courtesy and sideways as consultation. Said to someone whose sign-off you genuinely need, it can sound like you are minimising their role.
- **example** "Before I send this to the MD, can I run it by you?"
- **cues**
  1. You have drafted a recommendation and want your manager's reaction before it goes further, without making it a formal approval request.
  2. You are about to propose a change touching another team's system and want to show their lead first as a courtesy.
  3. The decision is yours to make, but you would rather not surprise your sponsor with it.
- **distractors** To formally submit something for approval · To delegate a task to someone more suitable · To test an idea against data before presenting it · To brief someone so they can answer questions on your behalf · To circulate a document for comment

---

## Notes on prompt v1 from this run

- **Cue count varies by word, and should.** `squarely` got 3 because its situations kept collapsing into "who owns this". Forcing 5 would have produced the exact memorisation risk ticket 12 warned about. The prompt says 3 to 5 rather than 5 for this reason.
- **Contrast sets are the easy case.** The three sibling senses gave each other genuinely confusable distractors for free.
- **`caution` is doing the work.** On `panopticon` and `run it by you` it carries almost all the value; the definitions alone would have been unremarkable.
