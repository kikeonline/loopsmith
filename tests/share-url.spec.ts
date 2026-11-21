import { test, expect, type Page } from '@playwright/test';
const link = (code:string) => `https://strudel.cc/#${encodeURIComponent(Buffer.from(code,'utf8').toString('base64'))}`;
const code = (page:Page) => page.evaluate(() => window.__loopsmithTest.editor!.state.doc.toString());
async function review(page:Page,url:string) { await page.getByText('Import Strudel share URL',{exact:true}).click(); await page.getByLabel('Strudel share URL',{exact:true}).fill(url); await page.getByRole('button',{name:'Review share link',exact:true}).click(); }
test.beforeEach(async ({page}) => { await page.goto('/'); await page.waitForFunction(() => !!window.__loopsmithTest?.editor); });

test('reviews offline without executing code, imports stopped, and shares undo/redo and autosave', async ({page}) => {
  const original=await code(page), originalIds=await page.evaluate(() => window.__loopsmithTest.editor!.state.doc.toString());
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click(); await expect(page.getByRole('status')).toContainText('Playing');
  const shared='// café 🌊\r\nglobalThis.__importExecuted = true;\r\ndrums: arrange([2,s("bd ~").fast(2)],[1,s("hh")]).gain(0.4);\r\n';
  const requests:string[]=[]; page.on('request',request => { if(request.url().startsWith('https://strudel.cc/')) requests.push(request.url()); });
  await review(page,link(shared));
  await expect(page.getByRole('textbox',{name:'Decoded Strudel code',exact:true})).toHaveValue(shared.replace(/\r\n/g,'\n'));
  expect(await code(page)).toBe(original); await expect(page.getByRole('status')).toContainText('Playing');
  expect(await page.evaluate(() => '__importExecuted' in window)).toBe(false); expect(requests).toEqual([]);
  await page.getByRole('button',{name:'Import reviewed code',exact:true}).click();
  expect(await code(page)).toBe(shared); await expect(page.getByRole('status')).toContainText('Ready');
  expect(await page.evaluate(() => '__importExecuted' in window)).toBe(false);
  await expect(page.getByLabel('Track arrangement',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Undo',exact:true}).click(); expect(await code(page)).toBe(originalIds);
  await page.getByRole('button',{name:'Redo',exact:true}).click(); expect(await code(page)).toBe(shared);
  await page.reload(); await page.waitForFunction(() => !!window.__loopsmithTest?.editor); expect(await code(page)).toBe(shared);
  expect(await page.evaluate(() => window.__loopsmithTest.plays.length)).toBe(0);
});

test('rejects unsupported/malformed links and invalid code while preserving editor and playback', async ({page}) => {
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click(); await expect(page.getByRole('status')).toContainText('Playing'); const original=await code(page);
  await review(page,'https://example.com/#cygiYmQiKQ=='); await expect(page.getByRole('alert')).toContainText('strudel.cc');
  for(const url of ['https://strudel.cc/#%XX','https://strudel.cc/#/w==',link('s(')]) {
    await page.getByLabel('Strudel share URL',{exact:true}).fill(url); await page.getByRole('button',{name:'Review share link',exact:true}).click();
    await expect(page.getByRole('alert')).toBeVisible(); expect(await code(page)).toBe(original); await expect(page.getByRole('status')).toContainText('Playing');
    await expect(page.getByRole('button',{name:'Import reviewed code',exact:true})).toHaveCount(0);
  }
});

test('editing a reviewed link invalidates its preview and keyboard/mobile controls remain usable', async ({page}) => {
  const original=await code(page); await review(page,link('s("cp")'));
  const field=page.getByLabel('Strudel share URL',{exact:true}); await field.fill(link('note("c3").s("sine")'));
  await expect(page.getByRole('region',{name:'Share code review',exact:true})).toHaveCount(0); expect(await code(page)).toBe(original);
  await page.getByRole('button',{name:'Review share link',exact:true}).click();
  const preview=page.getByRole('textbox',{name:'Decoded Strudel code',exact:true}); await preview.focus(); await expect(preview).toBeFocused();
  await page.setViewportSize({width:390,height:844});
  const box=await page.getByRole('button',{name:'Import reviewed code',exact:true}).boundingBox(); expect(box!.x+box!.width).toBeLessThanOrEqual(390);
  await page.getByRole('button',{name:'Import reviewed code',exact:true}).click(); expect(await code(page)).toBe('note("c3").s("sine")');
});
