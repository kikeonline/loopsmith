import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseDocument } from '../src/lib/project';
import { projectFile, STORAGE_KEY } from '../src/lib/persistence/project-file';
const code = (page: Page) => page.evaluate(() => window.__loopsmithTest.editor!.state.doc.toString());
const saved = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function ready(page: Page) { await page.waitForFunction(() => !!window.__loopsmithTest?.editor); }
async function replace(page: Page, text: string) { await page.evaluate(text => { const view = window.__loopsmithTest.editor!; view.dispatch({ changes: { from:0, to:view.state.doc.length, insert:text }, userEvent:'input.type' }); },text); }
function file(code: string, name = 'Imported loop') { const parsed = parseDocument(code); if (!parsed.ok) throw new Error('Fixture must be valid'); return projectFile(name, code, parsed.document); }
async function importJson(page: Page, data: unknown) { await page.getByLabel('Import project file').setInputFiles({ name:'example.loopsmith.json', mimeType:'application/json', buffer:Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) }); await expect(page.getByRole('button',{name:'Import project JSON',exact:true})).toBeEnabled(); }
async function download(page: Page, button: string) { const promise = page.waitForEvent('download'); await page.getByRole('button',{name:button,exact:true}).click(); const download = await promise; return { name:download.suggestedFilename(), text:await readFile((await download.path())!,'utf8') }; }

test('reload restores edited source, reconciled IDs, title and invalid drafts without starting audio', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.getByLabel('Volume',{exact:true}).fill('0.6'); await page.getByLabel('Volume',{exact:true}).press('Tab');
  await page.getByLabel('Project name',{exact:true}).fill('My first loop');
  const before = await saved(page);
  await replace(page,'// unfinished edit\ndrums: s(');
  // Save is synchronous with the editor transaction, including before the parse debounce.
  expect((await saved(page)).code).toBe('// unfinished edit\ndrums: s(');
  await page.reload(); await ready(page);
  expect(await code(page)).toBe('// unfinished edit\ndrums: s(');
  await expect(page.getByRole('alert')).toContainText('Line 2');
  await expect(page.locator('.step')).toHaveCount(8);
  await expect(page.getByLabel('Volume',{exact:true})).toHaveValue('0.6');
  await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('My first loop');
  expect((await saved(page)).project).toEqual(before.project);
  expect(await page.evaluate(() => window.__loopsmithTest.plays)).toEqual([]);
});

test('JSON/code downloads and clipboard preserve mixed endings and custom source exactly', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/'); await ready(page);
  const input = '// custom\r\nsamples("custom.json");\nraw: stack(s("bd"), s("hh")).jux(rev);\r\ndrums: s("bd ~ sd ~").jux( rev ).gain(0.8);\r\n';
  await importJson(page,file(input,'Portable loop'));
  expect(await code(page)).toBe(input);
  await page.getByRole('button',{name:'drums Drums',exact:true}).click();
  await page.getByLabel('Volume',{exact:true}).fill('0.6'); await page.getByLabel('Volume',{exact:true}).press('Tab');
  const expected = input.replace('gain(0.8)','gain(0.6)');
  const json = await download(page,'Export project JSON');
  const plain = await download(page,'Download code');
  expect(json.name).toBe('Portable-loop.loopsmith.json');
  expect(JSON.parse(json.text).code).toBe(expected);
  expect(plain.text).toBe(expected);
  expect(plain.name).toBe('Portable-loop.strudel');
  await page.getByRole('button',{name:'Copy Strudel code',exact:true}).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await page.getByRole('button',{name:'New project',exact:true}).click();
  await expect(page.locator('button.track')).toHaveCount(0);
  await importJson(page,JSON.parse(json.text));
  expect(await code(page)).toBe(expected);
  expect((await saved(page)).project).toEqual(JSON.parse(json.text).project);
});

test('invalid imports leave current code and playback intact; valid loads stop playback and undo restores identities', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.getByLabel('Volume',{exact:true}).fill('0.6'); await page.getByLabel('Volume',{exact:true}).press('Tab');
  const before = await saved(page);
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Playing');
  await importJson(page,{...file('melody: note("c4 e4").s("sine")'),version:99});
  await expect(page.getByRole('alert')).toContainText('Unsupported project version');
  expect(await code(page)).toBe(before.code);
  await expect(page.getByRole('status')).toContainText('Playing');
  await importJson(page,file('melody: note("c4 e4").s("sine")'));
  await expect(page.getByRole('status')).toContainText('Ready');
  const loaded = await saved(page);
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Playing');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Ready');
  expect(await code(page)).toBe(before.code);
  expect((await saved(page)).project).toEqual(before.project);
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  expect((await saved(page)).project).toEqual(loaded.project);
});

