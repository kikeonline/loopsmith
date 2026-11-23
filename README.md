# Loopsmith

A browser playground for beginners learning Strudel. Build drum and melodic loops visually, watch the matching code change, and hear valid edits live. The first post-v1 phase adds ordered Fast, Slow, Reverse, and Every controls. It is a permanent web app: no desktop wrapper, backend, accounts, collaboration, or audio export.

## Run and verify

Use **Node 22.19+** and npm. CI uses Node 22. Lighthouse requires 22.19 or newer.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/. Choose a starter template or add tracks. **Play loop** enables audio; valid edits then update the playing loop automatically. Stop ends scheduling, while existing sound tails may finish.

```sh
npm run check
npm test
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
npm run test:a11y
npm run preview
```

`build/` is the static SPA. Configure hosting to serve `index.html` as the fallback for routes. No public deployment is configured. Lighthouse runs against a temporary production preview for the main screen and populated modifier/arrangement fixtures, writing HTML/JSON reports under `reports/`. CI runs all checks, requires accessibility ≥90, and uploads those reports.

## Making and keeping a loop

- **Drums:** `bd` is kick, `sd` snare, `cp` clap, and `hh` hi-hat. `~` is a rest. Rows play together; length changes keep retained steps and pad with rests.
- **Melodies:** choose pitch or scale-degree tracks. Click notes or use arrows and Space/Enter in the piano roll. Degree tracks have an explicit scale such as `D:dorian`; instrument selection writes `.s(...)`.
- **Pattern modifiers:** add Fast, Slow, Reverse, or Every in the selected track. Edit their supported values, inspect the full chain, and move/remove individual modifiers without rewriting custom calls. Every starts on cycle 0. Custom expressions/callbacks need explicit replacement; [details and limits](docs/post-v1-modifiers.md).
- **Mixer:** change volume/pan, native mute/solo, and eleven supported effects. Each control shows the method it edits. Code-only expressions need an explicit replacement action.
- **Code:** typing parses after 200 ms. Visual writes wait for a one-second typing pause, then use fresh ranges. Invalid code stays in the editor with the last good grid/loop. Unknown calls and unrelated source remain intact.
- **Keyboard:** Space plays/stops outside editors, fields, buttons, and other interactive controls. Cmd/Ctrl+Enter plays/updates. Cmd/Ctrl+Z and Shift+Z share one history across code and visual changes. Project replacements are undoable and stop playback, including undo/redo across a load.
- **Project library:** save named project copies independently of workspace autosave. Open a saved copy stopped, export it, or remove/undo its removal. Edits create another version only when you choose Save a project copy; [details](docs/post-v1-project-library.md).
- **Share links:** import native Strudel links with local review, or create/copy/download one from the current source. Generated links are invalidated by source edits; use JSON to retain draft recovery and project-file details. [Export contracts](docs/post-v1-share-export.md).
- **Files:** autosave stores the current draft and last valid document on this browser only. Reload restores both, even during a syntax error, and stays stopped. Export project JSON for a portable backup. Copy/download Strudel code exports the current editor text exactly, including comments, native flags, metadata, and incomplete edits.

Basic beat, House loop, Ambient pad, and Melody + bass templates exercise drums, synths, parallel rows, pitches, and scale degrees. New, import, and template loads stop audio and replace source without a modal; Undo recovers the preceding source. Project title and layout preferences are separate from source undo history. Undo history and pending visual intentions are not persisted across reloads.

Storage can be unavailable, full, cleared, or limited by the browser. Failures leave editing and downloads usable. Corrupt saved data is retained, autosave pauses, and recovery download/resume controls are offered. Storage is per origin; opening another port/domain uses another store. The current-workspace autosave still uses last-writer-wins storage across tabs. The library uses independent immutable copy keys and refreshes its listing across tabs without replacing the editor. JSON version 1 validates its cached model against last-good source without executing it; it supports files up to 8 MiB and source versions up to 1,000,000 characters each.

## Architecture

SvelteKit 3, Svelte 5 runes, TypeScript, Vite, Tailwind 4, adapter-static, Acorn, CodeMirror 6, Vitest, and Playwright. `@strudel/web@1.3.0` is exactly pinned. SvelteKit configuration lives in `vite.config.ts`.

