import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {parseDocument} from '../src/lib/project';
import {projectFile,readProjectFile} from '../src/lib/persistence/project-file';
const prefix='loopsmith.library.project.v1.';
const source='// café 🌊\r\nglobalThis.__inspectionExecuted=true;\ndrums:s("bd ~").fast(2);\r\n';
function incoming(id='incoming',name='Incoming / loop',draft=source){const parsed=parseDocument(source);if(!parsed.ok)throw Error('Fixture');return {id,raw:JSON.stringify({format:'loopsmith-library-copy',version:1,id,savedAt:'2026-11-26T12:00:00Z',file:projectFile(name,draft,parsed.document)})};}
const backup=(entries:{id:string;raw:string}[])=>JSON.stringify({format:'loopsmith-library-backup',version:1,createdAt:'2026-11-26T12:00:00Z',entries});
const code=(page:Page)=>page.evaluate(()=>window.__loopsmithTest.editor!.state.doc.toString());
async function review(page:Page,text:string){await page.getByLabel('Review library backup file',{exact:true}).setInputFiles({name:'library.json',mimeType:'application/json',buffer:Buffer.from(text)});}
async function downloaded(page:Page,button:string){const pending=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();const file=await pending;return {text:await readFile((await file.path())!,'utf8'),name:file.suggestedFilename()};}
test.beforeEach(async({page})=>{await page.goto('/');await page.waitForFunction(()=>!!window.__loopsmithTest?.editor);await page.getByText('Project library',{exact:true}).click();await page.getByText('Library backup and restore',{exact:true}).click();});

test('inspects a conflicting invalid draft and exports its full project without disturbing playing source or local data',async({page})=>{
  const entry=incoming('incoming','Incoming / loop','// unfinished\ndrums:s('),current=await code(page);
  await page.evaluate(prefix=>localStorage.setItem(prefix+'incoming','keep local conflict'),prefix);
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');const plays=await page.evaluate(()=>window.__loopsmithTest.plays.length);
  await review(page,backup([entry]));await expect(page.locator('.backup-review')).toContainText('Conflicts kept: 1');
  const inspect=page.getByRole('button',{name:'Inspect backup entry 1: Incoming / loop',exact:true});await inspect.focus();await page.keyboard.press('Enter');
  const panel=page.getByRole('region',{name:'Backup entry inspection'});await expect(panel.getByRole('heading')).toBeFocused();await expect(page.getByLabel('Incoming project source',{exact:true})).toHaveValue('// unfinished\ndrums:s(');
  await expect(page.getByLabel('Incoming last-good source',{exact:true})).toHaveValue(source.replace(/\r\n/g,'\n'));await expect(page.getByLabel('Incoming project source',{exact:true})).toHaveAttribute('readonly','');
  const exported=await downloaded(page,'Download incoming project JSON');expect(exported.name).toBe('Incoming-loop.loopsmith.json');const restored=readProjectFile(exported.text);expect(restored.file).toEqual(JSON.parse(entry.raw).file);
  const single=JSON.parse((await downloaded(page,'Download entry backup')).text);expect(single.entries).toEqual([entry]);
  expect(await code(page)).toBe(current);await expect(page.getByRole('status')).toContainText('Playing');expect(await page.evaluate(()=>window.__loopsmithTest.plays.length)).toBe(plays);expect(await page.evaluate(()=> '__inspectionExecuted' in window)).toBe(false);expect(await page.evaluate(prefix=>localStorage.getItem(prefix+'incoming'),prefix)).toBe('keep local conflict');
  await page.getByRole('button',{name:'Close entry inspection',exact:true}).click();await expect(panel).toHaveCount(0);await expect(inspect).toBeFocused();
  await page.getByLabel('Import project file',{exact:true}).setInputFiles({name:exported.name,mimeType:'application/json',buffer:Buffer.from(exported.text)});await expect(page.getByRole('status')).toContainText('Ready');expect(await code(page)).toBe('// unfinished\ndrums:s(');expect(await page.evaluate(()=> '__inspectionExecuted' in window)).toBe(false);
});

