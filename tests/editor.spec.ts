import { test, expect, type Page } from '@playwright/test';

async function code(page: Page) { return page.evaluate(() => window.__loopsmithTest.editor!.state.doc.toString()); }
async function replace(page: Page, text: string) {
  await page.evaluate(text => { const view = window.__loopsmithTest.editor!; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.type' }); }, text);
}
async function settled(page: Page) { await expect(page.locator('.sync-bar')).toContainText('In sync'); await page.waitForTimeout(1050); }
test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.__loopsmithTest?.editor); });

test('step transaction updates code within 100ms and re-evaluates playing audio', async ({ page }) => {
  await page.getByRole('button', { name: '▶ Play loop' }).click();
  await expect(page.getByRole('status')).toContainText('Playing');
  const result = await page.evaluate(() => {
    const start = performance.now();
    (document.querySelector('[aria-label^="Row 1 step 2:"]') as HTMLButtonElement).click();
    return { elapsed: performance.now() - start, text: window.__loopsmithTest.editor!.state.doc.toString() };
  });
  expect(result.elapsed).toBeLessThan(100);
  expect(result.text).toContain('bd bd sd ~');
  await expect.poll(() => page.evaluate(() => window.__loopsmithTest.activeCode)).toContain('bd bd sd ~');
});

