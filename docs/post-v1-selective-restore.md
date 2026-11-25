# Follow-up phase: selective library restore

This phase extends [whole-library backup and restore](post-v1-library-backup.md). A backup can contain more missing copies than this browser has room for; the review now lets you choose a subset without editing the backup file or removing unrelated copies.

Open **Project library → Library backup and restore**, review a backup, then use the missing-entry checkboxes. All missing entries start selected. **Clear restore selection** clears them; **Select all missing entries** selects them again. Only missing entries have checkboxes. Identical/conflicting copies remain protected and visible in the full review. The selected count is announced, and restore is disabled for an empty selection or a selection exceeding free slots. Unselected entries remain in the original file.

**Restore missing library entries** applies the selected identities. Its completion counts describe that selection, while the review summary describes the whole backup. Completed/identical/conflicting entries leave the pending selection when the library refreshes; still-missing selected entries remain selected for retry after a partial storage failure. A refresh preserves deliberate deselection. An entry that becomes missing after review is not automatically selected; explicitly choose it or Select all missing entries. New files replace the selection, and cancelled/failed file reads clear it.

## Preservation and review

`ProjectLibrary.restoreBackup(text, selectedIds?)` validates the entire original envelope and selection before writes. Unknown/duplicate selected identities reject the operation; an empty selection is a no-op. Capacity is calculated from currently missing selected entries. Immediately before each write, the existing byte comparison, capacity check and partial-failure handling still apply. A selected entry that changed in another tab is skipped as a conflict or identical copy. Unselected entries are never written, including entries removed after review. The existing no-selection-argument API retains full-backup restore behavior.

Backup version, size/count limits, fixed-prefix namespace isolation, exact stored bytes, damaged-data recovery and browser concurrency limits are unchanged. Current editor/source history, autosave, playback and device state are not loaded or evaluated by selection or restore. Selection is review-only state and does not survive reloads. No dependency or persistence migration is introduced.

Final code review checked selection membership, whole-envelope prevalidation, stale storage/capacity, retry scope, cancellation and source nonexecution. Visual review found a global input width rule stretching the checkboxes; the final implementation overrides that width and includes desktop/390px layout assertions. No outstanding defect was found in the final review.

## Verification

- Four new unit cases cover fitting subsets, unknown/duplicate/empty selections, malformed unselected data, stale identities, exclusion of unselected entries, damaged identity suffixes and selected quota-failure retry.
- Three new browser scenarios cover keyboard selection near capacity, checkbox/label dimensions at 1280px and 390px, cross-tab refresh/deselection, explicit select-all, and cancelled/replaced/invalid reviews. Existing quota/conflict assertions now distinguish selected completion counts from whole-backup review counts.
- Local checks pass: **214 unit/invariant tests**, **54 Chromium tests**, type checking, static build and three production Lighthouse scores of **100/100**. These existing navigation audits leave the backup disclosure closed; open selection controls have separate browser/manual coverage.
- Orca inspection at `http://localhost:5173/` reviewed two named copies, cleared selection, selected one using Space and verified the count/restore-button state. Corrected desktop and 390px screenshots were inspected, with a 390px document width and no horizontal overflow. No library copies were added and the existing editor stayed stopped. Actual selective restore and live-playback safety are exercised by the browser suite.

Human listening/release acceptance and physical MIDI verification remain unreported; no release gate or deployment is completed by this phase.
