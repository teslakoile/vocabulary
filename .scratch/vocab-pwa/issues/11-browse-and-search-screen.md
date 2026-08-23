# Browse and search screen

Type: grilling
Status: resolved
Blocked by: —

## Question

[CRUD scope inside the app](04-crud-scope-inside-the-app.md) made browse a first-class screen, serving the use case Kyle stated first: remembering which words he has collected. [Review session UX](08-review-session-ux.md) designed the review flow and explicitly left this out. Nothing has designed it.

1. **What is a row?** [Entry and review-state data model](07-entry-and-review-state-data-model.md) made cards hang off senses while entries remain the thing Kyle captured. So does browse list 84 entries or ~95 senses? Listing entries matches how he thinks about his list; listing senses matches what he is actually practicing. Getting this wrong makes the two screens disagree about how many words he has.
2. **What can he search?** Headword only, or definitions and cautions too. The real use is drafting a message and knowing there is a word for this without remembering which, and that only works if search reaches the definition.
3. **What can he filter or sort by?** Candidates: recently added, struggling, not yet in rotation, archived, by tag. Each one needs a field that exists.
4. **What does a row show at rest?** Headword alone is scannable but says nothing. Headword plus a short gloss is more useful and much longer. Decide, given ~95 rows on a phone.
5. **Does browse show progress?** Showing how well he knows each word makes browse the place he checks his standing, which is satisfying and also the easiest way to avoid practicing. Ticket 08 deliberately stripped all progress furniture from review; decide whether it belongs here instead or nowhere.
6. **What does tapping a row do?** Open a read view, open an editor, or start a review of that entry on demand. On-demand review interacts with scheduling: a card practiced this way is not due, so under ticket 08's rule it would not count.
7. **Where does archive live?** Ticket 04 settled archive over delete, and this is the only screen that can reach an archived entry to restore it.

## Notes for the session

Invoke `/grill-me`. The framing risk: browse is where an app like this goes to be admired instead of used. Reading your list feels productive and teaches nothing. If browsing is easier and more pleasant than practicing, browsing wins.

## Answer

All recommendations accepted as proposed.

**A row is an entry, not a sense.** Browse reports 84, the number Kyle wrote down. Senses are an internal mechanic and it would be strange for this screen to report a count he never authored. A multi-sense entry shows its sense count on the row (`scaffolding / harness / sandbox … 3`) and its glosses joined on the gloss line.

**Search reaches every text field**: headword, definition, caution, example, and `capture_note`. The stated use is drafting a message knowing there is a word for this without remembering which, which only works if search reads definitions rather than headwords.

**Rows show a headword plus a one-line gloss.** About 5 per phone screen, so 84 entries is a long scroll, and that is accepted because **search is the real navigation**. Kyle will type three letters, not scroll.

**Filters are chips**: All, Recent, Struggling, Pending, Archived, plus tag filtering available without a default chip. Pending covers entries whose generation has not completed or has failed, which is where the badge from [CRUD scope inside the app](04-crud-scope-inside-the-app.md) leads. Archived is the only route back to restoring an entry, so it has no separate screen.

**Progress appears as a filter only, never as a per-row badge.** [Review session UX](08-review-session-ux.md) stripped every streak, count, and progress display out of review deliberately, and this screen does not reintroduce one. Kyle can find his struggling words; he does not get a dashboard.

**Tapping a row opens a read view with the same inline editing as a card's answer side.** One editing path in the whole app, learned once. There is no practise-on-demand.

### Residual risks, all accepted over a stated objection

- **If search is the real navigation, the list beneath it is close to decoration.** The question of what browsing is actually *for*, beyond finding a specific word, was raised and not answered. If browse goes unused except as a search box, simplify it rather than enriching it.
- **The Struggling filter is opaque.** With no per-row signal, Kyle taps it and trusts it, and will never notice that one word has been failing for two months. The cheapest fix if this bites is a signal on the read view rather than on every row.
- **Practise-on-demand is refused, and it is a real want.** "Drill this one word before a meeting" is a plausible thing to reach for. It was left out because a word practised on demand is not due, so under ticket 08's rule the answer would not count, and Kyle would be practising into a void with no indication. If the want proves real, the honest version tells him it does not count.
