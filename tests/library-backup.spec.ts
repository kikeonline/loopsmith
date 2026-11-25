import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const prefix='loopsmith.library.project.v1.';
const code=(page:Page)=>page.evaluate(()=>window.__loopsmithTest.editor!.state.doc.toString());
const entries=(page:Page)=>page.evaluate(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).sort().map(key=>({id:key.slice(prefix.length),raw:localStorage.getItem(key)!})),prefix);
const backup=(entries:{id:string;raw:string}[])=>JSON.stringify({format:'loopsmith-library-backup',version:1,createdAt:'2026-11-24T12:00:00Z',entries});
async function ready(page:Page){await page.waitForFunction(()=>!!window.__loopsmithTest?.editor);}
async function open(page:Page){await page.getByText('Project library',{exact:true}).click();await page.getByText('Library backup and restore',{exact:true}).click();}
async function review(page:Page,text:string){await page.getByLabel('Review library backup file',{exact:true}).setInputFiles({name:'library.json',mimeType:'application/json',buffer:Buffer.from(text)});}
async function save(page:Page,name:string){await page.getByLabel('Project name',{exact:true}).fill(name);await page.getByRole('button',{name:'Save a project copy',exact:true}).click();}
async function replace(page:Page,source:string){await page.evaluate(source=>{const view=window.__loopsmithTest.editor!;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:source},userEvent:'input.type'});},source);await page.waitForTimeout(1100);}
test.beforeEach(async({page})=>{await page.goto('/');await ready(page);await open(page);});

