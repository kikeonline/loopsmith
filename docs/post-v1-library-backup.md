# Follow-up phase: whole-library backup and restore

The owner requested the next implementation phase after the project library and native share-link exporter shipped. Whole-library backup and restore extends the [local library](post-v1-project-library.md) with a portable recovery file. It requires no account, server, new dependency or project-file migration.

## Using backups

Open **Project library → Library backup and restore**. **Download library backup** captures all saved copies, including damaged saved data. Save a project copy first to include current editor changes: workspace autosave, layout/device settings and editor history are separate from the library and are not included.

Choose **Review library backup** and select the downloaded JSON. Review shows each named copy or damaged entry and whether it is missing, already saved with identical bytes, or conflicts with an existing identity. Review does not write storage, open a project, evaluate source or initialize audio. **Cancel backup review** clears the pending review, including an unfinished file read.

**Restore missing library entries** adds absent entries. Identical entries are skipped; conflicting identities keep their existing local data. The incoming conflicting bytes remain in the backup file. Nothing is renamed, silently overwritten, cleared, or automatically opened. Use the library's existing Open control when ready; project loading remains stopped and source-undoable. Keep the backup until the restored copies have been checked.

The existing 30-key new-save limit includes damaged copies. The [selective restore follow-up](post-v1-selective-restore.md) adds checkboxes for missing entries, with select-all/clear controls. If there are too few free slots for the selected missing entries, restore is blocked before any writes. Select fewer entries, export/remove copies first, or restore into an empty library on another browser/origin. The review updates when an open library receives cross-tab storage changes, preserving deliberate deselection. Completion counts describe the selection; summary counts describe the full backup.

Storage can fill or become unavailable after restore begins. Restore stops at the first failure and reports added, identical, conflicting and unprocessed counts. Earlier successful entries remain saved; no rollback removes them. Retry skips identical completed entries. The current editor and playing loop are unaffected by backup/review/restore, including failure. A reload ends the in-memory review; choose the backup again to resume.

## Format and limits

`src/lib/persistence/library-backup.ts` reads/writes a separate version-1 envelope:

```json
{"format":"loopsmith-library-backup","version":1,"createdAt":"2026-11-24T12:00:00.000Z","entries":[{"id":"saved-copy-id","raw":"exact stored entry text"}]}
```

Entries retain their independent storage-key suffix and original stored string, including whitespace, Unicode, mixed line endings, invalid drafts, last-good code, identity anchors and malformed data. JSON string escaping is decoded back into the same stored string. Valid copies are inspected through the existing project-file validator without execution; damaged entries remain recoverable through existing download/removal controls. Malformed identity suffixes, including an empty suffix, stay inside the library namespace by fixed-prefix concatenation. They never become workspace or arbitrary storage keys.

The entire UTF-8 backup is limited to **32 MiB** and **100 unique entries** on import and export. JSON escaping/envelope overhead counts toward that file limit. This is a container limit, not a promise that browser storage has room for that much data. Existing per-project read limits remain unchanged. An oversized export fails without touching storage; individual saved-data/project downloads remain available. Empty backups are valid. Duplicate identities, unsupported versions, invalid dates, missing/non-string entry data and malformed JSON reject the whole file before any writes. Unknown envelope fields are discarded.

The UI checks file size before reading and guards async results with a request identity, so cancelled/superseded reads cannot reintroduce stale reviews. Restore reparses the original reviewed text, recomputes capacity and compares each current key immediately before deciding whether to add it. This is additive recovery using independent browser-storage keys, not a multi-key transaction or an atomic cross-tab snapshot. A backup reflects keys observed during capture; avoid simultaneous library changes for a consistent capture. The existing storage API has no compare-and-set lock against simultaneous writers of the same identity.

## Review and verification

- Reviewed envelope validation, namespace isolation, exact data fidelity, stale plans, additive failure behavior, source nonexecution, async cancellation and source/playback separation. No outstanding implementation defect was identified in the final review. No dependencies or existing persistence formats changed.
- Nine new unit cases cover exact valid/damaged recovery, invalid-draft/identity preservation, nonexecution, review nonmutation, identical/conflicting entries, fresh capacity checks, partial quota failures and retry, complete prevalidation, byte/count bounds, malformed identities, empty files and denied storage.
- Five new browser scenarios cover exact backup downloads and fresh-browser restore, explicit stopped project opening/reload, keyboard restoration, cross-tab review refresh, conflict preservation, continued playback, quota failure/retry, invalid/duplicate input, capacity blocking, cancellation and superseded file reads.
- Combined local checks pass: **210 unit/invariant tests**, **51 Chromium tests**, type checking, static build and three production Lighthouse accessibility scores of **100/100**. Those existing navigation audits leave these disclosures closed.
- Orca inspection on `http://localhost:5173/` confirmed a backup download and an identical-entry review with restore disabled. Open controls were visually checked at desktop and 390px widths; the 390px document had no horizontal overflow. The existing saved copy and editor source were preserved, with playback stopped. Fresh-browser recovery and live-playback safety are covered by the browser suite.

Human listening/release acceptance and physical MIDI verification remain unreported. This phase does not close those gates or deploy the application.

The subsequent [entry inspection/export phase](post-v1-backup-inspection.md) adds read-only draft/last-good or damaged-data previews, incoming project JSON export, and exact one-entry recovery backups for missing, identical and conflicting rows.