test('templates are undoable and new-project empty state can be composed through the UI', async ({ page }) => {
  await page.goto('/'); await ready(page);
  for (const [id, count] of [['basic-beat',3],['house-loop',4],['ambient-pad',2],['melody-bass',2]] as const) {
    await page.getByLabel('Starter template').selectOption(id);
    await page.getByRole('button',{name:'Load template',exact:true}).click();
    await expect(page.locator('button.track')).toHaveCount(count);
    expect(await page.evaluate(() => window.__loopsmithTest.plays.length)).toBe(0);
  }
  const previous = await code(page);
  await page.getByRole('button',{name:'New project',exact:true}).click();
  await expect(page.locator('.visual')).toContainText('Your next loop starts here');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await code(page)).toBe(previous);
  await page.getByRole('button',{name:'New project',exact:true}).click();
  await page.getByRole('button',{name:'+ Add track',exact:true}).click();
  await expect(page.locator('button.track')).toHaveCount(1);
});

test('corrupt local data is retained until explicit autosave resume and can be downloaded for recovery', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('loopsmith.project.v1','{broken backup'));
  await page.goto('/'); await ready(page);
  await expect(page.getByRole('alert')).toContainText('Existing saved data has not been changed');
  await page.getByRole('button',{name:/^Row 1 step 2:/}).click();
  expect(await page.evaluate(() => localStorage.getItem('loopsmith.project.v1'))).toBe('{broken backup');
  expect((await download(page,'Download saved recovery data')).text).toBe('{broken backup');
  await page.getByRole('button',{name:'Resume autosave with current project',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await saved(page)).code).toContain('bd bd sd ~');
});

test('storage quota failures keep editing and exports usable', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exhausted','QuotaExceededError'); }; });
  await page.goto('/'); await ready(page);
  await page.getByRole('button',{name:/^Row 1 step 2:/}).click();
  await expect(page.getByRole('alert')).toContainText('Autosave failed');
  const current = await code(page);
  expect(current).toContain('bd bd sd ~');
  expect(JSON.parse((await download(page,'Export project JSON')).text).code).toBe(current);
});

test('Space controls transport outside controls and preserves editor, form, and grid keyboard behavior', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.locator('body').click({position:{x:5,y:5}}); await page.keyboard.press('Space');
  await expect(page.getByRole('status')).toContainText('Playing');
  await page.keyboard.press('Space'); await expect(page.getByRole('status')).toContainText('Ready');
  const plays = await page.evaluate(() => window.__loopsmithTest.plays.length);
  await page.getByRole('textbox',{name:'Strudel code',exact:true}).focus(); await page.keyboard.press('Space');
  await page.getByLabel('Project name',{exact:true}).focus(); await page.keyboard.press('Space');
  await page.getByRole('button',{name:/^Row 1 step 2:/}).focus(); await page.keyboard.press('Space');
  await expect.poll(() => code(page)).toContain('bd bd sd ~');
  expect(await page.evaluate(() => window.__loopsmithTest.plays.length)).toBe(plays);
});

test('loading a template cancels queued writes and undo restores an invalid draft with its last-good identity', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.getByLabel('Volume',{exact:true}).fill('0.6'); await page.getByLabel('Volume',{exact:true}).press('Tab');
  const before = await saved(page);
  await replace(page,'drums: s(');
  await page.getByRole('button',{name:/^Row 1 step 2:/}).click();
  await expect(page.locator('.sync-bar')).toContainText('waiting');
  await page.getByRole('button',{name:'Load template',exact:true}).click();
  await expect(page.locator('.sync-bar')).not.toContainText('waiting');
  await expect(page.locator('button.track')).toHaveCount(3);
  const template = await code(page);
  await page.waitForTimeout(1100);
  expect(await code(page)).toBe(template);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await code(page)).toBe('drums: s(');
  await expect(page.getByRole('alert')).toContainText('Line 1');
  expect((await saved(page)).project).toEqual(before.project);
});
