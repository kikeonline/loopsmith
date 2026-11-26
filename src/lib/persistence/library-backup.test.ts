import { describe, expect, it } from 'vitest';
import { parseDocument } from '../project';
import { projectFile } from './project-file';
import { LIBRARY_BACKUP_FORMAT, MAX_BACKUP_BYTES, MAX_BACKUP_ENTRIES, readLibraryBackup, serializeLibraryBackup } from './library-backup';
import { LIBRARY_PREFIX, MAX_LIBRARY_COPIES, ProjectLibrary, inspectBackupEntry } from './project-library';

class MemoryStorage {
  data=new Map<string,string>();get length(){return this.data.size;}key(index:number){return [...this.data.keys()][index]??null;}getItem(key:string){return this.data.get(key)??null;}setItem(key:string,value:string){this.data.set(key,value);}removeItem(key:string){this.data.delete(key);}
}
const time='2026-11-24T12:00:00.000Z';
function file(code='drums:s("bd ~")',name='My loop') {const parsed=parseDocument(code);if(!parsed.ok)throw Error('Fixture');return projectFile(name,code,parsed.document);}
function setup() {const storage=new MemoryStorage();return {storage,library:new ProjectLibrary(storage,()=>crypto.randomUUID(),()=>time)};}
const backup=(entries:{id:string;raw:string}[])=>serializeLibraryBackup(entries,time);

