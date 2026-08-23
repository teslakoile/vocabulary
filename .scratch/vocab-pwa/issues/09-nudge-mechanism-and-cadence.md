# Nudge mechanism and cadence

Type: grilling
Status: resolved
Blocked by: 06

## Question

[iOS PWA capability constraints](02-ios-pwa-capability-constraints.md) settled the mechanism: Web Push, available since iOS 16.4, requiring home-screen installation, a user gesture to grant permission, VAPID keys, and a scheduled server job POSTing to APNs. There is no local scheduling path. What remains is everything about how the nudge behaves.

1. **Cadence and timing.** Once a day, at what time, in what timezone, and what happens at weekends? A nudge that arrives while you are in a meeting is a nudge you dismiss without practicing.
2. **What it says.** A bare "time to practice" is easy to ignore. Options with more pull: the count due, one of the words itself, or the actual first card. Decide whether the notification carries content, and note that this interacts with how much of the review state the server knows.
3. **The permission moment.** Permission needs a user gesture and can only be asked once with any grace. Decide when the app asks: at first launch, after the first completed session, or on an explicit settings toggle. Asking too early is how you get a permanent denial.
4. **The revocation rule.** Every push must display a visible notification or Safari revokes the subscription. This forbids using push as a silent sync trigger, and it means a nudge sent on a day with nothing due still has to show something. Decide what a zero-due day looks like: skip the send, or send something that is worth showing.
5. **Ignored nudges.** If you ignore it three days running, does anything change? Escalation, backing off, and streak mechanics all have opinions attached, and the wrong one turns a useful habit into a guilt machine.

## Notes for the session

Invoke `/grill-me`. Kyle described this as "some scheduled nudges for now", so the bar is a working daily prompt. Resist building a notification system. The one thing worth getting right on the first pass is the permission moment, because a denial is expensive to reverse.

## Added by ticket 05

**The app has no daily queue, so the nudge cannot say "you have 12 due".** [Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md) settled that this is an endless game with no session boundaries, no completion state, and free play when everything due is cleared. A count-based notification reintroduces exactly the "done for today" framing that decision rejected.

This reshapes question 2 on this ticket. If the notification does not carry a count, the candidates become: one of your words, an actual first card, or something that is simply an invitation to play. It also softens question 5: with no streak and no completion state, an ignored nudge should probably do nothing at all, because escalation would smuggle the guilt back in.

Note the interaction with the revocation rule: every push must display a visible notification, and with no due count there is no such thing as a zero-due day, so there is always something legitimate to send.

## Amendment history

**Dropped and reinstated on 2026-08-23. This ticket is live.**

It was briefly ruled out of scope:

This reverses the "nudges are scheduled reminders" decision from [Practice model and scope](01-practice-model-and-scope.md).

Nothing about the mechanism was wrong. Web Push works on iOS 16.4+ for an installed app, and a Cloudflare Workers Cron Trigger would have driven it. The decision is that the app does not need to bring Kyle back.

The consequence is a product risk, not a technical one: use case 3 was practicing regularly to keep these words in active vocabulary, and with no nudge nothing prompts a session. The zero-engineering fallbacks remain available to Kyle at any time, outside the app: a repeating iOS Calendar event, or a Shortcuts automation that opens the PWA. Both are OS features he configures himself, which is why they cost this project nothing.

Reopen only if the destination is redrawn.


**Reinstated the same day.** Kyle dropped nudges on the understanding that they forced infrastructure the project would otherwise avoid. That was wrong: [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) already requires a Cloudflare Worker for the Anthropic key and server-side generation, so push adds a VAPID keypair, a subscription endpoint, a POST to APNs, and a cron trigger. The infrastructure was already in the design for another reason.

The questions above are unchanged, and the additions from ticket 05 still apply: with no daily queue and no completion state, the notification cannot be a count.

## Answer

**The notification is an actual card.** Not "time to practice", not a word with a prompt, but a real cue from the rotation, with tapping it opening straight into that card. It is already the practice rather than an invitation to it, so reading the lock screen means Kyle has started before deciding to.

This also disposes of the revocation problem cleanly. Every push on iOS must display a visible notification or Safari revokes the subscription, and [Review session UX](08-review-session-ux.md) removed the daily queue, so there is no such thing as a zero-due day. There is always a legitimate card to send: a due card if one exists, otherwise a free-play card. If the card sent was due, answering it updates the schedule; if it was free play, it does not. Same rule as everywhere else, no special case.

**Accepted risk, raised and overridden:** a cue Kyle cannot answer without unlocking is a tease, and if he solves it in his head and never opens the app, the notification has replaced the practice it was meant to prompt. Watch for this. If it happens, the bare-doorbell version is the fallback.

**1pm every day, weekends included.** Kyle's call, over an objection that weekend nudges from a work-vocabulary app are what make an app feel like an obligation.

*Implementation:* store Kyle's timezone and run the Cron Trigger hourly, with the Worker sending only when it is 1pm local. A fixed UTC cron would be simpler for one user in one place, and would break on travel and on DST. The hourly check costs almost nothing and survives both.

**Permission is requested at first launch.** Kyle's call, over a recommendation to wait until after his first real session.

*Constraint, not a reversal:* push on iOS requires the app to be installed to the home screen, so a request during a first visit in Safari cannot succeed. The earliest possible moment is **the first launch in standalone mode**, immediately after Kyle adds it to his home screen. This is what "first launch" resolves to in practice. The install instruction card from [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) already handles the pre-install state, so the permission prompt follows it naturally.

**An ignored nudge does nothing.** No escalation, no backing off, no streak, no catch-up messaging. [Scheduling unit and algorithm](05-scheduling-unit-and-algorithm.md) removed every completion state and streak from the app, and escalation would smuggle the guilt back in through the notification channel.

### Residual risks

- **The lock-screen cue may substitute for the practice.** The single largest risk on this ticket, accepted knowingly. Signal to watch: notifications arriving and being dismissed without the app opening.
- **iOS gives roughly one shot at permission.** Asking at first standalone launch maximises reach and minimises context. A denial is expensive to reverse and, for a one-user app, would mean Kyle re-enabling it in iOS settings by hand.
- **Cues appear on the lock screen**, so anyone glancing at the phone sees them. Low stakes for a personal vocabulary list, worth knowing.
