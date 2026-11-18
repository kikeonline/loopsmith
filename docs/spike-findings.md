# M0 spike findings

Recorded 2026-11-17 (America/Toronto). Implementation scope: issues #1–#3 and owner decisions #23. The original handoff is not present locally or on the empty remote, so those original contents were not independently audited. The owner subsequently confirmed “M0 is verified,” accepting the milestone and resolving its outstanding acceptance checks.

## Acceptance status

| Check | Evidence |
| --- | --- |
| SPA, pinned Strudel, licensing, source footer | Implemented; type checking and static build pass. |
| Browser Play, Update, Stop | Exercised in Orca's Chromium browser on localhost. AudioContext running, sample loads successful, audio analyser reports nonzero output while playing. |
| Failed edit retains last good playback | Browser syntax error shown without stopping the old loop; analyser peak 0.4048 after the error. Deterministic tests also check pattern object and active code identity. |
| API verification | `npm test` runs the exact installed web bundle and boundary tests. |
| Manual listening | **Owner confirmed M0 is verified.** This closes the human-verification acceptance item. No detailed listening description was supplied; the earlier analyser readings remain separate automated evidence. |
| Original handoff verification | Owner accepted M0 completeness. The original handoff was unavailable for independent inspection; all verification topics named in the available issues are covered below. |
| Milestone gate | **M0 accepted by the owner.** M1 is also implemented and verified; M2 has not started. |

## Versions and sources

`package-lock.json` records the exact complete dependency tree. Direct resolved versions: SvelteKit 3.3.1, Svelte 5.57.3, adapter-static 4.0.1, vite-plugin-svelte 7.3.1, Vite 8.3.8, Tailwind and its Vite plugin 4.3.5, TypeScript 6.0.3, svelte-check 4.7.8, Vitest 5.1.0, Node types 22.20.5. Verification host: Node 26.13.0 / npm 11.20.0. CI targets Node 22. No change from the requested stack; configuration follows the installed Kit 3 APIs.

The exact runtime pin is **@strudel/web 1.3.0**. Its package dependencies pin core, mini, tonal, and transpiler at **1.2.6**, and webaudio at **1.3.0**. The installed `web/dist/index.mjs` is a self-contained bundle; independently installed package source files help explain behavior, but tests deliberately use that web bundle. Other resolved audio versions are listed in the license inventory.

Read and inspected:

