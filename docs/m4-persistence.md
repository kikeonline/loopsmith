# M4: persistence, templates, and v1 verification

Scope: [phase #19](https://github.com/kikeonline/loopsmith/issues/19), persistence/templates #20, keyboard/accessibility #21, and documentation/release checks #22. The owner requested this phase after M3 evidence was reported. This authorizes implementation while retaining unreported M2/M3 listening checks; it does not imply a listening report or release acceptance.

## Persistence and files

`src/lib/persistence/project-file.ts` defines JSON `{format:"loopsmith-project", version:1, name, code, lastGoodCode, project}`. `code` is the exact current draft, including invalid text. `lastGoodCode` and its canonical project form a validated identity anchor. Ranges are always reparsed; serialized offsets are never trusted. Import validates type/version/limits, generates a temporary canonical identity anchor from the model, reparses last-good original source against it, and rejects model/source mismatches. It never evaluates input or regenerates the editor's original source. The draft is then parsed against that last-good document; syntax errors retain the last-good grid.

Limits are 8 MiB per JSON file and 1,000,000 UTF-16 characters per source version; titles are at most 160 characters. Unsupported versions, malformed files, bad models, missing fields, source errors in last-good code, and inconsistent caches have useful errors and leave the current editor/audio untouched.

The page saves under localStorage `loopsmith.project.v1` on each source transaction and successful parse, and on title changes. This includes invalid drafts before the 200 ms parse debounce. Startup restores on mount and stays stopped. No audio context, sample fetch, or user-code execution is required for save/import/restore. Corrupt saved data is not overwritten: autosave pauses, the original data can be downloaded, and explicit resume replaces it with the current project. Quota/security failures do not clear the editor and still allow file downloads. Save is per origin and last-writer-wins across tabs; it is not a backup service.

CodeMirror uses LF as its structural separator while preserving CR characters in source. CRLF and mixed endings therefore survive load, visual edits, persistence, and download exactly. Pure-CR files retain their bytes but may have different visual line presentation than parser diagnostics; LF/CRLF are recommended for editing. The earlier M2 normalization limitation is superseded by this M4 behavior.

JSON export retains draft plus last-good source/model. Plain `.strudel` download and clipboard copy retain current text exactly, including native flags, comments, opaque code, and identity metadata. An invalid draft is exported as an invalid draft, not silently replaced by valid code. Clipboard failures offer download/manual-copy alternatives. Files are generated locally; there is no upload/backend.

New project, JSON import, and template loads replace source as one isolated CodeMirror history transaction. A reversible state effect carries before/after last-good identity anchors, so undo/redo restores stable IDs and even invalid drafts correctly. Replacements cancel queued visual intentions and stop transport, including when undo/redo crosses the replacement. They never start imported code automatically. Project title and view preferences are outside source history; history and unmaterialized queued intentions are not persisted across reloads.

## Templates and keyboard/accessibility

Four deterministic, metadata-bearing templates use the supported model: Basic beat (three drums), House loop (three drums plus degree bass), Ambient pad (parallel synth chord rows plus chime), and Melody + bass (two pitch patterns). All are editable with the existing controls and can be undone after loading. All four are evaluated/query-tested in the pinned Strudel bundle without audio/network.

Space toggles Play/Stop only outside interactive elements. It preserves native button/grid activation, form text entry, and CodeMirror input, and ignores key repeats/IME composition. Existing shared undo/redo and grid/piano arrow navigation continue to work. Empty projects point to Add track/templates. File read/load/save errors are non-modal and keep recovery actions available. Piano cells now distinguish notes/rests with visible symbols as well as color and `aria-pressed`. CodeMirror has a visible focus-within outline. Drum accessible names include the visible number/sound plus row context, and step-number contrast was increased.

`scripts/check-accessibility.mjs` launches an isolated Playwright Chromium binary through chrome-launcher and runs Lighthouse against a temporary production preview on port 4175, with a 1440×1000 browser window. Reports go to ignored `reports/accessibility.{json,html}`. CI requires ≥90 and uploads both reports. The first audit scored 96 and identified step-number contrast and label/name mismatches. Those issues were fixed; the recorded audit scored **100/100 with no failing audits**. This automated score does not claim a full assistive-technology or human usability audit.

## Local verification and v1 definition of done

Run Node 22.19+:

```sh
npm ci
npx playwright install --with-deps chromium
npm run check
npm test
npm run test:e2e
npm run build
npm run test:a11y
```

| v1 requirement | Evidence/status |
| --- | --- |
| Model generation/parsing and I1–I5 | Existing corpus/goldens, 500 randomized project round trips, 100 randomized source edits, pinned-runtime comparisons; all remain green |
| Two-way sync and shared history | All nine M2 browser scenarios pass, including timing, invalid text, cursor, unknown calls, active typing, and cancellation |
| Four-track UI composition and richer controls | All five M3 browser scenarios pass, including note/degree edits, instruments, raw mute, expression replacement, lifecycle, mixer, previews, and Stop |
| Reload, export, import, templates | Eight new M4 browser scenarios pass: invalid-draft/title/ID restore; exact mixed-ending JSON/code/clipboard; invalid import preserving active audio; replacement undo/redo; all templates/empty state; corrupt recovery; quota failure; Space behavior; queued-write cancellation is included |
| Pure persistence/schema validation | Nine new unit scenarios, including four template cases and a pinned-runtime template probe; corrupted/mismatched/oversize inputs fail without evaluation |
| Type checks / tests / static output | Zero type errors/warnings, **129 Vitest tests**, **22 Playwright tests**, successful static build |
| Accessibility | Lighthouse 13.6.0 **100/100**, threshold 90; reproducible production audit and CI configuration |
| Plain-code interoperability | Exported 323-character Basic beat source accepted, played, and stopped in live strudel.cc on 2026-11-18 (Toronto) using isolated Chromium; metadata comments/native labels required no translation |
| Architecture, subset, extension workflow, license | README covers setup, module boundaries, data preservation, supported/opaque timing, effect table defaults plus test workflow, offline/runtime limits, and AGPL/source availability |
| Human listening / release acceptance | **Unreported** for M2, M3, and v1. M0 owner verification is recorded separately |
| Remote CI for these local changes | Workflow includes every milestone check and Lighthouse; **no remote run is claimed** |

The v1 implementation is complete locally. Its release gate remains open until unreported human/remote acceptance evidence is supplied; no stretch features or publication are claimed.

## Interoperability reproduction

Load Basic beat, then Download code or Copy Strudel code. Paste the result into strudel.cc and press Play, then Stop. The optional live-site smoke check is:

```sh
node scripts/verify-export-in-strudel.mjs /path/to/exported-code.strudel
```

It uses a fresh, isolated browser, checks that the REPL enters playing state without a displayed evaluation error, stops it, and writes screenshot/JSON evidence under `reports/`. It is excluded from offline CI because strudel.cc and its samples are external services. The recorded check used the actual template source exported by the app, not a rewritten approximation. An initial Orca-hosted attempt hit a strudel.cc evaluator conflict with the host's protected `window.close`; the compatibility result comes from standard isolated Chromium. The original remote editor text was restored and the temporary Orca tab closed.

A browser Play/Stop state and runtime event checks are not a human listening report. Complete the M2/M3 listening checklists, then listen to all four templates, a UI-built four-track song, reload/import recovery, and exported code in strudel.cc. Record what was heard, browser/device, and limitations before marking the release accepted.

## Runtime and delivery limits

External sample manifests/recordings are fetched at runtime. There is no bundled sample library, service worker, or guaranteed offline startup; current initialization loads the default manifest even for synth-only patterns. Browser storage caches projects, not audio recordings. Native updates use the next scheduling tick with existing lookahead, not full-cycle quantization. Stop permits tails. Evaluation failures preserve patterns but cannot roll back arbitrary JavaScript side effects. Async sample/scheduler failures may not surface in the evaluation callback. Clock playheads are limited to representable synchronized rows; event-accurate highlighting remains deferred.

AGPL-3.0-or-later, source availability/visible link, beginners learning Strudel, native mute/solo, and permanent browser delivery follow the owner's confirmed decisions. Serve matching source when deploying a modified build and update the footer source URL accordingly. External sample provenance is separate. No audio export, backend, accounts, collaboration, desktop wrapper, mobile feature milestone, or post-v1 stretch work was added.

## Subsequent phase

After M4 evidence was reported, the owner requested the next phase. The first post-v1 backlog item was selected as the default and implemented: see [visual modifier controls](post-v1-modifiers.md). This does not change the unreported human/remote acceptance checks above. Current test counts and expanded Lighthouse coverage are recorded in that phase document.
