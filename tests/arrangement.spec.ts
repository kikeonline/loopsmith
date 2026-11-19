import { test, expect, type Page } from '@playwright/test';
const code = (page: Page) => page.evaluate(() => window.__loopsmithTest.editor!.state.doc.toString());
async function replace(page: Page, text: string) { await page.evaluate(text => { const view = window.__loopsmithTest.editor!; view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:'input.type'}); },text); }
async function change(page: Page, name: string, value: string) { const input = page.getByLabel(name,{exact:true}); await input.fill(value); await input.press('Tab'); }
test.beforeEach(async ({page}) => { await page.goto('/'); await page.waitForFunction(() => !!window.__loopsmithTest?.editor); });

test('arranges, edits, reorders and restores sections with shared history and autosave', async ({page}) => {
  const original = await code(page);
  await page.getByRole('button',{name:'Arrange this track',exact:true}).click();
  await expect(page.getByLabel('Track arrangement',{exact:true})).toBeVisible();
  await change(page,'Section name','Intro'); await change(page,'Section cycles','2');
  await page.getByRole('button',{name:'Duplicate section',exact:true}).click();
  await change(page,'Section name','Fill'); await change(page,'Section cycles','1');
  await page.getByRole('button',{name:/Row 1 step 2:/}).click();
  await expect(page.getByRole('button',{name:/Row 1 step 2:/})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Section earlier',exact:true}).click();
  await expect(page.getByRole('button',{name:'Select section 1: Fill 1 cycles',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Add rest section',exact:true}).click();
  await expect(page.getByRole('button',{name:/Row 1 step 1:/})).toHaveAttribute('aria-pressed','false');
  const beforeRemove = await code(page);
  await page.getByRole('button',{name:'Remove section',exact:true}).click();
  await page.getByRole('button',{name:'Undo',exact:true}).click(); expect(await code(page)).toBe(beforeRemove);
  await page.getByText('Track-wide modifiers and effects',{exact:true}).click();
  await page.getByRole('button',{name:'Track-wide Add fast',exact:true}).click();
  await change(page,'Track-wide Fast factor, call 1','3');
  await change(page,'Track-wide Volume','0.7');
  await expect(page.locator('.sync-bar')).not.toContainText('Contains code-only');
  const saved = await code(page); expect(saved).toContain(').fast(3).gain(0.7)');
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.__loopsmithTest.activeCode)).toBe(saved);
  await expect(page.locator('.arrangement-section.current')).toHaveCount(0);
  await page.reload(); await page.waitForFunction(() => !!window.__loopsmithTest?.editor);
  expect(await code(page)).toBe(saved); expect(saved).not.toBe(original);
  await expect(page.getByLabel('Section timeline',{exact:true}).getByRole('button')).toHaveCount(3);
});

test('edits a melody section, preserves custom duration and code, and explicitly flattens', async ({page}) => {
  const source = '// preserved\ndrums: arrange([bars, custom(foo)], [2,note("c3 ~").s("sine")]).gain(0.5);';
  await replace(page,source); await page.waitForTimeout(1100);
  await expect(page.getByLabel('Section cycles',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Select section 2: Section 2 2 cycles',exact:true}).click();
  await expect(page.getByLabel('Instrument',{exact:true})).toHaveValue('sine');
  await change(page,'Instrument','triangle');
  expect(await code(page)).toContain('[bars, custom(foo)]');
  expect(await code(page)).toContain('note("c3 ~").s("triangle")');
  await page.getByRole('button',{name:'Keep selected pattern only',exact:true}).click();
  expect(await code(page)).toBe('// preserved\ndrums: note("c3 ~").s("triangle").gain(0.5);');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByLabel('Track arrangement',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Convert to raw',exact:true}).click();
  await expect(page.getByLabel('Track arrangement',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Add fast',exact:true})).toBeDisabled();
});

test('queues nested modifier edits with section edits and retains last good arrangement after syntax errors', async ({page}) => {
  const source = 'drums: arrange([2,s("bd ~").fast(2).gain(0.5)],[1,s("hh")])';
  await replace(page,source); await page.waitForTimeout(1100);
  await replace(page,'// typing\n'+source);
  await change(page,'Fast factor, call 1','4');
  await page.getByRole('button',{name:'Move fast call 1 later',exact:true}).click();
  await change(page,'Section cycles','3');
  await expect.poll(() => code(page)).toContain('s("bd ~").gain(0.5).fast(4)');
  expect(await code(page)).toContain('[3,s("bd ~")');
  const good = await code(page);
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();
  await replace(page,good+'(');
  await expect(page.getByRole('alert')).toContainText('Unexpected token');
  await expect(page.getByLabel('Track arrangement',{exact:true})).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__loopsmithTest.activeCode)).toBe(good);
});

test('navigates the timeline by keyboard and hides highlights for muted and outer-modified timing', async ({page}) => {
  await replace(page,'drums: arrange([128,s("bd ~")],[1,s("hh")])'); await page.waitForTimeout(1100);
  const buttons = page.getByLabel('Section timeline',{exact:true}).getByRole('button');
  await buttons.first().focus(); await buttons.first().press('End');
  await expect(buttons.last()).toBeFocused(); await expect(buttons.last()).toHaveAttribute('aria-pressed','true');
  await buttons.last().press('Home'); await expect(buttons.first()).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();
  await expect(page.locator('.arrangement-section.current')).toHaveCount(1);
  await expect(page.locator('.step.playhead')).toHaveCount(1);
  await page.getByRole('button',{name:'Mute',exact:true}).click();
  await expect(page.locator('.arrangement-section.current')).toHaveCount(0);
  await page.getByRole('button',{name:'Mute',exact:true}).click();
  await expect(page.locator('.arrangement-section.current')).toHaveCount(1);
  await page.getByText('Track-wide modifiers and effects',{exact:true}).click();
  await page.getByRole('button',{name:'Track-wide Add slow',exact:true}).click();
  await expect(page.locator('.arrangement-section.current')).toHaveCount(0);
  await expect(page.locator('.step.playhead')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  const remove = await page.getByRole('button',{name:'Remove section',exact:true}).boundingBox();
  expect(remove!.x + remove!.width).toBeLessThanOrEqual(390);
});
