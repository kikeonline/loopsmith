import {test,expect,type Page} from '@playwright/test';
const code=(page:Page)=>page.evaluate(()=>window.__loopsmithTest.editor!.state.doc.toString());
async function replace(page:Page,text:string){await page.evaluate(text=>{const view=window.__loopsmithTest.editor!;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:text},userEvent:'input.type'});},text);await page.waitForTimeout(1100);}
async function emit(page:Page,token:string,source?:string,duration=5000){await page.evaluate(({token,source,duration})=>{source??=window.__loopsmithTest.activeCode;const from=source.indexOf(token);window.__loopsmithTest.emitOutput!(null,duration,[{from,to:from+token.length}],source);},{token,source,duration});}
test.beforeEach(async({page})=>{await page.goto('/');await page.waitForFunction(()=>!!window.__loopsmithTest?.editor);});
test('follows reported modified drum events and source tokens without changing code, history or selection',async({page})=>{
  const source='// 🌊\r\ndrums:s("bd ~ sd ~, hh hh").rev().fast(2)';await replace(page,source);
  await page.getByLabel('Playhead mode',{exact:true}).selectOption('events');
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');
  await page.evaluate(()=>window.__loopsmithTest.editor!.dispatch({selection:{anchor:0,head:2}}));
  await emit(page,'sd');await expect(page.locator('.step.playhead')).toHaveCount(1);
  await expect(page.getByRole('button',{name:/Row 1 step 3:/})).toHaveClass(/playhead/);
  await expect(page.locator('.cm-event-playhead')).toHaveText('sd');expect(await code(page)).toBe(source);
  expect(await page.evaluate(()=>({from:window.__loopsmithTest.editor!.state.selection.main.from,to:window.__loopsmithTest.editor!.state.selection.main.to}))).toEqual({from:0,to:2});
  await page.getByRole('button',{name:/Row 1 step 2:/}).click();expect(await code(page)).not.toBe(source);
  await expect(page.locator('.cm-event-playhead')).toHaveCount(0);
  await emit(page,'sd',source);await expect(page.locator('.cm-event-playhead')).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await code(page)).toBe(source);
  await page.getByRole('button',{name:'■ Stop',exact:true}).click();await expect(page.locator('.step.playhead')).toHaveCount(0);await expect(page.locator('.cm-event-playhead')).toHaveCount(0);
});
test('lights the actual note slot and arrangement section with outer modifiers',async({page})=>{
  const source='drums:arrange([1,s("bd sd")],[2,n("0 2").scale("C:minor").s("sine")]).slow(2)';await replace(page,source);
  await page.getByRole('button',{name:'Select section 2: Section 2 2 cycles',exact:true}).click();await page.getByLabel('Playhead mode',{exact:true}).selectOption('events');
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');
  // Inject the exact source leaf, rather than including the closing quote.
  await page.evaluate(()=>{const source=window.__loopsmithTest.activeCode,from=source.indexOf('0 2')+2;window.__loopsmithTest.emitOutput!(51,5000,[{from,to:from+1}],source);});
  await expect(page.getByRole('button',{name:'Degree 2 step 2',exact:true})).toHaveClass(/playhead/);
  await expect(page.locator('.piano-note.playhead')).toHaveCount(1);await expect(page.locator('.arrangement-section.current')).toHaveCount(1);
  await expect(page.locator('.cm-event-playhead')).toHaveText('2');
  await page.getByRole('button',{name:'■ Stop',exact:true}).click();await expect(page.locator('.arrangement-section.current')).toHaveCount(0);
});
test('hides event playheads for invalid drafts, expired gates and escaped strings; clock mode remains available',async({page})=>{
  const source='drums:s("bd sd")';await replace(page,source);await page.getByLabel('Playhead mode',{exact:true}).selectOption('events');
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');await emit(page,'bd',undefined,300);
  await expect(page.locator('.cm-event-playhead')).toHaveText('bd');await expect(page.locator('.cm-event-playhead')).toHaveCount(0);
  await emit(page,'sd');await expect(page.locator('.cm-event-playhead')).toHaveText('sd');
  await page.evaluate(()=>{const view=window.__loopsmithTest.editor!;view.dispatch({changes:{from:view.state.doc.length,insert:'('},userEvent:'input.type'});});await expect(page.locator('.cm-event-playhead')).toHaveCount(0);
  await replace(page,'drums:s("b\\u0064 sd")');await emit(page,'sd');await expect(page.locator('.cm-event-playhead')).toHaveCount(0);
  await replace(page,source);await page.getByLabel('Playhead mode',{exact:true}).selectOption('clock');await expect(page.locator('.step.playhead')).toHaveCount(1);
});
