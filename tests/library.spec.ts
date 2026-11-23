import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const prefix='loopsmith.library.project.v1.';
const code=(page:Page)=>page.evaluate(()=>window.__loopsmithTest.editor!.state.doc.toString());
async function ready(page:Page){await page.waitForFunction(()=>!!window.__loopsmithTest?.editor);}
async function openLibrary(page:Page){await page.getByText('Project library',{exact:true}).click();}
async function copies(page:Page){return page.evaluate(prefix=>Object.keys(localStorage).filter(key=>key.startsWith(prefix)).map(key=>JSON.parse(localStorage.getItem(key)!)),prefix);}
async function replace(page:Page,source:string){await page.evaluate(source=>{const view=window.__loopsmithTest.editor!;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:source},userEvent:'input.type'});},source);await page.waitForTimeout(1100);}
async function save(page:Page,name:string){await page.getByLabel('Project name',{exact:true}).fill(name);await page.getByRole('button',{name:'Save a project copy',exact:true}).click();return await page.getByLabel('Saved project',{exact:true}).inputValue();}
test.beforeEach(async({page})=>{await page.goto('/');await ready(page);});
test('keeps named copies, opens stopped with undo, exports saved source and reverses removal',async({page})=>{
  const original=await code(page);await openLibrary(page);const alpha=await save(page,'Alpha');
  const betaSource='// café 🌊\r\ndrums:s("bd sd").fast(2);\r\n';await replace(page,betaSource);await save(page,'Beta');
  expect((await copies(page)).map(copy=>copy.file.name).sort()).toEqual(['Alpha','Beta']);
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');
  await page.getByLabel('Saved project',{exact:true}).selectOption(alpha);await page.getByRole('button',{name:'Open saved project',exact:true}).click();
  expect(await code(page)).toBe(original);await expect(page.getByRole('status')).toContainText('Ready');
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await code(page)).toBe(betaSource);
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Export saved project JSON',exact:true}).click();const download=await promise;
  const exported=JSON.parse(await readFile((await download.path())!,'utf8'));expect(exported.code).toBe(original);expect(exported.name).toBe('Alpha');
  await page.getByRole('button',{name:'Remove saved project',exact:true}).click();expect(await copies(page)).toHaveLength(1);expect(await code(page)).toBe(betaSource);
  await page.getByRole('button',{name:'Undo library removal',exact:true}).click();expect(await copies(page)).toHaveLength(2);
  await page.reload();await ready(page);await openLibrary(page);await expect(page.getByLabel('Saved project',{exact:true}).locator('option')).toHaveCount(3);
});
test('saves invalid drafts and their last-good model without evaluating on library load or reload',async({page})=>{
  await openLibrary(page);const good=await code(page);await replace(page,'// unfinished\ndrums:s(');await save(page,'Draft');const saved=(await copies(page))[0];
  expect(saved.file.code).toBe('// unfinished\ndrums:s(');expect(saved.file.lastGoodCode).toBe(good);
  await page.getByRole('button',{name:'New project',exact:true}).click();await page.getByRole('button',{name:'Open saved project',exact:true}).click();
  expect(await code(page)).toBe('// unfinished\ndrums:s(');await expect(page.locator('.step')).toHaveCount(8);
  expect(await page.evaluate(()=>window.__loopsmithTest.plays.length)).toBe(0);expect(await page.evaluate(()=>window.__loopsmithTest.initializations)).toBe(0);
  await page.reload();await ready(page);expect(await code(page)).toBe('// unfinished\ndrums:s(');expect(await page.evaluate(()=>window.__loopsmithTest.plays.length)).toBe(0);expect(await page.evaluate(()=>window.__loopsmithTest.initializations)).toBe(0);
});
test('quota failures preserve current source, playing audio and existing copies; damaged data stays recoverable',async({page})=>{
  await openLibrary(page);await save(page,'Safe');const before=await copies(page),source=await code(page);
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');
  await page.evaluate(prefix=>{const write=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith(prefix))throw new DOMException('Library quota','QuotaExceededError');return write.call(this,key,value);};},prefix);
  await page.getByRole('button',{name:'Save a project copy',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Library quota');
  expect(await copies(page)).toEqual(before);expect(await code(page)).toBe(source);await expect(page.getByRole('status')).toContainText('Playing');
  await page.reload();await ready(page);await page.evaluate(prefix=>localStorage.setItem(prefix+'damaged','{broken'),prefix);await openLibrary(page);
  await expect(page.locator('.library-damaged')).toContainText('retained');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download damaged saved data: damaged',exact:true}).click();expect(await readFile((await (await downloading).path())!,'utf8')).toBe('{broken');
  await page.getByRole('button',{name:'Remove damaged copy damaged',exact:true}).click();await expect(page.locator('.library-damaged')).toHaveCount(0);
  await page.getByRole('button',{name:'Undo library removal',exact:true}).click();await expect(page.locator('.library-damaged')).toHaveCount(1);
});
test('refreshes copies across tabs without replacing either editor',async({page,context})=>{
  await openLibrary(page);await save(page,'One');const original=await code(page);
  const other=await context.newPage();await other.goto('/');await ready(other);await openLibrary(other);await save(other,'Two');
  await expect(page.getByLabel('Saved project',{exact:true}).locator('option')).toHaveCount(3);expect(await code(page)).toBe(original);
  await expect(page.locator('.project-library')).toContainText('another tab');
});
