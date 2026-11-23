import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {decodeShareUrl} from '../src/lib/persistence/share-url';
const code=(page:Page)=>page.evaluate(()=>window.__loopsmithTest.editor!.state.doc.toString());
async function ready(page:Page){await page.waitForFunction(()=>!!window.__loopsmithTest?.editor);}
async function replace(page:Page,source:string){await page.evaluate(source=>{const view=window.__loopsmithTest.editor!;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:source},userEvent:'input.type'});},source);await page.waitForTimeout(1100);}
test.beforeEach(async({page})=>{await page.goto('/');await ready(page);});
test('creates, copies and downloads native share links locally without executing or changing source',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);const source='// café 🌊\r\nglobalThis.__exportExecuted=true;\r\ndrums:arrange([2,s("bd sd").fast(2)],[1,s("hh")]);\r\n';await replace(page,source);
  const requests:string[]=[];page.on('request',request=>{if(request.url().startsWith('https://strudel.cc/'))requests.push(request.url());});
  await page.getByText('Export Strudel share link',{exact:true}).click();await page.getByRole('button',{name:'Create Strudel share link',exact:true}).click();
  const url=await page.getByLabel('Generated Strudel share URL',{exact:true}).inputValue();expect(decodeShareUrl(url)).toBe(source);expect(await code(page)).toBe(source);
  expect(await page.evaluate(()=>'__exportExecuted' in window)).toBe(false);expect(requests).toEqual([]);expect(await page.evaluate(()=>window.__loopsmithTest.plays.length)).toBe(0);expect(await page.evaluate(()=>window.__loopsmithTest.initializations)).toBe(0);
  await page.getByRole('button',{name:'Copy Strudel share link',exact:true}).click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(url);
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Download Strudel share link',exact:true}).click();const download=await promise;expect(await readFile((await download.path())!,'utf8')).toBe(url);
  await page.getByText('Import Strudel share URL',{exact:true}).click();await page.getByLabel('Strudel share URL',{exact:true}).fill(url);await page.getByRole('button',{name:'Review share link',exact:true}).click();await page.getByRole('button',{name:'Import reviewed code',exact:true}).click();expect(await code(page)).toBe(source);
});
test('invalidates generated links on edits and preserves unfinished drafts with clear errors',async({page})=>{
  await page.getByText('Export Strudel share link',{exact:true}).click();await page.getByRole('button',{name:'Create Strudel share link',exact:true}).click();
  await page.getByRole('button',{name:/Row 1 step 2:/}).click();await expect(page.getByLabel('Generated Strudel share URL',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Copy Strudel share link',exact:true})).toBeDisabled();
  await replace(page,'drums:s(');await page.getByRole('button',{name:'Create Strudel share link',exact:true}).click();await expect(page.locator('.share-export [role=alert]')).toContainText('Fix syntax errors');expect(await code(page)).toBe('drums:s(');
});
test('clipboard denial leaves a selectable/downloadable link and does not interrupt playback',async({page})=>{
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();await expect(page.getByRole('status')).toContainText('Playing');const original=await code(page);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Denied');}}}));
  await page.getByText('Export Strudel share link',{exact:true}).click();await page.getByRole('button',{name:'Create Strudel share link',exact:true}).click();await page.getByRole('button',{name:'Copy Strudel share link',exact:true}).click();
  await expect(page.locator('.share-export [role=alert]')).toContainText('Clipboard unavailable');const field=page.getByLabel('Generated Strudel share URL',{exact:true});await field.focus();await expect(field).toBeFocused();expect(decodeShareUrl(await field.inputValue())).toBe(original);
  await expect(page.getByRole('status')).toContainText('Playing');expect(await code(page)).toBe(original);
});
