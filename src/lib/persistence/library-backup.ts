/** Backups retain the exact stored bytes, including damaged copies, without executing source. */
export const LIBRARY_BACKUP_FORMAT = 'loopsmith-library-backup';
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
export const MAX_BACKUP_ENTRIES = 100;
export interface BackupEntry { id: string; raw: string }
export interface LibraryBackup {
  format: typeof LIBRARY_BACKUP_FORMAT;
  version: 1;
  createdAt: string;
  entries: BackupEntry[];
}
export function readLibraryBackup(text: string): LibraryBackup {
  if (text.length > MAX_BACKUP_BYTES || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('Library backups support up to 32 MiB. Export individual copies if needed.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('This is not valid library backup JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a Loopsmith library backup.');
  const data = value as Record<string, unknown>;
  if (data.format !== LIBRARY_BACKUP_FORMAT || data.version !== 1) throw new Error('Choose a Loopsmith library backup, version 1. Individual projects use Import project JSON.');
  if (typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt)) || !Array.isArray(data.entries) || data.entries.length > MAX_BACKUP_ENTRIES) throw new Error('Invalid backup date or entries; backups support up to 100 entries.');
  const ids = new Set<string>();
  for (const entry of data.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.id !== 'string' || typeof entry.raw !== 'string') throw new Error('Each backup entry needs a saved-copy identity and its original data.');
    if (ids.has(entry.id)) throw new Error('The backup contains duplicate saved-copy identities. No copies have been restored.');
    ids.add(entry.id);
  }
  // Unknown envelope fields never become storage keys. Keep only this version's data.
  return {format: LIBRARY_BACKUP_FORMAT, version: 1, createdAt: data.createdAt, entries: data.entries.map(({id,raw}) => ({id,raw}))};
}
export function serializeLibraryBackup(entries: BackupEntry[], createdAt: string): string {
  const text = JSON.stringify({format: LIBRARY_BACKUP_FORMAT, version: 1, createdAt, entries} satisfies LibraryBackup);
  readLibraryBackup(text);
  return text;
}
