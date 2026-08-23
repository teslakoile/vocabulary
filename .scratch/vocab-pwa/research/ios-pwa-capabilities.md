# iOS PWA capabilities: storage, notifications, install, background

Research for [issue 02 — iOS PWA capability constraints](../issues/02-ios-pwa-capability-constraints.md).
Compiled 2026-08-23.

## Version baseline

Everything below is stated against **iOS/iPadOS 26.6 and Safari 26.6**, the current shipping release
as of this writing. Safari 26.6 release notes are dated 27 July 2026
([WebKit Features for Safari 26.6](https://webkit.org/blog/18178/webkit-features-for-safari-26-6/)),
and caniuse's support tables list iOS Safari 26.6 as the newest released version with 27/TP as preview
([caniuse: StorageManager.persist](https://caniuse.com/mdn-api_storagemanager_persist)).
Where a behaviour was introduced earlier, the introducing version is named.

## Evidence grades used below

- **SPECIFIED** — written down in a W3C/WHATWG spec, an Apple developer doc, or a WebKit blog post.
- **MEASURED** — read directly out of WebKit source, a WebKit bug record, or a version support table.
- **ASSERTED** — claimed by a non-authoritative source. Labelled secondary and never load-bearing.
- **NOT ESTABLISHED** — I could not find a primary source. Said so explicitly.

A caveat that applies to every MEASURED-from-source claim: WebKit source read here is the public
`main` branch on 2026-08-23. It is the best available evidence of shipping behaviour and it is
consistent with the documented policy, but Apple ships from internal branches and I did not verify
any of it on a device. Source reading tells you what the code does; it does not prove what the
binary on an iPhone does.

---

## 1. Storage durability

### 1.1 The 7-day rule exists, and home-screen installation is an explicit exemption

**SPECIFIED.** WebKit's Intelligent Tracking Prevention deletes script-writable storage for websites:

> "ITP deletes all cookies created in JavaScript and all other script-writeable storage after 7 days of no user interaction with the website."
> — [WebKit, Tracking Prevention Policy](https://webkit.org/tracking-prevention/)

The affected storage forms named on that page are IndexedDB, LocalStorage, Media keys, SessionStorage,
and Service Worker registrations and cache. That covers both stores this project would use.

The same page states the exemption in one sentence:

> "The first-party domain of home screen web applications is exempt from ITP's 7-day cap on all script-writeable storage."
> — [WebKit, Tracking Prevention Policy](https://webkit.org/tracking-prevention/)

This restates the original announcement, which framed it as a separate day-counter rather than a flat
exemption:

> "Web applications added to the home screen are not part of Safari and thus have their own counter of days of use. Their days of use will match actual use of the web application which resets the timer."
> — John Wilander, [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/), 24 March 2020

and adds, in the same post, that first-party deletion inside an installed web app is not the intent of
the policy. Note the two framings differ slightly — 2020 says "own counter", the current policy page
says "exempt". The current page is the one to rely on, and the source (§1.3) matches "exempt".

**MEASURED.** A WebKit engineer said the same thing on the bug tracker:

> "Home Screen Web Application Domain Exempt From ITP" — John Wilander, 2021-08-12, and
> "Web apps in the Dock on macOS have the same exemption from ITP website data deletion as Home Screen web apps on iOS." — John Wilander, 2023-11-04
> — [bugs.webkit.org #209563](https://bugs.webkit.org/show_bug.cgi?id=209563)

That bug — "Support longterm persistent storage (re: default ITP 7 rolling days of browser use
expiry)" — was filed 2020-03-25 and is **still status NEW** with no resolution, last touched
2025-07-24. The absence of a general durability guarantee for non-installed sites is a six-year-old
open request, not an oversight.

### 1.2 The current quota and eviction policy (Safari 17.0 onward, unchanged since)

**SPECIFIED.** The governing document is Sihui Liu,
[Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/), dated
10 August 2023 on the page. (Some search indexes list it as September 2023; the on-page date is
August. Minor, flagged for honesty.) It is still the newest post in WebKit's storage category
([WebKit blog: Storage](https://webkit.org/blog/category/storage/)) — there has been **no** superseding
storage-policy post through Safari 26.6.

Key statements, verbatim:

> "Eviction means automatic website data deletion that is not initiated by the user or website. It can happen under a few conditions: when exceeding the overall quota, when the system is under storage pressure, or when the site has not been interacted with by the user for some time."

> Eviction uses "a least-recently-used policy. The last use time is the time of the last user interaction, or the time of the last storage operation."

> An origin is excluded from eviction if it "has active page at the time of eviction, or its storage is in persistent mode."

> "WebKit currently grants a request [for persistent mode] based on heuristics like whether the website is opened as a Home Screen Web App."

> "When a web app is running standalone (as Home Screen Web App on iOS or Web App added to dock on macOS), it has the same origin quota and overall quota as when it is opened in a browser app."

Quota numbers from the same post, applying from Safari 17.0 / iOS 17:

| | origin quota | overall quota |
|---|---|---|
| browser app (and standalone web apps, per the quote above) | up to 60% of total disk space | up to 80% of total disk space |
| other apps (e.g. in-app WebView) | up to 15% | up to 20% |
| cross-origin frames | 10% of the main frame's origin quota | — |

Safari 17.0 also "no longer prompts users about a website wanting to use more space" — the old
"website wants to store data on your device" dialog is gone. For an app storing 84 vocabulary entries
plus review history, quota is a non-issue by three or four orders of magnitude.

### 1.3 What `navigator.storage.persist()` actually does on iOS — read from source

**MEASURED.** `StorageManager.persist()` and `.persisted()` have been supported in iOS Safari since
**15.2** and remain supported through 26.6
([caniuse: persist](https://caniuse.com/mdn-api_storagemanager_persist),
[caniuse: persisted](https://caniuse.com/mdn-api_storagemanager_persisted)).

The blog says grants are made "based on heuristics"; the source says exactly what the heuristic is.
In `Source/WebKit/NetworkProcess/storage/NetworkStorageManager.cpp`, `persist()` bails out for
third-party contexts (`if (origin.topOrigin != origin.clientOrigin) return completionHandler(false);`)
and otherwise defers to `persistOrigin()`, which is a single membership test:

```cpp
bool NetworkStorageManager::persistOrigin(const WebCore::ClientOrigin& origin)
{
    if (!m_domainsExemptFromEviction->contains(origin.clientRegistrableDomain())) {
        // ...delete the persisted marker file...
        return false;
    }
    return !!FileSystem::overwriteEntireFile(persistedFilePath(origin), std::span<uint8_t> { });
}
```

`m_domainsExemptFromEviction` is populated from `NetworkProcess::registrableDomainsExemptFromWebsiteDataDeletion()`,
which reaches the ITP store. That set is defined in
`Source/WebKit/NetworkProcess/Classifier/ResourceLoadStatisticsStore.cpp`:

```cpp
HashSet<RegistrableDomain> ResourceLoadStatisticsStore::domainsExemptFromWebsiteDataDeletion() const
{
    auto result = m_appBoundDomains.unionWith(m_managedDomains);
    result = result.unionWith(m_persistedDomains);

    if (!m_standaloneApplicationDomain.isEmpty())
        result.add(m_standaloneApplicationDomain);

    return result;
}
```

`m_standaloneApplicationDomain` is set via `WebResourceLoadStatisticsStore::setStandaloneApplicationDomain()`
(same directory, `WebResourceLoadStatisticsStore.cpp`), which the embedder calls with the domain of
the standalone web app.

Three consequences follow, and they matter:

1. The **same set** gates both ITP data deletion (`shouldExemptFromWebsiteDataDeletion()` is a direct
   `contains()` on it) and whether `persist()` succeeds. The home-screen exemption and the persistence
   grant are literally the same list.
2. Inside a home-screen web app, `persist()` on the app's own origin should return **`true`**, because
   the app's registrable domain is the standalone application domain. This is the concrete form of the
   blog's vague "heuristics".
3. In a plain Safari tab, `persist()` for a normal site should return **`false`** — the domain is not
   app-bound, not managed by MDM, not already persisted, and not the standalone application domain.
   So there is no way to buy durability without installation.

Source files:
[NetworkStorageManager.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/storage/NetworkStorageManager.cpp),
[ResourceLoadStatisticsStore.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/Classifier/ResourceLoadStatisticsStore.cpp),
[NetworkProcess.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/NetworkProcess.cpp).

**Caveat, stated plainly:** points 2 and 3 are inferences from reading trunk source, not statements
Apple has made and not observations from a device. They are consistent with the blog post and the
tracking-prevention page. They are not a guarantee. The cheap way to close this gap is to call
`navigator.storage.persisted()` inside the installed app on a real phone and look at the boolean.

### 1.4 The two eviction paths, and what escapes them

**MEASURED**, from `NetworkStorageManager.cpp`. There are two eviction sweeps, and both skip the
same two categories:

**Quota-based eviction** (`performQuotaBasedEviction`) only runs when total usage exceeds the total
quota. It sorts origins by last access time and evicts the least recently used, skipping any record
where `record.isActive || valueOrDefault(record.isPersisted)`. With 84 entries this will never fire.

**Time-based eviction** (`performTimeBasedEviction`) is the interesting one. It skips:

- origins with an active page (`record.isActive`),
- origins with the persisted marker (`record.isPersisted`),
- origins whose last access is newer than the cutoff, and
- **origins with an active push subscription** — the code fetches `getAllPushSubscriptionOrigins()`
  and logs `"skipping origin ... with active push subscription"` before continuing past them.

The default inactivity threshold is `Seconds m_timeBasedEvictionThreshold { 180 * 24_h }` — **180 days**
([WebsiteDataStoreConfiguration.h](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/WebsiteData/WebsiteDataStoreConfiguration.h)) —
and the sweep itself is throttled to run at most once per `defaultTimeBasedEvictionInterval = 7 * 24_h`.

Most importantly, this whole path is gated off for anything that is not a browser:

```cpp
TimeBasedEvictionMode WebsiteDataStore::timeBasedEvictionMode() const
{
    bool isBrowserOrRunningTest = false;
#if PLATFORM(COCOA)
    isBrowserOrRunningTest = isFullWebBrowserOrRunningTest();
#endif
    if (!isBrowserOrRunningTest || trackingPreventionEnabled())
        return TimeBasedEvictionMode::Disabled;

    return m_configuration->timeBasedEvictionMode();
}
```
([WebsiteDataStore.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/WebsiteData/WebsiteDataStore.cpp))

Reading: time-based eviction is *disabled* unless the host app is a full web browser **and** tracking
prevention is off — i.e. it is the fallback deletion mechanism for when ITP is not doing the deleting.
A home-screen web app is not a full web browser, so this path should be disabled for it, on top of the
ITP exemption. Again — inference from trunk source, not an Apple statement.

### 1.5 Where the documentation and practitioner reports diverge

The documented position is clean: installed web app, exempt, done. Practitioner reports are messier,
and honesty requires saying so.

- **Apple's own forums contain the question and no answer.**
  [Apple Developer Forums thread 710157](https://developer.apple.com/forums/thread/710157), "Safari iOS
  PWA Data Persistence Beyond 7 Days" (July 2022), asks precisely this question. No Apple engineer
  replied. The only substantive answer, in February 2023, is a community developer pointing at the
  WebKit tracking-prevention page. Apple has never confirmed this in its own developer documentation —
  the only first-party statements are on webkit.org, not developer.apple.com.
- **There is an open, engineer-acknowledged data-durability bug in home-screen web apps.**
  [bugs.webkit.org #272325](https://bugs.webkit.org/show_bug.cgi?id=272325), "REGRESSION (iOS 17.x):
  Session cookies being reset randomly in a Home Screen web app", filed 2024-04-08, severity Critical,
  **status NEW**. WebKit's Alexey Proskuryakov wrote on 2024-04-12: "The needing to login aspect
  certainly looks wrong, it shouldn't be random whether we still have the cookies after relaunching."
  Brady Eidson could not reproduce it on iOS 18 beta 2 (2024-06-25). This is about cookies rather than
  IndexedDB, so it is not direct evidence about IndexedDB — but it is direct evidence that
  "installed web apps keep their data" has known exceptions that WebKit has not closed.
- **Secondary reports of IndexedDB instability on iOS** (data loss or corruption around OS updates,
  hung transactions) circulate widely in practitioner write-ups. I found no primary source that
  substantiates a current, specific, reproducible failure mode, so I am recording only that such
  reports exist and that I could not trace them to a WebKit bug or Apple statement. Do not treat
  the secondary claims as established.

### 1.6 Storage: the bottom line

- **iOS 26.6, installed home-screen web app:** IndexedDB and Cache Storage are exempt from the 7-day
  ITP cap (SPECIFIED, webkit.org/tracking-prevention). Quota is effectively unlimited at this app's
  scale (SPECIFIED). `persist()` should succeed and adds a second, independent exemption from the
  quota- and time-based eviction sweeps (MEASURED from source, not device-verified).
- **iOS 26.6, same site in a Safari tab, not installed:** subject to the 7-day cap, and `persist()`
  should fail. Uninstalled, the data is disposable within a week of non-use.
- **Residual risk that no exemption covers:** the user deleting the web app (which takes its data with
  it), "Clear History and Website Data", device restore, and open WebKit bugs of the #272325 kind.
- **Therefore:** device-local review history can be trusted as a *working* store that survives normal
  daily use, but it cannot be the system of record. There is no configuration of iOS that makes it one.

---

## 2. Notifications

### 2.1 Web Push works, from iOS 16.4, for home-screen web apps only

**SPECIFIED.** Apple's own documentation states the scope in a single sentence:

> "Add web push to Home Screen web apps in iOS 16.4 or later and Webpages in Safari 16 for macOS 13 or later."
> — Apple, [Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

That asymmetry is the whole story: on macOS any webpage can subscribe; **on iOS only a web app added
to the Home Screen can.** The launch announcement says the same:

> "A web app that has been added to the Home Screen can request permission to receive push notifications as long as that request is in response to direct user interaction — such as tapping on a 'subscribe' button provided by the web app."
> — Brady Eidson and Jen Simmons, [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), 16 February 2023

and [WebKit Features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
(27 March 2023): "iOS and iPadOS 16.4 add support for Web Push to web apps added to the Home Screen."

**Nothing through iOS 26.6 relaxes the home-screen requirement.** As late as iOS 18.4, WebKit was still
writing "Declarative Web Push is now available on iOS and iPadOS 18.4 **for web apps added to the Home
Screen**" ([WebKit Features in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/),
31 March 2025), and Apple's current push documentation still says "iOS 16.4 or later" with no broadening.
iOS 26 removed the *installability requirements* (§3.1) but not the *installation* requirement for push.

### 2.2 What it requires

**SPECIFIED**, all from [Apple's push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)
unless noted:

- **A user gesture.** "Provide a method for the user to grant permission with a gesture, such as
  clicking or tapping a button. When the user completes the gesture, call the push subscription method
  immediately from the gesture's event handler code." WebKit says it more bluntly: "Requesting a push
  subscription requires an explicit user gesture."
  ([Meet Web Push](https://webkit.org/blog/12945/meet-web-push/), Brady Eidson, 7 June 2022)
- **A service worker**, for classic Web Push: "Add a service worker that handles receiving push
  notifications." (Declarative Web Push relaxes this — §2.3.)
- **A server.** Apple's list is unambiguous: prepare a VAPID key pair, build and encrypt each payload,
  and send to the push service per RFC 8030. "If your network infrastructure limits which URLs your
  server can access, allow access for `https://*.push.apple.com`." The endpoint is APNs; TLS with SNI
  is required; HTTP/1.1 and HTTP/2 are both supported.
- **No Apple Developer Program membership.** "You don't need to join the Apple Developer Program to
  send web push notifications." This is a real cost saving worth knowing.
- **The Badging API comes free with notification permission.** "Permission for a Home Screen web app to
  use the Badging API is automatically granted when a user gives permission for notifications."
  ([Safari 16.4 features](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)) —
  `navigator.setAppBadge` / `clearAppBadge`, iOS 16.4+.

### 2.3 Declarative Web Push (iOS 18.4+) removes the service worker, not the server

**SPECIFIED.** [Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/),
Brady Eidson, 27 March 2025: it "allows web developers to request a Web Push subscription and display
user visible notifications without requiring an installed service worker" — the push payload is a
standardised JSON document the browser renders directly. Available on iOS/iPadOS 18.4 for
home-screen web apps ([Safari 18.4 features](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)).

**It does not create a local scheduling path.** A remote server still sends every message. It changes
who renders the notification, not who originates it.

### 2.4 Every push must be user-visible, or the subscription dies

**SPECIFIED**, and this is a hard design constraint, not a guideline:

> "Safari doesn't support invisible push notifications. Present push notifications to the user immediately after your service worker receives them. If you don't, Safari revokes the push notification permission for your site."
> — Apple, [Sending web push notifications](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

> "When a web application registers a push subscription, they promise that pushes will always be user visible." … "Violations of the `userVisibleOnly` promise will result in a push subscription being revoked."
> — [Meet Web Push](https://webkit.org/blog/12945/meet-web-push/)

So push **cannot** be repurposed as a silent background-sync trigger on iOS. Every wake-up costs the
user a visible notification. This closes the obvious workaround for the missing Background Sync API
(§4.5).

### 2.5 There is no local scheduled-notification path on iOS web. None.

This is the sharpest answer in the whole document, and it is establishable from three directions:

1. **It is not in the spec.** The WHATWG [Notifications API Standard](https://notifications.spec.whatwg.org/)
   defines `NotificationOptions` as `dir, lang, body, navigate, tag, image, icon, badge, vibrate,
   timestamp, renotify, silent, requireInteraction, data, actions`. There is no `showTrigger`, no
   `TimestampTrigger`, and no scheduling concept anywhere in the standard. The `timestamp` member
   records when an event *happened*, not when to display — the spec's own example is a message that
   "couldn't immediately be delivered because the device was offline".
2. **The proposal that would have provided it is dead at its only implementer.** Chrome's own
   documentation carries a termination notice: "The development of Notification Triggers API, part of
   Google's capabilities project, has ended. It wasn't clear that we could provide consistent and
   reliable experiences across platforms."
   ([Chrome for Developers, Notification Triggers API](https://developer.chrome.com/docs/web-platform/notification-triggers) —
   first-party for Chrome, and the API never existed anywhere else.)
3. **WebKit never even took a position on it.** A search of
   [WebKit/standards-positions](https://github.com/WebKit/standards-positions) for notification
   triggers returns zero issues; the only notification-related issues are
   [#318 (requireInteraction)](https://github.com/WebKit/standards-positions/issues/318) and
   [#89 (Incoming Call Extension)](https://github.com/WebKit/standards-positions/issues/89), neither
   about scheduling. There was no spec to have a position on.

**Conclusion: on iOS 26.6, every scheduled nudge to an installed PWA must originate from a server
pushing to APNs.** There is no timer, no alarm, no trigger, and no local scheduling primitive on the
web platform that survives the app being closed.

(Out-of-band alternatives — a repeating iOS Calendar event, a Shortcuts personal automation — are real
and would work for a single user, but they are user-configured OS features, not web APIs, and the app
cannot create or control them from JavaScript. I did not research their mechanics; they are named here
only so the ticket's option list stays honest.)

### 2.6 Reliability: what I can and cannot say

**NOT ESTABLISHED.** I could not find a primary source documenting systematic Web Push delivery
failures for iOS home-screen web apps. What is *documented* and worth planning around:

- Permission is revoked if you ever fail to show a notification (§2.4) — a documented failure mode
  under your own control.
- Deleting and re-adding the web app destroys the subscription along with its storage, which means
  re-subscription and a new endpoint on your server.
- The push subscription is per-installation. A user with the app on two devices has two subscriptions
  — WebKit notes Focus modes sync across a user's devices for the same web app
  ([Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)),
  but the subscriptions themselves are distinct.

Widely repeated practitioner complaints about iOS push reliability exist in secondary write-ups. I
could not trace them to a WebKit bug or an Apple statement, so I am not recording them as fact.

---

## 3. Install flow

### 3.1 iOS 26 removed every installability requirement

**SPECIFIED**, and this is the biggest change in the last few years.
[WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
(15 September 2025), section "Every site can be a web app on iOS and iPadOS":

> "By default, every website added to the Home Screen opens as a web app. If the user prefers to add a bookmark for their browser, they can disable 'Open as Web App' when adding to Home Screen — even if the site is configured to be a web app."

> "Simply put, there are now zero requirements for 'installability' in Safari. Users can add any site to their Home Screen and open it as a web app on iOS 26 and iPadOS 26."

The WWDC25 beta announcement
([News from WWDC25: WebKit in Safari 26 beta](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/),
9 June 2025) frames the before/after: previously only sites with a Web Application Manifest or
`<meta name="apple-mobile-web-app-capable">` opened as web apps; now every site does, matching the Mac
behaviour introduced in Safari 17. It adds: "Just now, nothing is _required_ beyond the basics of an
HTML file and a URL to provide a web app experience to users."

**The current install path (iOS 26.6):** Share sheet → *Add to Home Screen*, with an "Open as Web App"
toggle the user can turn off. It is entirely manual and entirely user-driven.

**Third-party browsers can offer it too**, since iOS 16.4: "iOS and iPadOS 16.4 also add support so
that third-party web browsers can offer 'Add to Home Screen' in the Share menu."
([WebKit Features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/))

### 3.2 There is no programmatic install prompt, and there never has been

**MEASURED.** `beforeinstallprompt` is **not supported in Safari on iOS from 3.2 through 26.6**, and
not on macOS Safari 3.1–27 either; Firefox does not support it anywhere
([caniuse: Window beforeinstallprompt event](https://caniuse.com/mdn-api_window_beforeinstallprompt_event)).
It is a Chromium-only event (Chrome 61+, Edge 79+).

**SPECIFIED, and freshly so.** WebKit took a formal position against it in 2026:
[WebKit standards-positions #619, BeforeInstallPromptEvent](https://github.com/WebKit/standards-positions/issues/619)
is **closed with `position: oppose`** (closed 2026-05-26), carrying `concerns: usability`,
`concerns: annoyance`, `concerns: API design`, `concerns: complexity`. Ryosuke Niwa stated the
reasoning on 2026-02-18:

> "I don't think we should provide a way for website to programmatically trigger a 'Add to Home Screen' sheet even under a user activation. User activation almost always happens on iOS because user has to tap screen to even scroll the page."

The thread also records Maciej Stachowiak's earlier position from
[bug 193959](https://bugs.webkit.org/show_bug.cgi?id=193959) (2019): "We don't have an install prompt
in Safari, either automatic or site-initiated. Unless that changes, supporting the event in WebKit
wouldn't do anything because it would never fire." The event was removed from the Web App Manifest
spec in 2020 ([w3c/manifest#836](https://github.com/w3c/manifest/pull/836)) largely on WebKit's
objections. Discussion of a replacement mechanism was still live as of July 2026 with no resolution.
This is not going to change on a timescale that matters to this project.

There is no API to trigger, request, or detect eligibility for installation on iOS. The only thing an
app can do is **detect that it is already installed** and instruct the user otherwise — via
`window.matchMedia('(display-mode: standalone)')` or the legacy `navigator.standalone`. Any "install
this app" affordance on iOS is a hand-drawn set of instructions pointing at the Share button.

### 3.3 What the manifest actually buys you, member by member

**MEASURED**, from `ApplicationManifestParser::parseManifest()` in
[Source/WebCore/Modules/applicationmanifest/ApplicationManifestParser.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/applicationmanifest/ApplicationManifestParser.cpp).
WebKit parses exactly these members and no others:

`start_url`, `dir`, `display`, `lang`, `name`, `description`, `short_name`, `scope`,
`background_color`, `theme_color`, `categories`, `icons`, `shortcuts`, `id`, `orientation`, and a
non-standard `color_scheme_dark` object from which it reads `background_color` and `theme_color`.

Details worth knowing:

- **`display`** accepts only `browser`, `fullscreen`, `minimal-ui`, `standalone`. An absent, non-string,
  or unrecognised value falls back to `browser` and logs a console warning. Since iOS 26 this no longer
  determines *installability*, but it still determines the chrome you get.
- **`display_override` is not parsed at all.** Neither are `screenshots`, `share_target`,
  `protocol_handlers`, `file_handlers`, `launch_handler`, `related_applications`, or
  `prefer_related_applications`. Shipping them is harmless but inert on WebKit.
- **`icons`** entries are parsed for `src`, `sizes`, `type`, and `purpose`; `purpose` accepts
  `any`, `maskable`, `monochrome`, defaulting to `any`.
- **`scope`** defaults to `URL(start_url, "./")` when absent — i.e. the start URL's directory. If the
  app is served from a subpath, set `scope` explicitly rather than relying on the default.
- **`shortcuts`** and **`categories`** were added for macOS in Safari 17.4 — shortcuts define custom
  File-menu and Dock-context-menu commands; categories name auto-created Launchpad folders
  ([WebKit Features in Safari 17.4](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/),
  5 March 2024). Neither does anything visible on iOS as far as I could establish.

**For push specifically, the manifest is not the gate — installation is.** Nothing in Apple's push
documentation or the WebKit push posts names a required manifest member. The requirement is that the
app was added to the Home Screen (§2.1).

### 3.4 Icons: a genuine documentation gap

**NOT ESTABLISHED.** I could not find a current, first-party Apple or WebKit statement specifying
required icon sizes and formats for a Home Screen web app on iOS 26, or stating whether
`<link rel="apple-touch-icon">` is still needed alongside manifest `icons`.

What exists:
- Apple's [Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
  describes `apple-touch-icon.png` and the `apple-mobile-web-app-capable` meta tag — but it lives under
  `developer.apple.com/library/archive/` and is **archived documentation**, predating the manifest era.
- WebKit's parser demonstrably reads manifest `icons` with `src`/`sizes`/`type`/`purpose` (§3.3), which
  establishes that manifest icons are consumed but not that `apple-touch-icon` is obsolete.
- [Apple Developer Forums thread 738535](https://developer.apple.com/forums/thread/738535) ("Specify
  custom icon for Safari 17") contains a detailed, plausible answer — manifest served as
  `application/manifest+json`, SVG plus 512×512 and 1024×1024 PNG/WebP, no transparency — but **no
  Apple employee replied**; every response is from a community member. Apple-hosted is not
  Apple-authored. Treat as ASSERTED.

**Practical advice, marked as advice rather than fact:** ship both — manifest `icons` and an
`apple-touch-icon` link — and verify on a device. The cost of shipping both is one extra `<link>`.

---

## 4. Background work

### 4.1 Background Sync: not implemented, never has been, no formal position

**MEASURED.** `ServiceWorkerRegistration.sync` is **not supported in Safari on iOS 3.2 through 26.6**,
nor on macOS Safari through 27; Chrome has had it since 49
([caniuse: ServiceWorkerRegistration.sync](https://caniuse.com/mdn-api_serviceworkerregistration_sync)).

The WebKit tracking bug [#201866 "Background Sync API"](https://bugs.webkit.org/show_bug.cgi?id=201866)
was filed 2019-09-17 by an external developer describing exactly this project's problem — storing form
submissions in IndexedDB while offline and needing them to sync later. It is **status NEW**, last
touched 2023-12-15, with no WebKit engineer comment beyond the automated radar import.

WebKit's standards-positions issue
[#14, Web Background Synchronization](https://github.com/WebKit/standards-positions/issues/14), is
**open with no `position:` label** — carrying `concerns: privacy`, `concerns: power`,
`topic: app-like capabilities`. The substantive comments:

> "Background Sync might be limited enough to be ok, but we generally have power and security concerns about invisible background script execution by a site that the user isn't currently visiting (potentially even if the browser is not running / not frontmost)."
> — Maciej Stachowiak, 2022-07-01

> "Adding `concerns: power` as generally having activity running in the background is not great for battery life." … "Adding `concerns: privacy` as this would allow a website to monitor you switching IP addresses."
> — Anne van Kesteren, 2022-10-11

An external developer proposed gating it on home-screen installation as a trust signal. Anne van
Kesteren rejected that reasoning on 2023-02-10: "I might add a game to my homescreen to make it easier
to get to. Doesn't mean I trust the code."

**Sources disagree here, and the disagreement is worth naming.** The formal standards position is
*unstated* (concerns raised, no verdict). But Maciej Stachowiak wrote flatly on the bug tracker in
2019 that "We are opposed to Service Worker Background Sync" (see §4.2). Formally undecided; in
practice, opposed and unimplemented for seven years. Plan against the practice.

### 4.2 Periodic Background Sync: explicitly refused

**MEASURED.** `ServiceWorkerRegistration.periodicSync` is **not supported in Safari on iOS through
26.6** or macOS Safari through 27; Chrome has had it since 80
([caniuse: periodicSync](https://caniuse.com/mdn-api_serviceworkerregistration_periodicsync)).

[bugs.webkit.org #204117](https://bugs.webkit.org/show_bug.cgi?id=204117), "Feature: Add support for
Periodic Background Sync", was **RESOLVED WONTFIX** by Maciej Stachowiak on 2019-12-07 with an explicit
statement of intent:

> "We oppose this feature and will not implement it. Reasons: (1) We are opposed to Service Worker Background Sync and this extends Background Sync. (2) We agree with all the reasons that Mozilla stated in considering this specification to be 'harmful.'"

The reasons given: "Without a solution for hiding IP addresses, this enables persistent IP-based
tracking"; "Periodic BackgroundSync could be used to build BotNets"; "Periodic background execution is
likely to harm mobile device battery life"; and that "Background Fetch serves some of the same use
cases in a safer way and has wider consensus."

This is not a backlog item. It is a refusal on the record. Do not architect anything that assumes it
will arrive.

### 4.3 Background Fetch: also unavailable

**MEASURED.** [WebKit standards-positions #149, Background Fetch](https://github.com/WebKit/standards-positions/issues/149)
is open, labelled `concerns: privacy` and `concerns: maintenance`, and shows **"Needs position"** — no
position label assigned. Stachowiak's 2019 WONTFIX called it a safer alternative, and WebKit's
youennf noted in 2023 on issue #14 that "background fetch scope is partially intersecting with
background sync, but it does not have the same privacy/power concerns" — but the position was never
taken and it is not implemented in Safari. It is not an available option on iOS 26.6.

### 4.4 What actually runs when the app is not in the foreground

**SPECIFIED, by elimination and by the push documentation.** The only mechanism that wakes a service
worker in a closed iOS home-screen web app is **an incoming push message** — Apple's guidance is "Add a
service worker that handles receiving push notifications" and the `push` event is the entry point
([Apple, Sending web push notifications](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)).

And that wake-up is not free: §2.4 requires that you show a user-visible notification for every push
or lose the subscription. So the service worker *can* run in the background, but only in a window
opened by a push you paid for with a notification.

**NOT ESTABLISHED:** I could not find a primary source stating an execution time budget for the iOS
`push` handler, or the exact conditions under which WebKit terminates a service worker in a
home-screen web app. Assume the window is short and do not architect a long sync inside a push handler
without measuring it.

### 4.5 What this forces

There is no API that lets an installed iOS PWA flush queued offline writes while it is closed:
Background Sync (unimplemented, opposed), Periodic Background Sync (WONTFIX), and Background Fetch
(no position, unimplemented) are all unavailable, and push cannot be used silently as a substitute
because of the `userVisibleOnly` rule.

The only reliable sync trigger is **the app being open**. In practice that means: queue writes locally,
and flush on app open, on `visibilitychange` to visible, and on regained connectivity while open. For
a once-a-day habit app this is an acceptable constraint — the user opens the app every day by design,
which is exactly when the sync can run.

---

## 5. Web Share Target API and low-friction capture on iOS

Added to this ticket after the initial four areas, because capture speed became load-bearing when the
app took over word capture from Google Keep.

### 5.1 Web Share Target does not exist on iOS. It is not close.

**MEASURED, from three independent directions.**

**The manifest member is not parsed at all.** WebKit's `ApplicationManifestParser::parseManifest()`
reads exactly the fifteen members listed in §3.3. `share_target` is **not among them**. A
`share_target` block in your manifest is read past and discarded — WebKit does not even warn about it
([ApplicationManifestParser.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/applicationmanifest/ApplicationManifestParser.cpp)).
This is the most direct evidence available: the feature is not partially implemented or gated behind a
flag; the configuration surface does not exist.

**The tracking bug is seven and a half years old and still open.**
[bugs.webkit.org #194593, "Add support for Web Share Target API"](https://bugs.webkit.org/show_bug.cgi?id=194593),
was filed 2019-02-13 by Thomas Steiner. It is **status NEW**, no resolution, with 23 comments — all of
them external developers asking for it, most recently on **2026-05-23**. No WebKit engineer has ever
committed to it in the thread.

**WebKit's formal standards position is "neutral", and has been since 2023.**
[WebKit standards-positions #11, Web Share Target API](https://github.com/WebKit/standards-positions/issues/11),
carries the label `position: neutral` alongside `concerns: security` and `concerns: integration`, and
was closed 2023-03-23 by WebKit's `hober` with "Closing as we've identified our position." The position
itself, drafted by Marcos Caceres on 2022-11-11:

> "WebKit's position is 'neutral' but with concerns." … "Stronger spec wording may be required to make sure that a regular web application can't change its visual identity after the user has registered a site as a share target" … "The WebKit community probably needs to evaluate if the mechanism proposed is compatible across various platforms (particularly macOS, which use 'Share Extensions', and iOS, which relies on 'Actions')."

Maciej Stachowiak named the underlying worry on 2022-07-01 in the same thread:

> "Potential security concerns if this allows a website to appear in the Share Sheet with a site-chosen icon and name, as it can then intentionally duplicate a popular or preinstalled app and thus mislead users."

**Spec status:** Web Share Target is a WICG unofficial draft
([w3c.github.io/web-share-target](https://w3c.github.io/web-share-target/)), not a W3C Recommendation
track document, and Chromium is its only implementer. MDN marks the `share_target` manifest member
"Limited availability … not Baseline because it does not work in some of the most widely-used browsers"
and "Experimental"
([MDN: share_target](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)).
Where it does work, it accepts `action`, `method` (GET/POST), `enctype`
(`multipart/form-data`), and `params` for `title`, `text`, `url`, and `files` — and it requires the app
to be installed.

**Verdict for §5.1: no. An installed iOS PWA cannot appear in the iOS share sheet, on iOS 26.6 or any
earlier version.** Neutral-with-security-concerns plus an untouched seven-year bug is not a feature
arriving soon. Do not design around it.

Note the asymmetry that makes this especially frustrating: the **outbound** Web Share API
(`navigator.share`) *is* implemented in WebKit — supported on iOS Safari since **12.2** and still
supported at 26.6 ([caniuse: web-share](https://caniuse.com/web-share)) — so the app can push content
out to the share sheet but cannot receive anything back.

### 5.2 Reframing: the share sheet would not have solved the stated problem anyway

The requirement is "the user hears a word in a meeting and needs it in the app in about five seconds."

The share sheet answers a different question. It routes content **from a source app** — a selection in
Safari, a message in Slack, a link in Mail — into a destination app. A word *heard out loud* has no
source app and nothing on screen to share. Even on Android, where Web Share Target works perfectly,
this capture would not use it.

So there are actually two capture jobs, and they need separating:

- **Job A — heard, not on screen** (the stated five-second requirement). Share sheet is irrelevant.
  What competes with Google Keep here is *how few taps from lock screen to a focused text field*.
- **Job B — read somewhere else** (a term in a doc, a Slack message, an article). This *is* the share
  sheet's job, and it is the one iOS blocks. §5.4 covers the workaround.

### 5.3 Job A: yes, a PWA can meet the bar — via a dedicated home-screen capture icon

**SPECIFIED.** Since iOS 26, "there are now zero requirements for 'installability'" and "Users can add
any site to their Home Screen and open it as a web app"
([WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
"Any site" means any **URL** — so a capture route such as `https://app.example/capture` can be its own
Home Screen icon, opening directly onto a screen whose only content is an autofocused text field and a
save button.

Tap count from a locked phone: wake + Face ID → tap capture icon → type → save. That is the same
number of deliberate actions as Google Keep (wake → tap Keep → tap "Take a note" → type → done), with
one fewer in-app tap because the capture icon skips the app's own home screen. Combined with §1
(IndexedDB survives in an installed app) and §4.5 (flush on open), the capture can be written locally
and synced later, so it works with no signal in a basement meeting room — which Keep, syncing to
Google, does not reliably do.

**Verdict for Job A: yes, this bar is meetable, and the mechanism is pure PWA with no OS integration
required.** Two caveats, both honest:

- **NOT ESTABLISHED: cold-start latency of an iOS home-screen web app.** I found no primary source
  quantifying launch time, nor a statement about whether iOS keeps a home-screen web app warm or
  relaunches it cold each time. A precached app shell served by a service worker should be
  sub-second, but "should be" is not measured. **This is the single highest-value thing to prototype**,
  because if a cold launch takes three seconds the whole argument weakens.
- **NOT ESTABLISHED: whether two Home Screen icons for the same origin are one web app or two.**
  WebKit parses the manifest `id` member (§3.3), which is the spec's identity key, but I found no
  Apple or WebKit statement on how iOS treats two icons added from different URLs of the same origin —
  one storage bucket or two, one web app or two. Since they share an origin they should share storage,
  but this is inference. **The zero-risk alternative is one icon whose landing screen is capture-first**
  — the capture field is simply the first thing the app shows. That sidesteps the question entirely and
  costs one tap at most.

### 5.4 Job B, and the voice path: iOS Shortcuts, first-party documented

Where the web platform has no answer, iOS Shortcuts does, and Apple documents all of it. This is not a
web API and the app cannot create or install these automations from JavaScript — the user configures
them once, by hand.

- **A shortcut can be put in the system share sheet.** "To allow a shortcut to run from within other
  apps, you must enable it to appear in the share sheet … turn on Show in Share Sheet", and "The share
  sheet allows you to use content from an app as input"
  ([Apple, Receive onscreen items from other apps](https://support.apple.com/guide/shortcuts/receive-onscreen-items-apd350ce757a/ios)).
  This is the only route to Job B on iOS.
- **A shortcut can POST to an API.** The `Get Contents of URL` action, "switched to POST, PUT, or
  PATCH", exposes a `Request Body` parameter
  ([Apple, Request your first API in Shortcuts](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios)).
  So a share-sheet shortcut can send selected text straight to a capture endpoint.
- **A shortcut can also just open a URL**, including a deep link into the web app with the text as a
  query parameter — no server endpoint needed, and the write happens in the PWA where it can go into
  IndexedDB offline. Given §5.3 this is usually the better choice.
- **A shortcut can be triggered fast, several ways**, all Apple-documented:
  [Home Screen icon](https://support.apple.com/guide/shortcuts/add-a-shortcut-to-the-home-screen-apd735880972/ios),
  [Control Center control](https://support.apple.com/guide/shortcuts/run-shortcuts-from-control-center-apd06a9201d4/ios),
  [the Action button on iPhone 15 Pro and later](https://support.apple.com/guide/shortcuts/run-shortcuts-with-the-action-button-apdfea15680b/ios),
  [Back Tap (Settings › Accessibility › Touch › Back Tap)](https://support.apple.com/guide/shortcuts/run-shortcuts-tapping-iphone-apd897693606/ios),
  and Siri by name.
- **A shortcut can be run from a URL scheme**
  ([Apple, Run a shortcut using a URL scheme](https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios)),
  which matters mainly for chaining, not for capture.

**Two real costs of the Shortcuts path, stated plainly:**

1. **A POST-to-API shortcut needs the network at capture time.** Shortcuts has no offline queue. In a
   meeting room with no signal the capture fails or hangs, which is exactly the case the PWA path
   handles well. It also needs an authenticated endpoint, which pulls in
   [stack, hosting, and LLM key custody](../issues/06-stack-hosting-and-llm-key-custody.md).
2. **The Siri/voice variant is attractive but probably wrong for this domain.** This vocabulary list is
   `hyperscaler`, `gravitas`, `community of practice vs center of excellence`. Dictation accuracy on
   exactly that kind of jargon is the weak point, and a mis-transcribed capture is worse than no
   capture. **NOT ESTABLISHED** — I did not test dictation accuracy and found no source on it — but it
   is a reason to treat voice as a nice-to-have, not the primary path.

### 5.5 Capture: the bottom line

- **Web Share Target: no, on iOS 26.6.** Not implemented, manifest member not parsed, bug open since
  2019, WebKit position neutral-with-security-concerns. Do not put `share_target` in the manifest
  expecting anything.
- **Five-second capture of a heard word: yes, achievable, and without any OS integration.** A
  capture-first landing screen (or a dedicated `/capture` Home Screen icon) puts the PWA at parity with
  Google Keep, and beats it offline. This is a UI decision, not a platform limitation.
- **Capture of text seen in another app: only via a user-installed iOS Shortcut in the share sheet.**
  Available and first-party documented, but it is manual one-time setup and cannot be shipped with the
  app. Acceptable for a single-user app; would be unacceptable for a product.
- **The one thing that could still falsify this: home-screen web app cold-start time.** Measure it
  before committing.

## 6. Summary table

| Capability | iOS 26.6 status | Grade | Primary source |
|---|---|---|---|
| IndexedDB / Cache Storage, installed app | Exempt from 7-day ITP cap | SPECIFIED | [webkit.org/tracking-prevention](https://webkit.org/tracking-prevention/) |
| IndexedDB / Cache Storage, Safari tab | Deleted after 7 days without interaction | SPECIFIED | [webkit.org/tracking-prevention](https://webkit.org/tracking-prevention/) |
| `navigator.storage.persist()` | Supported since iOS 15.2; grants for standalone web apps | MEASURED | [caniuse](https://caniuse.com/mdn-api_storagemanager_persist), [WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/storage/NetworkStorageManager.cpp) |
| Storage quota | ~60% origin / ~80% overall of disk, no prompt | SPECIFIED | [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/) |
| Web Push | iOS 16.4+, **home-screen web apps only**, user gesture, VAPID, server | SPECIFIED | [Apple docs](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) |
| Declarative Web Push | iOS 18.4+, no service worker needed, still server-sent | SPECIFIED | [Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/) |
| Silent push | Forbidden; revokes permission | SPECIFIED | [Apple docs](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [Meet Web Push](https://webkit.org/blog/12945/meet-web-push/) |
| Local scheduled notifications | Do not exist on the web platform | SPECIFIED | [Notifications Standard](https://notifications.spec.whatwg.org/), [Chrome: Notification Triggers](https://developer.chrome.com/docs/web-platform/notification-triggers) |
| Badging API | iOS 16.4+, granted with notification permission | SPECIFIED | [Safari 16.4 features](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/) |
| Install | Manual Share → Add to Home Screen; zero manifest requirements since iOS 26 | SPECIFIED | [Safari 26.0 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) |
| `beforeinstallprompt` | Not supported, any Safari version | MEASURED | [caniuse](https://caniuse.com/mdn-api_window_beforeinstallprompt_event) |
| Background Sync | Not implemented; open bug since 2019; position unstated but negative | MEASURED | [#201866](https://bugs.webkit.org/show_bug.cgi?id=201866), [position #14](https://github.com/WebKit/standards-positions/issues/14) |
| Periodic Background Sync | **WONTFIX** — explicit refusal | MEASURED | [#204117](https://bugs.webkit.org/show_bug.cgi?id=204117) |
| Background Fetch | Not implemented; "Needs position" | MEASURED | [position #149](https://github.com/WebKit/standards-positions/issues/149) |
| Web Share Target | Not implemented; `share_target` not parsed; bug open since 2019 | MEASURED | [#194593](https://bugs.webkit.org/show_bug.cgi?id=194593), [position #11](https://github.com/WebKit/standards-positions/issues/11), [manifest parser](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/applicationmanifest/ApplicationManifestParser.cpp) |
| Web Share (outbound `navigator.share`) | Supported on iOS since 12.2 | MEASURED | [caniuse: web-share](https://caniuse.com/web-share) |
| Shortcut in share sheet / Action button / Back Tap | Available, user-configured, not app-installable | SPECIFIED | [Apple Shortcuts guide](https://support.apple.com/guide/shortcuts/receive-onscreen-items-apd350ce757a/ios) |

## 7. What I could not establish

1. **Device-verified behaviour of `persist()` inside an installed iOS 26 web app.** Source reading says
   it grants; nobody at Apple has written that down and I did not run it on hardware. One line of
   JavaScript in the real app closes this.
2. **Icon requirements for iOS 26 home-screen web apps.** The only Apple doc is archived and
   pre-manifest; the detailed forum answer has no Apple author (§3.4).
3. **Any execution time budget for the service worker `push` handler on iOS** (§4.4).
4. **Whether the IndexedDB-instability reports circulating in secondary write-ups correspond to any
   current, reproducible defect.** No primary source found either way (§1.5).
5. **Whether `shortcuts`, `categories`, or `orientation` have any observable effect on iOS** — WebKit
   parses them (§3.3), but the only documented behaviour is macOS-specific.
6. **Whether iOS 26's "every site can be a web app" changes anything for push.** Apple's push doc still
   says iOS 16.4+ for Home Screen web apps and no source says otherwise, so the answer is almost
   certainly no — but no source explicitly addresses the interaction.
7. **Cold-start latency of an iOS 26 home-screen web app** (§5.3). No primary source quantifies it, and
   none says whether iOS keeps a home-screen web app warm or relaunches it cold. This is the biggest
   unmeasured risk to the five-second capture claim, and the cheapest to close with a prototype.
8. **Whether two Home Screen icons for different URLs of the same origin are one web app or two**, and
   whether they share storage (§5.3). Same-origin suggests shared storage; iOS behaviour is undocumented.
9. **Siri dictation accuracy on this vocabulary domain** (§5.4). Not tested, no source. Relevant only if
   the voice capture path is pursued.
