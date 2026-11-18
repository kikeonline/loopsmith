# Loopsmith

A browser playground for beginners learning Strudel. M0 provides an editable code textarea, Play/Update/Stop, evaluation errors that retain the last good pattern, and a cycle display driven by Strudel's audio scheduler.

## Run locally

Use Node 22.12+ and npm (CI uses Node 22).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/, then press **Play loop** to enable audio. Edit the code and press **Update loop** or Cmd/Ctrl+Enter. Editing alone does not evaluate code. `s("bd sd cp hh")` plays kick, snare, clap, and hi-hat. Replace a sound with `~` to make a rest. Stop ends scheduling; already triggered sounds may finish their envelopes.

External samples need an internet connection. JavaScript is evaluated in the page's origin, as in Strudel; only run code you trust. There is no backend, account, iframe, desktop wrapper, or audio export.

```sh
npm run check
npm test
npm run build
npm run preview
```

The static SPA is emitted to `build/`. Configure your static host to serve `index.html` for fallback routes. Deploy the source corresponding to the served build at the footer's source URL. Source is maintained in the linked GitHub repository. No public deployment is configured.

## M0 architecture and evidence

- SvelteKit 3, Svelte 5 runes, TypeScript, Vite, Tailwind 4, Vitest, and adapter-static. Kit 3 configuration lives in `vite.config.ts`; TypeScript extends `$app/tsconfig`.
- `src/lib/runtime.ts` lazily imports exactly pinned `@strudel/web@1.3.0`, initializes audio from Play, and adapts its error behavior. The package provides no types; the small declaration file covers only used APIs.
- `src/routes/+page.svelte` owns the spike editor and transport. A revision token cancels playback requested before Stop or page destruction. Code is never rewritten or cleared by evaluation.
- `scripts/verify-strudel.mjs` exercises the installed browser bundle without audio. Vitest runs it along with boundary error-recovery tests. CI checks types, tests, and the static build.
- [Spike findings](docs/spike-findings.md) cover exact APIs, native mute/solo, scheduling, controls, samples, highlighting, arrangement, reproduction, and acceptance limitations.
- [Dependency licenses](docs/dependency-licenses.md) record the lockfile inventory. Regenerate using `node scripts/dependency-licenses.mjs` after dependency updates.

M0 scope comes from GitHub [#1](https://github.com/kikeonline/loopsmith/issues/1), [#2](https://github.com/kikeonline/loopsmith/issues/2), [#3](https://github.com/kikeonline/loopsmith/issues/3), and confirmed owner decisions [#23](https://github.com/kikeonline/loopsmith/issues/23). The repository was initially empty and the referenced original handoff/README was unavailable. Findings cover every verification topic named in those issues; the absent handoff cannot be independently checked for additional items.

M1 has not started. Its canonical model, parser, deterministic generator, preservation invariants, and visual editing belong to subsequent milestone gates.

## License

Loopsmith is licensed under **AGPL-3.0-or-later**; see [LICENSE](LICENSE). The UI links to the public [source repository](https://github.com/kikeonline/loopsmith). Retain license notices and make corresponding source available when serving modified versions. Strudel and its related audio packages use AGPL-3.0-or-later. External sample recordings have separate provenance; they are fetched at runtime and are not included in this repository or static build.
