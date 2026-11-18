# M1: project model, generation, and preservation

The pure TypeScript API is exported from `src/lib/project/index.ts`. It is intentionally independent of the M0 playback page. M2 will connect this model to a visual editor; no M2 UI work is included here.

## Canonical data

`Project` has `version: 1` and an ordered `items` array. Each item is a tempo declaration, a track, or a raw block. Tempo declarations stay in their original position, including repeated changes; moving them ahead of preamble declarations could change program behavior.

A track contains a stable `id`, native registration `key`, display `name`, `muted` and `solo` flags, a source, and an ordered `calls` array. The ID is independent of the registration key. Duplicate native keys retain Strudel's last-registration-wins behavior; keys containing `$` retain its anonymous-pattern behavior. A bare supported source is a track only when it is the final statement and there are no labeled tracks. Earlier bare expressions must stay raw because the runtime discards their return values.

Sources are:

- `drums` with a mini-notation tree or opaque text;
- `notes` with mode `note` (pitches) or `n` (scale degrees/sample numbers), plus mini notation;
- `raw` with the complete original expression and no separately editable calls.

Calls are ordered numeric/expression effects, string instrument/scale controls, or opaque method suffixes. Unknown methods stay exactly where they appeared. Repeated effects are retained; `setEffect` edits the final occurrence, matching native last-write behavior. Multi-argument effects, callbacks, computed methods, and optional chains are preserved rather than approximated. Computed/optional chains, explicit native registration calls such as `.p('key')`, and otherwise unrepresentable comments conservatively make the whole track raw. This prevents adding a second native registration during generation. Direct program bindings that shadow `s`, `sound`, `note`, or `n` make constructor expressions code-only; shadowed tempo functions stay raw. This is a syntactic subset, not a general JavaScript scope/side-effect analyzer.

`EFFECTS` is the single shared table for gain, pan, LPF, HPF, room, delay/time/feedback, attack/release, and speed. `effectName()` normalizes verified aliases such as cutoff → lpf, hcutoff → hpf, att → attack, and delayfb → delayfeedback. UI bounds are suggestions, not playback clamps; valid imported numeric values are not silently clamped.

## Numeric precision and tempo

Editable JavaScript numeric fields must be finite exact thousandths within ±1,000,000,000; negative zero is excluded. `formatNumber` rejects values outside that domain instead of rounding. Imported literals with more precision, negative zero, calculations, identifiers, and pattern-valued arguments remain exact expression text. Mini-notation atoms remain text and are not subject to JavaScript control-number rounding.

For four beats per cycle, `bpmToCps(bpm) = bpm / 240`, `bpmToCpm(bpm) = bpm / 4`, and `cpsToBpm(cps) = cps * 240`. Conversions that do not fit exact thousandths should use CPM or a preserved expression instead of silently rounding CPS. Tempo items preserve the `cps` or `cpm` unit. Parsing never evaluates tempo expressions or any other user code.

## Mini notation and timing

The structural subset supports atoms, `~` rests, numeric sample indices (`bd:3`), parallel comma-separated rows, nested `[sub sequences]`, `<alternation>`, and one integer postfix per node: `*n`, `!n`, or `@n` (1–1024). Nodes can nest to depth 32, with at most 4096 nodes per parsed pattern. Unsupported syntax, mixed postfixes, random choice, degradation, Euclidean rhythms, polymeters, fractional/pattern-valued modifiers, or malformed mini syntax become a single opaque pattern preserving the original string. A JavaScript string containing unsupported mini syntax is not discarded.

Rows occupy the same cycle concurrently. A normal sequence distributes its cycle among its children; square brackets subdivide a slot. `*n` repeats inside the allocated slot, `!n` replicates across the containing sequence, and `@n` changes relative slot weight. Angle brackets select successive alternatives over cycles. The representation retains these distinctions instead of flattening them into steps.

`noteEvents()` returns exact rational start/duration values only for flat equal-spaced note rows. It returns `null` for nested groups, modifiers, alternation, sample-indexed atoms, or opaque patterns. This is an explicit code-only result, never a timing approximation. No compression algorithm is applied: generation normalizes spacing while preserving the syntax tree and musical timing. Differential tests compare emitted notation with the pinned runtime over eight cycles.

