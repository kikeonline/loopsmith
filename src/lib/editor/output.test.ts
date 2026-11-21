import { describe, expect, it, vi } from 'vitest';
import { OutputHistory, pitchedNote } from './output';
const hap = (value: unknown) => ({value,ensureObjectValue() {}});
describe('scheduled output observations', () => {
  it('maps the audio clock into performance timestamps and bounds note gates', () => {
    const history = new OutputHistory(() => 1000);
    history.record(hap({note:60,s:'sine'}),0.5,2.1,2,() => 60);
    expect(history.snapshot().events[0]).toMatchObject({note:60,sound:'sine',start:1100,end:1600});
    history.record(hap({note:0}),1000,2,2,() => 0);
    expect(history.snapshot().events[1]).toMatchObject({note:0,end:61000});
  });
  it('does not infer pitches from sample numbers, handles malformed notes, and rounds frequencies', () => {
    const convert = vi.fn(() => 60);
    expect(pitchedNote({s:'bd',n:3},convert)).toBeNull(); expect(convert).not.toHaveBeenCalled();
    for (const pitch of [NaN,Infinity,-1,128]) expect(pitchedNote({note:pitch},() => pitch)).toBeNull();
    expect(pitchedNote({freq:441},() => 69.04)).toBe(69);
    expect(pitchedNote({note:'bad'},() => {throw Error('bad');})).toBeNull();
  });
  it('caps retained events and prunes expired history without querying patterns', () => {
    let now = 0; const history = new OutputHistory(() => now);
    for (let i=0;i<300;i++) history.record(hap({note:60}),1,0,0,() => 60);
    expect(history.snapshot().events).toHaveLength(256);
    now = 6000; expect(history.snapshot().events).toHaveLength(0);
  });
  it('bounds dense histories and expires old events without polling a user pattern', () => {
    let now=0; const history=new OutputHistory(() => now);
    for(let i=0;i<300;i++) history.record(hap({note:60}),0.1,0,0,() => 60);
    expect(history.snapshot().events).toHaveLength(256);
    now=5000; expect(history.snapshot().events).toEqual([]);
  });
  it('isolates observers and unsubscribes/clears without affecting output', () => {
    const history = new OutputHistory(() => 0), listener = vi.fn();
    history.subscribe(() => {throw Error('observer');}); const unsubscribe = history.subscribe(listener);
    history.record(hap({note:60}),1,0,0,() => 60); expect(listener).toHaveBeenCalledOnce();
    unsubscribe(); history.clear(); expect(history.snapshot().events).toEqual([]);
    history.record(hap({note:60}),-1,0,0,() => 60); expect(listener).toHaveBeenCalledOnce();
  });
});
