# iOS PWA capability constraints

Type: research
Status: resolved
Blocked by: —

## Question

What can an installed, home-screen PWA actually do on current iOS Safari, specifically in the five areas this app depends on?

1. **Storage durability.** Does iOS evict IndexedDB or Cache Storage for an installed PWA, and under what conditions? The 7-day cap on script-writable storage for websites is well documented; does home-screen installation exempt it, and does `navigator.storage.persist()` change the outcome? This determines whether device-local review history can ever be trusted as anything but a cache.
2. **Notifications.** Does the Web Push API work for an installed PWA on iOS, from which version, and what does it require (a push service, a server, a user gesture to grant permission)? Are there known reliability problems? Is there any purely local scheduled-notification path, or does every nudge require a server pushing to it?
3. **Install flow.** What is the current path to get a PWA onto the home screen on iOS, can it be prompted programmatically, and what does the manifest need?
4. **Background work.** Are Background Sync and Periodic Background Sync available on iOS Safari? If not, what does that imply for syncing changes made while offline?
5. **Web Share Target.** Does iOS support the Web Share Target API, so an installed PWA can appear as a destination in the system share sheet? If not, what is the status in WebKit, and what is the fastest alternative path to low-friction capture? The bar: a word heard in a meeting is in the app in about five seconds, competing against opening Google Keep and typing. *(Added after the ticket was claimed, once capture moved into this app's scope.)*

For each, state the iOS version the answer applies to, cite the primary source (WebKit blog, Apple developer docs, the relevant spec, or caniuse), and flag where sources disagree or where the documented behavior differs from what practitioners report.

## Why this blocks

[Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) cannot be decided without the storage and background-sync answers. The nudge mechanism, currently in the map's fog, cannot even be phrased as a question until the notification answer lands.

## Answer

All answers apply to **iOS/iPadOS 26.6 and Safari 26.6** (current as of 2026-08-23) unless an earlier
introducing version is named. Full findings, with a citation on every claim and an explicit separation
of what is specified, measured, asserted, and unestablished:
[research/ios-pwa-capabilities.md](../research/ios-pwa-capabilities.md).

**1. Storage durability — installed is genuinely different, but still not a system of record.**
Home-screen installation is an *explicit* exemption, not a side effect: "The first-party domain of home
screen web applications is exempt from ITP's 7-day cap on all script-writeable storage"
([webkit.org/tracking-prevention](https://webkit.org/tracking-prevention/)). The same site in a Safari
tab is *not* exempt, and its IndexedDB and Cache Storage are deleted after 7 days without interaction.
Quota is irrelevant at this app's scale (~60% of disk per origin since Safari 17.0, and no more
"wants to store data" prompt). `navigator.storage.persist()` has worked since iOS 15.2 and, read from
WebKit source, grants only for domains on the ITP exemption list — which includes a standalone web
app's own domain, so it should return `true` inside the installed app and `false` in a tab. It buys a
second, independent exemption from both eviction sweeps. **Not device-verified**, and Apple has never
documented the exemption outside webkit.org — an Apple Developer Forums thread asking this exact
question got no Apple reply. There is also an open WebKit bug (#272325, still NEW, "Critical") where
Home Screen web apps lose session cookies unpredictably.

**2. Notifications — Web Push works, install is mandatory, and nothing local exists.**
Web Push has worked for Home Screen web apps since **iOS 16.4**, and Apple's wording is exact: "Add web
push to Home Screen web apps in iOS 16.4 or later and Webpages in Safari 16 for macOS 13 or later" —
on iOS, installation is the gate, and nothing through iOS 26.6 relaxes it. It requires a user gesture
("call the push subscription method immediately from the gesture's event handler code"), a service
worker (unless using Declarative Web Push, iOS 18.4+), and a server holding VAPID keys that POSTs to
`*.push.apple.com`. No Apple Developer Program membership needed. **Every push must show a
notification** — "Safari doesn't support invisible push notifications … If you don't, Safari revokes
the push notification permission for your site." **There is no local scheduled-notification path.**
`showTrigger` is not in the WHATWG Notifications Standard, Chrome killed Notification Triggers ("The
development … has ended"), and WebKit never had a position on it because there was no spec. Every
scheduled nudge must come from a server.

**3. Install flow — manual only, forever, but the requirements are gone.**
iOS 26 removed every installability requirement: "there are now zero requirements for 'installability'
in Safari. Users can add any site to their Home Screen and open it as a web app"
([Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). Path is Share sheet →
Add to Home Screen, with a user-facing "Open as Web App" toggle. **`beforeinstallprompt` does not exist
and will not** — WebKit closed its standards position as `position: oppose` on 2026-05-26, with Ryosuke
Niwa writing "I don't think we should provide a way for website to programmatically trigger a 'Add to
Home Screen' sheet even under a user activation." The app can only detect it is already installed and
show instructions. WebKit's manifest parser reads exactly `start_url, dir, display, lang, name,
description, short_name, scope, background_color, theme_color, categories, icons, shortcuts, id,
orientation` (plus a `color_scheme_dark` object). `display_override`, `share_target`, `screenshots`,
`protocol_handlers`, `file_handlers` and friends are silently ignored. Icon requirements are a real
documentation gap — the only Apple doc is archived and pre-manifest; ship both manifest `icons` and an
`apple-touch-icon`, and verify on device.

**4. Background work — nothing runs unless you pay for it with a notification.**
Background Sync is unimplemented (caniuse: not supported iOS 3.2–26.6; WebKit bug #201866 open since
2019 with no engineer response; standards position open with `concerns: privacy` and `concerns: power`
and no verdict). Periodic Background Sync is **WONTFIX** — "We oppose this feature and will not
implement it" (Maciej Stachowiak, 2019-12-07). Background Fetch is unimplemented and shows "Needs
position". The only background wake-up is a push message, and §2's `userVisibleOnly` rule means it
cannot be used silently. **Therefore the only reliable sync trigger is the app being open.**

**5. Web Share Target — no, and it would not have helped anyway.**
Not implemented on any iOS version. WebKit's manifest parser does not parse `share_target` at all;
[bug #194593](https://bugs.webkit.org/show_bug.cgi?id=194593) has been open since 2019-02-13 (still
NEW, last poked 2026-05-23, every comment from an outside developer); WebKit's formal position is
`position: neutral` with security concerns about share-sheet spoofing. But the share sheet routes
content *from a source app*, and a word heard in a meeting has no source app — so it was never the
right mechanism for the stated requirement. **The five-second bar is met, and met with pure PWA:** a
capture-first landing screen (or a dedicated `/capture` Home Screen icon, which iOS 26 now permits for
any URL) reaches an autofocused text field in the same number of taps as Google Keep, and beats Keep
offline because the write lands in IndexedDB. For capturing text *seen in another app*, the only route
is a user-installed iOS Shortcut with "Show in Share Sheet", which can either POST to an API or deep-link
into the app — first-party documented, but manual one-time setup that cannot ship with the app.

### Consequences for this project

- **Cloud storage is mandatory, not optional.** Device-local data is durable enough to be the working
  store but is destroyed by app deletion, "Clear History and Website Data", or device loss, and iOS
  offers no configuration that changes this. Treat IndexedDB as an offline-first cache with the cloud
  as system of record. Unblocks [06 — stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md).
- **The nudge requires a server. This settles the map's open question.** No calendar hack, no local
  timer, no service-worker alarm. A scheduled server job holding VAPID keys must POST to APNs. This
  forces the project to have a backend with persistent scheduling and rules out a purely static host.
  Cheapest honest fallbacks if a backend is refused: a repeating iOS Calendar event or a Shortcuts
  automation — both user-configured OS features the app cannot create or control.
- **The app must be installed to the Home Screen, and installation is a manual ritual you cannot
  automate.** Push is impossible without it and storage is fragile without it. Since it cannot be
  prompted, build a one-time instruction screen shown when `display-mode: standalone` is false. As a
  single-user app this is a one-off, not a funnel problem.
- **Never send a push you are not willing to show.** Push cannot double as a silent sync trigger.
  One push, one visible notification, or the subscription is revoked.
- **Sync design is forced: offline-first with opportunistic flush.** Queue local writes; flush on app
  open, on `visibilitychange` to visible, and on regained connectivity while open. Do not design any
  flow that assumes data leaves the device while the app is closed. This constrains
  [07 — entry and review state data model](07-entry-and-review-state-data-model.md) toward
  last-write-wins or per-field merge on a local queue.
- **Do not put `share_target` in the manifest.** It is inert on iOS. Design capture as a first-class
  in-app screen instead, and treat a share-sheet Shortcut as an optional extra Kyle installs by hand.
- **Prototype one thing before committing: home-screen web app cold-start time.** The five-second
  capture claim rests on a fast launch, and no primary source quantifies it. It is the cheapest
  possible experiment and the only finding here that could still be falsified.