test('downloads exact snapshots and damaged data, then restores in a fresh browser without loading or execution',async({page,browser})=>{
  const source='// café 🌊\r\nglobalThis.__backupExecuted=true;\ndrums:s("bd ~").fast(2);\r\n';
  await replace(page,source);await save(page,'Valid 🌊');await replace(page,'// unfinished\ndrums:s(');await save(page,'Draft');
  await page.evaluate(prefix=>{localStorage.setItem(prefix+'bad/id','{broken\r\n');localStorage.setItem('unrelated','private');},prefix);
  const expected=await entries(page),downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download library backup',exact:true}).click();const download=await downloaded;
  expect(download.suggestedFilename()).toBe('loopsmith-library.backup.json');const text=await readFile((await download.path())!,'utf8');expect(JSON.parse(text).entries.sort((a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0)).toEqual(expected);
  const context=await browser.newContext(),fresh=await context.newPage();await fresh.goto(page.url());await ready(fresh);await open(fresh);const initial=await code(fresh);
  await review(fresh,text);await expect(fresh.getByRole('region',{name:'Library backup review'})).toContainText('To add: 3');expect(await entries(fresh)).toEqual([]);
  await fresh.getByRole('button',{name:'Restore missing library entries',exact:true}).focus();await fresh.keyboard.press('Enter');
  await expect(fresh.locator('.project-library')).toContainText('Restored: 3');expect(await entries(fresh)).toEqual(expected);expect(await code(fresh)).toBe(initial);
  expect(await fresh.evaluate(()=>({initialized:window.__loopsmithTest.initializations,plays:window.__loopsmithTest.plays.length,executed:'__backupExecuted' in window}))).toEqual({initialized:0,plays:0,executed:false});
  const draft=expected.find(entry=>entry.id!=='bad/id'&&JSON.parse(entry.raw).file.name==='Draft')!;
  await fresh.getByLabel('Saved project',{exact:true}).selectOption(draft.id);await fresh.getByRole('button',{name:'Open saved project',exact:true}).click();expect(await code(fresh)).toBe('// unfinished\ndrums:s(');
  await fresh.reload();await ready(fresh);expect(await code(fresh)).toBe('// unfinished\ndrums:s(');expect(await entries(fresh)).toEqual(expected);
  await context.close();
});

test('keeps conflicts, skips identical entries and refreshes review across tabs while playback continues',async({page,context})=>{
  await save(page,'Existing');const saved=(await entries(page))[0],source=await code(page);
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');
  const before=await page.evaluate(()=>window.__loopsmithTest.plays.length);
  await review(page,backup([saved,{id:'conflict',raw:'incoming'},{id:'new',raw:'recovery bytes'}]));
  const other=await context.newPage();await other.goto('/');await ready(other);await other.evaluate(prefix=>localStorage.setItem(prefix+'conflict','keep other tab'),prefix);
  const region=page.getByRole('region',{name:'Library backup review'});await expect(region).toContainText('Already saved: 1. Conflicts kept: 1');await expect(region).toContainText('To add: 1');
  await page.getByRole('button',{name:'Restore missing library entries',exact:true}).click();await expect(page.locator('.project-library')).toContainText('Restored: 1. Already saved: 0. Conflicts kept: 0');
  expect((await entries(page)).find(entry=>entry.id==='conflict')?.raw).toBe('keep other tab');expect(await code(page)).toBe(source);await expect(page.getByRole('status')).toContainText('Playing');expect(await page.evaluate(()=>window.__loopsmithTest.plays.length)).toBe(before);
  await expect(page.getByRole('button',{name:'Restore missing library entries',exact:true})).toBeDisabled();
});

test('reports partial quota failure, keeps completed entries and safely retries without changing playing source',async({page})=>{
  await save(page,'Safe');const original=await entries(page),source=await code(page);
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');
  await review(page,backup([{id:'a',raw:'recovery a'},{id:'b',raw:'recovery b'},{id:'c',raw:'recovery c'}]));
  await page.evaluate(prefix=>{localStorage.setItem('test.fail','yes');const write=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===prefix+'b'&&localStorage.getItem('test.fail'))throw new DOMException('Restore quota','QuotaExceededError');write.call(this,key,value);};},prefix);
  await page.getByRole('button',{name:'Restore missing library entries',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Restore quota');await expect(page.locator('.project-library')).toContainText('Restored: 1. Already saved: 0. Conflicts kept: 0. Not processed: 2');
  expect((await entries(page)).find(entry=>entry.id===original[0].id)).toEqual(original[0]);expect(await entries(page)).toHaveLength(2);
  await page.evaluate(()=>localStorage.removeItem('test.fail'));await page.getByRole('button',{name:'Restore missing library entries',exact:true}).click();
  await expect(page.locator('.project-library')).toContainText('Restored: 2. Already saved: 0');expect(await entries(page)).toHaveLength(4);expect(await code(page)).toBe(source);await expect(page.getByRole('status')).toContainText('Playing');await expect(page.getByRole('alert')).toHaveCount(0);
});

test('rejects malformed/duplicate backups, invalidates prior review and blocks restores over capacity',async({page})=>{
  await save(page,'Keep');const before=await entries(page);
  await review(page,backup([{id:'ok',raw:'data'}]));await expect(page.getByRole('region',{name:'Library backup review'})).toBeVisible();
  await review(page,'{broken');await expect(page.getByRole('alert')).toContainText('not valid');await expect(page.getByRole('region',{name:'Library backup review'})).toHaveCount(0);
  await review(page,backup([{id:'duplicate',raw:'x'},{id:'duplicate',raw:'y'}]));await expect(page.getByRole('alert')).toContainText('duplicate');expect(await entries(page)).toEqual(before);
  await review(page,backup(Array.from({length:30},(_,i)=>({id:'new-'+i,raw:'damaged data'}))));await expect(page.getByRole('region',{name:'Library backup review'})).toContainText('Not enough free slots');await expect(page.getByRole('button',{name:'Restore missing library entries',exact:true})).toBeDisabled();expect(await entries(page)).toEqual(before);
  await page.getByRole('button',{name:'Cancel backup review',exact:true}).click();await expect(page.getByRole('region',{name:'Library backup review'})).toHaveCount(0);
});

test('ignores cancelled and superseded asynchronous file reads',async({page})=>{
  await page.evaluate(()=>{const read=File.prototype.text;File.prototype.text=async function(){if(this.name==='slow.json')await new Promise(resolve=>setTimeout(resolve,600));return read.call(this);};});
  const input=page.getByLabel('Review library backup file',{exact:true});
  await input.setInputFiles({name:'slow.json',mimeType:'application/json',buffer:Buffer.from(backup([{id:'slow',raw:'old'}]))});
  await page.getByRole('button',{name:'Cancel backup review',exact:true}).click();await page.waitForTimeout(800);await expect(page.getByRole('region',{name:'Library backup review'})).toHaveCount(0);expect(await entries(page)).toEqual([]);
  await input.setInputFiles({name:'slow.json',mimeType:'application/json',buffer:Buffer.from(backup([{id:'slow',raw:'old'}]))});await review(page,backup([{id:'fast',raw:'new'}]));await page.waitForTimeout(800);
  await expect(page.getByRole('region',{name:'Library backup review'})).toContainText('fast');await expect(page.getByRole('region',{name:'Library backup review'})).not.toContainText('slow');await page.getByRole('button',{name:'Restore missing library entries',exact:true}).click();expect(await entries(page)).toEqual([{id:'fast',raw:'new'}]);
});

test('selects a fitting subset with the keyboard and leaves unselected backup data untouched',async({page})=>{
  await page.evaluate(prefix=>{for(let i=0;i<29;i++)localStorage.setItem(prefix+'existing-'+i,'keep');},prefix);
  const source=await code(page);await review(page,backup([{id:'a',raw:'a'},{id:'b',raw:'b'}]));
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:844});
    const sizes=await page.locator('.backup-choice').first().evaluate(label=>({height:label.getBoundingClientRect().height,input:label.querySelector('input')!.getBoundingClientRect().width,text:label.querySelector('span')!.getBoundingClientRect().width}));
    expect(sizes.input).toBeLessThan(32);expect(sizes.text).toBeGreaterThan(100);expect(sizes.height).toBeLessThan(160);
  }
  const restore=page.getByRole('button',{name:'Restore missing library entries',exact:true});await expect(restore).toBeDisabled();
  await page.getByRole('button',{name:'Clear restore selection',exact:true}).click();await expect(page.locator('.backup-review')).toContainText('Selected to restore: 0');await expect(restore).toBeDisabled();
  const choice=page.getByRole('checkbox',{name:'Restore entry 2: Damaged saved data',exact:true});await choice.focus();await page.keyboard.press('Space');await expect(choice).toBeChecked();await expect(restore).toBeEnabled();
  await restore.click();await expect(page.locator('.project-library')).toContainText('Restored: 1');expect((await entries(page)).find(entry=>entry.id==='b')?.raw).toBe('b');expect((await entries(page)).some(entry=>entry.id==='a')).toBe(false);expect(await code(page)).toBe(source);expect(await page.evaluate(()=>window.__loopsmithTest.initializations)).toBe(0);
});

