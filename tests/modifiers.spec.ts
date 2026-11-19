import { test, expect, type Page } from '@playwright/test';
const code = (page: Page) => page.evaluate(() => window.__loopsmithTest.editor!.state.doc.toString());
async function replace(page: Page, text: string) { await page.evaluate(text => { const view = window.__loopsmithTest.editor!; view.dispatch({ changes: {from:0,to:view.state.doc.length,insert:text},userEvent:'input.type' }); },text); }
async function fixture(page: Page, text: string) { await replace(page,text); await page.waitForTimeout(1100); }
async function change(page: Page, name: string, value: string) { await page.getByLabel(name,{exact:true}).fill(value); await page.getByLabel(name,{exact:true}).press('Tab'); }
test.beforeEach(async ({page}) => { await page.goto('/'); await page.waitForFunction(() => !!window.__loopsmithTest?.editor); });

test('adds and edits every modifier live, reorders the real chain, and shares undo and persistence', async ({page}) => {
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Playing');
  await page.getByRole('button',{name:'Add fast',exact:true}).click();
  await change(page,'Fast factor, call 4','3');
  await page.getByRole('button',{name:'Add slow',exact:true}).click();
  await page.getByRole('button',{name:'Add reverse',exact:true}).click();
  await page.getByRole('button',{name:'Add every',exact:true}).click();
  await change(page,'Every cycle count, call 7','3');
  await page.getByLabel('Every transform, call 7',{exact:true}).selectOption('fast');
  await change(page,'Transform factor, call 7','4');
  const before = await code(page);
  expect(before).toContain('.fast(3).slow(2).rev().every(3, p => p.fast(4))');
  await expect(page.locator('.sync-bar')).not.toContainText('Contains code-only');
  await expect(page.locator('.step.playhead')).toHaveCount(0);
  await page.getByRole('button',{name:'Move fast call 4 earlier',exact:true}).click();
  expect(await code(page)).toContain('.pan(0.5).fast(3).lpf(12000).slow(2)');
  const moved = await code(page);
  await page.getByRole('button',{name:'Remove slow call 5',exact:true}).click();
  expect(await code(page)).not.toContain('.slow(2)');
  await page.getByRole('button',{name:'Undo',exact:true}).click(); expect(await code(page)).toBe(moved);
  await page.getByRole('button',{name:'Undo',exact:true}).click(); expect(await code(page)).toBe(before);
  await page.getByRole('button',{name:'Redo',exact:true}).click(); expect(await code(page)).toBe(moved);
  await expect.poll(() => page.evaluate(() => window.__loopsmithTest.activeCode)).toBe(moved);
  await page.getByRole('button',{name:'■ Stop',exact:true}).click();
  await page.reload(); await page.waitForFunction(() => !!window.__loopsmithTest?.editor);
  expect(await code(page)).toBe(moved);
  await expect(page.locator('[data-modifier]')).toHaveCount(4);
  expect(await page.evaluate(() => window.__loopsmithTest.plays.length)).toBe(0);
});

test('keeps custom expressions and callbacks read-only and replaces only explicitly chosen fields', async ({page}) => {
  const original = '// keep\r\nsamples("custom.json");\r\ndrums: s("bd sd").jux( rev ).fast(1/3).every(cycles, customTransform).gain(amount); // tail\r\n';
  await fixture(page,original);
  await expect(page.getByLabel('Fast factor, call 2',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('Every cycle count, call 3',{exact:true})).toBeDisabled();
  await expect(page.locator('.modifier-controls')).toContainText('Callback edited in code');
  await page.getByRole('button',{name:'Replace fast factor with 2, call 2',exact:true}).click();
  await page.getByRole('button',{name:'Replace every cycle count with 4, call 3',exact:true}).click();
  expect(await code(page)).toBe(original.replace('fast(1/3)','fast(2)').replace('every(cycles,','every(4,'));
  await page.getByRole('button',{name:'Replace callback with visual reverse, every call 3',exact:true}).click();
  await page.getByLabel('Every transform, call 3',{exact:true}).selectOption('slow');
  await change(page,'Transform factor, call 3','0.5');
  expect(await code(page)).toBe(original.replace('fast(1/3)','fast(2)').replace('every(cycles, customTransform)','every(4, p => p.slow(0.5))'));
  await expect(page.locator('.sync-bar')).toContainText('Contains code-only'); // jux and gain remain custom
  await change(page,'Fast factor, call 2','0');
  await expect(page.getByRole('alert')).toContainText('0.125 to 16');
  expect(await code(page)).toContain('.fast(2)');
});

test('queued modifier edits use fresh references and survive an intervening effect edit and typing', async ({page}) => {
  await fixture(page,'drums: s("bd sd").fast(2).gain(0.5)');
  await replace(page,'// typing\ndrums: s("bd sd").fast(2).gain(0.5)');
  await change(page,'Fast factor, call 1','4');
  await page.getByRole('button',{name:'Move fast call 1 later',exact:true}).click();
  await change(page,'Volume','0.7');
  await expect(page.locator('.sync-bar')).toContainText('waiting');
  await replace(page,'// longer preamble\ndrums: s("bd sd").jux( rev ).fast(2).gain(0.5)');
  await expect.poll(() => code(page)).toBe('// longer preamble\ndrums: s("bd sd").jux( rev ).gain(0.7).fast(4)');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.sync-bar')).not.toContainText('waiting');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect(await code(page)).toBe('// longer preamble\ndrums: s("bd sd").jux( rev ).fast(2).gain(0.5)');
});

test('rejects a queued stale target without overwriting typed modifier code and locks raw tracks', async ({page}) => {
  await fixture(page,'drums: s("bd sd").fast(2)');
  await replace(page,'// typing\ndrums: s("bd sd").fast(2)');
  await change(page,'Fast factor, call 1','3');
  await replace(page,'// edited by hand\ndrums: s("bd sd").fast(4)');
  await expect(page.getByRole('alert')).toContainText('modifier changed while you were typing');
  expect(await code(page)).toBe('// edited by hand\ndrums: s("bd sd").fast(4)');
  await page.getByRole('button',{name:'Convert to raw',exact:true}).click();
  await expect(page.getByRole('button',{name:'Add fast',exact:true})).toBeDisabled();
  await expect(page.locator('.modifier-card')).toHaveCount(0);
  expect(await code(page)).toContain('.fast(4)');
});