Sources reviewed: [Strudel mini notation](https://strudel.cc/learn/mini-notation/), [effects](https://strudel.cc/learn/effects/), [tonal functions](https://strudel.cc/learn/tonal/), the installed `@strudel/web`, mini, and transpiler READMEs, and the pinned mini grammar/runtime inspected during M0. Runtime probes take precedence over assumptions from unversioned examples.

## Identity, native flags, and metadata

`createTrack({ id, name, source, ... })` supplies an identifier-safe registration key derived from the ID. `trackLabel()` adds the native `_` mute prefix and `S` solo prefix. Imported native labels are decoded according to the M0 findings, and their registration keys remain in the model. Canonical generation keeps duplicate/anonymous registration semantics. Keys whose native spelling cannot represent the requested flags are rejected; `setTrackFlags()` requires an explicit rename rather than silently changing mute/solo behavior.

Generated code starts with `// @loopsmith-project/v1`. A track has an immediately preceding comment:

```js
// @loopsmith-track/v1 {"id":"stable-id","name":"Display name"}
```

Raw tracks also record `"raw":true`, allowing an explicit code-only choice to round-trip even when the underlying expression belongs to the editable subset. Names and IDs are JSON escaped, including newlines and Unicode line separators. The metadata contains identity/display information only; playback flags are visible native code and remain effective in plain Strudel.

The parser accepts well-formed metadata with exactly the supported fields. Malformed or unused comments remain raw source. Duplicate metadata IDs receive unique replacements and warnings. Metadata IDs are stored in a prototype-free range dictionary.

Without metadata, deterministic IDs are derived from the initial key/source/calls and disambiguated on collision. Subsequent parsing with the prior document reconciles identity using metadata, native labels, exact source/call matches, and finally position for same-size unmatched sets. Exact matches among duplicate labels are reserved before assigning changed occurrences. Ambiguous positional matches and duplicate labels produce diagnostics. This supports renames, numeric edits, insertion/deletion, and reordering, but no parser can infer intent when several indistinguishable unlabeled tracks are changed simultaneously. Persisting generated metadata is the reliable cross-session identity contract.

## Preservation and source transactions

`parseDocument(code, previous?)` returns a discriminated result. On success, `ParsedDocument` contains the original `code`, canonical `project`, warnings, item ranges, and per-track label/expression/source-argument/call-argument ranges. Ranges are UTF-16 offsets compatible with JavaScript strings and CodeMirror. Raw blocks are complete unsupported top-level statements or standalone comments; embedded comments stay with their owning raw expression or opaque argument/call.

Whitespace and trivia between items remain in `document.code`. Parsing is not formatting. Ordinary edits use `setEffect`, `setPattern`, `setTrackFlags`, or `applyEdits`, which replace only the requested ranges and then reparse atomically. Unrelated bytes, including CRLF, comments, custom sample declarations, raw tracks, expressions, and unknown calls, remain unchanged. Successful reparsing refreshes all ranges and reconciles IDs; callers must use the returned document for the next edit. Documents/models should be treated as immutable snapshots.

Expression parameters and opaque patterns require an explicit replacement option. Raw tracks reject numeric/pattern editing; native flag changes can still edit their labels without touching expressions. Invalid, overlapping, or syntactically broken edits throw and leave the original document untouched.

On a JavaScript syntax error, `parseDocument` returns a line/column diagnostic and the previous document by identity. `ProjectSession` retains its last successful document/model until the code parses again. It never evaluates input. The caller retains the invalid editor text separately; M2 will display that text while showing the last good model.

`generateProject()` is for explicit new/load/reformat/export operations, not routine synchronization. It emits deterministic labels, ordered calls, numeric formatting, metadata, and LF scaffold lines. Raw fragments and opaque expressions/calls retain their exact bytes, including embedded line endings. It validates the output syntax and model representability before returning. Examples of rejected models include duplicate IDs, incompatible native key/flag combinations, numeric expression fields that should be canonical numbers, and raw blocks containing several unrelated top-level statements. It never drops data to force a model to fit the supported subset.

## Verification and milestone status

Run:

```sh
npm run check
npm test
npm run build
```

The existing CI workflow already runs all three checks and a clean install. Local validation passes with 105 tests, type checking, and the static build. The M1 suite adds:

- 48 corpus cases including invalid JavaScript, all supported mini operators, templates, expressions, duplicate labels, sample declarations, and raw code;
- 8 independently authored complete input/model golden fixtures;
- the actual upstream **“coastline” by eddyflux** as a code-preservation fixture, with attribution and source URL in the fixtures README;
- 500 deterministic fast-check project round trips (I1) and byte-stable regeneration checks (I2), spanning notes, drums, opaque patterns, raw tracks, metadata, flags, and ordered calls;
- 100 randomized source-preservation and stable-ID edits (I3/I5), plus explicit error-retention/identity checks (I4);
- 20 mini-notation timing comparisons and 13 program comparisons against the installed `@strudel/web@1.3.0` bundle, including duplicate keys, anonymous tracks, native flags, aliases, and discarded bare expressions.

The suite proves the model contracts and byte preservation without an audio device or network. It does not claim a new manual listening check. The user explicitly requested this next milestone while M0's listening and original-handoff completeness checks remained open; that authorizes M1 work without claiming those M0 checks passed. M2 remains unstarted.