test('bounds damaged previews and preserves all raw data, including malformed Unicode, in an entry backup',async({page})=>{
  const entry={id:'',raw:'<script>globalThis.__inspectionExecuted=true</script>🌊\uD800'+'x'.repeat(21_000)},current=await code(page);
  await review(page,backup([entry]));await page.getByRole('button',{name:'Inspect backup entry 1: Damaged saved data',exact:true}).click();
  const panel=page.getByRole('region',{name:'Backup entry inspection'});await expect(panel).toContainText('Showing the first 20,000');expect((await page.getByLabel('Incoming saved data',{exact:true}).inputValue()).length).toBe(20_000);await expect(page.getByRole('button',{name:'Download incoming project JSON',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Save incoming as new library copy',exact:true})).toHaveCount(0);
  const exported=await downloaded(page,'Download entry backup');expect(exported.name).toBe('loopsmith-entry.backup.json');expect(JSON.parse(exported.text).entries).toEqual([entry]);
  for(const width of [1280,390]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);const field=await page.getByLabel('Incoming saved data',{exact:true}).boundingBox();expect(field!.width).toBeGreaterThan(200);expect(field!.x+field!.width).toBeLessThanOrEqual(width);}
  await review(page,exported.text);await expect(panel).toHaveCount(0);await expect(page.locator('.backup-review')).toContainText('Entries: 1');expect(await code(page)).toBe(current);expect(await page.evaluate(()=>({initialized:window.__loopsmithTest.initializations,executed:'__inspectionExecuted' in window}))).toEqual({initialized:0,executed:false});expect(await page.evaluate(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).length,prefix)).toBe(0);
});

test('keeps inspection tied to incoming bytes through cross-tab changes and clears it for cancelled or replaced reviews',async({page,context})=>{
  const first=incoming('one','First'),second=incoming('two','Second');await review(page,backup([first,second]));
  await page.getByRole('button',{name:'Inspect backup entry 1: First',exact:true}).click();const panel=page.getByRole('region',{name:'Backup entry inspection'});await expect(panel.getByRole('heading')).toHaveText('Inspect First');
  const other=await context.newPage();await other.goto('/');await other.waitForFunction(()=>!!window.__loopsmithTest?.editor);await other.evaluate(({prefix,id})=>localStorage.setItem(prefix+id,'other tab'),{prefix,id:'one'});await expect(page.locator('.backup-review')).toContainText('Conflicts kept: 1');await expect(panel.getByRole('heading')).toHaveText('Inspect First');expect(JSON.parse((await downloaded(page,'Download entry backup')).text).entries).toEqual([first]);
  await page.getByRole('button',{name:'Inspect backup entry 2: Second',exact:true}).click();await expect(panel.getByRole('heading')).toHaveText('Inspect Second');await expect(panel).not.toContainText('downloaded in a one-entry');
  await page.getByRole('button',{name:'Cancel backup review',exact:true}).click();await expect(panel).toHaveCount(0);
  await review(page,backup([first]));await page.getByRole('button',{name:'Inspect backup entry 1: First',exact:true}).click();await review(page,'{broken');await expect(panel).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('not valid');
});

test('bounds valid draft previews while exporting complete source and resetting inspection for new backups',async({page})=>{
  const draft='// '+ 'x'.repeat(22_000)+'\ndrums:s(',entry=incoming('large','Large',draft);await review(page,backup([entry]));
  await page.getByRole('button',{name:'Inspect backup entry 1: Large',exact:true}).click();expect((await page.getByLabel('Incoming project source',{exact:true}).inputValue()).length).toBe(20_000);await expect(page.locator('.backup-inspection')).toContainText('Downloads contain the full data');
  expect(readProjectFile((await downloaded(page,'Download incoming project JSON')).text).file.code).toBe(draft);
  await review(page,backup([incoming('other','Other')]));await expect(page.getByRole('region',{name:'Backup entry inspection'})).toHaveCount(0);expect(await page.evaluate(()=>window.__loopsmithTest.initializations)).toBe(0);
});

test('saves an incoming conflict as a renamed independent copy while playback continues, then opens stopped with undo',async({page})=>{
  const entry=incoming('conflict','Incoming','// unfinished\ndrums:s('),current=await code(page),title=await page.getByLabel('Project name',{exact:true}).inputValue();
  await page.evaluate(prefix=>localStorage.setItem(prefix+'conflict','keep local'),prefix);await review(page,backup([entry]));await page.getByRole('button',{name:'Inspect backup entry 1: Incoming',exact:true}).click();
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');const plays=await page.evaluate(()=>window.__loopsmithTest.plays.length);
  await page.getByLabel('Recovered project name',{exact:true}).fill('Recovered 🌊');const saving=page.getByRole('button',{name:'Save incoming as new library copy',exact:true});await saving.focus();await page.keyboard.press('Enter');
  await expect(page.locator('.backup-inspection')).toContainText('Saved as a new library copy');await expect(saving).toBeDisabled();await expect(page.getByLabel('Recovered project name',{exact:true})).toBeDisabled();
  const id=await page.getByLabel('Saved project',{exact:true}).inputValue();expect(id).not.toBe('conflict');expect(id).not.toBe('');
  const stored=await page.evaluate(({prefix,id})=>JSON.parse(localStorage.getItem(prefix+id)!),{prefix,id});expect(stored.file).toEqual({...JSON.parse(entry.raw).file,name:'Recovered 🌊'});expect(await page.evaluate(prefix=>localStorage.getItem(prefix+'conflict'),prefix)).toBe('keep local');
  expect(await code(page)).toBe(current);await expect(page.getByRole('status')).toContainText('Playing');expect(await page.evaluate(()=>window.__loopsmithTest.plays.length)).toBe(plays);await expect(page.getByLabel('Project name',{exact:true})).toHaveValue(title);expect(await page.evaluate(()=> '__inspectionExecuted' in window)).toBe(false);
  await page.getByRole('button',{name:'Open saved project',exact:true}).click();expect(await code(page)).toBe('// unfinished\ndrums:s(');await expect(page.getByRole('status')).toContainText('Ready');await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await code(page)).toBe(current);
  await page.reload();await page.waitForFunction(()=>!!window.__loopsmithTest?.editor);expect(await page.evaluate(({prefix,id})=>JSON.parse(localStorage.getItem(prefix+id)!).file.name,{prefix,id})).toBe('Recovered 🌊');
});

