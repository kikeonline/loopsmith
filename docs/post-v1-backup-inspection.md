# Follow-up phase: backup entry inspection and export

This phase follows [selective restore](post-v1-selective-restore.md). An incoming entry can conflict with a local copy, or be damaged, without being safe to restore. The backup review now exposes its data without opening it in the editor or overwriting the existing copy.

The follow-up [incoming-project recovery phase](post-v1-incoming-recovery.md) adds an explicit action to save valid incoming projects under a fresh library identity, keeping existing versions and the current editor intact.

## Inspecting and recovering an entry

Review a library backup, then choose **Inspect backup entry** on any row: missing, identical or conflicting. The inspection always describes the incoming file entry. It does not substitute data from the local copy sharing its identity. A valid saved-project envelope displays the current draft, saved date and last-good source when different. A syntax-error draft is still a valid saved project when its last-good model validates. Damaged entries show the validation reason and a read-only saved-data preview.

Each source/raw field previews at most **20,000 JavaScript string characters**, with a truncation notice and original length. Source is displayed as textarea data, never HTML or evaluated code. Textarea display can normalize line endings; previews are for inspection, while downloads preserve the complete underlying strings.

- **Download incoming project JSON** is available for valid saved projects, including incomplete drafts. It uses the existing project-file serializer and includes the full draft, last-good source, project name and identity model. Downloading does not load it. Choose Import project JSON separately when ready; that existing load stops playback and is source-undoable.
- **Download entry backup** is available for every entry. It wraps the original identity and exact saved string in the existing version-1 library-backup envelope, with a new backup creation timestamp. JSON escaping preserves malformed stored Unicode too. This is a one-entry backup, not plain code or a standalone project JSON; use Review library backup to inspect/restore it. Conflicts continue to be kept on restore.
- **Close entry inspection** removes the panel and returns keyboard focus to its invoking button when still present. Opening an inspection focuses its heading. Choosing another entry replaces the panel and clears previous download messages/errors.

Downloads use the immutable incoming entry data, never a truncated or edited preview field. Existing project-file and backup size limits apply; a failed download leaves the incoming backup, library and editor intact. Keep the full backup when a container limit prevents an individual export.

Inspection is cleared as soon as another file is read, review is cancelled, or an invalid replacement file is chosen. Cross-tab library changes refresh conflict/selection state while preserving the incoming inspection. Inspection, downloads and close never mutate storage, source history, current playback or device state. No new persistence format, dependencies, cloud service or migration is introduced.

## Review and verification

Final review covered whole-envelope validation before inspection, incoming/local data separation, bounded text rendering, complete download payloads, Unicode recovery, project/model validation, stale review lifecycle, keyboard focus, and source nonexecution. One-entry backups were chosen for raw recovery so malformed strings survive JSON encoding. No outstanding implementation defect was found in the final review.

- Four new unit cases cover conflicting incoming projects with invalid drafts/identities/Unicode/line endings, nonexecution, damaged identities/data, unknown entries, malformed/duplicate envelopes, unsupported copy versions and mismatched models.
- Four new browser scenarios cover playing-source safety, conflict preservation, focus/close, current/last-good preview, complete project export and explicit stopped import, one-entry backup recovery, preview truncation, malformed Unicode, HTML/script-like text, 1280px/390px dimensions, cross-tab changes and cancelled/replaced reviews.
- Local checks pass: **218 unit/invariant tests**, **58 Chromium tests**, type checking, static build and three production Lighthouse accessibility scores of **100/100**. Existing navigation audits leave backup disclosures closed; open inspection controls have separate browser/manual coverage.
- Orca inspection at `http://localhost:5173/` displayed a named incomplete draft and its last-good source. Desktop and 390px screenshots were inspected; both narrow preview fields were 290px wide and stayed within a 390px document without horizontal overflow. No library data or editor source was changed and playback stayed stopped. Downloads, cross-tab conflicts and live-playback safety are covered by the browser suite.

Human listening/release and physical MIDI acceptance remain unreported. This phase does not complete those gates or deploy the app.
