import { MAX_FILE_BYTES, readProjectFile, serializeProject, type ProjectFile, type RestoredProject } from './project-file';
export const LIBRARY_PREFIX = 'loopsmith.library.project.v1.';
export const MAX_LIBRARY_COPIES = 30;
const ENTRY_FORMAT = 'loopsmith-library-copy';
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id);
type LibraryStorage = Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export interface LibraryCopy { id: string; name: string; savedAt: string; tracks: number; raw: string }
export interface DamagedCopy { id: string; error: string; raw: string; removable: boolean }
export interface LibraryListing { copies: LibraryCopy[]; damaged: DamagedCopy[] }
export interface RemovedCopy { id: string; raw: string }
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
}