- Installed `@strudel/web/README.md` (initStrudel, evaluate, hush, samples, autoplay, string semantics).
- Installed `@strudel/web/dist/index.mjs` (actual exported API and bundled implementation).
- Installed `@strudel/core/{repl,cyclist,evaluate,controls,pattern}.mjs`, `@strudel/transpiler/transpiler.mjs`, `@strudel/webaudio/webaudio.mjs`, and `superdough/{sampler,superdough,superdoughoutput}.mjs`.
- [Strudel source](https://codeberg.org/uzu/strudel), [samples documentation](https://strudel.cc/learn/samples/), [Dirt-Samples source](https://github.com/tidalcycles/Dirt-Samples). API conclusions below come from installed code plus executable probes, rather than assumptions from unversioned documentation.

## Initialization and playback

`await initStrudel({ prebake })` establishes the evaluation scope, synths, transpiler, and a webaudio REPL. It returns the REPL. `repl.evaluate(code)` accepts code strings; `repl.stop()` stops the scheduler. Public convenience exports `evaluate(code)` and `hush()` also exist. No iframe or @strudel/react is used.

The README's first-click audio helper installs a **mousedown** listener. A module lazily loaded by the Play click misses that first mousedown; keyboard activation also lacks it. The adapter explicitly calls `getAudioContext().resume()` and `initAudio()` from the Play path. Importing the initial page creates no audio context. Successful browser testing included the first Play gesture after a fresh load, and Enter-key activation of Play on the production build. The production page had no audio exports imported before Play.

There are no default external samples. Prebake calls `samples('github:tidalcycles/dirt-samples')`; the manifest registers URLs. WAV files load and decode lazily when triggered. Browser console confirmed successful bd, sd, cp, and hh loads (approximately 24.5, 79.2, 38.5, and 150.4 KiB). Manifest/recording URLs are upstream-controlled and not pinned or vendored. Initial sample loading requires the network; offline cold start is not supported by this spike.

## Tracks, native mute, and native solo

The transpiler converts `label: expression` to `expression.p('label')`. The REPL gathers these patterns and stacks them. Repeated `$:` labels are anonymous, assigned unique evaluation-local suffixes; ordinary duplicate labels overwrite their previous entry. Names must be valid JavaScript identifiers.

| Intent | Verified code | Result |
| --- | --- | --- |
| Named tracks | `drums: s("bd"); hats: s("hh")` | Both play. |
| Anonymous tracks | `$: s("bd"); $: s("hh")` | Both play. |
| Mute | `_drums: s("bd"); hats: s("hh")` | Only hats play. Trailing underscore `drums_:` also works. |
| Solo | `drums: s("bd"); Shats: s("hh")` | Only hats play. |
| Multiple solos | `Sdrums: s("bd"); Shats: s("hh"); bass: s("sine")` | Both solo tracks play; bass is suppressed. |
| Muted solo | `_Sdrums: s("bd"); hats: s("hh")` | Muted entry does not activate solo; hats play. |

Solo detection is case-sensitive: **any registered key longer than one character starting with uppercase `S` is soloed**. Leading/trailing `_` suppresses registration. There is no need to invent `.solo()`/`.mute()` calls or UI-only flags. These labels survive ordinary plain-code export and evaluation. M1 must reserve/escape these naming conventions and define reversible label/identity metadata without changing arbitrary user labels. M0 verifies native execution, not a parser/generator round trip (those are M1 deliverables).

Evaluation is not a transaction for arbitrary JavaScript: for example, `setcps(...)` before a thrown exception can change tempo even though the pattern is retained. Scheduler-time errors and asynchronous sample failures are logged by the audio backend and do not necessarily reject evaluation. Future error UI must distinguish these from parse/evaluation errors; re-running previous arbitrary JavaScript is not a safe rollback strategy.

## Tempo and update boundary

`setcps(x)` sets cycles per second. `setcpm(x)` sets cycles per minute, converted internally by `/60`. In a four-beat-per-cycle convention, BPM = CPS × 240; 120 BPM is `setcps(0.5)` or `setcpm(30)`. This convention is not an inherent meter restriction.

**Re-evaluation is not next-cycle quantized.** Cyclist's `setPattern` immediately replaces the queried pattern. When already playing, it does not restart the clock. Subsequent scheduling ticks use the new pattern; events already scheduled in the roughly 100 ms lookahead/latency window can still sound. M2 must describe this as a live update, or explicitly implement cycle quantization if later requested. It must not promise a native next-cycle option that this runtime does not provide.

`scheduler.now()` supplies cycle time from the audio clock. The spike reads it through requestAnimationFrame solely to refresh the display; it does not infer musical timing using a wall-clock interval. Stop resets scheduling/cycle state. Already triggered notes, sample envelopes, and effect tails can ring out; Stop is not an immediate audio-graph kill switch.

## Evaluation errors and limits

`repl.evaluate` catches syntax/evaluation errors internally and resolves rather than rejecting. Inspect `repl.state.evalError` or use `onEvalError`. The adapter rethrows this stored error to the page. The scheduler retains the last successfully installed pattern and `activeCode`. Correcting the error and updating recovers normally; source text stays in the editor throughout.

This preservation is **not a transaction over arbitrary JavaScript effects**: e.g. `setcps(1); throw new Error('bad')` can change tempo before evaluation fails. User code can also mutate globals, call hush, fetch data, or trigger audio itself. A successfully evaluated non-pattern returns silence, rather than an error. Runtime query/output failures may be logged later and are not reliably reported by the evaluation callback; unknown sounds/network decode failures are distinct from compilation failures. M0 promises last-good pattern retention for syntax/evaluation failures, not rollback of arbitrary code or guaranteed error attribution to a track.

## Effects and source controls

Executable tests verify each method exists and query the resulting event's numeric control value. M1 should emit these method names in ordered chains and preserve opaque expressions/calls.

| Method | Event field | Meaning |
| --- | --- | --- |
| `gain(x)` | gain | Amplitude multiplier. |
| `pan(x)` | pan | Stereo position. |
| `lpf(x)` | **cutoff** | Low-pass frequency in Hz; `cutoff` is the canonical internal control. |
| `hpf(x)` | **hcutoff** | High-pass frequency in Hz. |
| `room(x)` | room | Reverb amount; separate size controls exist. |
| `delay(x)` | delay | Delay send amount. |
| `delaytime(x)` | delaytime | Delay time in seconds. |
| `delayfeedback(x)` | delayfeedback | Feedback; audio implementation clamps to 0–0.98. |
| `attack(x)` | attack | Envelope time in seconds. |
| `release(x)` | release | Envelope time in seconds. |
| `speed(x)` | speed | Sample playback-rate multiplier. |

Also verified `s`, `note`, `n`, `scale`, `fast`, `slow`, `rev`, `every`, and `onTrigger`. The spike verifies API/event behavior; it does not provide a listening comparison for every effect or a supported-subset parser. `lpf`/`hpf` are aliases, so tests must expect `cutoff`/`hcutoff` in event objects. Do not infer model field names from queried event keys.

## Sound registry and preview

`soundMap.get()` returns a dictionary. Entries expose `onTrigger` and `data`; sample entries include `data.type`, `data.samples`, and base URL. The browser reported **238 sounds** after this manifest and built-in synth initialization. Registry contents vary with sample declarations, so the later browser should derive the list rather than hardcode it.

A one-shot preview works using `await superdough({ s: 'bd', gain: 0.3 }, getAudioContext().currentTime + 0.1, 0.2, 0.5)`. The browser probe measured nonzero output for this one-shot preview. This calls the audio backend without replacing the transport pattern. No dedicated `previewSound()` API was assumed. M3 needs preview cancellation/overlap, loading, and runtime error UI. Custom `samples(...)` declarations must remain source code; the transpiler automatically awaits bare samples calls.

## Event hooks and highlighting

`repl.state.miniLocations` carries source spans collected by the transpiler. Queried events have `hap.context.locations`, verified on `s("bd sd")`. `Pattern.onTrigger(callback)` is supported; its callback receives `(hap, currentAudioTime, cps, scheduledTargetTime)`. This differs from the scheduler's default-output signature. Hooks fire during scheduling, so a UI must wait for the target audio time before showing highlights. `onUpdateState`, `afterEval`, and the scheduler clock are available integration points. M0 shows a clock only; token/step highlighting remains later scope.

## Arrangement and stretch feasibility

`arrange([2, s("bd")], [1, s("hh")])` queries as bd, bd, hh across three cycles and repeats across the next three. `s("<bd hh>")` alternates bd then hh across two cycles. This makes cycle-based sections feasible without a separate scheduler. Nested pattern phase and unsupported expressions must be preserved; a flat grid is not a safe approximation for arbitrary alternation/arrangement.

MIDI is not a configured output in this bundle/spike; future hardware work requires the appropriate package and browser permission testing. Scope/piano-roll visualization and share-URL decoding are unimplemented stretch items. No arrangement UI or post-M4 work was started.

## Browser reproduction and evidence

1. `npm ci && npm run dev`; open http://127.0.0.1:5173/.
2. Confirm Stop is disabled before playback. Press Play on `s("bd sd cp hh")`; wait for the manifest and samples.
3. Confirm playing status and advancing cycle time. Browser measured audio state `running` and output peak **0.7974** over about 1.2 seconds.
4. Change to `s("bd*4 hh*8").gain(0.4)`. Confirm edits-waiting status, then Update. The cycle remains continuous and the status returns to Playing.
5. Change to `s(` and Update. Confirm the syntax error, unchanged text, and continued cycle/output. The previous pattern's measured peak was **0.4048**.
6. Stop. Scheduling stops and cycle returns to ready. After 500 ms for tails, measured output peak was **0** over about 1.2 seconds.
7. Restore valid code and Play. Error clears and playback restarts. Stop when done.
8. Human verification was requested during implementation. The owner subsequently confirmed **“M0 is verified.”** The acceptance item is complete; no more detailed listening report was provided.

Measurements used an AnalyserNode attached to the installed controller's destination gain and disconnected after each probe. They establish generated PCM activity, not audible listening evidence. Visual screenshot reviewed at desktop size; all controls, code, status, help, and source link are present. Browser errors during the invalid-code check are expected.

## Licensing, security audit, and remaining questions

Owner choices are settled: AGPL-3.0 with visible source, beginners learning Strudel, native-code mute/solo, permanent browser/static delivery. No additional product choice is needed for M0.

All lockfile packages declare a license. Runtime Strudel/Kabelsalat/Superdough packages are AGPL-3.0-or-later; remaining dependency licenses are permissive, with MPL-2.0 on the Lightning CSS build tooling. No declared incompatible license was identified; see the inventory. Dirt-Samples recordings are external and their root README has no blanket license declaration; do not assume the application's AGPL license covers these recordings or redistribute them without confirming individual provenance.

`npm audit` reports a high-severity picomatch ReDoS advisory (GHSA-fc5q-39xc-vjpf), propagated through nine tooling dependency entries. Installed picomatch 4.0.7 is also the latest registry version at verification; there is no patched upgrade to apply. `npm audit --omit=dev` reports zero runtime vulnerabilities. Recheck the tooling advisory before exposing development/build tooling to untrusted input. No forced downgrades were applied.

M0 has no remaining acceptance items following the owner’s confirmation, **“M0 is verified.”** The matching source is published on GitHub. M1 is implemented and verified; M2 has not started.


## Subsequent milestone authorization

After these findings were reported and published, the user explicitly requested implementation of the next milestone. M1 therefore proceeded with that authorization. At that time the M0 listening and original-handoff completeness checks were still pending. The owner subsequently confirmed “M0 is verified,” accepting those remaining checks. See [M1 model and verification](m1-model.md) for the subsequent work.
