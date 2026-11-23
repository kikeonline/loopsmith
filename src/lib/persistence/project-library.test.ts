import {describe,expect,it} from 'vitest';
import {parseDocument} from '../project';
import {projectFile,type ProjectFile} from './project-file';
import {ProjectLibrary,LIBRARY_PREFIX,MAX_LIBRARY_COPIES} from './project-library';
function file(code='drums:s("bd ~")',name='My loop'):ProjectFile {const parsed=parseDocument(code);if(!parsed.ok)throw Error('Fixture');return projectFile(name,code,parsed.document);}
class MemoryStorage {
  data=new Map<string,string>();get length(){return this.data.size;}key(index:number){return [...this.data.keys()][index]??null;}getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){this.data.set(key,value);}removeItem(key:string){this.data.delete(key);}
}
function setup(){const storage=new MemoryStorage();const library=new ProjectLibrary(storage);return {storage,library};}
describe('immutable local project copies',()=>{
  it('saves independent named copies without touching workspace autosave or executing source',()=>{
    const {storage,library}=setup();storage.setItem('loopsmith.project.v1','workspace');
    const source='// café 🌊\r\nglobalThis.__libraryExecuted=true;\r\ndrums:s("bd ~").jux( rev );\n';
    const a=library.save(file(source,'First')),b=library.save(file('lead:note("c3 ~").s("sine")','Second'));
    expect(a).not.toBe(b);expect(library.list().copies).toHaveLength(2);expect(storage.getItem('loopsmith.project.v1')).toBe('workspace');
    const copy=library.list().copies.find(x=>x.id===a)!;const restored=library.open(a,copy.raw);
    expect(restored.file.code).toBe(source);expect(restored.file.project).toEqual(file(source,'First').project);expect('__libraryExecuted' in globalThis).toBe(false);
  });
  it('preserves invalid drafts, last-good code and stable model identities',()=>{
    const {library}=setup(),original=file();const invalid={...original,code:'drums:s('};const id=library.save(invalid),copy=library.list().copies[0];
    const restored=library.open(id,copy.raw);expect(restored.file.code).toBe('drums:s(');expect(restored.document.code).toBe(original.lastGoodCode);expect(restored.file.project).toEqual(original.project);
  });
  it('keeps damaged entries and valid copies independent, with exact removal/restore recovery',()=>{
    const {library,storage}=setup();library.save(file());storage.setItem(LIBRARY_PREFIX+'damaged','{broken');
    const listing=library.list();expect(listing.copies).toHaveLength(1);expect(listing.damaged[0]).toMatchObject({id:'damaged',raw:'{broken',removable:true});
    const removed=library.remove('damaged',listing.damaged[0].raw);expect(storage.getItem(LIBRARY_PREFIX+'damaged')).toBeNull();library.restore(removed);expect(storage.getItem(LIBRARY_PREFIX+'damaged')).toBe('{broken');
  });
  it('rejects stale open/removal and never overwrites a different entry on undo',()=>{
    const {storage,library}=setup(),id=library.save(file()),copy=library.list().copies[0];storage.setItem(LIBRARY_PREFIX+id,'newer data');
    expect(()=>library.open(id,copy.raw)).toThrow('another tab');expect(()=>library.remove(id,copy.raw)).toThrow('another tab');
    expect(()=>library.restore({id,raw:copy.raw})).toThrow('not been overwritten');expect(storage.getItem(LIBRARY_PREFIX+id)).toBe('newer data');
  });
  it('supports independent library instances, deletion and idempotent undo without an index',()=>{
    const {storage,library}=setup(),other=new ProjectLibrary(storage);library.save(file('s("bd")','One'));other.save(file('s("sd")','Two'));
    expect(library.list().copies.map(x=>x.name).sort()).toEqual(['One','Two']);const copy=other.list().copies[0],removed=other.remove(copy.id,copy.raw);
    library.restore(removed);other.restore(removed);expect(other.list().copies).toHaveLength(2);
  });
  it('limits new copies without evicting existing or damaged data',()=>{
    const {storage,library}=setup();for(let i=0;i<MAX_LIBRARY_COPIES;i++)storage.setItem(LIBRARY_PREFIX+'copy-'+i,'{broken');
    expect(()=>library.save(file())).toThrow('30 saved copies');expect(storage.length).toBe(MAX_LIBRARY_COPIES);
  });
  it('keeps existing data intact when writes fail and allows failed undo to be retried',()=>{
    const {storage,library}=setup();const id=library.save(file()),copy=library.list().copies[0],removed=library.remove(id,copy.raw);
    const write=storage.setItem.bind(storage);storage.setItem=()=>{throw Error('Quota exceeded');};
    expect(()=>library.save(file())).toThrow('Quota');expect(()=>library.restore(removed)).toThrow('Quota');expect(storage.length).toBe(0);
    storage.setItem=write;library.restore(removed);expect(library.open(id,copy.raw).file.code).toBe(file().code);
  });
});

it('recovers malformed namespace keys without touching other application storage',()=>{
  const {storage,library}=setup();storage.setItem(LIBRARY_PREFIX+'bad/id','damaged data');storage.setItem('unrelated','keep');
  const damaged=library.list().damaged[0],removed=library.remove(damaged.id,damaged.raw);
  expect(storage.getItem(LIBRARY_PREFIX+'bad/id')).toBeNull();expect(storage.getItem('unrelated')).toBe('keep');
  library.restore(removed);expect(storage.getItem(LIBRARY_PREFIX+'bad/id')).toBe('damaged data');
});
