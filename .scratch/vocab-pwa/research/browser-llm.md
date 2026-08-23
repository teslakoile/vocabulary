# Browser-based LLM feasibility — findings

Research date: **2026-08-23**. Every claim below is labelled:

- **MEASURED** — a number someone actually observed and published (benchmark, profiler, device test).
- **SPECIFIED** — stated in a spec, API doc, or model card by the owning party.
- **ASSERTED** — a claim made by a vendor/blog/forum without published measurement.
- **CALCULATED-BY-YOU** — arithmetic or inference I did from the labelled inputs above. Not a source.

Status: COMPLETE.

---

## 1. Chrome built-in AI / Prompt API (Gemini Nano)

### Status — this changed materially in May 2026

**The Prompt API shipped enabled-by-default on the desktop web in Chrome 148, released 2026-05-05.** (SPECIFIED — [Chrome 148 release notes](https://developer.chrome.com/release-notes/148): "The Prompt API gives web developers direct access to a browser-provided on-device AI language model… The initial implementation supports text, image, and audio inputs.") It is no longer origin-trial or flag-gated for basic text prompting on desktop. Chrome stable as of 2026-08 is ~151, so this has been live for roughly three months.

Timeline, for the record:

| Milestone | What | Label |
|---|---|---|
| Chrome 138 (Jun 2025) | Prompt API stable **for Chrome Extensions only**; Translator, Language Detector, Summarizer stable for web | SPECIFIED |
| Chrome 139–144 | Multimodal Prompt API origin trial for the web, ended ~Mar 2026 | SPECIFIED ([Chrome blog](https://developer.chrome.com/blog/prompt-multimodal-origin-trial)) |
| **Chrome 148 (2026-05-05)** | **Prompt API on by default, desktop web** | SPECIFIED |
| Chrome 148 → | `temperature` / `topK` **sampling parameters** still require an origin trial token on the web (they are freely available in extensions) | SPECIFIED ([Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api), "Origin trial for sampling parameters") |

**Caveat worth carrying:** the sampling-parameter split means that on the open web today you get the model's default temperature unless you register for an origin trial. For a generation task that wants *varied* cues, inability to set temperature is a real (if modest) limitation. ASSERTED that this matters; I found no measurement of Gemini Nano's default temperature.

### Hardware requirements — these are stiff

Verbatim from [Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started) (SPECIFIED):

- **OS**: Windows 10/11; **macOS 13+ (Ventura and onwards)**; Linux; ChromeOS Platform 16389.0.0+ **on Chromebook Plus devices only**
- **Storage**: "At least 22 GB of free space on the volume that contains your Chrome profile". The model is *removed* if free space later drops below 10 GB.
- **GPU**: "Strictly more than 4 GB of VRAM" — **or** CPU path: "16 GB of RAM or more and 4 CPU cores or more"
- **Network**: "Unlimited data or an unmetered connection" (first download only)

> **"Chrome for Android, iOS, and ChromeOS on non-Chromebook Plus devices are not yet supported by the APIs which use foundation models."** (SPECIFIED, developer.chrome.com, read 2026-08-23)

That single sentence disposes of the iPhone half of this ticket for the Prompt API route. **Chrome on iOS is a WebKit shell and does not ship Gemini Nano. Safari does not implement the Prompt API at all.** There is no Prompt API on any iPhone browser today.

### Model download — one download for the whole browser, not per site

The weights live in the Chrome **profile** directory, in `OptGuideOnDeviceModel`, as a file called `weights.bin`. It is a Chrome *component*, downloaded once by the browser and shared by every origin that calls the API. There is **no per-site model download**. (MEASURED by multiple independent reporters inspecting profile directories in May 2026; e.g. [gHacks](https://www.ghacks.net/2026/05/06/google-chrome-is-silently-downloading-a-4gb-gemini-nano-ai-model-to-user-devices-without-consent/), [Android Authority](https://www.androidauthority.com/google-chrome-weights-bin-ai-model-download-explained-3664043/).)

**Size: ~4 GB.** Reports cluster at "roughly 4 GB" / "4.27 GB"; one source says "roughly 2 GB". FLAGGED DISAGREEMENT — I could not find a Google-published figure for the weights size; every number I found is someone measuring their own profile directory. Treat **~4 GB, MEASURED-by-third-parties, not SPECIFIED** as the honest statement.

This became a minor news cycle in May 2026 ("Chrome is silently downloading a 4 GB AI model"). Relevant to this project only in that it means: **on a machine that already has Chrome 148+ and meets the hardware bar, the model is probably already there, and the app pays no download cost.** That is genuinely the single strongest argument for this route on desktop.

### Availability API

```js
const a = await LanguageModel.availability();
// "unavailable" | "downloadable" | "downloading" | "available"
const session = await LanguageModel.create({ monitor(m) {
  m.addEventListener("downloadprogress", e => console.log(e.loaded));
}});
```
(SPECIFIED, developer.chrome.com.) `create()` requires **user activation** if a download would be triggered — you cannot silently start the 4 GB fetch from page load. Once the model is present, *no* activation and *no* permission prompt is required to run inference; that is precisely what Apple and Mozilla objected to (below).

### Context window — this is a hard blocker for this app's prompt

**~6144 tokens total.** (MEASURED — developers reading `session.inputQuota` in Chrome 138+; reported by [swyx](https://swyx.io/gemini-nano) and others.)

Earlier and lower figures from Thomas Steiner, Chrome DevRel, on the Chromium AI dev-preview group (SPECIFIED by the Chrome team, but **dated ~2024–2025 and superseded**): *"there is a per prompt limit of 1024 tokens, and the session can retain the last 4096 tokens"*, with the exception that *"the system prompt… is never removed."*

FLAGGED DISAGREEMENT: 6144 vs 1024/4096. The 6144 figure is later and matches `inputQuota` as currently exposed. I could not find a Google doc stating any number — `developer.chrome.com` documents `session.contextWindow` and `session.contextUsage` as the way to *read* the limit and deliberately does not publish a value, because it is expected to change. **Correct engineering posture: read `contextWindow` at runtime, never hard-code.**

Either way the number is small. Ticket 12's prompt carries register furniture (enterprise AI / platform engineering / investment; steering committees, sponsors, MDs, boards), sense-splitting criteria with four relationship types, and worked examples — and must emit, per sense, a definition, caution, example, 3–5 cues and 5 distractors. **6k tokens shared between input and output is roughly one sense per call with a stripped prompt, not one entry.** CALCULATED-BY-YOU, but the direction is not in doubt.

### Structured output — genuinely good news

Chrome 148 supports **response constraints**: "response constraints ensure that generated text conforms with predefined regular expression and JSON schema formats" (SPECIFIED, Chrome 148 release notes). So `responseConstraint` with a JSON schema is available, which is the mechanism ticket 12 relies on ("Schema is forced, not requested"). Schema *conformance* is enforced by constrained decoding; schema conformance is not content quality (see §5).

### Model quality tier

Gemini Nano. Google does not publish MMLU/IFEval-class benchmark numbers for the Chrome-embedded Nano build, and the API explainer explicitly disclaims quality:

> "We do not intend to provide guarantees of language model quality, stability, or interoperability between browsers. In particular, we cannot guarantee that the models exposed by these APIs are particularly good at any given use case."
> — [prompt-api README, Non-goals](https://github.com/webmachinelearning/prompt-api/blob/main/README.md#goals) (SPECIFIED by the API's own authors)

That sentence is the single most important line in this whole ticket. **The spec authors decline to promise the model is good at anything.** Not marketing hedging — Apple quotes it as grounds for opposition (below).

### Standardisation — contested, and Apple has formally opposed

Venue is the **W3C Web Machine Learning Community Group** ([webmachinelearning/prompt-api](https://github.com/webmachinelearning/prompt-api)) — a CG, i.e. incubation, **not a W3C standards-track Working Group**.

- **Mozilla: `position: negative`**, concerns: interoperability ([mozilla/standards-positions#1213](https://github.com/mozilla/standards-positions/issues/1213), closed). Mozilla's stated view is that it has "severe negative consequences to the interoperability, updatability, and neutrality of the web platform."
- **WebKit/Apple: `position: oppose`**, concerns: interoperability, privacy, **portability** ([WebKit/standards-positions#495](https://github.com/WebKit/standards-positions/issues/495), closed). Position statement by Tess O'Connor (Apple), 2026-04-30. Verbatim highlights (SPECIFIED):
  - "The API has no user consent mechanism for running inference… any top-level page can run inference silently, consuming the user's battery, CPU, and GPU resources without their knowledge. Running inference on a mobile device is quite expensive."
  - "We are not aware of another web API where the correctness of the primary output is left entirely as a quality-of-implementation issue."
  - "Developers will tune their prompts and application logic to whichever model is most widely available" — citing Mozilla's evidence of a real project (Automattic's jetpack-ai-client) tuning logic to Gemini's observed behaviour.
  - On why this is hard for Apple specifically: "On platforms where the system manages AI models, the browser is a client of the system model, not a host. This creates a portability gap."
- **W3C TAG** design review: [w3ctag/design-reviews#1093](https://github.com/w3ctag/design-reviews/issues/1093).
- Google shipped in Chrome 148 anyway, over those objections. (ASSERTED by trade press, e.g. [TechTimes 2026-05-16](https://www.techtimes.com/articles/316729/20260516/google-ships-chrome-prompt-api-over-objections-mozilla-apple-w3c-microsoft.htm); the underlying positions and the ship date are both independently SPECIFIED, so the substance holds.)

**Consequence for this project:** the Prompt API is, for planning purposes, a **Chrome-desktop-only vendor feature with an actively hostile second implementer**. Apple's portability objection is not a stalling tactic — it is a description of why Safari cannot easily implement it. Do not plan on a Safari Prompt API on any horizon that matters here.

### Any Safari / iOS equivalent?

**No web-exposed one.** Apple Intelligence's Foundation Models framework is a native Swift API available to native apps; it is not exposed to WebKit content, and Apple has just opposed the API that would expose it. A PWA on iOS gets nothing.

---

## 2. Gemma 3, Gemma 3n — and Gemma 4, which supersedes both

**Update the ticket's premise.** The ticket names Gemma 3 / 3n. **Gemma 4 was released 2026-04-02** and carries the on-device line forward; Gemma 3 and 3n remain downloadable but are the previous generation. (SPECIFIED — [Gemma releases](https://ai.google.dev/gemma/docs/releases), [Gemma 4 overview](https://ai.google.dev/gemma/docs/core), model card last-updated 2026-07-30.)

### Gemma 4 lineup (current)

| Variant | Raw params (incl. embeddings) | Effective params | Context | Modalities |
|---|---|---|---|---|
| **E2B** | 5.1B | **2.3B** | 128K | text, image, video, audio |
| **E4B** | 8B | **4.5B** | 128K | text, image, video, audio |
| 12B Unified | 11.95B | 11.95B | 256K | + native audio/video |
| 26B A4B (MoE) | 25.2B total | 3.8B active | 256K | text, image |
| 31B Dense | 30.7B | 30.7B | 256K | text, image |

(SPECIFIED — [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4).) Apache 2.0. 140+ languages.

### Gemma 4 inference memory — the numbers that decide this ticket

Verbatim from [ai.google.dev/gemma/docs/core](https://ai.google.dev/gemma/docs/core), heading "Gemma 4 Inference Memory Requirements" (SPECIFIED):

| Model | BF16 | SFP8 (8-bit) | Q4_0 (4-bit) | **Mobile** | **Mobile (text-only)** |
|---|---|---|---|---|---|
| **Gemma 4 E2B** | 11.4 GB | 5.7 GB | **2.9 GB** | **1.1 GB** | **0.84 GB** |
| **Gemma 4 E4B** | 17.9 GB | 8.9 GB | **4.5 GB** | **2.5 GB** | **2.2 GB** |
| Gemma 4 12B | 26.7 GB | 13.4 GB | 6.7 GB | — | — |
| Gemma 4 26B A4B | 57.7 GB | 28.8 GB | 14.4 GB | — | — |
| Gemma 4 31B | 69.9 GB | 34.9 GB | 17.5 GB | — | — |

Google's own footnote (SPECIFIED): the estimates "only account for the memory required to load the static model weights" and exclude "additional VRAM needed for supporting software or the context window" — i.e. **KV cache is on top**, and KV cache at a 128K context is not small.

### The critical asterisk on the "Mobile" column

Those Mobile numbers (1.1 GB / 0.84 GB for E2B) are **not** achievable in a browser, and understanding why is the crux of this whole ticket.

**Per-Layer Embeddings (PLE)** is the trick. Gemma 3n/Gemma 4 E-models give each decoder layer its own small embedding table per token. These tables are large in bytes but are pure **lookups** — they are never matrix-multiplied against, so they do not need to be resident on the accelerator. Google's docs: "PLE data can be generated separately, outside the operating memory of the model, cached to fast storage" and pulled in during inference. (SPECIFIED, [Gemma 3n overview](https://ai.google.dev/gemma/docs/gemma-3n).)

The way LiteRT-LM realises this is **memory-mapping the embedding file from disk**: "LiteRT-LM strategically reduces overhead by keeping per-layer embeddings (PLEs) out of memory… the main weights [stay] in memory, while the embedding parameters are memory mapped." For E2B the on-disk `.litertlm` file is **3.65 GB** (text decoder 2.24 GB of weights + 0.67 GB of embedding parameters), and a reported run "compresses the physical memory footprint down to **607 MB** on Apple mobile CPUs." (ASSERTED/MEASURED by a Google Developer Expert write-up and the LiteRT-LM blog, not by a formal benchmark I could verify.)

> **CALCULATED-BY-YOU, and I am confident in it: `mmap` does not exist in a browser.** WASM linear memory is a single contiguous `ArrayBuffer`; WebGPU buffers are explicitly allocated and explicitly written. There is no API by which a web page maps a file from OPFS or Cache Storage into address space and lets the OS page it in on demand. Therefore **the PLE-offload trick that produces the 0.84–1.1 GB "Mobile" figures is unavailable to a browser tab.** A browser must hold the whole thing — so the honest browser figure for E2B is the **Q4_0 column: ~2.9 GB**, plus KV cache, plus runtime overhead. If someone claims "Gemma E2B runs in 1 GB", ask whether they are mmap-ing, because in a browser they are not.

FLAG: I could not find any Google statement that directly says "PLE offload is unavailable on web". This is inference from how the mechanism works, clearly labelled as mine.

### Gemma 3 and 3n, for completeness

**Gemma 3** (Mar 2025): 270M, 1B, 4B, 12B, 27B. 128K context on 4B+, 32K on 1B and 270M. Multimodal from 4B up; 1B and 270M are text-only. (SPECIFIED, [Gemma 3 model card](https://ai.google.dev/gemma/docs/core/model_card_3).)

Gemma 3 QAT (quantisation-aware training) int4 weights, verbatim from the [Google Developers blog](https://developers.googleblog.com/en/gemma-3-quantized-aware-trained-state-of-the-art-ai-to-consumer-gpus/) (SPECIFIED):

| Gemma 3 | BF16 | int4 (QAT) |
|---|---|---|
| 1B | 2 GB | **0.5 GB** |
| 4B | 8 GB | **2.6 GB** |
| 12B | 24 GB | 6.6 GB |
| 27B | 54 GB | 14.1 GB |

Same footnote: weights only, "does not include the KV cache". QAT claim: ~5,000 training steps of quantisation-aware training gives a "54% reduction in perplexity drop" versus naive post-training Q4_0 (MEASURED by Google, perplexity only — perplexity is not instruction-following, see §5).

**Gemma 3n** (Jun 2025): E2B and E4B. Raw ~5B and ~8B parameters; E2B has "an effective memory load of just under 2 billion (1.91B) parameters". 32K context. Introduced MatFormer, PLE, LAuReL, AltUp, MobileNet-v5 vision encoder. (SPECIFIED, [Gemma 3n overview](https://ai.google.dev/gemma/docs/gemma-3n) + [developer guide](https://developers.googleblog.com/en/introducing-gemma-3n-developer-guide/).)

**MatFormer** ("Matryoshka Transformer"): the E4B model is trained with a fully-optimised E2B nested inside it, so one artefact can be run at two compute points, and intermediate slices can be extracted. Relevant here only as background — for this app you would just pick a size.

### Which are realistic in a browser tab?

Ranked by weights-only footprint (all SPECIFIED figures above; the fit judgement is CALCULATED-BY-YOU):

- **Gemma 3 1B int4 QAT — 0.5 GB.** Comfortably the only one that is *unambiguously* loadable everywhere, including a phone. Also the weakest model in the list by a wide margin.
- **Gemma 3 4B int4 QAT — 2.6 GB** / **Gemma 4 E2B Q4_0 — 2.9 GB.** Fine on a desktop with a discrete GPU or Apple Silicon; **over every documented iOS Safari WebGPU buffer limit** (see §4).
- **Gemma 4 E4B Q4_0 — 4.5 GB.** Desktop only, and a heavy ask even there.
- Everything 12B and up: not a browser proposition.

---

## 3. Runtimes that actually run these in a browser

Versions read from the npm registry on **2026-08-23**.

### MediaPipe LLM Inference API for Web — deprecated, do not start here

Verbatim notice at the top of the [LLM Inference guide for Web](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js) (SPECIFIED):

> "The MediaPipe LLM Inference API is in **maintenance-only mode**. We recommend migrating your Web projects to LiteRT-LM JavaScript API."

The same notice appears on the iOS guide (migrate to LiteRT-LM Swift API). Supported families were Gemma / Gemma-2 / Gemma-3 / Gemma-3n / Gemma 4, plus Phi-2, StableLM, Falcon, using `.task` bundles with a `-Web` suffix. Requires WebGPU: "The LLM Inference API requires a web browser with WebGPU compatibility." **The ticket names this runtime; it is now the previous generation. Any plan should target LiteRT-LM instead.**

### LiteRT-LM JavaScript API — the current Google path, and the most informative source in this whole ticket

- Package `@litert-lm/core`, **latest 0.16.0, published 2026-08-11** (MEASURED, npm registry).
- WebGPU backend, `.litertlm` model files, streaming API, configurable `maxNumTokens` (the README example uses 8192). (SPECIFIED, [README](https://github.com/google-ai-edge/litert-lm/blob/main/js/packages/core/README.md).)
- Self-described **"early preview that supports text-in / text-out running in WebGPU."** Only two models are supported today: `gemma-4-E2B-it-web.litertlm` and `gemma-4-E4B-it-web.litertlm`. "We're working on expanding this to cover general `.litertlm` model files."
- **Actual download sizes (MEASURED — Hugging Face file listing, 2026-08-23):**
  - `gemma-4-E2B-it-web.litertlm` — **2.01 GB**
  - `gemma-4-E4B-it-web.litertlm` — **2.97 GB**
  - (for reference, the native `gemma-4-E2B-it.litertlm` is 2.59 GB, and vendor-specific NPU builds run 2.95–3.29 GB)
- No CPU/WASM fallback documented for the web path; WebGPU is required.
- No stated memory requirement. Docs note only: "Initializing the engine can take several seconds to load the model."

**Safari / iOS — the maintainers' own words.** Two GitHub issues carry this, and they are the best evidence available:

[**LiteRT-LM #2616**](https://github.com/google-ai-edge/LiteRT-LM/issues/2616) (opened 2026-06-20, closed 2026-07-06). A developer trying exactly this project's scenario — a PWA on iOS Safari — found the web runtime was built with **Emscripten JSPI**, which Chrome/V8 has and WebKit does not:

> "undefined is not a constructor (evaluating 'new WebAssembly.Suspending(original)')" — on iOS Safari 26.2, `@litert-lm/core` 0.13.1, cross-origin-isolated HTTPS page, `gemma-4-E2B-it-web.litertlm`. (MEASURED by the reporter.)

They also proved a JS polyfill cannot substitute (embind handle lifetimes need real suspend/resume). Google maintainer **mattsoulanille** replied:

> "This is in progress and should be fixed in the upcoming 0.14.0 release. We'll have an `asyncify` version of the Wasm build that works on Firefox and **very recent versions of Safari** and feature detection to automatically select it on those platforms." — then "Fixed in 0.14.0" (published 2026-07-01).

[**LiteRT-LM #2368**](https://github.com/google-ai-edge/LiteRT-LM/issues/2368), titled **"web api doesn't run on ios/android"**, **still OPEN as of 2026-08-23**. Same maintainer:

> "We are aiming for support on all platforms that support WebGPU. I'm able to run Gemma 4 E2B on our web demo on my **Pixel 9** (although native performance is better). The 0.13.x web API on iOS won't work, but with 0.14.0, we're adding an Asyncify version of the Wasm files that fix the `WebAssembly.Suspending` error it has. **However, I'm not sure if that will completely fix it.**"

A later commenter (2026-07-11) reports the demo showing "model is preparing" for minutes and then **"refreshed itself"** — the signature of an iOS Safari out-of-memory tab reload. (MEASURED-ish; device not stated, so treat as a report rather than a controlled result.)

**Read that carefully.** Google's own maintainer can run E2B on a Pixel 9 and is *not confident* it will work on iOS even after the JSPI fix. The JSPI blocker is fixed; the memory question is unresolved and the issue is still open.

### transformers.js

- Package `@huggingface/transformers`, **latest 4.2.0, published 2026-04-22** (MEASURED, npm).
- Runs ONNX models via **ONNX Runtime Web**. Default backend in the browser is **WASM (CPU)**; `device: 'webgpu'` opts into GPU. Quantisation options `fp32` / `fp16` / `q8` / `q4`.
- Maintainers' own caveat (SPECIFIED, [docs](https://huggingface.co/docs/transformers.js/index)): **"The WebGPU API is still experimental in many browsers, so if you run into any issues, please file a bug report."**
- The docs are oriented at small task models (DistilBERT, MobileNetV*, embedding models), not multi-billion-parameter chat models. It *can* run small LLMs, but that is not the shape it optimises for.
- **Independently measured to leak badly on Safari**: the LlamaWeb paper (§4) observed "a memory leak … on Safari where Transformers.js climbed to 10 GB until the tab was killed." (MEASURED, UCSC/Microsoft Research.) That is a disqualifying result for the iOS path.

### WebLLM / MLC

- Package `@mlc-ai/web-llm`, **latest 0.2.84, published 2026-05-27** (MEASURED, npm).
- **WebGPU only**, no WASM CPU fallback. Compiles models through TVM/MLC to WGSL shaders plus a per-model `.wasm`; wide prebuilt catalogue (Llama 3.x, Qwen, Phi, Gemma, SmolLM, Mistral) at `q4f16_1` / `q4f32_1`.
- **iOS evidence — the single most on-point report I found:** [**web-llm #753**, "Browser tab crashes when loading a larger model on iOS 26 (Safari)"](https://github.com/mlc-ai/web-llm/issues/753) (opened 2025-12-10, **closed 2026-03-23 with no fix**). MEASURED by the reporter:
  - `SmolLM2-135M-Instruct-q0f16-MLC` — **runs, prompts complete**, but "didn't produce the quality of results I needed"
  - `Qwen2.5-3B-Instruct-q4f16_1` — downloads fully, then **"Safari terminates the tab"** with "A problem occurred with this webpage". No console output, no crash log.
  - Confirmed by a second user ("Same issue"), diagnosed by a third as OOM against WebKit's WebContent process limit, and effectively closed as not-our-bug: "I do not believe this can be fixed on our side."
- The `#729` model request for Gemma-3n-E2B is still open — WebLLM does not have the Gemma E-series in its catalogue.

### Summary table

| Runtime | Version (2026-08-23) | Backend | Models | Works on iOS Safari? |
|---|---|---|---|---|
| MediaPipe LLM Inference Web | maintenance-only | WebGPU | Gemma/Phi/Falcon `.task` | Superseded — do not use |
| **LiteRT-LM JS** | `@litert-lm/core` 0.16.0 | WebGPU (+Asyncify wasm since 0.14.0) | Gemma 4 E2B (2.01 GB), E4B (2.97 GB) | JSPI blocker fixed; **memory unresolved, maintainer "not sure"**, issue open |
| transformers.js | `@huggingface/transformers` 4.2.0 | WASM default, WebGPU experimental | ONNX; small task models | Loads, but **measured leaking to 10 GB → tab killed** |
| WebLLM / MLC | `@mlc-ai/web-llm` 0.2.84 | WebGPU only | Large prebuilt catalogue | **135M works; 3B kills the tab.** Issue closed unfixed |

---

## 4. iOS Safari feasibility — verifying the three prior claims

### Claim 1: "WebGPU ships in Safari 26" — **VERIFIED**

[WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), 2025-09-15 (SPECIFIED):

> "WebGPU has been enabled in Safari Technology Preview for over a year, and is now shipping in Safari 26.0."
> "WebGPU supersedes WebGL on macOS, **iOS, iPadOS**, and visionOS and is preferred for new sites and web apps."

Enabled by default, no flag. So the *API* is present on a current iPhone. That is necessary and nowhere near sufficient.

### Claim 2: "~256 MB on older iPhones to ~993 MB on iPad Pro" — **VERIFIED, and here is the actual code**

I traced this to WebKit's own source. [`Source/WebGPU/WebGPU/HardwareCapabilities.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebGPU/WebGPU/HardwareCapabilities.mm), `main` branch, read 2026-08-23 (SPECIFIED — this is the implementation):

```objc
static constexpr uint64_t defaultMaxBufferSize = 268435456;   // 256 MiB

static uint64_t maxBufferSize(id<MTLDevice> device)
{
    constexpr auto maxBuffersToAllow = 3;
#if PLATFORM(MAC) || PLATFORM(MACCATALYST)
    auto result = std::max<uint64_t>(std::min<uint64_t>(device.maxBufferLength, GB),
                                     std::min<uint64_t>(INT_MAX, device.maxBufferLength / maxBuffersToAllow));
#else   // <-- iOS / iPadOS / visionOS
    auto result = std::max<uint64_t>(defaultMaxBufferSize,
                                     std::min<uint64_t>(GB, device.maxBufferLength / maxBuffersToAllow));
#endif
    return multipleOf4(result);
}
```

`GB` is `1024*1024*1024` (WTF/StdLibExtras.h). So, on iOS/iPadOS, in plain English (CALCULATED-BY-YOU from the code, but it is only reading the expression):

> **`maxBufferSize` = clamp(Metal's `device.maxBufferLength` ÷ 3, floor 256 MiB, ceiling 1 GiB).**

That explains both endpoints of the prior claim exactly: **256 MiB is the hard floor** (the constant `defaultMaxBufferSize`), and the top end is capped at **1 GiB** — "993 MB" is a device-reported value just under that ceiling. Line 620 of the same file sets `maxStorageBufferBindingSize = maxBufferSize(device)`, so **on iOS the storage-binding limit equals the buffer limit** — no separate 128 MiB penalty like some Chrome/Android configurations.

For reference, the [W3C WebGPU spec](https://www.w3.org/TR/webgpu/#limits) defaults (SPECIFIED) are `maxBufferSize` = 268435456 (256 MiB) and `maxStorageBufferBindingSize` = 134217728 (128 MiB), and "Adapters are always guaranteed to support the defaults or better."

**But this is not the binding constraint**, and treating it as such is the mistake to avoid. Every serious runtime shards weights across many buffers, so a 1 GiB per-buffer ceiling does not by itself cap total model size. The thing that actually kills you is the next claim.

### Claim 3: "0.5B–1.5B models need 1–2 GB" — **REFUTED as stated, but the conclusion survives and gets worse**

At 4-bit quantisation, models in that range are **much smaller than 1–2 GB**. MEASURED file sizes from the LlamaWeb evaluation (below): Qwen3-0.6B q4_k_m = **0.40 GB**, Granite4-1B q4_k_m = **0.90 GB**, Gemma3-270M q4_k_m = 0.25 GB. The 1–2 GB figure is roughly right for **fp16**, not for q4. So the number was pessimistic in the wrong dimension.

It does not matter, because the real ceiling is **the WebContent process memory budget**, and that is *lower* than 1 GB.

### The number that actually decides it

**"Llamas on the Web: Memory-Efficient, Performance-Portable, and Multi-Precision LLM Inference with WebGPU"**, [arXiv:2605.20706v1](https://arxiv.org/html/2605.20706v1), 2026-05-20, UC Santa Cruz + Microsoft Research. 10 models × 16 GPUs across 8 vendors, including 2 iOS devices on Safari (Chrome elsewhere). This is the best measured evidence in existence for this question. (MEASURED.)

> **"Not all models run on all devices; for example, on iOS devices Safari tab memory is limited to <500 MB."**

Models evaluated, with measured file sizes, and which fit on iOS:

| Model | Quant | Size | Fits on iOS Safari? |
|---|---|---|---|
| LFM2.5-350M | q4_k_m | 0.23 GB | **yes** |
| Bonsai-1.7B | q1_0 | 0.25 GB | **yes** |
| Gemma3-270M | q4_k_m | 0.25 GB | **yes** |
| Qwen3-0.6B | q4_k_m | **0.40 GB** | **yes — the largest that fits** |
| Granite4-1B | q4_k_m | 0.90 GB | no |
| Qwen3.5-2B | q4_k_m | 1.28 GB | no |
| SmolLM3-3B | q4_k_m | 1.92 GB | no |
| Ministral3-3B | q4_k_m | 2.15 GB | no |
| **Gemma4-E2B** | q4_k_m | **3.11 GB** | **no** |

Paper's own summary: on iOS **only the four smallest models fit** (lfm, bonsai, gemma3, qwen3). Decode throughput on the iPhone cluster: **4–17 tok/s**. (Compare: ~100 tok/s for Llama-1B on an M4 Pro.)

The same paper measured transformers.js on Safari climbing "to 10 GB until the tab was killed" — which is both a transformers.js bug and a demonstration that Safari does enforce the cap by killing you.

### Corroborating independent reports of people actually trying

- **[web-llm #753](https://github.com/mlc-ai/web-llm/issues/753)** (2025-12-10 → closed unfixed 2026-03-23). iOS 26 Safari: `SmolLM2-135M-Instruct-q0f16` **runs**; `Qwen2.5-3B-Instruct-q4f16_1` (~1.9 GB) downloads and then **"Safari terminates the tab"**. Reporter's own verdict on the 135M model: *"this model didn't produce the quality of results I needed."* Reproduced by a second user. Closed as unfixable from the library side.
- **[LiteRT-LM #2368](https://github.com/google-ai-edge/LiteRT-LM/issues/2368)**, "web api doesn't run on ios/android", **still open**. Google maintainer runs Gemma 4 E2B on a Pixel 9 but on iOS: *"I'm not sure if that will completely fix it."* Later commenter's page "refreshed itself" — an OOM reload.
- **[WebKit bug 268816](https://bugs.webkit.org/show_bug.cgi?id=268816)**. Ben Nham (Apple/WebKit) states two separate limits: the WebContent process OS limit ("On iPad… For an 8GB device, the limit will be in the 4GB+ range") and the **Gigacage**, which backs TypedArrays and WASM memory: *"Currently the Gigacage supports 2GB of allocations on iOS… we will probably not change this imminently."* The bug's original measurement was an **8 GB iPad Pro M1 giving a web page only 1.88 GB via Uint8Array**. (SPECIFIED by an Apple engineer + MEASURED by the reporter.) Resolved DUPLICATE of bug 272232, June 2024.

FLAGGED DISAGREEMENT, and I cannot resolve it: the reported ceiling ranges over **<500 MB** (LlamaWeb, iPhone, measured 2026), **~300–450 MB** (third-party WebKit-internals write-up, ASSERTED), **1.88 GB** (iPad Pro M1, measured 2024), **"4GB+"** for an 8 GB iPad (Apple engineer, SPECIFIED), and **2 GB Gigacage** (Apple engineer, SPECIFIED). These are not all the same limit — Gigacage ≠ WebContent jetsam budget ≠ what a tab gets under real memory pressure, and iPad ≠ iPhone. **What is consistent: iPhone is far tighter than iPad, and the practical iPhone budget observed by people actually loading models is in the hundreds of megabytes.**

I could not find an Apple-published, per-device iPhone memory budget. There isn't one; jetsam is dynamic and depends on what else is resident.

### Does installing to the home screen help?

**No evidence that it does.** An installed PWA on iOS runs in the same WebKit WebContent process architecture under the same jetsam subsystem. Ticket 02 already established that installation changes *storage* eviction (exempting from the 7-day cap); I found nothing indicating it changes the *runtime memory* budget. (ASSERTED — absence of evidence; I could not find any Apple statement either way, and no measurement comparing standalone-mode to tab memory.)

### Plain answer

**Can a usefully-capable model load and run in an installed PWA on a current iPhone? No.**

- The largest model measured to work in iOS Safari is around **0.4 GB on disk — roughly a 0.6B model at 4-bit**. Qwen3-0.6B q4 is the high-water mark in the only systematic study I found.
- A **1B model at q4 (0.90 GB) did not fit** in that study.
- Gemma 4 E2B — the only model LiteRT-LM's web API supports — is **2.01 GB as the `-web.litertlm` file** and 3.11 GB as a q4_k_m GGUF. That is 4–8× over budget. It is not close.
- Even where it loads, decode is **4–17 tok/s** on iPhone. Generating one entry's worth of JSON (say 700–900 output tokens across senses) would take **roughly one to four minutes** of sustained GPU load, hot phone, battery drain. (CALCULATED-BY-YOU from the paper's tok/s.)
- Before any of that, the app must download 0.4 GB+ of weights over the user's connection and store them, versus Chrome's zero-cost shared model.

**The largest model that realistically runs on a current iPhone in a browser is ~0.6B at 4-bit.** For a task whose whole point is register-sensitive professional English, a 0.6B model is not a candidate — see §5.

---

## 5. Quality at 1B–4B for *this* task — the deciding question

### Up front: there is no direct evidence, and I am not going to manufacture some

**I could not find any benchmark that measures what this app actually needs.** Nothing measures whether a model knows that `gravitas` sounds arch in a standup, or that `panopticon` carries a critical connotation, or can invent five *materially different* steering-committee situations for `idempotent` without teaching the situation instead of the word. The closest research areas are pragmatics benchmarks (PUB, PragmEval, MultiPragEval), which test implicature, presupposition, reference and deixis as **multiple-choice comprehension** — not register-appropriate **generation**. There is no register/connotation *generation* benchmark at any model size, let alone one broken out at 1B–4B.

So everything below is indirect. It is labelled as such, and where I am reasoning rather than reporting I say so.

### What the benchmarks do say

**IFEval** (SPECIFIED, [Gemma 3 Technical Report](https://arxiv.org/html/2503.19786v1) Table 18):

| Model | IFEval |
|---|---|
| Gemma 3 1B | 80.2 |
| Gemma 3 4B | 90.2 |
| Gemma 3 12B | 88.9 |
| Gemma 3 27B | 90.4 |

Read that and you would conclude a 4B model follows instructions as well as a 27B one. **It does not mean that.** IFEval is a set of *verifiable* instructions — 25 types like "write exactly four paragraphs", "include the word X at least 3 times", "write in JSON format". From the benchmark's own framing (SPECIFIED, [Zhou et al. 2023](https://arxiv.org/pdf/2311.07911)): **IFEval scores do not consider the content of the model output — only whether the checkable requirement was met.** The example given in the literature is exact: it checks the frequency of the letter "i", not whether the story is any good.

This project's prompt is almost entirely *unverifiable* instructions. "Write a caution that reflects a senior investment-committee register" has no regex. **IFEval at 90 tells you the model will return well-formed JSON with five cues in it. It tells you nothing about whether the cues are good.** This is the single most important interpretive point in this section.

**Gemma 4 E-series reasoning/knowledge** (SPECIFIED, [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4)):

| Benchmark | E2B | E4B | 12B |
|---|---|---|---|
| MMLU Pro | 60.0 | 69.4 | 77.2 |
| GPQA Diamond | 43.4 | 58.6 | 78.8 |
| BigBench Extra Hard | 21.9 | 33.1 | 53.0 |
| MMMLU | 67.4 | 76.6 | 83.4 |

Note **BigBench Extra Hard: E2B 21.9 vs 12B 53.0** — on the hardest reasoning set the on-device models fall off a cliff, more than halving. Google does not publish IFEval for the Gemma 4 E-series. (FLAG: an absence, not a finding.)

Independent corroboration: [arXiv:2604.07035](https://arxiv.org/html/2604.07035v1) measured weighted accuracy on ARC-C/GSM8K/MATH/TruthfulQA at **E2B 0.493, E4B 0.675** — E4B is substantially better than E2B, and E2B is near coin-flip on a reasoning composite. (MEASURED.)

### Structured output — solved, and it does not help the part that matters

Chrome's Prompt API supports JSON-schema `responseConstraint`; LiteRT-LM and llama.cpp-family runtimes support grammar-constrained decoding. Schema conformance is therefore **mechanically guaranteed**, not model-dependent.

Two papers disagree about whether constraining hurts, and the disagreement is worth flagging because it is methodological:

- **"Let Me Speak Freely?"** ([arXiv:2408.02442](https://arxiv.org/pdf/2408.02442)): format restrictions **significantly degrade** performance across reasoning and classification, and **smaller models suffer disproportionately**. (MEASURED. I could not extract clean per-size percentages from the PDF; treat the direction as established, the magnitude as not.)
- **JSONSchemaBench** ([arXiv:2501.10868](https://arxiv.org/html/2501.10868v1)): grammar-based constrained decoding **improved** downstream accuracy — Last Letter 50.7→54.0, Shuffle Objects 52.6→55.9, GSM8K 80.1→83.8. Compliance rates 96–98% for good frameworks. (MEASURED.)

**Resolution (CALCULATED-BY-YOU):** these test different things. Asking a model in the *prompt* to emit JSON degrades it; constraining the *decoder* to a grammar does not, and can help. Ticket 12's decision to force the schema rather than request it is therefore the right mechanism and survives on a small model. **But neither result says anything about whether the strings inside the correctly-shaped JSON are good.** A perfectly-valid JSON object full of dictionary-flat definitions is exactly the failure mode ticket 12 says is disqualifying.

### The `cues` field — where the small-model evidence is actually bad

Ticket 12 requires 3–5 cues per sense that are varied enough that Kyle learns the word rather than the cue. The relevant literature is generation diversity, and it says something uncomfortable:

- [NoveltyBench](https://arxiv.org/html/2504.05228v1) found that on raw diversity metrics, small models like Gemma-2-2B and Llama-3.2-1B **score highest** — better than Claude 3 and GPT-4o, which "produce on average fewer than 4 distinct responses in 10 queries". (MEASURED.)
- But the follow-on work is blunt about what that diversity is: **"In zero-shot settings, the smallest models exhibited the highest diversity scores but the lowest compliance, suggesting that their 'diverse' outputs were largely incoherent or factually inconsistent"**, and "high diversity in small models more often signals hallucination than creative exploration." (MEASURED / SPECIFIED by that literature.)

**So the naive hope — "at least a small model will give me varied cues" — is the trap.** You would get variety, and a share of it would be wrong: cues that misuse the word, invent implausible governance rituals, or quietly describe a different sense. And ticket 12 has **no human review gate**, so a wrong cue enters rotation unnoticed. Five cues per sense × ~93 senses ≈ 465 unreviewed cue strings. (CALCULATED-BY-YOU from ticket 12's own counts.)

### The `caution` field — the honest assessment

This field requires three things at once: knowing the word's connotation, knowing the pragmatics of a specific professional register, and knowing where the two collide. Ticket 07 already flagged it as the field Kyle will rewrite most **even with Opus 5**.

I have no benchmark for it. What I can say with sources:

1. It is the least verifiable of all the fields, so the one benchmark that looks reassuring (IFEval) is exactly the one that does not apply. (SPECIFIED, from IFEval's own scope.)
2. Register/connotation knowledge is long-tail world knowledge, and MMLU-Pro tracks 60.0 (E2B) / 69.4 (E4B) / 77.2 (12B) — the on-device sizes are the weak end of a knowledge-scaling curve. (SPECIFIED; using knowledge benchmarks as a proxy for register knowledge is **my inference**, not a measured relationship.)
3. Google's own Prompt API explainer refuses to promise the model is good at anything: *"we cannot guarantee that the models exposed by these APIs are particularly good at any given use case."* (SPECIFIED.) Apple cites this as grounds for opposing the API.
4. The one user in [web-llm #753](https://github.com/mlc-ai/web-llm/issues/753) who got a model running in iOS Safari (SmolLM2-135M) reported it "didn't produce the quality of results I needed" — the only end-user quality datapoint I found for a browser-resident model, and it is negative. (MEASURED, n=1, on a much smaller model than the ones under discussion.)

**Plain statement, flagged as my judgement rather than a finding:** for `definition` and `example` on a common word, a 4B model would probably produce something serviceable. For `caution` and for cues in Kyle's specific register, I would expect a 1B–4B model to produce fluent generic English — "use `gravitas` sparingly in informal settings" — which is the dictionary-flat failure that ticket 12 defines as disqualifying. **I have no measurement proving that, and I am not going to dress the reasoning up as one.** But note the asymmetry of the bet: the ticket says content quality *is* the product, this is 84 entries generated once, and the cloud cost of doing it with Opus 5 is negligible.

### Gemini Nano specifically

No published quality tier. Google does not release MMLU/IFEval for the Chrome-embedded Nano build; the ~4 GB `weights.bin` implies something in the low-single-digit-billions at 4-bit, but I found **no confirmed parameter count**. FLAG: could not establish. Combined with the 6144-token context (§1), Nano is best treated as roughly Gemma-4-E2B-class or below, with the explicit no-quality-guarantee attached.

---

## 6. Does it actually help?

### What the server exists for, and what a browser model touches

From [ticket 06](../issues/06-stack-hosting-and-llm-key-custody.md) (resolved, with nudges back in scope as of 2026-08-23):

| Server responsibility | Removed by a browser model? |
|---|---|
| Cloudflare Pages — serving the PWA | **No** |
| Cloudflare D1 — system of record so phone and laptop agree | **No** |
| Workers Cron — the 1pm nudge, VAPID keys, POST to APNs | **No** |
| Worker API — auth via shared secret, read/write routes, rate limits | **No** |
| **Anthropic API key as a Worker secret** | **Yes — this one thing** |
| Per-token generation cost | Yes |
| The generation endpoint and its tight rate limit | Yes |

**It removes one secret out of two.** The VAPID keypair still has to live on the Worker, so "no keys on the server" is not achievable. The Worker, the database, the cron, and the static host all stay exactly as they are.

### The three possible justifications, tested

**Cost.** Ticket 12 chose `claude-opus-5` at **$5.00 / 1M input, $25.00 / 1M output** (current Anthropic first-party pricing; Batch API halves it). This is 84 entries generated once, ~93 senses, plus the occasional new word. Estimating ~3,000 input and ~1,200 output tokens per entry: **≈ $1.26 input + $2.52 output ≈ $4 for the entire corpus, one time** — under $2 via the Batch API, and less again with prompt caching on the shared register prompt. (CALCULATED-BY-YOU from SPECIFIED pricing and ticket 12's field counts; the token estimates are mine.) **Cost is not an argument. It is a rounding error against a single lunch.**

**Privacy.** The data is a personal list of professional English words. There is nothing sensitive in `hyperscaler`. And note WebKit's point (SPECIFIED, standards-position #495): on-device inference is not automatically more private, because "the site controls the prompts and receives the responses." Here the site is Kyle's own. **No privacy argument exists.**

**Offline.** Ticket 04 already settled that capture never blocks and generation is queued asynchronously. Kyle types a word; the entry sits as `bare` and becomes `ready` later. Nothing about that is improved by generating locally. **No offline argument exists.**

### The argument that runs the other way

Ticket 06 chose server-side generation for a specific reason: *"This is the only shape that makes progress while the app is closed, which matters because iOS runs nothing in the background: Background Sync is unimplemented and Periodic Background Sync is WONTFIX."*

**A browser model can only run while the app is open and in the foreground.** Moving generation into the browser does not just fail to simplify the architecture — it **reverses a decision that was made to work around a documented iOS limitation**. Capture a word on the phone, background the app, and generation stops mid-flight.

### The hybrid shapes, judged

**(a) Prompt API on desktop Chrome, cloud fallback on iPhone.** Technically the only shape that works at all — the Prompt API is genuinely available, free, and pre-installed on a qualifying Chrome 148+ machine. But it produces **two content qualities in one corpus depending on which device captured the word**. `gravitas` captured on the laptop gets a Gemini Nano caution; `hyperscaler` captured on the phone gets an Opus 5 caution. The whole premise of ticket 12 is that content quality *is* the product, and there is no review gate to catch the difference. It also doubles the generation code path, doubles the prompt-tuning surface (Nano's 6144-token context needs a *different, shorter* prompt), and makes `prompt_version` — ticket 12's mechanism for fixing a systematic problem once — ambiguous, because now there are two prompts and two models per version. **Rejected: it buys ~$4 and costs the one property the app is built on.**

**(b) Browser model for cheap operations, frontier model for the hard fields.** This needs a cheap operation to exist, and in this app there isn't one. Every generated field is a quality field: `definition` and `example` are the ones that make the card readable, `distractors` must be wrong-but-plausible (and ticket 07 already sources them from sibling senses first), `cues` are the hardest output in the app, and `caution` is the field ticket 07 says Kyle will rewrite most even with Opus 5. Splitting the generation across two models also breaks the single tool-use call that ticket 12 relies on to force one coherent schema. **Rejected: there is no cheap half to split off.**

**(c) A note on what *is* feasible on-device, for a different problem.** Ticket 11 makes search the real navigation. A small **embedding** model (30–100 MB, transformers.js, WASM — no WebGPU needed, well within iOS budgets) could do semantic search over 84 entries entirely locally. That is a genuinely tractable on-device use of the same technology stack. It is **not** this ticket, it is not needed for a corpus this small (substring search over 84 rows is instant), and I am recording it only so it is not confused with the generation question. (ASSERTED — I did not research embedding-model browser feasibility in depth.)

### Verdict

**iOS: not feasible.** Not marginal, not "wait a version". Off by 4–8× on memory, against a ceiling nobody publishes and Apple has no incentive to raise, with the one Google runtime that could target it carrying an open issue titled "web api doesn't run on ios/android" and a maintainer saying "I'm not sure if that will completely fix it."

**Desktop Chrome: feasible, and irrelevant.** The Prompt API genuinely works, genuinely costs nothing, and the model is genuinely already on disk. It is also 6144 tokens of context, no controllable temperature without an origin trial, no published quality tier, and an explicit written refusal by its own authors to guarantee it is good at anything. It could run this task. It should not, because the whole app is a bet on content quality and this saves four dollars.

**Does it help? No.** It removes one of two server secrets and about $4, keeps every piece of infrastructure, reverses a decision made for a real iOS constraint, and puts the app's only real differentiator at risk. **Keep Claude Opus 5 on the Worker. Ticket 12 stands.**

---

## Could not establish / source disagreements

Listed plainly rather than smoothed over.

**Could not establish:**

1. **Gemini Nano's parameter count and quality tier.** Google publishes no benchmark numbers for the Chrome-embedded build. The ~4 GB `weights.bin` is a third-party measurement of a profile directory, not a Google figure, and does not pin a parameter count.
2. **Gemini Nano's authoritative context window.** Google deliberately documents `session.contextWindow` as the way to read it and publishes no number. Community measurement says 6144; older Chrome-team statements say 1024/prompt and 4096/session. Read it at runtime.
3. **An Apple-published iOS per-tab memory budget.** None exists. Jetsam is dynamic. Every figure in circulation is somebody's measurement on one device under one memory condition.
4. **Whether an installed (standalone) PWA on iOS gets a different memory budget than a Safari tab.** Found no evidence either way — no Apple statement, no comparative measurement. Assumed the same; that assumption is untested.
5. **Whether LiteRT-LM's Asyncify build (0.14.0+) actually loads a model on an iPhone.** The JSPI blocker is confirmed fixed. Nobody has published a successful — or a failed — iPhone run since. [Issue #2368 is still open.](https://github.com/google-ai-edge/LiteRT-LM/issues/2368) **This is the single cheapest thing to test if the answer ever needs revisiting**: load the [LiteRT-LM web demo](https://google-ai-edge.github.io/LiteRT-LM/web_demos/chat/index.html) on Kyle's actual iPhone and watch whether the tab survives. Expected outcome: it does not, since E2B-web is 2.01 GB.
6. **Per-size IFEval for the Gemma 4 E-series.** Google's model card omits it.
7. **Any benchmark for register-sensitive or connotation-aware *generation*** at any model size. Pragmatics benchmarks (PUB, PragmEval) are multiple-choice comprehension, not generation. This is the gap that makes §5 indirect, and I have not papered over it.
8. **Clean per-size percentages from "Let Me Speak Freely?"** — the direction (format restriction hurts, smaller models more) is established; I could not extract the magnitudes from the PDF.

**Source disagreements, unresolved:**

| Topic | Disagreement |
|---|---|
| Nano context window | 6144 (community, `inputQuota`, recent) vs 1024/prompt + 4096/session (Chrome DevRel, older). Both from Google-adjacent sources. |
| Gemini Nano download size | "~4 GB" / "4.27 GB" vs "roughly 2 GB". All third-party directory measurements; no Google figure. |
| iOS memory ceiling | **<500 MB** (LlamaWeb, iPhone, 2026, measured) · ~300–450 MB (third-party WebKit write-up, asserted) · 1.88 GB (iPad Pro M1, 2024, measured) · "4GB+" for an 8 GB iPad (Apple engineer) · 2 GB Gigacage (Apple engineer). These are different limits on different devices — Gigacage ≠ jetsam budget ≠ WebGPU buffer cap — but the spread is real and I cannot collapse it. |
| Structured output vs quality | "Let Me Speak Freely?" (constraint degrades, small models worse) vs JSONSchemaBench (constrained decoding *improves* accuracy 3–4 pts). Probably reconcilable as prompt-for-JSON vs grammar-constrained decoding, but that reconciliation is **mine**, not either paper's. |
| Small-model diversity | NoveltyBench ranks Gemma-2-2B and Llama-3.2-1B *above* Claude 3 and GPT-4o on diversity; follow-on work says small-model diversity is largely incoherence. Not contradictory, but easy to cite misleadingly. |

**Two claims in the prior project research, adjudicated:**

- "WebGPU ships in Safari 26" — **verified** against webkit.org.
- "Metal per-buffer limits ~256 MB (older iPhones) to ~993 MB (iPad Pro)" — **verified**, and now sourced to WebKit's `HardwareCapabilities.mm` rather than to blog hearsay: on iOS the formula is `clamp(maxBufferLength/3, 256 MiB, 1 GiB)`.
- "0.5B–1.5B models typically need 1–2 GB" — **refuted as stated** (at q4 they are 0.25–0.9 GB), but the conclusion is unaffected and in fact strengthened, because the binding limit is the tab memory budget, not the buffer cap, and that budget is *below* 1 GB on iPhone.

---

## Sources

Primary sources are marked **P**.

**Chrome / Prompt API**
- **P** [The Prompt API — Chrome for Developers](https://developer.chrome.com/docs/ai/prompt-api)
- **P** [Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started) — hardware requirements
- **P** [Chrome 148 release notes](https://developer.chrome.com/release-notes/148) — ship + response constraints
- **P** [Join the Prompt API origin trial](https://developer.chrome.com/blog/prompt-multimodal-origin-trial) — OT range 139–144
- **P** [prompt-api explainer, Non-goals](https://github.com/webmachinelearning/prompt-api/blob/main/README.md#goals) — the no-quality-guarantee sentence
- **P** [mozilla/standards-positions#1213](https://github.com/mozilla/standards-positions/issues/1213) — `position: negative`
- **P** [WebKit/standards-positions#495](https://github.com/WebKit/standards-positions/issues/495) — `position: oppose`, Tess O'Connor's statement 2026-04-30
- **P** [w3ctag/design-reviews#1093](https://github.com/w3ctag/design-reviews/issues/1093)
- [Chromium AI dev-preview group, token limits](https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/WO2NIK_9Ue4) — Thomas Steiner
- [swyx, Gemini Nano notes](https://swyx.io/gemini-nano) — 6144 `inputQuota`
- [gHacks](https://www.ghacks.net/2026/05/06/google-chrome-is-silently-downloading-a-4gb-gemini-nano-ai-model-to-user-devices-without-consent/), [Android Authority](https://www.androidauthority.com/google-chrome-weights-bin-ai-model-download-explained-3664043/) — `weights.bin` size and location

**Gemma**
- **P** [Gemma 4 model overview](https://ai.google.dev/gemma/docs/core) — inference memory table
- **P** [Gemma 4 model card](https://ai.google.dev/gemma/docs/core/model_card_4) — params, context, benchmarks
- **P** [Gemma 3n model overview](https://ai.google.dev/gemma/docs/gemma-3n) — PLE, MatFormer
- **P** [Gemma 3 model card](https://ai.google.dev/gemma/docs/core/model_card_3)
- **P** [Gemma 3 Technical Report, arXiv:2503.19786](https://arxiv.org/html/2503.19786v1) — Table 18, IFEval
- **P** [Gemma 3 QAT blog](https://developers.googleblog.com/en/gemma-3-quantized-aware-trained-state-of-the-art-ai-to-consumer-gpus/) — int4 VRAM table
- **P** [Introducing Gemma 3n: developer guide](https://developers.googleblog.com/en/introducing-gemma-3n-developer-guide/)

**Runtimes**
- **P** [MediaPipe LLM Inference for Web](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js) — maintenance-only notice
- **P** [LiteRT-LM Web API docs](https://developers.google.com/edge/litert-lm/js) and **P** [JS README](https://github.com/google-ai-edge/litert-lm/blob/main/js/packages/core/README.md)
- **P** [LiteRT-LM #2616](https://github.com/google-ai-edge/LiteRT-LM/issues/2616) — JSPI / iOS Safari, fixed 0.14.0
- **P** [LiteRT-LM #2368](https://github.com/google-ai-edge/LiteRT-LM/issues/2368) — "web api doesn't run on ios/android", still open
- **P** [litert-community/gemma-4-E2B-it-litert-lm](https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm) — file sizes
- **P** [transformers.js docs](https://huggingface.co/docs/transformers.js/index)
- **P** [web-llm #753](https://github.com/mlc-ai/web-llm/issues/753) — iOS 26 tab crash
- npm registry — `@litert-lm/core` 0.16.0, `@huggingface/transformers` 4.2.0, `@mlc-ai/web-llm` 0.2.84

**iOS / WebGPU**
- **P** [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- **P** [WebKit `HardwareCapabilities.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebGPU/WebGPU/HardwareCapabilities.mm) — the `maxBufferSize` formula
- **P** [W3C WebGPU spec, limits](https://www.w3.org/TR/webgpu/#limits)
- **P** [WebKit bug 268816](https://bugs.webkit.org/show_bug.cgi?id=268816) — Ben Nham on Gigacage and WebContent limits
- **P** ["Llamas on the Web", arXiv:2605.20706](https://arxiv.org/html/2605.20706v1) — UCSC + Microsoft Research, 2026-05-20

**Quality**
- **P** [IFEval, arXiv:2311.07911](https://arxiv.org/pdf/2311.07911) — verifiable instructions, scope
- **P** [JSONSchemaBench, arXiv:2501.10868](https://arxiv.org/html/2501.10868v1)
- **P** ["Let Me Speak Freely?", arXiv:2408.02442](https://arxiv.org/pdf/2408.02442)
- **P** [NoveltyBench, arXiv:2504.05228](https://arxiv.org/html/2504.05228v1)
- [arXiv:2604.07035](https://arxiv.org/html/2604.07035v1) — Gemma 4 / Phi-4 / Qwen3 accuracy-efficiency
- [PUB pragmatics benchmark, arXiv:2401.07078](https://arxiv.org/abs/2401.07078)

**Pricing**
- Anthropic first-party API pricing, `claude-opus-5`: $5.00 / 1M input, $25.00 / 1M output.