test('typed code updates grid within 500ms; syntax errors keep grid and audio; correction recovers', async ({ page }) => {
  await replace(page, 'drums: s("bd ~ sd ~")'); await settled(page);
  await page.getByRole('button', { name: '▶ Play loop' }).click();
  await expect(page.getByRole('status')).toContainText('Playing');
  // Exercise actual CodeMirror keyboard input, replacing a rest with bd.
  await page.getByRole('textbox', { name: 'Strudel code' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('drums: s("bd bd sd ~")');
  await expect(page.getByRole('button', { name: /^Row 1 step 2:/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
  const previous = await page.evaluate(() => window.__loopsmithTest.activeCode);
  await replace(page, 'drums: s(');
  await expect(page.getByRole('alert')).toContainText('Line 1');
  await expect(page.getByRole('button', { name: /^Row 1 step 2:/ })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__loopsmithTest.activeCode)).toBe(previous);
  expect(await code(page)).toBe('drums: s(');
  await replace(page, 'drums: s("~ bd sd ~")');
  await expect(page.getByRole('button', { name: /^Row 1 step 1:/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('unknown calls, comments, order and expressions survive knob edits', async ({ page }) => {
  const input = '// keep this\r\nconst amount = 0.4;\r\ndrums: s("bd ~ sd ~").jux(rev).gain(0.8).pan(amount); // tail';
  await replace(page, input); await settled(page);
  await expect(page.getByLabel('Pan', { exact: true })).toBeDisabled();
  await page.getByLabel('Volume', { exact: true }).fill('0.6');
  await page.getByLabel('Volume', { exact: true }).press('Tab');
  // Imported mixed/CRLF line endings remain exact source bytes.
  expect(await code(page)).toBe(input.replace('gain(0.8)', 'gain(0.6)'));
  await expect(page.locator('.sync-bar')).toContainText('Contains code-only parts');
});

test('one history spans UI and code, with global undo/redo and preserved cursor', async ({ page }) => {
  const original = await code(page);
  await page.evaluate(() => { const view = window.__loopsmithTest.editor!; view.dispatch({ selection: { anchor: view.state.doc.length } }); });
  await page.getByRole('button', { name: /^Row 1 step 2:/ }).click();
  const changed = await code(page);
  expect(changed).not.toBe(original);
  expect(await page.evaluate(() => window.__loopsmithTest.editor!.state.selection.main.head)).toBe(changed.length);
  await page.keyboard.press('ControlOrMeta+z'); expect(await code(page)).toBe(original);
  await page.keyboard.press('ControlOrMeta+Shift+z'); expect(await code(page)).toBe(changed);
  await page.getByRole('textbox', { name: 'Strudel code' }).click();
  await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.insertText('\n// hello');
  await expect.poll(() => code(page)).toContain('// hello');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await code(page)).toBe(changed);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await code(page)).toBe(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await code(page)).toBe(changed);
});

test('active typing queues UI edits, reconciles fresh ranges, and retains invalid editor text', async ({ page }) => {
  await replace(page, '// inserted preamble\ndrums: s("bd ~ sd ~").gain(0.8)');
  await page.getByRole('button', { name: /^Row 1 step 2:/ }).click();
  await expect(page.locator('.sync-bar')).toContainText('waiting');
  await replace(page, '// a longer inserted preamble\ndrums: s("bd ~ sd ~").gain(0.7)');
  await expect.poll(() => code(page)).toContain('bd bd sd ~');
  expect(await code(page)).toContain('longer inserted preamble');
  expect(await code(page)).toContain('.gain(0.7)');
  await replace(page, 'drums: s(');
  await expect(page.getByRole('alert')).toContainText('Line 1');
  await page.getByRole('button', { name: /^Row 1 step 4:/ }).click();
  await page.waitForTimeout(1100);
  expect(await code(page)).toBe('drums: s(');
  await replace(page, '// corrected\ndrums: s("bd bd sd ~").gain(0.7)');
  await expect.poll(() => code(page)).toContain('bd bd sd bd');
  await expect(page.locator('.sync-bar')).not.toContainText('waiting');
});

test('evaluation failure keeps active audio; Stop cancels an in-flight update and restart works', async ({ page }) => {
  await page.getByRole('button', { name: '▶ Play loop' }).click();
  await expect(page.getByRole('status')).toContainText('Playing');
  const previous = await page.evaluate(() => window.__loopsmithTest.activeCode);
  await replace(page, '// fake-evaluation-error\ndrums: s("bd ~")');
  await expect(page.getByRole('alert')).toContainText('Fake evaluation error');
  expect(await page.evaluate(() => window.__loopsmithTest.activeCode)).toBe(previous);
  await page.evaluate(() => { window.__loopsmithTest.delay = 400; });
  await replace(page, 'drums: s("hh ~ hh ~")');
  await expect(page.getByRole('status')).toContainText('Preparing');
  await page.getByRole('button', { name: '■ Stop', exact: true }).click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__loopsmithTest.started)).toBe(false);
  await page.getByRole('button', { name: '▶ Play loop' }).click();
  await expect(page.getByRole('status')).toContainText('Playing');
});

test('track selection, native flags, row length, tempo, docking and keyboard grid controls', async ({ page }) => {
  await replace(page, '/* tempo */ setcps(0.5);\ndrums: s("bd ~ sd ~");\nhats: s("hh ~ hh ~")'); await settled(page);
  await page.getByRole('button', { name: 'hats Drums', exact: true }).click();
  await page.getByRole('button', { name: 'Mute', exact: true }).click(); expect(await code(page)).toContain('_hats:');
  await page.getByRole('button', { name: 'Solo', exact: true }).click(); expect(await code(page)).toContain('_Shats:');
  await page.getByLabel('Row 1 length').selectOption('8');
  await expect(page.locator('.step')).toHaveCount(8);
  await page.getByLabel('Tempo BPM').fill('124'); await page.getByLabel('Tempo BPM').press('Tab');
  expect(await code(page)).toContain('/* tempo */ setcpm(31)');
  await page.getByRole('button', { name: /^Row 1 step 1:/ }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /^Row 1 step 2:/ })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^Row 1 step 2:/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Change code docking' }).click(); await expect(page.locator('.workspace-body')).toHaveClass(/bottom/);
  await page.getByRole('button', { name: 'Hide code' }).click(); await expect(page.locator('.code-content')).toBeHidden();
  await page.getByRole('button', { name: 'Show code' }).click(); await expect(page.locator('.code-content')).toBeVisible();
});

test('queued edits preserve a selection between distinct source changes and wait through continued typing', async ({ page }) => {
  await replace(page, 'drums: s("bd ~ sd ~").jux(rev).gain(0.8)');
  await page.waitForTimeout(250);
  await page.evaluate(() => { const view = window.__loopsmithTest.editor!; const anchor = view.state.doc.toString().indexOf('rev'); view.dispatch({ selection: { anchor, head: anchor + 3 } }); });
  await page.getByRole('button', { name: /^Row 1 step 2:/ }).click();
  await page.getByLabel('Volume', { exact: true }).fill('0.6'); await page.getByLabel('Volume', { exact: true }).press('Tab');
  await page.waitForTimeout(400);
  await page.evaluate(() => { const view = window.__loopsmithTest.editor!; view.dispatch({ changes: { from: 0, insert: '// still typing\n' }, userEvent: 'input.type' }); });
  await page.waitForTimeout(500);
  expect(await code(page)).toContain('bd ~ sd ~');
  await expect.poll(() => code(page)).toContain('bd bd sd ~');
  expect(await code(page)).toContain('gain(0.6)');
  expect(await page.evaluate(() => { const view = window.__loopsmithTest.editor!; const selection = view.state.selection.main; return view.state.sliceDoc(selection.from, selection.to); })).toBe('rev');
});

test('nested patterns, raw tempo and expression controls stay code-only without losing source', async ({ page }) => {
  const input = 'setcps( /* preserve */ 0.5);\ndrums: s("bd [hh hh]").gain(sine.range(0, 1));';
  await replace(page, input); await settled(page);
  await expect(page.getByLabel('Tempo BPM')).toBeDisabled();
  await expect(page.getByLabel('Volume', { exact: true })).toBeDisabled();
  await expect(page.locator('.step')).toHaveCount(0);
  await expect(page.locator('.visual')).toContainText('Keep this pattern in code');
  await page.getByLabel('Pan', { exact: true }).fill('0.3'); await page.getByLabel('Pan', { exact: true }).press('Tab');
  expect(await code(page)).toBe(input.replace('gain(sine.range(0, 1));', 'gain(sine.range(0, 1)).pan(0.3);'));
});
