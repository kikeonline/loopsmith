# Post-v1 phase: visual pattern modifiers

This implements the first item in [stretch backlog #24](https://github.com/kikeonline/loopsmith/issues/24): visual fast/slow/rev/every controls that preserve ordered calls and opaque source. M4 completes the numbered v1 roadmap. After the owner requested the next phase, the first backlog item was offered as the default and implemented without an alternate preference being supplied. The request authorizes this implementation ahead of unreported v1 acceptance; it does **not** close M4, establish a human listening report, or imply that the other stretch items are implemented.

## Scope and behavior

The selected track now has **Shape the pattern** controls. Add fast, slow, reverse, or every appends a native method suffix to the end of its expression. The complete chain is shown in source order, including effects, instrument/scale calls, and unknown calls. Repeated modifiers are independent entries: changing the second `.fast(2)` does not modify the first. Earlier/Later crosses exactly one neighboring call. Unknown calls retain their exact text and relative order with other non-modifier calls. Remove deletes the selected complete suffix, including trivia/comments owned by that suffix; it does not regenerate surrounding code.

Fast changes pattern density, Slow stretches pattern time, and Reverse reflects each cycle. These differ from the existing sample-speed effect. Every applies one transform on the **first** cycle and then every N cycles: N=4 selects 0, 4, 8, etc. It preserves global pattern phase rather than restarting the source on selected cycles. For example, a slowed pattern can select a different half of its source on a later Every cycle. Calls do not generally commute: `.slow(2).rev()` differs from `.rev().slow(2)`.

Supported controls:

| Method | Visual fields |
| --- | --- |
| `.fast(factor)`, `.slow(factor)` | Positive finite exact-thousandth literal factors from 0.125 to 16 |
| `.rev()` | No arguments; comments in the empty argument list are retained |
| `.every(cycles, callback)` | Literal whole cycle counts 1–1024; custom periods remain read-only |
| `p => p.rev()`, `p => p.fast(factor)`, `p => p.slow(factor)` in Every | Transform selector and optional factor, with one identifier parameter and a direct method-call body |

Factor/cycle expressions, negative/zero/out-of-range imported values, parenthesized calculations, string patterns, and arbitrary callbacks stay exact and read-only. Explicit replace-with-value actions replace only the chosen argument. A global callback identifier such as `rev` is never assumed to reference Strudel's function; `.every(4, rev)` retains that callback while allowing its period to be edited. An explicit replace-callback action writes a visual arrow function. Switching between recognized transforms edits just the method name and relevant argument; callback parameter spelling, formatting, and unrelated comments survive.

Wrong-arity calls stay locked rather than being approximated. Unrelated aliases/functions such as density, sparsity, firstOf, lastOf, custom transforms, block-bodied callbacks, computed methods, and nested callback chains are not promoted to editable modifiers. Existing M1 raw-track rules still apply, including spread/computed/optional chains. Raw tracks can still use native mute/solo, but adding/editing modifiers stays locked.

The drum grid and piano roll continue to display the source pattern before transformations. Clock playheads remain hidden for modifier-bearing tracks: this phase does not pretend that an untransformed step index matches transformed event timing. In desktop side-dock mode, the code pane stays visible while scrolling the longer modifier chain; bottom/collapsed layouts retain their behavior.

## Source transactions, queued edits, and compatibility

`src/lib/editor/modifiers.ts` derives typed controls from the canonical track's ordered opaque calls using Acorn. It never evaluates callbacks. The canonical project and JSON format remain **version 1**; modifiers continue to round-trip as exact opaque call strings. Existing files require no migration.

Number edits replace the current argument range. Add inserts at the current expression end. Reorder swaps two complete current call ranges. No routine operation formats or regenerates the project. Unrelated code, sample declarations, aliases, comments, line endings, native flags, and track IDs remain intact.

Queued controls capture a source-backed reference, not a stale offset. If typing inserts preamble/calls, a unique unchanged target is resolved against the latest valid document. If the target's code changes, disappears, or becomes ambiguous among duplicates after other chain changes, the batch rejects visibly without overwriting the typed code. Duplicate calls are addressed by their original index only while the original chain is unchanged. Short-lived WeakMap anchors carry references across a single immutable UI edit sequence, including intervening effect edits, moves, and removals. Deleted references cannot retarget a newly added identical call. These anchors are not serialized or persisted.

All changes use the existing CodeMirror history, typing queue, autosave, live evaluation, and Stop behavior. A queued batch is one atomic history entry. Successful changes re-evaluate while playing; stopped editing does not initialize audio. Invalid code remains in the editor with the last good model/audio. Reload, JSON, and plain-code export retain modifiers exactly.

## Verification

```sh
npm run check
npm test
npm run test:e2e
npm run build
npm run test:a11y
```

Local results: zero type errors/warnings, **142 Vitest tests**, **26 Chromium browser tests**, and successful static build. The previously completed 129 unit/invariant tests and 22 browser scenarios remain green. Thirteen new unit cases and four browser cases cover:

- Deriving editable fields while preserving the v1 model and original text;
- Repeated modifiers, exact range edits, CRLF/comments/preambles, raw flags and locks;
- Custom period/factor/callback replacement and transform changes without unrelated formatting edits;
- Call ordering, full suffix movement/removal, JSON preservation, and reference invalidation;
- Live UI changes, shared undo/redo, reload, active typing with intervening effect edits, and rejection of stale targets;
- An independently authored JSON fixture containing editable modifiers and read-only expressions/callbacks.

The pinned `@strudel/web@1.3.0` probe compares event sounds/order over eight cycles for Fast, Slow, Reverse, and Every with all three transforms. It also checks Fast's exact onset/duration spacing and a noncommuting call-order pair. These checks establish first-cycle selection and retained global phase independently of the UI implementation.

Lighthouse runs against both the fresh main screen and a restored populated modifier fixture, including replacement actions and disabled custom parameters. Both score **100/100 with no failing audits**. `npm run test:a11y` now runs both; CI uploads all `reports/accessibility*` HTML/JSON artifacts. The populated audit uses `src/lib/project/fixtures/modifiers.loopsmith.json` in an isolated temporary browser profile. Its contents are validated by the unit suite. Reports are generated locally and are not checked in.

A real-runtime Orca Chromium smoke check on 2026-11-18 (Toronto) played Basic beat, added Fast and Every while the scheduler clock continued, observed successful evaluation messages, and stopped playback. The populated desktop layout and sticky code pane were inspected. This is integration evidence, **not a human listening report**. No remote CI run is claimed for local changes.

Remaining human check: listen to a simple drum or note sequence, add/change Fast and Slow, reverse it, and compare Every on cycles 0/N/2N. Move Slow across Reverse and hear the difference. Confirm custom calls still sound as expected after numeric edits; try undo/redo and Stop. The earlier M2/M3/v1 listening and release gates remain unreported.

Arrangement, MIDI/output visualizers, and share-link import remain separate backlog items. No deployment, external issue closure, or release acceptance is claimed here.

The following next-phase request is implemented in [per-track arrangements](post-v1-arrangement.md), which reuses these controls inside individual sections and on the shared outer chain.
