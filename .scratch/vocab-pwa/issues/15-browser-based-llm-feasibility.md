# Browser-based LLM feasibility

Type: research
Status: resolved
Blocked by: —

## Question

Can recent Google on-device work (Gemma 3 / Gemma 3n, MediaPipe LLM Inference for Web, LiteRT, Chrome's built-in Prompt API) run the generation step of this app in a browser, and would doing so actually help?

Two questions, and the second is the one that decides it.

**Is it feasible?** Specifically on iOS Safari, since the destination is an installed iPhone PWA, and separately on desktop Chrome, since Kyle uses both devices.

**Does it help?** [Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) needs a server for three reasons that have nothing to do with the model: serving the app, a cloud database so two devices agree, and a scheduler for the 1pm nudge. A browser model removes an API key and some tokens; it does not remove the backend. So the case for it has to be made on cost, privacy, or offline capability, not on architectural simplification.

**The quality bar it must clear.** [Generation prompt](12-generation-prompt.md) established that content quality *is* this product. The model must split senses correctly, and write a `definition`, a `caution` (when *not* to use a word, requiring knowledge of Kyle's professional register), an `example`, 3-5 rotating situation `cues`, and 5 plausible-but-wrong `distractors`. A model that produces dictionary-flat definitions fails, regardless of how well it runs.

## Amends if the answer is yes

[Stack, hosting, and LLM key custody](06-stack-hosting-and-llm-key-custody.md) and [Generation prompt](12-generation-prompt.md), both currently resolved.

## Answer

**No.** Keep generation on the Worker with `claude-opus-5`. Full research, every claim labelled MEASURED / SPECIFIED / ASSERTED / CALCULATED, in [browser-llm.md](../research/browser-llm.md).

### Feasibility — iOS

**Not feasible, and not close.** WebGPU does ship in Safari 26 on iOS (verified against webkit.org). Everything after that fails.

The binding constraint is not the WebGPU buffer cap — that turned out to be `clamp(Metal maxBufferLength / 3, 256 MiB, 1 GiB)`, read straight out of WebKit's `HardwareCapabilities.mm`, which is exactly where the project's earlier "256 MB to ~993 MB" figures came from. The binding constraint is **the WebContent process memory budget**. "Llamas on the Web" (arXiv:2605.20706, UC Santa Cruz + Microsoft Research, May 2026) measured 10 models across 16 GPUs and states plainly: **"on iOS devices Safari tab memory is limited to <500 MB."** Only their four smallest models fit; **Qwen3-0.6B at q4 (0.40 GB) is the high-water mark**, and a 1B model at q4 (0.90 GB) already did not fit.

Against that ceiling: the only model LiteRT-LM's web API supports is Gemma 4 E2B, whose `-web.litertlm` file is **2.01 GB**. Off by 4–5×. The PLE memory-mapping trick that produces Google's headline "1.1 GB mobile" figure needs `mmap`, which does not exist in a browser.

Corroborating reports from people who actually tried, not capability tables:
- [web-llm #753](https://github.com/mlc-ai/web-llm/issues/753): on iOS 26 Safari, SmolLM2-135M runs (reporter: *"didn't produce the quality of results I needed"*); Qwen2.5-3B-q4 downloads fully then Safari kills the tab. Closed unfixed — *"I do not believe this can be fixed on our side."*
- [LiteRT-LM #2368](https://github.com/google-ai-edge/LiteRT-LM/issues/2368), **"web api doesn't run on ios/android", still open**. The JSPI/`WebAssembly.Suspending` blocker was real and is fixed in 0.14.0, but Google's own maintainer on iOS: *"I'm not sure if that will completely fix it."*
- transformers.js on Safari was measured climbing to 10 GB until the tab was killed.

Home-screen installation does not help: it changes storage eviction (ticket 02), not the runtime memory budget.

### Feasibility — desktop Chrome

**Feasible, and it got materially better in May 2026.** The Prompt API shipped **enabled-by-default on the desktop web in Chrome 148 (2026-05-05)** — no flag, no origin trial for basic text. Gemini Nano lives in the Chrome profile as a browser-level component shared by every origin, so on a qualifying machine **the app pays no model download at all**. JSON-schema response constraints are supported. It is free.

The gates: macOS 13+, **22 GB free disk**, **>4 GB VRAM** (or 16 GB RAM + 4 cores), **6144-token context window**, and `temperature`/`topK` still require an origin trial token on the open web.

### Does it help?

**No.** The server is required regardless — Pages, D1 for two-device sync, Workers Cron for the 1pm nudge, and the VAPID keypair. A browser model removes **one of two Worker secrets and about $4**: ~$4 is the entire Opus 5 cost of generating all 84 entries once (under $2 via Batch API). Privacy is not a factor for a personal word list. Offline is not a factor because ticket 04 already made generation async and non-blocking.

It runs actively **against** the architecture: ticket 06 chose server-side generation because *"it is the only shape that makes progress while the app is closed"* on iOS. A browser model only runs while the app is open and foregrounded.

And the quality bar is the thing that decides it. There is **no benchmark anywhere** for register-sensitive generation — nothing measures whether a model knows `gravitas` is wrong in a standup. The reassuring number (Gemma 3 4B scores IFEval 90.2) is the *least* applicable one: IFEval only checks verifiable constraints and **explicitly does not score content**. Meanwhile the diversity literature says the smallest models produce the most varied outputs precisely because *"their 'diverse' outputs were largely incoherent or factually inconsistent"* — which is the exact failure mode for 3–5 rotating cues per sense entering rotation with no review gate.

### Best hybrid option

**There isn't one worth taking.** Both shapes were considered and rejected:

- **Prompt API on desktop, cloud fallback on iPhone** — the only technically workable hybrid, but it produces two content qualities inside one corpus depending on which device captured the word, with no review gate to catch it, and it makes `prompt_version` ambiguous (two prompts, two models per version). It buys $4 and risks the one property the app is built on.
- **Browser model for cheap fields, frontier for hard ones** — needs a cheap field to exist. Every generated field is a quality field, and splitting them breaks the single forced-schema tool call ticket 12 depends on.

### Consequences

- **[Ticket 12 — Generation prompt](12-generation-prompt.md): no change.** `claude-opus-5`, tool-use-forced schema, server-side, versioned prompts. Confirmed rather than amended. Worth recording that the ~$4 total corpus cost is now a checked number, which is what makes "quality is the only axis" defensible.
- **[Ticket 06 — Stack, hosting, LLM key custody](06-stack-hosting-and-llm-key-custody.md): no change.** The Anthropic key stays a Worker secret; generation stays server-side. Its reasoning ("the only shape that makes progress while the app is closed") is reinforced, not weakened.
- **No new dependency, no new build step, no WebGPU/WASM path in the bundle.** This ticket removes work rather than adding it.
- **One cheap re-test if this ever reopens:** load the [LiteRT-LM web demo](https://google-ai-edge.github.io/LiteRT-LM/web_demos/chat/index.html) on Kyle's actual iPhone. Expected: the tab dies. Nobody has published an iPhone result since the JSPI fix, and [#2368](https://github.com/google-ai-edge/LiteRT-LM/issues/2368) is still open.
- **Recorded but out of scope:** a small *embedding* model (30–100 MB, WASM, no WebGPU) is comfortably within iOS budgets and could power semantic search for [ticket 11](11-browse-and-search-screen.md). Not needed at 84 rows; noted only so it is not confused with this ticket's answer.

### Caveats carried forward

- Chrome's Prompt API is a **contested vendor feature**. Mozilla is `position: negative`; **WebKit is `position: oppose`** on interoperability, privacy and portability grounds, and Apple's objection includes the observation that on OS-managed-model platforms "the browser is a client of the system model, not a host." Do not plan on a Safari Prompt API.
- Google's own explainer refuses to promise quality: *"we cannot guarantee that the models exposed by these APIs are particularly good at any given use case."*
- The §5 quality assessment is **indirect by necessity** and labelled as such in the findings file. No benchmark exists for what `caution` and `cues` actually require. The verdict rests on the asymmetry — $4 versus the app's only differentiator — not on a measurement.
