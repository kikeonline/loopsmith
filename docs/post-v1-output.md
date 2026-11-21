# Post-v1: MIDI note mirror and runtime visualizers

Implements the third item in [stretch backlog #24](https://github.com/kikeonline/loopsmith/issues/24), following visual modifiers and per-track arrangements. Runtime output is below the mixer. Project text, JSON version 1, exports, and editor history remain unchanged by monitoring or device settings.

## Using the output panel

Enable **Show runtime visualizers**, then Play. Audio scope reads the browser mix; the read-only runtime piano roll shows pitched note gates over the last four seconds. The sounding-note text names current pitches without a constantly announcing live region. These observations include resolved scale degrees, chords, arrangements, and timing modifiers, independent of the selected track’s visual editing subset. Unpitched drums have no piano lane. Sound previews use a separate audio branch and do not enter the scope or event view.

The panel observes the last installed pattern during parse/evaluation failure or unsynced code. Stop clears the display. Closing visualizers releases the analyser branch; reopening attaches it again. An audio-graph reset reconnects the tap to the new output node. The tap never disconnects the audio destination. Visual refresh is capped at about 30 frames per second; events are bounded to 256 entries, with a four-second history and 60-second maximum displayed gate. No user pattern is queried or reevaluated for display.

Scope follows the standard Superdough output mix. The event view and MIDI mirror follow Strudel’s **default output callback**. A custom dominant `.onTrigger(...)`/output can bypass that callback, and a custom audio graph can bypass the mix. Event bars describe scheduler gates, not recordings, envelope releases, per-track attribution, or an editable score.

## MIDI behavior

**Connect MIDI** requests Web MIDI access with `{sysex:false}`. Neither loading the app nor showing visualizers requests permission or initializes audio. Select a connected output and choose channel 1–16 and fixed velocity 1–127, then enable mirroring. Browser audio continues. Settings and permissions are not written into the project, and mirroring is off after reload.

The mirror accepts the default output’s resolved `note` or `freq`; it uses the pinned Strudel `valueToMidi` conversion, rounds to the nearest MIDI note, and skips invalid/out-of-range values. It does not turn sample indices into pitches or invent drum mappings. Each gate uses the scheduled duration, capped at 60 seconds. Hardware programs, pitch bends/microtonality, sustain, MIDI clock/transport, per-track channels, inputs, and SysEx are outside this phase.

Audio-context target times are converted into `performance.now()` timestamps. A 10 ms queue driver sends note-ons into a 20 ms native timestamp window. Note-offs stay cancellable locally until due, so obsolete gates cannot cut a newer same-pitch retrigger; due note-offs can have timer jitter. Same-pitch overlaps retrigger one channel voice rather than allocating MPE voices. Dense queues stop mirroring at 1024 messages. This is browser-timed mirroring without hardware-latency compensation.

Stop and MIDI panic clear both application and native queues and release pitches this session sent. Panic leaves mirroring enabled for subsequent events. Changing device, channel, velocity, reconnecting, a device failure/disconnect, hiding the page, or leaving the page disables mirroring and releases notes. Opening/closing devices is serialized; a canceled open cannot re-enable output later. Denial, unsupported browsers, missing outputs, and send/open failures are presented in the panel. Devices used by other applications on the same channel can share MIDI voice state.

The timestamp, queue-clearing, secure-context and permission contracts follow the [Web MIDI specification](https://www.w3.org/TR/webmidi/). The implementation requests no system-exclusive access and opens no input ports.

## Verified boundary and local evidence

The installed `@strudel/web@1.3.0` bundle exports `webaudioOutput`, `getTrigger`, `valueToMidi`, and `getSuperdoughAudioController`. `initStrudel` forwards a supplied default output through `webaudioRepl`; it retains native custom-output precedence. The audio scope attaches an unconnected analyser side branch to `output.destinationGain`. These APIs and shapes were checked against the installed sources and runtime probes, without adding a dependency or changing Strudel’s source.

- `npm run check`: no errors or warnings.
- `npm test`: 172 tests pass. New cases cover note mapping, timestamp conversion, bounded histories, observer isolation, analyser reconnection/cleanup, lazy playback observation, permission/device lifecycle, channel/velocity, same-pitch retriggers, near-boundary note-off cancellation, panic, disconnect, send failure, and canceled opens.
- `scripts/verify-strudel.mjs`: queries real scaled/arranged/modified notes, verifies scheduler callback timestamps and resolved pitches, and verifies a dominant custom output bypasses the observer. Prior bundle and template probes still pass.
- Chromium browser coverage now totals 33 tests. New scenarios cover lazy visualizers, runtime gates/scope, last-good output on invalid code, Stop cleanup, explicit MIDI connection and settings, outgoing bytes, panic, reload defaults, denied/unsupported access, disconnect, and hidden-page disabling. MIDI devices are mocked.
- `npm run build`: static build passes; the existing large-chunk advisory remains.
- `npm run test:a11y`: starter, populated-modifier, and populated-arrangement screens, including the new permanent output controls, each score 100/100 with no failing audits. These audits leave the visualizer checkbox off; the open display has labeled SVGs and was inspected separately.
- Orca browser at `http://localhost:5173/`: added a melody on an isolated local origin, played using the real audio runtime, observed four note gates and a nonzero scope signal with no alerts, checked desktop and 390px layouts, then stopped playback. Existing work at `http://127.0.0.1:5173/` was preserved.

Physical MIDI-device behavior and human listening acceptance remain unreported. No physical-device permission prompt was accepted or hardware message sent during these checks. The prior v1 listening and remote CI acceptance checks remain unreported. Share-link import is the remaining stretch item; no release gate or deployment is claimed.

The subsequent phase implements [local Strudel share-link import](post-v1-share-import.md), the remaining listed stretch item.
