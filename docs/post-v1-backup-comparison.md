# Follow-up phase: incoming and saved-copy comparison

This phase extends [backup inspection](post-v1-backup-inspection.md) and [incoming recovery](post-v1-incoming-recovery.md). A conflicting incoming entry can now be compared with the local copy under its original identity before deciding whether to keep another version.

Review a backup, inspect an entry, and choose **Compare with saved copy**. The panel reads the current saved key and shows incoming and saved data in separate columns, stacked below 800px. This compares a backup entry with its saved counterpart; the current editor/workspace is separate. The same control reads a fresh comparison again. **Close saved comparison** returns focus to its invoking button; opening a comparison focuses its heading.

For two validated projects, the summary reports equality of the complete saved entry text, project name, draft, last-good source, stable track/section model and saved timestamp string. Strings are compared exactly, including Unicode and line endings; models use the existing stable JSON representation, including identities and raw content. These are equality checks, not musical/semantic equivalence or a line-by-line diff. Envelope formatting, timestamps or names can differ while source/model match.

Each column shows its project name/date, read-only draft and last-good source when different, plus complete string lengths. Fields preview at most 20,000 JavaScript string characters and explicitly report truncation. A difference outside the visible prefix still reports Different. Textarea display can normalize line endings, so visually identical previews can have different underlying source strings. Existing inspection downloads retain complete incoming data.

A missing local key is reported as **No saved copy currently uses this backup entry's identity**, not damaged data. If either side fails saved-project validation, only exact saved-string equality is reported; project fields are not guessed. Damaged strings and validation errors appear as read-only text, never HTML or executed source. Denied storage produces a comparison error rather than claiming the copy is missing, and clears any previous comparison so stale results are not left visible. Retry remains available alongside incoming recovery/download controls.

Library refreshes invalidate an open saved-side snapshot, including cross-tab storage events and same-tab save/removal/restore actions. A notice asks you to compare again while retaining incoming inspection and recovery state. Invalidation happens even if refreshing the listing fails. Unrelated library changes may also invalidate the comparison conservatively. New/cancelled/invalid backup reviews or another inspected entry discard comparison state entirely. This is a snapshot read, not an atomic cross-tab transaction or merge tool.

## Review and verification

`ProjectLibrary.compareBackupEntry(text,id)` validates the whole incoming backup envelope, inspects its selected entry, reads only the corresponding fixed-prefix library key, validates the saved entry and calculates equality. It never writes storage, executes source, loads the editor or starts playback. No dependencies, persistence formats, existing restore rules or source contracts changed.

Final code review covered incoming/local separation, exact complete-string checks, metadata/model equality, missing versus damaged/denied storage, bounded text rendering, stale result invalidation, focus lifecycle and separation from recovery writes. No outstanding implementation defect was identified.

- Six new unit cases cover identical/nonexecuted/nonmutating comparisons, metadata/formatting differences, differences beyond preview bounds, line-ending-only changes, missing/damaged entries and namespace isolation, and validation/read-denial ordering.
- Four new browser scenarios cover keyboard/focus, incoming/saved fields and complete summaries during playback, unchanged editor/storage/restore selection, cross-tab invalidation and missing/damaged transitions, read-denial retry, long-source truncation, 1280px/390px columns and same-tab recovery invalidation. Existing recovery and backup suites remain passing.
- Local checks pass: **229 unit/invariant tests**, **65 Chromium tests**, clean type checking, static build and three production Lighthouse accessibility scores of **100/100**. Existing navigation audits leave backup disclosures closed; open comparison controls have separate browser/manual coverage.
- Orca inspection at `http://localhost:5173/` compared two incomplete drafts under one saved identity. Draft/name/timestamp differences and identical last-good/model data were correctly reported. Desktop side-by-side and stacked 390px screenshots were inspected. Narrow columns were 290px wide within a 390px document. Storage comparison confirmed byte-identical prior copies and workspace autosave; transport remained **Ready when you are**.

Human listening/release and physical MIDI acceptance remain unreported. This phase does not close those gates or deploy the application.
