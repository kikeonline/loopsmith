# Post-v1: scheduled event playheads

After the listed v1/stretch development backlog was implemented, the next-phase request was offered a default of the source/event highlighting still deferred in the README. This phase adds **Playhead → Scheduled events** to the transport. **Cycle clock** remains the default and retains its conservative timing rules.

Scheduled-events mode highlights original mini-notation source tokens in CodeMirror and the corresponding flat drum/note slots. It follows reported gates through fast, slow, reverse, every, parallel rows and arrangements. Arrangement sections light up when active source locations belong to their pattern, including with outer timing modifiers. The code pane can show simultaneous source tokens across multiple tracks, including reported scale and instrument tokens.

This is scheduled-event/source feedback, not a recording, envelope/tail meter, or sample-accurate hardware synchronization. Source slots describe the original pattern; transforms can change the resulting pitch/rhythm. The runtime piano-roll visualizer continues to show resolved pitches separately.

## Runtime and source contracts

The pinned Strudel default-output callback reports `hap.context.locations` as original UTF-16 source offsets `{start,end}`. The event observer copies at most 64 locations per event and retains the exact `repl.state.activeCode` version. Existing event-history limits remain: 256 events, four seconds of recent history, and gates capped at 60 seconds. Old full-source references/locations are discarded when the source version changes, while note history remains available to the output visualizer. Reading event snapshots does not create an audio analyser or initialize audio.

Only active gates with the exact currently playing/editor source are eligible. Loading, Stop, syntax errors, unsynced edits, changing to clock mode, and source changes clear/hide event highlighting. Old source ranges are never mapped onto a newly edited document. Decorations clear immediately on CodeMirror document changes; visual slots refresh on the next animation frame. Project loads use existing transport Stop and history behavior.

Reported locations are checked against parsed literal boundaries without evaluating user code. The installed transpiler produces unreliable positions inside cooked escaped strings, so an entire literal containing a backslash is excluded. Interpolated/tagged templates, invalid bounds, unsupported/computed source locations and missing default-output metadata do not get guessed highlights. Ordinary literals and untagged, non-interpolated multiline mini templates can retain Unicode/CRLF positions. Custom dominant output callbacks can bypass default-output observation, as documented for runtime visualizers/MIDI.

For flat editable sources, source-token ranges map separately to each row/slot; rests never light up as sounding atoms. Nested/unsupported patterns remain code-only. Arrangement proxy offsets are translated back to their original section-expression positions. Shared/computed patterns whose tokens live outside a section cannot safely identify that section, so their section highlight can be absent. Source highlighting still works where a valid reported literal is available.

A four-entry source-literal cache avoids reparsing every frame. Active ranges are merged/deduplicated, with binary lookup against literal boundaries. CodeMirror decorations use a dedicated state field and `addToHistory(false)`; they do not edit text, move selection, trigger autosave, or affect Undo/Redo. The cached editor draft string prevents rebuilding the complete source on every animation frame. The project model, JSON v1 schema and exported source are unchanged; playhead mode is session-only and resets to Cycle clock on reload.

## Verification

- `npm run check`: no errors or warnings.
- `npm test`: **188 tests** pass, including source-version/gate validation, literal boundaries, Unicode/CRLF/templates, escaped-string exclusion, independent rows, note/degree slots, arrangement proxy offsets, immutable location snapshots and old-source cleanup.
- Chromium coverage totals **39 tests**. New scenarios cover modified drum events and exact code-token highlights, selection/source/undo preservation, stale-source rejection, note slots inside outer-modified arrangements, Stop, invalid drafts, expired gates, escaped strings and switching back to clock mode. The full suite passed; the changed event/output scenarios were rerun after final refinements.
- Pinned-bundle probes verify original locations through reverse/fast/every/arrangement transforms, the exact active-code version, Unicode/CRLF positions, and the observed escaped-string limitation.
- Runtime-boundary tests verify event snapshots carry the source/version locations without creating an analyser or changing audio output.
- `npm run build`: static build passes; the existing large-chunk advisory remains.
- `npm run test:a11y`: the starter, populated modifier and populated arrangement screens retain Lighthouse 100/100. Active event borders were also inspected separately; sounding filled slots have a dark inner stroke and a light outer outline.
- Orca browser at `http://localhost:5173/`: a fresh page load with the real audio runtime reported `sd`, `hh`, `e4` and `sine` token highlights and the matching independently active drum-row slots, with no alerts. Playback was stopped afterwards. Existing work at `http://127.0.0.1:5173/` was preserved.

Earlier main commit [8a2bf61 passed CI](https://github.com/kikeonline/loopsmith/actions/runs/44849009427); CI for this new phase runs after its push. Human listening/v1 release acceptance and physical MIDI-device verification remain unreported. No acceptance gate or deployment is claimed closed by this change.

The next two-phase request is implemented in the [local project library](post-v1-project-library.md) and [native share-link export](post-v1-share-export.md).
