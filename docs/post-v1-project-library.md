# Follow-up phase: local project library

The listed roadmap was already implemented when the owner requested the next two phases. A local project library followed by native Strudel share-link export was proposed as the default pair and implemented. This document records the library phase; [share-link export](post-v1-share-export.md) records the second phase.

Open **Project library** in the project bar. Set the existing Project name field and choose **Save a project copy**. Each save creates an independent named snapshot. Choose a saved project to open it, export its JSON without opening it, or remove it. **Undo library removal** restores the most recently removed copy, including damaged data, until another removal or a page reload replaces that in-memory undo slot.

Saved copies are immutable snapshots: opening one does not attach subsequent autosaves to it. Edit the opened source and save another copy to retain a new version. The existing workspace autosave remains separate and continues preserving the current draft/last-good document. Project title and layout are still outside source undo history. Opening a library copy stops playback, cancels pending project writes through the existing load path, and is source-undoable. Saving, listing and exporting library copies do not start playback or evaluate their code.

## Storage and preservation

`src/lib/persistence/project-library.ts` stores each copy under `loopsmith.library.project.v1.<id>`, in a `loopsmith-library-copy` version-1 envelope containing its identity, save time and the unchanged Loopsmith project-file v1. There is no shared index to rewrite or migrate. Workspace key `loopsmith.project.v1` and other storage keys are untouched by library mutations.

The embedded project is validated through the existing project-file reader. Original source, mixed line endings, invalid drafts, last-good code, stable track/section identities and custom/raw content are retained. Validation parses code and uses temporary identity anchors; it does not evaluate code or regenerate editor text. Opening revalidates current stored bytes before replacing the workspace.

Saving creates a fresh identity and refuses to overwrite an occupied key. Open/removal compare the exact stored bytes with the listed copy, rejecting stale changes. Restoration refuses to overwrite different data and is idempotent when another tab already restored the identical copy. Independent per-copy keys prevent normal concurrent saves in different tabs from clobbering one shared library document. This is browser storage, not a general concurrent database transaction protocol.

New saves are refused when 30 library keys already exist, including damaged entries. Undo prioritizes restoring user data rather than evicting another copy to enforce that new-save threshold. Each valid entry allows the existing 8 MiB project-file limit plus 2 KiB of envelope overhead; ordinary browser storage quotas can be smaller and writes can fail. Existing copies/editor data remain available on failure. Copies are per origin/browser, without accounts, cloud sync or cross-device guarantees; JSON export remains the portable backup.

The disclosure reads lazily when opened. Storage events refresh an open library without changing the editor. Missing/unreadable entries are reported individually without clearing or overwriting them. Exact damaged bytes can be downloaded, explicitly removed, and restored with the same removal-undo control. Invalid namespace suffixes are also recoverable without touching unrelated storage.

## Verification

- Eight library unit cases cover independent keys, preservation/nonexecution, invalid drafts and identities, damaged data, stale access, conflicting/idempotent restoration, multiple storage clients, capacity/quota errors, and malformed-key recovery.
- Four browser scenarios cover named copies, stopped/undoable project switching, saved JSON exports, removal/undo/reload, invalid-draft restoration, quota failure while playing, damaged-data recovery and cross-tab refresh.
- Combined two-phase checks: **201 unit/invariant tests**, **46 Chromium tests**, type checking and static build pass. The existing three production Lighthouse screens remain **100/100** with no failing audits; those navigation audits leave these disclosures closed.
- Orca inspection at `http://localhost:5173/`: saved a copy, observed its name/time/track count, and checked the open controls at desktop and 390px widths without horizontal page overflow. Existing workspace source stayed intact and playback remained stopped. The original work at `http://127.0.0.1:5173/` was preserved.

This is an implementation/automated-verification report. Human listening/release acceptance and physical MIDI verification remain unreported; no release gate or deployment is claimed closed.

The next phase adds [whole-library backup and restore](post-v1-library-backup.md), including exact damaged-data recovery, a review step, additive conflict handling and retry after partial storage failures.