test('keeps failed quota saves retryable and respects capacity filled after inspection',async({page})=>{
  const entry=incoming();await review(page,backup([entry]));await page.getByRole('button',{name:'Inspect backup entry 1: Incoming / loop',exact:true}).click();const save=page.getByRole('button',{name:'Save incoming as new library copy',exact:true});
  await page.evaluate(prefix=>{for(let i=0;i<30;i++)localStorage.setItem(prefix+'existing-'+i,'keep');},prefix);await save.click();await expect(page.getByRole('alert')).toContainText('30 saved copies');await expect(save).toBeEnabled();
  await page.evaluate(prefix=>{localStorage.removeItem(prefix+'existing-0');localStorage.setItem('test.fail','yes');const write=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith(prefix)&&localStorage.getItem('test.fail'))throw Error('Recovery quota');write.call(this,key,value);};},prefix);
  await save.click();await expect(page.getByRole('alert')).toContainText('Recovery quota');await expect(save).toBeEnabled();expect(await page.evaluate(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).length,prefix)).toBe(29);
  await page.evaluate(()=>localStorage.removeItem('test.fail'));await save.click();await expect(save).toBeDisabled();await expect(page.getByRole('alert')).toHaveCount(0);expect(await page.evaluate(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).length,prefix)).toBe(30);expect(await page.evaluate(()=>window.__loopsmithTest.initializations)).toBe(0);
});

test('treats a committed copy as saved when refreshing its listing fails, preventing duplicate retries',async({page})=>{
  await review(page,backup([incoming()]));await page.getByRole('button',{name:'Inspect backup entry 1: Incoming / loop',exact:true}).click();
  await page.evaluate(prefix=>{const write=Storage.prototype.setItem,read=Storage.prototype.getItem;Storage.prototype.setItem=function(key,value){write.call(this,key,value);if(key.startsWith(prefix))write.call(this,'test.listing-failure','yes');};Storage.prototype.getItem=function(key){if(key.startsWith(prefix)&&read.call(this,'test.listing-failure'))throw Error('Listing unavailable');return read.call(this,key);};},prefix);
  const save=page.getByRole('button',{name:'Save incoming as new library copy',exact:true});await save.click();await expect(page.getByRole('alert')).toContainText('New copy saved, but the library could not refresh');await expect(page.locator('.backup-inspection')).toContainText('Saved as a new library copy');await expect(save).toBeDisabled();
  expect(await page.evaluate(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).length,prefix)).toBe(1);await page.evaluate(()=>localStorage.removeItem('test.listing-failure'));await page.getByRole('button',{name:'Refresh library',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByLabel('Saved project',{exact:true}).locator('option')).toHaveCount(2);
});
