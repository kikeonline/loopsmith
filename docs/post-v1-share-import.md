# Post-v1: Strudel share-link import

Implements the remaining item in [stretch backlog #24](https://github.com/kikeonline/loopsmith/issues/24). Open **Import Strudel share URL** in the project bar, paste a link, and choose **Review share link**. The app decodes and parses locally, displays the decoded source in a read-only, keyboard-scrollable text area, and waits for **Import reviewed code**.

Reviewing does not fetch the link, evaluate its code, change the editor, or stop the current loop. Import uses the existing project-load transaction: it stops transport and clears pending writes, preserves shared Undo/Redo identity restoration, and autosaves a version-1 project. Imported code stays stopped until Play. Editing the link invalidates its preview. A successful template/JSON load clears the preview; importing a reviewed link invalidates an in-flight JSON read. Errors leave the editor and current playback intact.

## Verified encoding

The pinned `@strudel/core` helper in `node_modules/@strudel/core/util.mjs` implements:

```text
code2hash(code) = encodeURIComponent(Base64(UTF8(code)))
hash2code(hash) = UTF8Decode(Base64Decode(decodeURIComponent(hash)))
URL = https://strudel.cc/#<hash>
```

There is no compression. The independently authored vector `https://strudel.cc/#cygiYmQiKQ%3D%3D` decodes to `s("bd")`. A literal `+` in a fragment remains a Base64 character; the decoder does not use query-form decoding, which would change it to a space.

On 2026-11-20, the live [Strudel REPL bundle](https://strudel.cc/_astro/Repl.BewAS-Kk.js) was inspected through its entry at [Repl.BQ-tEMxB.js](https://strudel.cc/_astro/Repl.BQ-tEMxB.js). Its after-evaluation hook sets `location.hash` to the exported encoding helper. The [current core bundle](https://strudel.cc/_astro/index.jpSYW3TI.js) implements the same UTF-8/Base64/percent-encoding algorithm. These content-hashed asset names record the inspected build and can change with upstream deployments. Local probes exercise the pinned bundle directly, without relying on the live site during CI.

## Supported boundaries

- Only HTTPS `strudel.cc` root and `/embed` or `/embed/` links with code in the fragment are accepted. Query parameters do not supply code and are not executed or fetched. Credentials, nondefault ports, other hosts/paths/schemes, short links, and alternate/compressed/Base64URL encodings are rejected.
- Percent decoding happens once. Standard Base64, including unpadded input accepted by `atob`, is supported. Malformed percent escapes, invalid Base64, and invalid UTF-8 are rejected.
- Valid UTF-8 code retains Unicode, BOMs, CRLF/mixed newlines, comments, metadata, raw statements, unknown calls, arrangements, and modifiers. The source stored for import is the original decoded string; native text-area display normalizes line endings but does not replace that stored source.
- Encoded URLs are capped at 2,000,000 characters, and decoded source at 1,000,000 UTF-8 bytes. Both encoded and decoded allocation bounds are checked. Project JSON can represent larger Unicode sources within its existing character/file limits.
- Syntactically invalid shared code is rejected before producing a replacement project. Valid custom JavaScript is parsed without execution and is only run after Play, under the same origin/trust model as ordinary editor code.
- Source-only links use the name “Imported Strudel loop.” Embedded Loopsmith track/section metadata is retained. Device settings, current playback, and editor history are not encoded in Strudel links. This phase adds import, without automatically importing from the Loopsmith page URL or adding share-link generation.

## Local verification

- `npm run check`: no errors or warnings.
- `npm test`: 180 unit/invariant tests pass. Share coverage includes an independent vector, Unicode/BOM/newline fidelity, raw plus/slash characters, embed links, one-time percent decoding, invalid origins/encodings, both size boundaries, nonexecution of custom code, syntax rejection, and version-1 JSON restoration.
- `npm run test:e2e`: 36 Chromium tests pass, including offline review/nonexecution, importing while playing, Stop, Undo/Redo, autosave reload, arrangement recognition, errors that preserve the editor, preview invalidation, and keyboard/mobile use. Prior MIDI and visualizer tests are included.
- Native-bundle probes verify ASCII and Unicode/mixed-newline compatibility with Strudel’s actual `code2hash`/`hash2code` functions.
- `npm run build`: static build passes; the existing large-chunk advisory remains.
- `npm run test:a11y`: the starter, populated modifiers, and populated arrangement screens each score 100/100 with no failing audits. Those navigation audits leave the share disclosure closed. The open review controls were inspected separately in Orca and exercised by keyboard in Chromium.
- Orca browser inspection at `http://localhost:5173/`: reviewed a Unicode/CRLF arrangement link in the project bar; decoded source and explicit import controls rendered correctly. The original project at `http://127.0.0.1:5173/` was preserved.

All four listed stretch items now have local implementations. Physical MIDI verification, human listening acceptance, and a remote CI result for this commit remain unreported; implementation does not close those acceptance checks or claim a deployment.
