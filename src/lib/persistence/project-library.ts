import { MAX_FILE_BYTES, readProjectFile, serializeProject, type ProjectFile, type RestoredProject } from './project-file';
import { readLibraryBackup, serializeLibraryBackup, type BackupEntry, type LibraryBackup } from './library-backup';
export const LIBRARY_PREFIX = 'loopsmith.library.project.v1.';
export const MAX_LIBRARY_COPIES = 30;
const ENTRY_FORMAT = 'loopsmith-library-copy';
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id);
type LibraryStorage = Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export interface LibraryCopy { id: string; name: string; savedAt: string; tracks: number; raw: string }
export interface DamagedCopy { id: string; error: string; raw: string; removable: boolean }
export interface LibraryListing { copies: LibraryCopy[]; damaged: DamagedCopy[] }
export interface RemovedCopy { id: string; raw: string }
export interface BackupReview {
  backup: LibraryBackup;
  items: { entry: BackupEntry; name: string; damaged: boolean; status: 'add'|'identical'|'conflict' }[];
  additions: number; identical: number; conflicts: number; available: number;
}
export interface BackupRestoreResult { added: number; identical: number; conflicts: number; pending: number; error: string }
interface Entry { format: typeof ENTRY_FORMAT; version: 1; id: string; savedAt: string; file: ProjectFile }
function key(id: string) { if (!validId(id)) throw new Error('Invalid saved-copy identity'); return LIBRARY_PREFIX+id; }
function readEntry(id: string,raw: string): { entry: Entry; restored: RestoredProject } {
  if (new TextEncoder().encode(raw).length > MAX_FILE_BYTES+2048) throw new Error('Saved copy exceeds the size limit');
  const value = JSON.parse(raw) as Partial<Entry> | null;
  if (!value || typeof value !== 'object' || value.format !== ENTRY_FORMAT || value.version !== 1 || value.id !== id || !validId(id) || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt)) || !value.file) throw new Error('Invalid saved-copy format or metadata');
  return {entry:value as Entry,restored:readProjectFile(JSON.stringify(value.file))};
}
/** Immutable copies live in independent keys: saving a new copy never rewrites an index or old project. */
export class ProjectLibrary {
  constructor(private storage: LibraryStorage,private identity=() => crypto.randomUUID(),private now=() => new Date().toISOString()) {}
  private ids() {
    const ids = new Set<string>();
    for (let i=0;i<this.storage.length;i++) { const name=this.storage.key(i); if (name?.startsWith(LIBRARY_PREFIX)) ids.add(name.slice(LIBRARY_PREFIX.length)); }
    return [...ids];
  }
  list(): LibraryListing {
    const copies: LibraryCopy[] = [], damaged: DamagedCopy[] = [];
    for (const id of this.ids()) {
      const raw=this.storage.getItem(LIBRARY_PREFIX+id); if(raw===null) continue;
      try {
        const {entry,restored}=readEntry(id,raw);
        copies.push({id,name:restored.file.name,savedAt:entry.savedAt,tracks:restored.document.project.items.filter(item => item.kind==='track').length,raw});
      } catch(cause) { damaged.push({id,raw,removable:true,error:cause instanceof Error ? cause.message : String(cause)}); }
    }
    copies.sort((a,b) => b.savedAt.localeCompare(a.savedAt) || a.id.localeCompare(b.id));
    return {copies,damaged};
  }
  save(file: ProjectFile): string {
    const restored=readProjectFile(serializeProject(file,false));
    if(this.ids().length>=MAX_LIBRARY_COPIES) throw new Error(`The library supports ${MAX_LIBRARY_COPIES} saved copies. Export and remove a copy before saving another.`);
    const id=this.identity(), name=key(id);
    if(this.storage.getItem(name)!==null) throw new Error('Saved-copy identity already exists; try saving again');
    const raw=JSON.stringify({format:ENTRY_FORMAT,version:1,id,savedAt:this.now(),file:restored.file} satisfies Entry);
    readEntry(id,raw);
    this.storage.setItem(name,raw); return id;
  }
  open(id: string,expectedRaw: string): RestoredProject {
    return readEntry(id,this.current(id,expectedRaw)).restored;
  }
  private current(id: string,expectedRaw: string): string {
    const raw=this.storage.getItem(LIBRARY_PREFIX+id);
    if(raw===null) throw new Error('This saved copy was removed. Refresh the library.');
    if(raw!==expectedRaw) throw new Error('This saved copy changed in another tab. Refresh the library before using it.');
    return raw;
  }
  remove(id: string,expectedRaw: string): RemovedCopy {
    const raw=this.current(id,expectedRaw);
    this.storage.removeItem(LIBRARY_PREFIX+id); return {id,raw};
  }
  restore(removed: RemovedCopy) {
    const name=LIBRARY_PREFIX+removed.id,current=this.storage.getItem(name);
    if(current===removed.raw) return;
    if(current!==null) throw new Error('Another saved copy now uses that identity; it has not been overwritten.');
    this.storage.setItem(name,removed.raw);
  }
  exportBackup(): string {
    const entries: BackupEntry[] = [];
    for (const id of this.ids()) {
      const raw = this.storage.getItem(LIBRARY_PREFIX+id);
      if (raw !== null) entries.push({id,raw});
    }
    return serializeLibraryBackup(entries,this.now());
  }
  reviewBackup(text: string): BackupReview {
    const backup = readLibraryBackup(text);
    const items = backup.entries.map(entry => {
      const current = this.storage.getItem(LIBRARY_PREFIX+entry.id);
      const status = current === entry.raw ? 'identical' : current === null ? 'add' : 'conflict';
      let name = 'Damaged saved data', damaged = true;
      try { name = readEntry(entry.id,entry.raw).restored.file.name || 'Untitled loop'; damaged = false; } catch { /* Exact damaged bytes remain recoverable. */ }
      return {entry,name,damaged,status} satisfies BackupReview['items'][number];
    });
    return {backup,items,additions:items.filter(item=>item.status==='add').length,identical:items.filter(item=>item.status==='identical').length,conflicts:items.filter(item=>item.status==='conflict').length,available:Math.max(0,MAX_LIBRARY_COPIES-this.ids().length)};
  }
  /** Add only absent keys; retries skip identical data. Browser storage has no multi-key transaction. */
  restoreBackup(text: string, selectedIds?: readonly string[]): BackupRestoreResult {
    const review = this.reviewBackup(text);
    const selected = selectedIds === undefined ? undefined : new Set(selectedIds);
    if (selected && (selected.size !== selectedIds!.length || [...selected].some(id=>!review.backup.entries.some(entry=>entry.id===id)))) throw new Error('Restore selection contains duplicate or unknown identities. No copies have been restored.');
    const items = review.items.filter(item=>!selected || selected.has(item.entry.id));
    const additions = items.filter(item=>item.status==='add').length;
    if (additions > review.available) throw new Error(`This selection needs ${additions} free slots; ${review.available} are available. Choose fewer entries or export and remove copies first. No copies have been restored.`);
    const result: BackupRestoreResult = {added:0,identical:0,conflicts:0,pending:0,error:''};
    for (const {entry} of items) {
      try {
        const name=LIBRARY_PREFIX+entry.id,current=this.storage.getItem(name);
        if (current===entry.raw) {result.identical++;continue;}
        if (current!==null) {result.conflicts++;continue;}
        if(this.ids().length>=MAX_LIBRARY_COPIES) throw new Error('The library is full.');
        this.storage.setItem(name,entry.raw);
        result.added++;
      } catch(cause) {result.error=cause instanceof Error ? cause.message : String(cause);break;}
    }
    result.pending=items.length-result.added-result.identical-result.conflicts;
    return result;
  }
}
