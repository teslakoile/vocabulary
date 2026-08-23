# Review session UX

Type: prototype
Status: resolved
Blocked by: 05, 07

## Question

What does one daily session look like on a phone, from opening the app to being done?

Build a rough, throwaway prototype to react to rather than arguing about it in the abstract. It should show:

- The three card types as actual screens: recognition, reverse recognition, and cued production. Cued production is the interesting one, because it needs a text input, and typing on a phone is friction that could sink the habit. Try at least one alternative to free typing.
- How an answer is submitted and revealed, and how the grade is captured, in whatever scale [Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md) settled.
- What a wrong answer does. Does the card come back in this session, and is the correct answer explained or only shown?
- The inline correction path from [CRUD scope inside the app](04-crud-scope-inside-the-app.md): fixing a bad definition without losing your place in the session.
- The start and end of a session. What tells you how many are due, and what does finishing feel like.

Use real entries from `../source-list.md`, with hand-written placeholder content in Kyle's register. Generic dictionary text will make the prototype feel wrong for reasons that have nothing to do with the UX.

## Notes for the session

Invoke `/mattpocock-skills:prototype`. Consult `/impeccable` and `/make-interfaces-feel-better`. Link the prototype from this ticket as an asset rather than pasting code into it.

## Added by ticket 05

**Recognition is a multiple-choice card**, not a typed one. Three formats now need screens, not two, and the tap-only card should feel meaningfully faster than the typed ones.

**There is no session.** No "done for today", no completion screen, no streak. Closing the app is pausing, and every answer persists as it is given. Design for someone who opens this for 40 seconds in a lift.

**Free play needs to look different from real review.** When everything due is cleared the app keeps serving cards, but those answers do not move any schedule. If the two modes look identical, Kyle will not understand why one moved his progress and the other did not. This is the single largest UX risk on the ticket, and it is why free play was accepted at all.

## Added by ticket 07

**Cards belong to senses, not entries.** `trivial` and `nontrivial` are separate cards from one entry. If the browse screen lists entries but review serves senses, the two views count differently and that needs to not be confusing.

**The answer side has four things to show**: definition, `caution` (when not to use it), example, and Kyle's own `capture_note`. Decide what appears immediately and what needs a tap, because four blocks of text after every card is a lot at 3 seconds each.

**Multiple-choice options are close by design.** Sibling senses supply real, confusable definitions. Reading four similar options is slower than reading four obviously different ones, so the recognition card is no longer the quick one, and the screen should not pretend otherwise.

## Answer

### There are no modes

Kyle's call: free play is the default. That inverts the design proposed in [Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md), and it is better. Instead of "clear what is due, then opt into free play", the app serves one continuous queue:

1. **Due cards first**, and answering them updates the FSRS schedule.
2. **Then everything else**, and those answers do not.

The transition is invisible and automatic. There is no mode switch, no "you have cleared everything" screen, and no "keep going" button. The completion screen proposed as the deliberate-entry option is rejected precisely because it reintroduces the done state ticket 05 removed.

Counting cards carry a **quiet persistent marker** so the distinction is honest, but it is never a decision Kyle makes and never interrupts him.

**Residual risk:** progress will move on some cards and not others, with no announcement of why. Kyle may notice the inconsistency without understanding it. The marker is the only mitigation, and if it proves too quiet to read, the fix is a louder marker rather than a mode.

### The answer side shows everything

Approved as mocked. After every card, regardless of right or wrong: the word, the definition, the `caution`, the example, and Kyle's own `capture_note`. Progressive disclosure was proposed and rejected. The argument that hiding the definition on correct answers causes slow drift in what a word means was the deciding one.

### Wrong answers come back in the same sitting

Kyle's call. A failed card re-enters the queue roughly 8 to 10 cards later. Getting it wrong, seeing the answer, then producing it yourself shortly after teaches more than seeing the answer alone.

Since there is no session, "same sitting" is defined as **the current app-open**. The requeue lives in memory and is discarded when the app is closed, at which point the card is simply due early by FSRS's own reckoning. Nothing follows Kyle across days.

### The three card screens

Mocked and approved in conversation. Recognition is four options with genuinely close distractors, drawn from sibling senses where they exist. Reverse recognition shows a definition and takes a typed word. Cued production shows a situation from Kyle's working world and takes a typed word.

Note the tension carried from ticket 05: recognition was kept because it was a 3-second tap, and close distractors make it a read. The screen should not pretend it is the quick one.

### Also settled

**Inline correction**, required by [CRUD scope inside the app](04-crud-scope-inside-the-app.md), happens on the answer side. Any of the four text blocks is editable in place, and saving does not lose position in the queue. This is the only correction path in the app, so it has to work while moving.

**No session furniture.** No streak, no daily count, no completion state, no "come back tomorrow". Every answer persists as it is given, so closing the app is pausing. Design for someone who opens this for 40 seconds in a lift.

**Browse is not this ticket.** It is a first-class screen per ticket 04 and nothing has designed it. Graduated to [Browse and search screen](11-browse-and-search-screen.md).
