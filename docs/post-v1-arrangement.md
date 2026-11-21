# Post-v1: per-track arrangements

Implemented the second stretch-backlog item after visual modifiers. Use **Arrange this track** on a visual drum or melody track, then select sections in the timeline. Each section has a name, an integer cycle length, its own pattern/modifier/effect controls, duplication, movement, and removal. Add rest section inserts a silent pattern. Keep selected pattern only explicitly replaces the arrangement with that pattern and the shared effect chain; Undo restores it.

## Native Strudel semantics

The source is ordinary `arrange([cycles, pattern], ...)`, with optional outer chained effects/modifiers. Wrapping an existing track keeps its complete original expression in the first four-cycle section. Its existing effects stay inside that section; mixer controls and the Track-wide modifiers and effects disclosure edit the outer chain. Sections can have different patterns, including drums and melodies in the same track. Each track has its own repeating arrangement, rather than a synchronized project-wide song structure.

The pinned `@strudel/web@1.3.0` bundle advances each section by **its own duration** on each arrangement loop; it does not reset each section to source cycle zero. For example:

```js
drums: arrange([1, s("<bd hh>")], [2, s("<cp sd>")]);
```

Over nine cycles this produces `bd, cp, sd, hh, cp, sd, bd, cp, sd`. A section beginning at arrangement offset `start`, with duration `length`, reads source time `floor(cycle / total) * length + cycle % total - start` while active. Alternations, every, fast, and slow retain that native behavior. The runtime probe verifies boundaries, phase, inner modifiers, rests, and shared effects directly against the installed bundle.

The timeline highlights the active section only for audible, synchronized tracks with known integer section durations and no opaque outer timing calls. The selected section’s flat grid/piano playhead additionally requires an unmodified visual pattern. Custom timing, syntax errors, stale audio, mute/solo exclusion, and stopped playback hide the relevant playheads. This is scheduler-clock highlighting, not event/token tracing.

## Source and persistence contracts

`src/lib/editor/arrangement.ts` derives section ranges using Acorn without evaluating code. The canonical JSON/model remains version 1: arrangements are raw source expressions with an editor-side view. `// @loopsmith-section/v1 {"id":"…","name":"…"}` comments pin identities on visual edits. Imported unannotated sections are readable without rewriting source; ambiguous stale targets are rejected. Duplicate explicit identities, shadowed `arrange`, spreads, malformed section arrays, explicit raw choices, and unsupported root shapes remain code-only.

There are at most 32 visual sections. Visual durations are whole cycles from 1 through 1024. Other valid duration expressions remain verbatim and read-only until an explicit replacement. Custom section patterns stay intact; their duration, name, and ordering remain editable. Shadowed source constructors disable source editing and rest creation. These are conservative syntactic checks, matching the existing parser boundary, not JavaScript scope or side-effect analysis.

Section controls reuse the existing pattern editor through isolated parsed source views. Only the edited section expression or outer suffix is copied back into its original range. Other sections, preambles, suffixes, and unrelated comments retain their bytes. Source-backed modifier references survive queued section edits, outer effect changes, and section reordering. Section names, track rename/duplication, explicit raw conversion, autosave, JSON reload, and code export work with existing history and identity restoration.

## Local verification

- `npm run check`: no errors or warnings.
- `npm test`: 157 tests passed, including arrangement source/identity, custom expressions, precedence, queued nested modifiers, phase, and v1 fixture restoration.
- `npm run test:e2e`: 30 Chromium tests passed. Arrangement tests cover creation, duration/name changes, drum and melody edits, rests, ordering, outer controls, live updates, undo, autosave reload, explicit flatten/raw conversion, queued edits, syntax-error retention, keyboard timeline navigation, and playhead visibility.
- `npm run build`: static build passes; existing large-chunk advisory remains.
- `node scripts/verify-strudel.mjs`: native arrangement and prior runtime probes pass without audio/network.
- `npm run test:a11y`: starter, populated modifiers, and populated arrangement screens each score 100/100 with no failing audits; reports are generated under `reports/` and uploaded by CI.
- Orca browser inspection at `http://127.0.0.1:5173/`: rendered two-section arrangement at desktop and 390px mobile widths without horizontal page overflow, played it with the real runtime, observed the current-section highlight advance, and stopped playback. This does not establish human listening acceptance.

M2/M3/v1 listening acceptance and a remote CI result remain unreported. MIDI/output visualizers and share-link import remain separate backlog items. No deployment or release-gate closure is claimed.

The following next-phase request is implemented in [MIDI and runtime output](post-v1-output.md).