| Module | Responsibility |
| --- | --- |
| `src/lib/project/` | Immutable canonical model, mini notation, deterministic generation, Acorn parsing, source ranges, identity reconciliation, targeted edits |
| `src/lib/editor/sync.ts` | CodeMirror text/history, parse debounce, semantic edit queue, atomic source transactions, load/undo identity anchors |
| `src/lib/editor/arrangement.ts` | Source-derived native sections, pattern views, targeted edits, and timeline phase |
| `src/lib/editor/modifiers.ts` | Source-derived modifier views, targeted edits, ordering, and queued reference reconciliation |
| `src/lib/editor/composition.ts` | Track lifecycle, note/degree edits, instruments, and row sounds |
| `src/lib/editor/event-playheads.ts` | Validated runtime source locations, token/slot attribution, and scheduled-event highlighting |
| `src/lib/editor/output.ts`, `midi.ts` | Bounded scheduled-event observations, timestamped MIDI mirroring and device lifecycle |
| `src/lib/editor/playback.ts` | Injected runtime, serialized live evaluations, latest-version queue, Stop/restart cancellation |
| `src/lib/runtime.ts` | Lazy audio initialization, pinned Strudel boundary, scheduler clock, registry, isolated cancellable previews |
| `src/lib/persistence/` | Versioned JSON validation, source/model restoration, local project snapshots, Strudel share-link import/export, exports, and deterministic templates |
| `src/lib/components/`, `src/routes/+page.svelte` | Model-derived controls, project files, piano roll, sound browser, mixer, and status |
| `scripts/verify-strudel.mjs` | Pinned-bundle API/event probes without audio; all templates are also evaluated here |

Parsing never evaluates user code. Routine edits change targeted ranges; they do not regenerate the project. Full generation is reserved for explicit scaffolds and a temporary validation/identity anchor during import. The original source remains authoritative. Editor transactions retain CRLF and mixed endings. JSON preserves stable IDs even when imported source has no metadata. Sound initialization happens only after Play or a sound-browser action.

## Supported subset and boundaries

The model handles ordered tempo declarations, labeled/native tracks, raw statements/tracks, string-literal `s`/`sound`, `note`, and `n` sources, ordered effect/instrument/scale calls, and opaque calls/expressions. Mini notation supports rests, sample indices, parallel rows, square-bracket subdivisions, angle-bracket alternation, and one integer `*`, `!`, or `@` modifier per node. Unsupported syntax is retained opaquely.

The visual grid/piano roll supports flat, equally spaced atom/rest rows up to 64 steps. Notes accept pitch names/MIDI integers; degree editing requires an explicit string scale. Nested/variable timing, unscaled sample-number sequences, raw sources, and opaque patterns remain code-only. Parallel note rows can express chords; independent note durations and arbitrary timing quantization are outside v1. Numeric controls preserve finite exact thousandths within ±1e9; other valid numeric/expression source remains verbatim and read-only until explicitly replaced. Suggested control ranges do not clamp imported values.

Native labels encode mute/solo, and metadata comments retain IDs/display names and explicit raw choices. They work as ordinary Strudel code. Cycle-clock playheads apply to supported, audible, synchronized rows without opaque timing calls. The optional Scheduled events mode follows reported source tokens and flat pattern slots through modifiers and arrangements; unsupported or stale locations stay unhighlighted. See [event playhead contracts](docs/post-v1-event-playheads.md). See [M1 contracts](docs/m1-model.md) and [M3 boundaries](docs/m3-composition.md) for details.

Runtime output below the mixer provides an opt-in audio scope and read-only note-gate history, plus explicit Web MIDI connection, device/channel/velocity selection, and note mirroring. Browser audio continues; unpitched drums and custom dominant outputs are excluded from MIDI. Device settings stay outside project source and reload with mirroring off. See [runtime output contracts and verification](docs/post-v1-output.md).

The project bar also imports native `https://strudel.cc/#…` share links: review decoded code locally, then explicitly import it as a stopped, undoable project load. Unicode and source formatting are preserved; malformed/unsupported links and invalid JavaScript leave the current editor intact. See [share-link contracts and verification](docs/post-v1-share-import.md).

