# Follow-up phase: native Strudel share-link export

The second phase of the proposed pair extends the existing [share-link importer](post-v1-share-import.md) with local link creation, copy and download. It follows the [project library phase](post-v1-project-library.md).

Open **Export Strudel share link**, then **Create Strudel share link**. The generated URL represents the entire current editor source, including comments, native mute/solo forms, embedded metadata, arrangements and custom code. The source is parsed without execution; link creation does not upload it, open the external site, start audio or change editor history. Copy the URL, download it as text, or select the read-only field when clipboard permission is unavailable.

Any subsequent source edit invalidates the generated URL and disables its copy/download actions until it is regenerated. Invalid drafts are rejected with syntax details; JSON/plain-code downloads and the library can still preserve those drafts. A late clipboard response does not replace the newer source-changed message. Project-title edits alone do not change a source-only link; the title can still determine the downloaded text filename.

## Encoding and limits

The encoder in `src/lib/persistence/share-url.ts` implements the already verified native format:

```text
https://strudel.cc/#<encodeURIComponent(Base64(UTF8(code)))>
```

No compression, URL shortening, backend or network request is used. The encoder chunks binary conversion at 32,768 bytes to support large programs without exceeding the JavaScript function-argument limit. The URL payload and Loopsmith decoder round-trip BOMs, Unicode and mixed line endings exactly. An external editor can normalize a leading BOM or line endings when displaying the decoded source. Text that cannot round-trip through valid UTF-8, such as a lone surrogate, is rejected instead of silently replaced.

The existing importer limits also apply to exported links: 1,000,000 decoded UTF-8 bytes and 2,000,000 URL characters. Both are checked. Valid source can exceed the URL limit because percent encoding expands some Base64 characters; JSON/plain-code export is the fallback. Empty source and syntactically invalid JavaScript are rejected. Parsing verifies syntax, not successful runtime/sample behavior.

The link contains source only. Workspace draft-recovery state, project-file headers, device settings, editor history and the library are not encoded. Any track/section metadata already present as comments remains part of the source. Project JSON is still the full portable project format.

The current Strudel site was checked on 2026-11-23: its [REPL bundle](https://strudel.cc/_astro/Repl.CTrjKTei.js) updates the hash with its encoding helper, and the [core bundle](https://strudel.cc/_astro/index.4MTgZMQA.js) retains the UTF-8/Base64/percent-encoding format. Asset filenames are evidence of the inspected build and can change later. Offline tests use independent vectors and the pinned runtime's established format; live-site access is not required by CI.

## Verification

- Five new unit cases cover an independent vector, importer round trips, Unicode/BOM/line-ending and opaque-source fidelity, nonexecution, large/chunked inputs, exact byte limits, URL expansion, malformed Unicode, empty source and syntax errors.
- Three browser scenarios cover creation, clipboard and downloaded URL bytes, importer compatibility, absence of execution/network requests, stale-link invalidation, invalid-draft errors, clipboard denial and continued playback.
- Combined two-phase checks: **201 unit/invariant tests**, **46 Chromium tests**, type checking, static build and three production Lighthouse accessibility scores of **100/100** pass.
- Orca inspection at `http://localhost:5173/`: generated a link for the visible project and decoded it independently; it matched the saved/current source exactly. Desktop and 390px controls fit without horizontal page overflow. Playback stayed stopped and no external site was opened by the feature.

The library and share-export disclosures were visually/keyboard inspected separately; the existing navigation audits leave them closed. Existing human listening/release and physical MIDI acceptance checks remain unreported. No deployment is claimed.
