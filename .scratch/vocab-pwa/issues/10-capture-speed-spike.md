# Capture speed spike

Type: prototype
Status: closed (not measured)
Blocked by: —

## Question

Can an installed home-screen PWA get a heard word into a list in about five seconds, competing head to head with opening Google Keep and typing?

This is the one assumption on the map that the iOS research could not settle and explicitly flagged as falsifiable. No primary source quantifies home-screen web app cold-start time. [CRUD scope inside the app](04-crud-scope-inside-the-app.md) retired Google Keep on the strength of this working, and that decision is the biggest risk on the map: if capture is slower than Keep, Kyle keeps using Keep, the list goes stale, and the app dies.

Web Share Target is not implemented on any iOS version and the manifest member is not even parsed, so the share sheet is not the answer. The candidate designs to test are a capture-first landing screen and a dedicated `/capture` Home Screen icon, which iOS 26 permits at any URL.

## Build

A throwaway static page with a single text input that writes to `localStorage`. No database, no backend, no styling beyond what affects perceived speed. Deploy it anywhere free and install it to the Home Screen.

## Measure

Time from intent to word-saved, on a real phone, for each of:

1. The PWA cold, meaning not in the app switcher, which is the case that matters.
2. The PWA warm.
3. Google Keep, as the baseline to beat.

Run each several times, including at least once on a phone that has been idle for hours, and record the numbers rather than an impression. Also note whether the standalone splash screen adds a fixed delay and whether a `/capture` deep-link icon lands faster than the app's normal entry point.

## Resolve

Record the measured times. State plainly whether the five-second bar is met, and if it is not, say what that forces. The honest fallbacks are a capture-first landing screen, a hand-installed iOS Shortcut, or reopening the decision to retire Google Keep.

## Notes for the session

Invoke `/mattpocock-skills:prototype`. This is deliberately the cheapest experiment on the map. Do not let it grow into the real app.

## Outcome

**Closed without measuring. Kyle declined the spike on 2026-08-23.**

The prototype was built and verified working (`prototypes/capture-spike/`, four files, 16 KB), but no measurement was taken on a real device.

**The assumption therefore stands unverified.** [CRUD scope inside the app](04-crud-scope-inside-the-app.md) retired Google Keep on the strength of PWA capture being fast enough to replace it, and nothing has tested that. The risk is already recorded on that ticket, along with a fallback signal that costs nothing and needs no spike: two weeks after the app is usable, count how many new words went into the app versus Keep. If Keep is still winning, ticket 04 reopens.

Reopen this ticket if the app ships and capture feels slow.