describe('portable library backups',()=>{
  it('inspects incoming projects without reading or mutating a conflicting local copy or executing source',()=>{
    const {library,storage}=setup(),source='\uFEFF// café 🌊\r\nglobalThis.__inspectionExecuted=true;\ndrums:s("bd ~");\r\n';
    const id=library.save({...file(source,'Incoming'),code:'drums:s('}),text=library.exportBackup(),original=storage.getItem(LIBRARY_PREFIX+id)!;
    storage.setItem(LIBRARY_PREFIX+id,'local conflict');const result=inspectBackupEntry(text,id);
    expect(result.kind).toBe('project');if(result.kind!=='project')throw Error('Expected project');
    expect(result.raw).toBe(original);expect(result.restored.file.code).toBe('drums:s(');expect(result.restored.file.lastGoodCode).toBe(source);expect(result.restored.file.project).toEqual(file(source,'Incoming').project);expect(storage.getItem(LIBRARY_PREFIX+id)).toBe('local conflict');expect('__inspectionExecuted' in globalThis).toBe(false);
  });
  it('inspects malformed identities and raw data as recoverable entries without rewriting the bytes',()=>{
    for(const id of ['', '../key', '__proto__']) {
      const raw='broken\r\n🌊\uD800'+('x'.repeat(21_000)),result=inspectBackupEntry(backup([{id,raw}]),id);
      expect(result).toMatchObject({id,raw,kind:'damaged'});expect(readLibraryBackup(backup([{id:result.id,raw:result.raw}])).entries).toEqual([{id,raw}]);
    }
  });
  it('rejects unknown inspection identities and fully validates the outer backup first',()=>{
    const text=backup([{id:'a',raw:'a'}]);expect(()=>inspectBackupEntry(text,'missing')).toThrow('not in the reviewed backup');expect(()=>inspectBackupEntry('{','a')).toThrow('valid library backup JSON');
    const duplicate={...JSON.parse(text),entries:[{id:'a',raw:'first'},{id:'a',raw:'second'}]};expect(()=>inspectBackupEntry(JSON.stringify(duplicate),'a')).toThrow('duplicate');
  });
  it('keeps unsupported saved-copy versions and mismatched cached models as damaged incoming data',()=>{
    const {library}=setup(),id=library.save(file()),raw=library.list().copies[0].raw;
    for(const changed of [{...JSON.parse(raw),version:2},{...JSON.parse(raw),id:'different'},{...JSON.parse(raw),file:{...JSON.parse(raw).file,lastGoodCode:'drums:s("sd")'}}]) {
      const data=JSON.stringify(changed);expect(inspectBackupEntry(backup([{id,raw:data}]),id)).toMatchObject({id,raw:data,kind:'damaged'});
    }
  });
  it('restores a chosen subset when the whole backup exceeds available capacity',()=>{
    const {library,storage}=setup();for(let i=0;i<MAX_LIBRARY_COPIES-1;i++)storage.setItem(LIBRARY_PREFIX+i,'keep');
    const text=backup([{id:'a',raw:'a'},{id:'b',raw:'b'}]);
    expect(()=>library.restoreBackup(text)).toThrow('free slots');
    expect(library.restoreBackup(text,['b'])).toEqual({added:1,identical:0,conflicts:0,pending:0,error:''});
    expect(storage.getItem(LIBRARY_PREFIX+'a')).toBeNull();expect(storage.getItem(LIBRARY_PREFIX+'b')).toBe('b');expect(storage.length).toBe(30);
  });
  it('validates selection and the entire envelope before writing, including empty selections',()=>{
    const {library,storage}=setup(),text=backup([{id:'a',raw:'a'}]);
    expect(()=>library.restoreBackup(text,['unknown'])).toThrow('unknown');expect(()=>library.restoreBackup(text,['a','a'])).toThrow('duplicate');
    expect(library.restoreBackup(text,[])).toEqual({added:0,identical:0,conflicts:0,pending:0,error:''});
    const malformed=JSON.stringify({...JSON.parse(text),entries:[{id:'a',raw:'a'},{id:'unselected',raw:123}]});expect(()=>library.restoreBackup(malformed,['a'])).toThrow();expect(storage.length).toBe(0);
  });
  it('rechecks selected identities and never adds unselected entries that disappeared since review',()=>{
    const {library,storage}=setup();storage.setItem(LIBRARY_PREFIX+'unselected','old');
    const text=backup([{id:'selected',raw:'incoming'},{id:'unselected',raw:'old'}]);library.reviewBackup(text);
    storage.removeItem(LIBRARY_PREFIX+'unselected');storage.setItem(LIBRARY_PREFIX+'selected','other tab');
    expect(library.restoreBackup(text,['selected'])).toEqual({added:0,identical:0,conflicts:1,pending:0,error:''});expect(storage.getItem(LIBRARY_PREFIX+'unselected')).toBeNull();expect(storage.getItem(LIBRARY_PREFIX+'selected')).toBe('other tab');
  });
  it('keeps partial-failure counts and retries scoped to selected entries, including malformed identities',()=>{
    const {library,storage}=setup(),text=backup([{id:'',raw:'empty'},{id:'skip',raw:'skip'},{id:'bad/id',raw:'damaged'}]),write=storage.setItem.bind(storage);
    storage.setItem=(key,value)=>{if(key===LIBRARY_PREFIX+'bad/id')throw Error('Quota');write(key,value);};
    expect(library.restoreBackup(text,['','bad/id'])).toEqual({added:1,identical:0,conflicts:0,pending:1,error:'Quota'});storage.setItem=write;
    expect(library.restoreBackup(text,['','bad/id'])).toEqual({added:1,identical:1,conflicts:0,pending:0,error:''});expect(storage.getItem(LIBRARY_PREFIX+'skip')).toBeNull();expect(storage.getItem(LIBRARY_PREFIX+'bad/id')).toBe('damaged');
  });
  it('exports exact valid and damaged bytes, excluding workspace and unrelated keys without executing code',()=>{
    const {library,storage}=setup();storage.setItem('loopsmith.project.v1','workspace');storage.setItem('unrelated','private');
    const source='\uFEFF// café 🌊\r\nglobalThis.__backupExecuted=true;\ndrums:s("bd ~").jux( rev );\r\n';
    const id=library.save({...file(source,'🌊'),code:'drums:s('});
    storage.setItem(LIBRARY_PREFIX+'bad/id','{broken\r\n');storage.setItem(LIBRARY_PREFIX+'','raw empty identity');
    const copy = readLibraryBackup(library.exportBackup());
    expect(copy.createdAt).toBe(time);expect(copy.entries).toEqual([id,'bad/id',''].map(id=>({id,raw:storage.getItem(LIBRARY_PREFIX+id)!})));
    expect('__backupExecuted' in globalThis).toBe(false);expect(storage.getItem('loopsmith.project.v1')).toBe('workspace');
    const target=setup();expect(target.library.restoreBackup(JSON.stringify(copy))).toMatchObject({added:3,pending:0,error:''});
    const restored=target.library.list();expect(restored.copies).toHaveLength(1);expect(restored.damaged).toHaveLength(2);
    const opened=target.library.open(id,restored.copies[0].raw);expect(opened.file.code).toBe('drums:s(');expect(opened.file.lastGoodCode).toBe(source);expect(opened.file.project).toEqual(file(source,'🌊').project);
    expect(target.storage.getItem(LIBRARY_PREFIX+'bad/id')).toBe('{broken\r\n');expect(target.storage.getItem('unrelated')).toBeNull();expect('__backupExecuted' in globalThis).toBe(false);
  });
  it('reviews without writes and distinguishes new, identical and conflicting identities',()=>{
    const {library,storage}=setup();storage.setItem(LIBRARY_PREFIX+'same','same');storage.setItem(LIBRARY_PREFIX+'conflict','keep');
    const text=backup([{id:'same',raw:'same'},{id:'conflict',raw:'incoming'},{id:'new',raw:'new data'}]);const before=[...storage.data];
    expect(library.reviewBackup(text)).toMatchObject({additions:1,identical:1,conflicts:1,available:28});expect([...storage.data]).toEqual(before);
    expect(library.restoreBackup(text)).toEqual({added:1,identical:1,conflicts:1,pending:0,error:''});expect(storage.getItem(LIBRARY_PREFIX+'conflict')).toBe('keep');
    expect(library.restoreBackup(text)).toEqual({added:0,identical:2,conflicts:1,pending:0,error:''});expect(storage.length).toBe(3);
  });
  it('rechecks changed copies and capacity after review instead of trusting a stale plan',()=>{
    const {library,storage}=setup();const text=backup([{id:'new',raw:'from backup'}]);expect(library.reviewBackup(text).additions).toBe(1);
    storage.setItem(LIBRARY_PREFIX+'new','other tab');expect(library.restoreBackup(text).conflicts).toBe(1);expect(storage.getItem(LIBRARY_PREFIX+'new')).toBe('other tab');
    const extra=backup([{id:'extra',raw:'x'}]);library.reviewBackup(extra);for(let i=1;i<MAX_LIBRARY_COPIES;i++)storage.setItem(LIBRARY_PREFIX+i,'keep');
    expect(()=>library.restoreBackup(extra)).toThrow('0 are available');expect(storage.getItem(LIBRARY_PREFIX+'extra')).toBeNull();
  });
  it('refuses insufficient capacity before adding anything, while identical restores need no slots',()=>{
    const {library,storage}=setup();for(let i=0;i<MAX_LIBRARY_COPIES-1;i++)storage.setItem(LIBRARY_PREFIX+i,'keep');
    expect(()=>library.restoreBackup(backup([{id:'a',raw:'a'},{id:'b',raw:'b'}]))).toThrow('No copies have been restored');expect(storage.length).toBe(29);
    storage.setItem(LIBRARY_PREFIX+'last','keep');expect(library.restoreBackup(backup([{id:'last',raw:'keep'}])).identical).toBe(1);
  });
  it('reports partial quota failures, preserves old data and supports an idempotent retry',()=>{
    const {library,storage}=setup();storage.setItem('loopsmith.project.v1','workspace');storage.setItem(LIBRARY_PREFIX+'old','keep');
    const text=backup([{id:'a',raw:'a'},{id:'b',raw:'b'},{id:'c',raw:'c'}]),write=storage.setItem.bind(storage);
    storage.setItem=(key,value)=>{if(key===LIBRARY_PREFIX+'b')throw Error('Quota exceeded');write(key,value);};
    expect(library.restoreBackup(text)).toEqual({added:1,identical:0,conflicts:0,pending:2,error:'Quota exceeded'});
    expect(storage.getItem(LIBRARY_PREFIX+'a')).toBe('a');expect(storage.getItem(LIBRARY_PREFIX+'b')).toBeNull();expect(storage.getItem(LIBRARY_PREFIX+'old')).toBe('keep');expect(storage.getItem('loopsmith.project.v1')).toBe('workspace');
    storage.setItem=write;expect(library.restoreBackup(text)).toEqual({added:2,identical:1,conflicts:0,pending:0,error:''});
  });
  it('rejects duplicate or malformed backup metadata and validates all entries before writes',()=>{
    const {library,storage}=setup();const valid={format:LIBRARY_BACKUP_FORMAT,version:1,createdAt:time,entries:[{id:'valid',raw:'good'}]};
    const invalid:unknown[]=[null,[],{}, {...valid,version:2},{...valid,format:'loopsmith-project'},{...valid,createdAt:'invalid'}, {...valid,entries:{}},{...valid,entries:[...valid.entries,{id:'x',raw:42}]},{...valid,entries:[...valid.entries,...valid.entries]},{...valid,entries:[[]]}];
    for(const value of invalid)expect(()=>library.restoreBackup(JSON.stringify(value))).toThrow();expect(()=>library.restoreBackup('{')).toThrow('valid library backup JSON');expect(storage.length).toBe(0);
  });
  it('bounds count and UTF-8 file size on both import and export',()=>{
    expect(()=>backup(Array.from({length:MAX_BACKUP_ENTRIES+1},(_,i)=>({id:String(i),raw:''})))).toThrow('100 entries');
    const huge='é'.repeat(MAX_BACKUP_BYTES/2);expect(()=>backup([{id:'big',raw:huge}])).toThrow('32 MiB');expect(()=>readLibraryBackup(' '.repeat(MAX_BACKUP_BYTES+1))).toThrow('32 MiB');
    const {library,storage}=setup();storage.setItem(LIBRARY_PREFIX+'big',huge);expect(()=>library.exportBackup()).toThrow('32 MiB');expect(storage.getItem(LIBRARY_PREFIX+'big')).toBe(huge);
  });
  it('scopes even malformed identities to library keys and discards unknown envelope fields',()=>{
    const {library,storage}=setup();storage.setItem('loopsmith.project.v1','keep');
    const text=JSON.stringify({...readLibraryBackup(backup([{id:'../loopsmith.project.v1',raw:'damaged'},{id:'__proto__',raw:'data'}])),workspace:'overwrite'});
    expect(readLibraryBackup(text)).not.toHaveProperty('workspace');library.restoreBackup(text);expect(storage.getItem('loopsmith.project.v1')).toBe('keep');expect(storage.getItem(LIBRARY_PREFIX+'../loopsmith.project.v1')).toBe('damaged');
  });
  it('supports empty backups and propagates unreadable storage without deleting anything',()=>{
    const {library,storage}=setup();expect(readLibraryBackup(library.exportBackup()).entries).toEqual([]);expect(library.restoreBackup(backup([]))).toEqual({added:0,identical:0,conflicts:0,pending:0,error:''});
    storage.setItem(LIBRARY_PREFIX+'saved','data');storage.getItem=()=>{throw Error('Storage denied');};expect(()=>library.exportBackup()).toThrow('Storage denied');expect(()=>library.reviewBackup(backup([{id:'saved',raw:'data'}]))).toThrow('Storage denied');expect(storage.data.size).toBe(1);
  });
});
