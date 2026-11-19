# M3: melodic tracks and richer UI

Implemented against [phase #14](https://github.com/kikeonline/loopsmith/issues/14) and tasks #15–#18. The owner requested the next phase after M2's implementation/evidence was reported. That request authorizes M3 implementation; **it does not constitute a listening report for M2 or M3**. Both listening checks remain unreported. The owner subsequently requested M4; its implementation and remaining release acceptance checks are recorded in [M4 evidence](m4-persistence.md).

## Composition and preservation

A song can be built through Add track, choosing Drums, Melody · pitches, or Melody · scale. Tracks have editable display names and independently stable metadata IDs. Newly created native labels are readable and unique (`drums2`, `melody3`, `lead4`); imported labels are retained. Duplicate assigns a fresh ID and key, copying the original expression exactly. Native mute and solo flags remain visible in code, including on raw tracks.

`src/lib/editor/composition.ts` implements lifecycle operations as immutable source transactions. Add generates only the new track's scaffold; it never regenerates the existing document. An imported bare final track receives a native label before adding/duplicating another track, keeping both audible. Reorder swaps only track-owned statements and recognized metadata; all intervening raw statements, comments, and whitespace remain in place. Rename edits identity/display metadata without renaming native keys. Delete removes only the selected statement/metadata. When removing the final track, a final `null;` prevents previously discarded bare expressions from unexpectedly becoming the program's returned pattern. Arbitrary code side effects remain outside the model's guarantees.

All these operations use M2's typing queue, refreshed source ranges, CodeMirror transactions, and shared undo/redo history. A queued batch fails atomically if a track disappears or becomes uneditable. Ordinary visual edits preserve custom `samples(...)` declarations, comments, expression arguments, unknown call text/order, and unrelated source. There is still no file import UI; handwritten code can be pasted into CodeMirror.

## Melodies, drums, and effects

The piano roll edits flat equal-spaced pitch/rest rows and numeric scale-degree/rest rows. Multiple rows play concurrently and can have different lengths; selecting a row preserves the others. Lengths run from 1 to 64 slots; extension adds rests. Clicking/Space/Enter toggles a note, and arrow keys navigate the two-dimensional roll. Pitches cover selectable octaves plus all existing imported pitches. MIDI integer pitches and enharmonic spellings are recognized without rewriting them during unrelated edits. Scale degrees include imported integers from −128 to 128; scale-degree editing requires an explicit string-valued `.scale(...)`.

The roll has one note per slot in each row, with a displayed source-slot duration of 1/row-length cycles before extra code transforms. Chords can use parallel rows. Nested groups, modifiers, alternation, sample-number sequences without a scale, fractional degrees, sample-indexed pitches, opaque patterns, and other variable timing remain read-only rather than being approximated. There is no note-dragging, independent duration editing, or arbitrary timing quantization in M3.

Instrument selection uses a string control or the registry browser's Use action. Degree tracks expose a scale string such as `D:dorian`. Existing scale controls on pitch tracks remain accessible. Later opaque `.s(...)`, `.sound(...)`, or `.scale(...)` calls take precedence over earlier string calls in the UI; they require an explicit replacement action. Method identification uses Acorn, including aliases/comments. Numeric-expression effects appear as read-only chips with explicit replace-with-value actions. Replacement changes only the selected argument/call and remains undoable.

Drum rows now have a sound field, including sample indices, and a registry-browser target row. Changing a row's sound updates its active cells and keeps rests. An all-rest row activates its first step so the chosen sound is represented in source. Mixed-sound rows still display every actual sound; enabling a rest uses the first active sound as in M2.

The mixer provides independent gain/pan fields and native mute/solo buttons for every track. The selected track exposes all eleven effects from the shared table: gain, pan, LPF, HPF, room, delay, delay time/feedback, attack, release, and speed. Imported numeric values are not silently clamped. Raw-track effects remain locked. Repeated effects still edit their final occurrence through the M1 API.

## Code-only tracks and highlighting

Raw tracks show an **Edited in code · locked** card with their exact expression, plus native mute/solo controls. Convert to raw adds/updates metadata with `raw:true`, leaving the executable expression unchanged. Undo restores visual editing. Unknown calls receive badges/chips and remain in their original order.

Playhead highlighting is an **audio-clock fallback**, calculated from the runtime scheduler's cycle and each row's equal slot count. It does not use wall-clock extrapolation or a separate interval. It is enabled only for the exact active source version, supported flat rows, audible native flags, and chains without opaque calls. Muted/non-soloed tracks, duplicate non-anonymous native keys, code-only timing transforms such as `.fast(...)`, parse errors, and stale audio versions have no playhead. A highlight can be ahead of/behind a scheduled onset by the runtime's lookahead and display frame latency; it is not an onTrigger-derived event visualization. Token highlighting, arbitrary expression/event timing, and exact audible-onset highlighting remain deferred.

## Sounds and previews

The runtime extends the injected interface with optional `sounds`, `preview`, and `stopPreview` capabilities. Sound browsing and playback share one lazy initialization promise; initial rendering/ordinary edits do not create audio. Load available sounds explicitly initializes audio and the verified manifest, then reads `soundMap.get()`. Filtering and pagination expose all registered names, types, and sample counts. Refresh after playing custom sample declarations to see their registered sounds. Registry contents remain runtime data, not a hardcoded production list.

Previews use the pinned registry entry's `onTrigger` audio handler, isolated from transport evaluation. For a cold sample, `getSampleBuffer` warms the same runtime cache **before** choosing a trigger time, avoiding the missed-trigger behavior found during M0. A dedicated gain node limits preview output; previews are short (at most roughly 0.6 seconds after triggering), and synths use middle C. Preview is a sound audition, not the selected track's effects/scale processing.

Starting another preview or pressing Stop preview/transport Stop invalidates outstanding preview requests, stops the current source, and disconnects its preview output. Stop before initialization or sample loading completes prevents late playback. A canceled download may still populate the runtime cache; it does not become an audible late preview. Loading, successful trigger, missing handlers, network/decode failures, and other preview errors have their own UI states. The loop's active code/pattern is untouched by auditioning.

The API boundary was checked against installed `@strudel/web@1.3.0`, its bundled exports, and `superdough/{sampler,synth,superdough}.mjs`. Pinned-bundle probes now also verify four-track drum/pitch/degree event values and `getSampleBuffer`. M0's live-update, arbitrary-JavaScript side-effect, external-sample, and asynchronous scheduler-error limitations continue to apply.

## Verification and remaining acceptance

Local commands:

```sh
npm run check
npm test
npm run test:e2e
npm run build
```

Results: type checking passes with zero warnings, **120 Vitest tests** and **14 Chromium browser tests** pass, and the static production build passes. The existing M2 CI workflow runs these checks; no remote CI result is claimed for local changes. Production output excludes the e2e fake runtime/bridge.

New tests cover source-preserving lifecycle operations, stable IDs/native keys, promoting bare tracks, final-track deletion, raw conversion, note and degree edits, row timing boundaries, instrument precedence, sampler selection, shared sound/transport initialization, and preview cancellation before initialization. The five new Playwright scenarios build/play a four-track song without code editing; exercise lifecycle/flags/history; retain unsupported code through effects/raw mute/expression replacement; undo raw conversion; and exercise sound search/use/preview/error/cancellation. All nine M2 browser scenarios continue to pass.

A real-runtime Orca Chromium smoke check on 2026-11-18 built four tracks through UI actions, played them with an advancing scheduler clock, and stopped. The registry returned **238 sounds**. Both a cold `cp` sample preview and a `sine` synth preview completed successfully with transport stopped; Stop preview was exercised. Desktop and 390 px mobile piano-roll layouts were inspected. These observations establish runtime integration, not human listening acceptance.

Remaining human listening check: build two drum tracks, a pitch melody, and a scale melody; press Play and listen for all four. Change notes, instrument, scale, gain/pan, filtering, and delay while playing; verify native mute/solo, preview isolation, and Stop. Paste supported/unsupported custom code, change a visual effect, and listen for preserved behavior. Report what was heard before closing M3 or starting M4. M2's earlier listening checklist remains in [its evidence document](m2-live-editor.md).
