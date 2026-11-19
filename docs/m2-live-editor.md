# M2: minimal UI with live sync

Implemented against phase gate [#9](https://github.com/kikeonline/loopsmith/issues/9) and tasks #10–#13, after M1's accepted evidence in #4. M2 implementation and automated acceptance scenarios pass locally. **The M2 human listening check remains unreported. The owner subsequently requested the next phase, authorizing M3 implementation without claiming this listening check passed. See [M3 evidence](m3-composition.md).**

## Editing and preservation

The page renders tracks, flags, drum rows, tempo, and volume/pan/LPF fields from the last successful canonical document. CodeMirror 6 is the only source-text owner and the only undo history. There is no regenerate-on-change path. The code pane can be hidden, docked beside/below the grid, and resized with its lower-right handle; narrow screens stack the pane below the editor.

`src/lib/editor/sync.ts` parses typed text after 200 ms. Parsing never evaluates or rewrites the editor. Syntax errors retain the invalid editor text and the last good grid/model. Diagnostics report source line and column. `lastEditSource` distinguishes code, `ui-sync`, and history changes.

Visual edits use M1's source-range operations, reparse atomically, and dispatch minimal CodeMirror changes annotated `ui-sync`. CodeMirror maps selections through those changes. Multiple queued operations compose their individual changes so a selection in untouched code between them survives. UI transactions are isolated history events; a batch queued during typing is one atomic undo step. Global Cmd/Ctrl+Z and Shift+Z, editor shortcuts, and toolbar buttons all use that history.

All visual writes conservatively wait until one second after the last typed change. This also protects overlapping changes without having to infer the user's editing intent. Queued operations store semantic intent and track IDs, never old offsets. They reparse current text before execution, resolve current ranges, and stay queued through invalid syntax. Subsequent typing extends the wait. A removed track or no-longer-editable pattern rejects the batch visibly without modifying code.

The drum grid represents flat, equally spaced atom/rest rows of at most 64 steps each, including multiple parallel rows and sample indices. Arrow keys, Home/End, and Space/Enter work on step buttons. Length changes preserve retained steps and pad with rests. Enabling a rest inserts the first currently active sound (including its sample index) from that row; an entirely empty row uses `bd`. Mixed-sound rows show the actual sound in each cell; use code to choose another sound. Nested groups, alternation, modifiers, larger rows, notes, and opaque sources remain code-only rather than being flattened. Supported numeric controls still work on note and nested-pattern tracks. Expression values and raw-track effects stay read-only. Numeric imports are not clamped to suggested ranges.

Native mute/solo labels remain executable Strudel. Unsupported native-key changes produce a visible error rather than silently renaming tracks. Tempo edits preserve surrounding text and replace only the setter name/argument, using CPM for exact four-beat BPM conversion. Expression tempo and raw tempo calls (including comments that M1 intentionally preserves as a raw statement) stay code-only. A new setter is not inserted when a raw tempo call could override it.

CodeMirror normalizes pasted CRLF to its line representation. Ordinary UI transactions preserve every unrelated byte of the current editor document; M1's filesystem/source preservation guarantees are unchanged. There is no file-import UI in M2.

## Playback

`src/lib/editor/playback.ts` accepts an injected factory for `LiveRuntime`: `play(code)`, `stop()`, `onError(callback)`, and `cycle()`. The adapter retains M0's `evaluate` entry point for compatibility. Audio imports and initialization happen only after Play. Valid typed, visual, and undo/redo edits automatically re-evaluate while playback is requested. Stopped editing never initializes audio.

Evaluations serialize, keeping only the latest waiting version. Stop invalidates pending initialization/evaluation, stops the scheduler immediately, and stops any stale evaluation that completes later. Stop followed by Play waits for stale work to finish before restarting. Reverting to active code during an in-flight different evaluation queues that active code again, so the final audio matches the reverted editor.

Evaluation failures retain the last installed pattern and active code. Parse failures never reach audio. The cycle display reads the runtime/audio scheduler clock via requestAnimationFrame. The transport shows initialization/evaluation loading, runtime errors, and playing state. Parse errors have reliable source locations; arbitrary runtime errors have no reliable per-track attribution in the pinned adapter.

M0 verified that updates take effect on the **next scheduling tick**, with roughly 100 ms of already scheduled events/lookahead; they are not cycle-quantized. Stop allows existing envelopes/tails to finish. Arbitrary JavaScript side effects are not rolled back. Lazy sample download/decode and scheduler failures may be logged asynchronously by Strudel without reaching its evaluation error callback; the loading indicator covers initialization/manifest/evaluation, not guaranteed completion of every future sample download.

## Automated verification

```sh
npm ci
npx playwright install --with-deps chromium
npm run check
npm test
npm run test:e2e
npm run build
```

Local results: type checking passes without warnings; **109 Vitest tests** and **9 Chromium Playwright tests** pass; the static production build passes. CI now runs Playwright after the existing checks. No remote CI run is claimed for these local changes.

All five requested acceptance scenarios run against the injected fake runtime:

1. An idle step click changes CodeMirror synchronously in under 100 ms and triggers a new runtime evaluation. The typing-protection window intentionally takes precedence while typing.
2. Real CodeMirror keyboard input changing `s("bd ~ sd ~")` to `s("bd bd sd ~")` changes the grid within 500 ms.
3. Syntax errors retain editor text, last-good grid, and active audio code; correction recovers.
4. `.jux(rev)`, expression arguments, comments, and call order survive visual volume edits.
5. UI/code undo and redo share history, including global shortcuts, active-typing reconciliation, and selection preservation.

Additional browser checks cover continued typing extending the queue deadline, invalid-text queues, selections between distinct queued writes, raw tempo/nested-pattern read-only states, native mute/solo, track selection, row lengths, BPM, docking/collapse, keyboard navigation, evaluation failure, and Stop during evaluation. Four deterministic transport tests cover stale initialization, Stop/restart, in-flight undo, and error recovery.

The fake and editor test bridge load only under Vite `--mode e2e`; production branches eliminate them. Fake tests require no samples, network, or audio device. The real adapter remains covered by the pinned-bundle differential tests from M0/M1.

A real-runtime smoke check in Orca Chromium on 2026-11-18 initialized audio, reached Playing with an advancing scheduler cycle, accepted a step edit from `bd ~ sd ~` to `bd bd sd ~` without restarting the cycle, and stopped. Desktop and 390 px mobile layouts were inspected visually. This is browser/runtime evidence, **not a human listening report**.

## Remaining listening acceptance

Open `npm run dev`, press Play, and listen to the kick/snare/hat loop. Toggle a rest on and off while it plays; confirm the change becomes audible live with a short lookahead, without restarting the loop. Edit code, introduce `s(`, and confirm the last good rhythm continues; correct the syntax and confirm recovery. Try undo/redo across both edits, then Stop and allow tails to finish. Record what was heard before closing the M2 gate or starting M3.
