import { test, expect, type Page } from '@playwright/test';
declare global { interface Window { __midiTest: {requests:number;messages:{data:number[];time?:number}[];clears:number;denied:boolean;disconnect():void} } }
const code = (page:Page) => page.evaluate(() => window.__loopsmithTest.editor!.state.doc.toString());
async function fakeMidi(page: Page) {
  await page.addInitScript(() => {
    const access = new EventTarget();
    const state = window.__midiTest = {requests:0,messages:[],clears:0,denied:false,disconnect() {port.state='disconnected';access.dispatchEvent(new Event('statechange'));}};
    const port = {id:'test',name:'Test synthesizer',state:'connected',open:async () => {},close:async () => {},send:(data:number[],time?:number) => state.messages.push({data,time}),clear:() => state.clears++};
    Object.assign(access,{outputs:new Map([['test',port]])});
    Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async (options:{sysex:boolean}) => { if(options.sysex) throw Error('Unexpected sysex'); state.requests++; if(state.denied) throw Error('Permission denied'); return access; }});
  });
}
async function ready(page: Page) { await page.goto('/'); await page.waitForFunction(() => !!window.__loopsmithTest?.editor); }
async function connect(page:Page) {
  await page.getByRole('button',{name:'Connect MIDI',exact:true}).click();
  await page.getByLabel('MIDI output',{exact:true}).selectOption('test');
  await page.getByRole('button',{name:'Enable MIDI mirror',exact:true}).click();
  await expect(page.getByRole('button',{name:'Disable MIDI mirror',exact:true})).toBeEnabled();
}
test('visualizers stay lazy, follow runtime output, retain last-good events and clear on Stop', async ({page}) => {
  await fakeMidi(page); await ready(page);
  const original=await code(page);
  await page.getByRole('checkbox',{name:'Show runtime visualizers',exact:true}).check();
  expect(await page.evaluate(() => window.__loopsmithTest.initializations)).toBe(0);
  expect(await page.evaluate(() => window.__midiTest.requests)).toBe(0);
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Playing');
  await page.evaluate(() => window.__loopsmithTest.emitOutput!(60,5000));
  await expect(page.locator('.output-notes')).toContainText('C4 (60)');
  await expect(page.locator('.output-piano rect')).toHaveCount(1);
  await expect(page.locator('.scope-trace')).not.toHaveAttribute('d','M0,50H640');
  expect(await code(page)).toBe(original);
  await page.evaluate(() => { const view=window.__loopsmithTest.editor!; view.dispatch({changes:{from:view.state.doc.length,insert:'('}}); });
  await expect(page.getByRole('alert')).toContainText('Unexpected token');
  await expect(page.getByLabel('Runtime output',{exact:true})).toContainText('last playing version');
  await page.getByRole('button',{name:'■ Stop',exact:true}).click();
  await expect(page.locator('.output-piano rect')).toHaveCount(0); await expect(page.locator('.output-notes')).toContainText('none');
  await page.getByRole('checkbox',{name:'Show runtime visualizers',exact:true}).uncheck();
  await expect(page.locator('.output-scope')).toHaveCount(0);
  expect(await page.evaluate(() => window.__loopsmithTest.monitorReleases)).toBeGreaterThan(0);
});

test('opt-in MIDI sends selected channel and velocity, skips drums, and panic/Stop release notes without source edits', async ({page}) => {
  await fakeMidi(page); await ready(page); const original=await code(page);
  await page.getByRole('button',{name:'Connect MIDI',exact:true}).click();
  await expect(page.getByRole('button',{name:'Enable MIDI mirror',exact:true})).toBeDisabled();
  await page.getByLabel('MIDI output',{exact:true}).selectOption('test');
  await page.getByLabel('MIDI channel',{exact:true}).fill('3'); await page.getByLabel('MIDI channel',{exact:true}).press('Tab');
  await page.getByLabel('MIDI velocity',{exact:true}).fill('88'); await page.getByLabel('MIDI velocity',{exact:true}).press('Tab');
  await page.getByRole('button',{name:'Enable MIDI mirror',exact:true}).click();
  await page.getByRole('button',{name:'▶ Play loop',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Playing');
  await page.evaluate(() => { window.__loopsmithTest.emitOutput!(null); window.__loopsmithTest.emitOutput!(60,5000); });
  await expect.poll(() => page.evaluate(() => window.__midiTest.messages.some(message => message.data.join(',')==='146,60,88'))).toBe(true);
  await page.getByRole('button',{name:'MIDI panic',exact:true}).click();
  expect(await page.evaluate(() => window.__midiTest.messages.at(-1)?.data)).toEqual([130,60,0]);
  await page.evaluate(() => window.__loopsmithTest.emitOutput!(64,5000));
  await expect.poll(() => page.evaluate(() => window.__midiTest.messages.some(message => message.data.join(',')==='146,64,88'))).toBe(true);
  await page.getByRole('button',{name:'■ Stop',exact:true}).click();
  expect(await page.evaluate(() => window.__midiTest.messages.at(-1)?.data)).toEqual([130,64,0]);
  expect(await code(page)).toBe(original);
  await page.reload(); await page.waitForFunction(() => !!window.__loopsmithTest?.editor);
  expect(await page.evaluate(() => window.__midiTest.requests)).toBe(0);
  await expect(page.getByRole('button',{name:'Disable MIDI mirror',exact:true})).toBeDisabled();
});

test('reports denied/unsupported access and disconnection, and disables MIDI when hidden', async ({page}) => {
  await fakeMidi(page); await ready(page);
  await page.evaluate(() => window.__midiTest.denied=true);
  await page.getByRole('button',{name:'Connect MIDI',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Permission denied');
  await page.evaluate(() => window.__midiTest.denied=false); await connect(page);
  await page.evaluate(() => window.__midiTest.disconnect());
  await expect(page.getByRole('alert')).toContainText('disconnected');
  await page.reload(); await page.waitForFunction(() => !!window.__loopsmithTest?.editor); await connect(page);
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('button',{name:'Disable MIDI mirror',exact:true})).toBeDisabled();
  await page.addInitScript(() => Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:undefined}));
  await page.reload(); await page.waitForFunction(() => !!window.__loopsmithTest?.editor);
  await expect(page.getByRole('button',{name:'Connect MIDI',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Runtime output',{exact:true})).toContainText('Web MIDI is unavailable');
});