test('preserves intentional deselection on refresh and never selects newly missing copies automatically',async({page,context})=>{
  const other=await context.newPage();await other.goto('/');await ready(other);await other.evaluate(prefix=>localStorage.setItem(prefix+'existing','existing'),prefix);
  await review(page,backup([{id:'a',raw:'a'},{id:'b',raw:'b'},{id:'existing',raw:'existing'}]));
  await page.getByRole('checkbox',{name:'Restore entry 2: Damaged saved data',exact:true}).uncheck();
  await other.evaluate(prefix=>{localStorage.removeItem(prefix+'existing');localStorage.setItem(prefix+'a','conflict');},prefix);
  await expect(page.locator('.backup-review')).toContainText('Conflicts kept: 1');await expect(page.locator('.backup-review')).toContainText('Selected to restore: 0');
  await expect(page.getByRole('checkbox',{name:'Restore entry 2: Damaged saved data',exact:true})).not.toBeChecked();await expect(page.getByRole('checkbox',{name:'Restore entry 3: Damaged saved data',exact:true})).not.toBeChecked();
  await page.getByRole('button',{name:'Select all missing entries',exact:true}).click();await expect(page.locator('.backup-review')).toContainText('Selected to restore: 2');
  await page.getByRole('button',{name:'Restore missing library entries',exact:true}).click();expect((await entries(page)).find(entry=>entry.id==='a')?.raw).toBe('conflict');expect(await entries(page)).toHaveLength(3);
});

test('replaces selection for new files and clears it when review is cancelled or invalid',async({page})=>{
  await review(page,backup([{id:'first',raw:'first'}]));await page.getByRole('button',{name:'Clear restore selection',exact:true}).click();
  await review(page,backup([{id:'second',raw:'second'},{id:'third',raw:'third'}]));await expect(page.locator('.backup-review')).toContainText('Selected to restore: 2');
  await page.getByRole('button',{name:'Cancel backup review',exact:true}).click();await expect(page.getByRole('checkbox',{name:/Restore entry/})).toHaveCount(0);
  await review(page,'{}');await expect(page.getByRole('alert')).toContainText('version 1');await expect(page.getByRole('checkbox',{name:/Restore entry/})).toHaveCount(0);expect(await entries(page)).toEqual([]);
});
