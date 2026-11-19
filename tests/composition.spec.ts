import { test, expect, type Page } from '@playwright/test';
const code = (page: Page) => page.evaluate(() => window.__loopsmithTest.editor!.state.doc.toString());
async function replace(page: Page, text: string) {
  await page.evaluate(text => { const view = window.__loopsmithTest.editor!; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.type' }); }, text);
  await page.waitForTimeout(1100);
}
async function change(page: Page, label: string, value: string) { await page.getByLabel(label, { exact: true }).fill(value); await page.getByLabel(label, { exact: true }).press('Tab'); }
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.__loopsmithTest?.editor); });

test('builds and plays a four-track drum and melodic song entirely through the UI', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add track', exact: true }).click();
  await change(page, 'Track name', 'Hats');
  await change(page, 'Row 1 sound', 'hh');
  await page.getByRole('button', { name: /^Row 1 step 2:/ }).click();
  await page.getByLabel('New track type').selectOption('note');
  await page.getByRole('button', { name: '+ Add track', exact: true }).click();
  await change(page, 'Track name', 'Bass');
  await change(page, 'Instrument', 'sawtooth');
  const pitch = page.getByRole('button', { name: 'Note d4 step 2', exact: true });
  await pitch.focus(); await page.keyboard.press('Space');
  await expect(pitch).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Note d4 step 3', exact: true })).toBeFocused();
  await page.getByLabel('Melody length').selectOption('8');
  await change(page, 'Attack', '0.02');
  await change(page, 'Release', '0.3');
  await page.getByLabel('New track type').selectOption('n');
  await page.getByRole('button', { name: '+ Add track', exact: true }).click();
  await change(page, 'Track name', 'Lead');
  await change(page, 'Scale', 'D:dorian');
  await page.getByRole('button', { name: 'Degree 5 step 2', exact: true }).click();
  await change(page, 'Reverb', '0.2');
  await change(page, 'Delay', '0.1');
  await expect(page.locator('button.track')).toHaveCount(4);
  await expect(page.locator('.mixer-strip')).toHaveCount(4);
  await page.getByRole('button', { name: '▶ Play loop', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Playing');
  await expect.poll(() => page.evaluate(() => window.__loopsmithTest.activeCode)).toContain('.scale("D:dorian")');
  const text = await code(page);
  expect(text).toContain('s("hh hh hh ~")');
  expect(text).toContain('note("c4 d4 e4 ~ ~ ~ ~ ~").s("sawtooth")');
  expect(text).toContain('n("0 5 2 ~")');
  await expect(page.locator('.piano-time.playhead')).toHaveCount(1);
  await page.getByRole('button', { name: '■ Stop', exact: true }).click();
  await expect(page.locator('.piano-time.playhead')).toHaveCount(0);
});

test('track lifecycle uses one undo history with stable metadata and native flags', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add track', exact: true }).click();
  await change(page, 'Track name', 'Second');
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await page.getByRole('button', { name: 'Solo', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate track', exact: true }).click();
  await expect(page.getByLabel('Track name', { exact: true })).toHaveValue('Second copy');
  const before = await code(page);
  const ids = [...before.matchAll(/"id":"([^"]+)"/g)].map(match => match[1]);
  expect(new Set(ids).size).toBe(2);
  expect(before.match(/_S(?:drums|copy)\d+/g)).toHaveLength(2);
  await page.getByRole('button', { name: 'Move track up', exact: true }).click();
  const moved = await code(page);
  expect(moved.indexOf('Second copy')).toBeLessThan(moved.indexOf('"name":"Second"'));
  expect(ids.every(id => moved.includes(id))).toBe(true);
  await page.getByRole('button', { name: 'Delete track', exact: true }).click();
  await expect(page.locator('button.track')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await code(page)).toBe(moved);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await code(page)).toBe(before);
});

test('unsupported code plays and survives effects, raw mute, and explicit expression replacement', async ({ page }) => {
  const input = '// custom samples\nsamples("custom.json");\nraw: stack(s("bd*3"), s("hh*8")).jux(rev);\nmelody: note("c4 ~ e4 ~").s("sine").jux( rev ).gain(sine.range(0.2, 0.8)).room(0.1); // tail';
  await replace(page, input);
  await page.getByRole('button', { name: 'melody Melody', exact: true }).click();
  await expect(page.getByLabel('Volume', { exact: true })).toBeDisabled();
  await expect(page.locator('.expression-chip')).toContainText(['.jux( rev )', 'sine.range(0.2, 0.8)']);
  await change(page, 'Reverb', '0.4');
  expect(await code(page)).toBe(input.replace('.room(0.1)', '.room(0.4)'));
  await page.getByRole('button', { name: 'Replace volume with value', exact: true }).click();
  await expect(page.getByLabel('Volume', { exact: true })).toBeEnabled();
  expect(await code(page)).toContain('.jux( rev ).gain(1).room(0.4)');
  await page.getByRole('button', { name: '▶ Play loop', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Playing');
  await expect(page.locator('.piano-time.playhead')).toHaveCount(0); // unknown timing remains unhighlighted
  await page.getByRole('button', { name: 'raw Edited in code · locked', exact: true }).click();
  await expect(page.locator('.code-only')).toContainText('Edited in code · locked');
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  const output = await code(page);
  expect(output).toContain('_raw: stack(s("bd*3"), s("hh*8")).jux(rev);');
  expect(output).toContain('samples("custom.json");');
  await expect.poll(() => page.evaluate(() => window.__loopsmithTest.activeCode)).toBe(output);
});

test('converts to raw without rewriting the expression and undo restores piano editing', async ({ page }) => {
  await page.getByLabel('New track type').selectOption('note');
  await page.getByRole('button', { name: '+ Add track', exact: true }).click();
  const before = await code(page);
  await page.getByRole('button', { name: 'Convert to raw', exact: true }).click();
  await expect(page.locator('.code-only')).toContainText('Edited in code · locked');
  expect(await code(page)).toBe(before.replace('"name":"Melody 2"}', '"name":"Melody 2","raw":true}'));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Piano roll', exact: true })).toBeVisible();
  expect(await code(page)).toBe(before);
});

test('registry browsing, preview loading/errors/cancellation, and choosing a sound leave transport intact', async ({ page }) => {
  await page.locator('.sound-browser summary').click();
  await page.getByRole('button', { name: 'Load available sounds' }).click();
  expect(await page.evaluate(() => window.__loopsmithTest.plays.length)).toBe(0);
  await page.getByLabel('Search sounds').fill('hh');
  await page.getByRole('button', { name: 'Preview hh', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__loopsmithTest.previews)).toEqual(['hh']);
  expect(await page.evaluate(() => window.__loopsmithTest.started)).toBe(false);
  await page.getByRole('button', { name: 'Use hh', exact: true }).click();
  expect(await code(page)).toContain('hh ~ hh ~, hh hh hh hh');
  await page.getByLabel('Search sounds').fill('broken');
  await page.getByRole('button', { name: 'Preview broken', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Preview failed to load');
  await page.getByLabel('Search sounds').fill('sine');
  await page.evaluate(() => { window.__loopsmithTest.previewDelay = 300; });
  await page.getByRole('button', { name: 'Preview sine', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview sine', exact: true })).toContainText('Loading');
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__loopsmithTest.previews)).toEqual(['hh']);
});