## Network and runtime behavior

External sample manifests/recordings need internet access and are not bundled. There is no service worker or guaranteed offline cold start. Even synth templates currently initialize the default manifest; cached samples may work offline, but that is not an offline guarantee. Browser storage does not store recordings. Custom `samples(...)` declarations remain code; play them before refreshing the registry.

Live updates apply on the next scheduling tick with a short lookahead, **not** a guaranteed next-cycle boundary. The cycle counter uses the audio scheduler clock. Parse/evaluation failures retain the last installed pattern, but arbitrary JavaScript side effects cannot be rolled back. Async scheduler/sample failures may be logged outside the evaluation callback. Preview has its own loading/error/cancellation path and does not replace the transport pattern. Only run code you trust: it executes in the page's origin, without an iframe or sandbox.

## Extending effects

For a verified single-numeric-argument Strudel method, add **one row** to `EFFECTS` in `src/lib/project/model.ts`, including its default. For example, the pinned bundle's `.crush(8)` returns a `crush: 8` event field; an extension could add:

```ts
crush: { label: 'Bit depth', min: 1, max: 16, default: 16 },
```

Then add `crush: 8` to the `controls` test fixture in `scripts/verify-strudel.mjs`. This is an example, not a currently enabled v1 control. The parser, generator, selected-track controls, and defaults discover effect-table rows automatically. Existing property/corpus tests check model round trips and source preservation. Add a targeted edit regression if a method has aliases or unusual behavior; add aliases to `EFFECT_ALIASES` only after verifying them. Multi-argument or timing-transform methods need a separate design rather than being treated as scalar effects.

Run the checks above and regenerate [dependency licenses](docs/dependency-licenses.md) after dependency changes with `node scripts/dependency-licenses.mjs`.

## Evidence and release status

[Spike findings](docs/spike-findings.md), [M1 invariants](docs/m1-model.md), [M2 sync](docs/m2-live-editor.md), [M3 composition](docs/m3-composition.md), [M4/v1 verification](docs/m4-persistence.md), [post-v1 modifiers](docs/post-v1-modifiers.md), [arrangements](docs/post-v1-arrangement.md), [runtime output](docs/post-v1-output.md), [share-link import](docs/post-v1-share-import.md), [event playheads](docs/post-v1-event-playheads.md), [project library](docs/post-v1-project-library.md), and [share export](docs/post-v1-share-export.md) record implementation evidence and limits. Current local checks pass: **201 unit/invariant tests, 46 Chromium browser tests, static build, type checking, and Lighthouse accessibility 100/100** on all three audited screens. Exported Basic beat code played/stopped in strudel.cc; all four templates pass pinned-runtime probes.

The owner verified M0. Later next-phase requests authorized implementation without supplying new listening reports. **M2/M3/v1 human listening acceptance remains unreported.** [Published main CI passed for 14acb62](https://github.com/kikeonline/loopsmith/actions/runs/44853822208). The local project-library and share-export phases have passed the local checks listed above; their remote CI has not yet been reported. v1 implementation is complete; the release gate is not claimed closed. The subsequent next-phase request authorized the first stretch item: visual modifiers are now implemented. The next phase adds per-track arrangements with editable sections and native Strudel phase behavior. MIDI note mirroring and runtime scope/piano-roll visualizers are implemented. Physical MIDI hardware verification is still unreported; local Strudel share-link review/import is now implemented, completing the listed stretch backlog. The subsequent phase adds optional scheduled-event/source playheads. Two follow-up phases add a local project library and native Strudel share-link export.

## License and source availability

Loopsmith is **AGPL-3.0-or-later**; see [LICENSE](LICENSE). The UI links to the public [source repository](https://github.com/kikeonline/loopsmith). Retain notices and serve corresponding source for modified versions, with the footer URL pointing to that source. Source must match the deployed build. Strudel and its audio packages also use AGPL-3.0-or-later.

External sample recordings have separate provenance and are fetched at runtime. They are not distributed with this source or build; the app's license does not assert a blanket license for them. The [lockfile license inventory](docs/dependency-licenses.md) records dependency declarations and how to obtain upstream notices.
