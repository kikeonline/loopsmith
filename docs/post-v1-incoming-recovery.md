# Follow-up phase: recover incoming projects as new copies

This phase extends [backup entry inspection](post-v1-backup-inspection.md). An incoming project can now be kept beside an existing conflicting version directly from inspection, without exporting/reimporting it or replacing the current editor.

Review a backup and inspect a valid saved-project entry. **Recovered project name** defaults to the incoming title and accepts the same 160-character limit as other projects. Choose **Save incoming as new library copy** to create an independent local snapshot. This works for missing, identical and conflicting incoming entries, including invalid drafts whose last-good source/model validate. Damaged entries retain their download-only inspection path.

Saving assigns a fresh library identity and save time. The draft, last-good source, track/section identity model, custom code, Unicode and line endings remain intact; an edited title changes only the project-file name. The original incoming bytes and any local entry under its original identity are retained. The recovered copy is selected in the library after a successful refresh. **Open saved project** remains a separate stopped, source-undoable load; saving does not change current source, project title, source history, autosave, device state or playback.

The existing 30-key capacity limit includes damaged data. Capacity/quota failures keep the action retryable and do not evict or overwrite anything. After a successful save, the action and name field are disabled for that inspection to prevent accidental repeated saves. Closing/reopening inspection, choosing another entry or reviewing again starts a new action; explicitly saving again creates another independent copy. This guard is UI state, not persistent deduplication across sessions.

If storage writes successfully but the following listing refresh fails, the UI reports that the copy was saved and offers Refresh library. The save action stays disabled rather than treating that refresh failure as an unsaved project and creating duplicates on retry. Existing exports/recovery downloads remain available.

## Implementation and review

`ProjectLibrary.saveBackupCopy(text,id,name?)` revalidates the full current backup envelope and selected saved project before writing. It uses the same validated save path as ordinary snapshots, checks capacity, rejects an occupied generated identity, and also rejects a generated identity matching the incoming entry even when that key is absent. Only a new library key is written; workspace autosave is untouched. Existing per-file/source limits and browser concurrency limitations remain unchanged. No dependencies, persistence formats or migrations were added.

Final review covered incoming/local separation, incomplete-draft and model fidelity, name validation, identity collisions, write/refresh failure separation, retry state, source nonexecution and keyboard/layout behavior. No outstanding implementation defect was identified.

## Verification

- Five new unit cases cover renamed conflicting drafts, exact source/model preservation and nonexecution; missing/identical input and name limits; damaged/unknown/malformed input rejection; capacity/quota failure and retry; and generated identities matching incoming/occupied keys.
- Three new browser scenarios cover keyboard recovery while playing, unchanged source/title/local conflict, explicit stopped opening and Undo, capacity filled after inspection, quota retry, and successful writes followed by failed listing refresh without duplicate retries. Existing damaged-entry coverage also verifies that project recovery is unavailable for damaged data.
- Local verification passes: **223 unit/invariant tests**, **61 Chromium tests**, type checking, static build and three production Lighthouse accessibility scores of **100/100**. Existing navigation audits leave backup disclosures closed; open controls have separate browser/manual coverage.
- Orca inspection on `http://localhost:5173/` saved an incomplete incoming draft as **Recovered preview**. Storage comparison showed exactly one new library key, all previous copy bytes retained, and byte-identical workspace autosave. Transport remained **Ready when you are**. Desktop and 390px screenshots of the recovery controls were inspected; the narrow document remained 390px wide without horizontal overflow.

Human listening/release acceptance and physical MIDI verification remain unreported; this phase does not close those gates or deploy the application.
