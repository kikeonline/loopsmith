import { describe, expect, it, vi } from 'vitest';
import type { Output } from '@strudel/web';
const mock = vi.hoisted(() => {
  const analyser = {fftSize:0,disconnect:vi.fn(),getFloatTimeDomainData:vi.fn((data:Float32Array) => data.fill(0.25))};
  const node = () => ({connect:vi.fn(),disconnect:vi.fn()});
  const controller = {output:{destinationGain:node()}};
  const context = {currentTime:10,resume:vi.fn(async () => {}),createAnalyser:vi.fn(() => analyser)};
  const repl = {evaluate:vi.fn(async () => {}),stop:vi.fn(),state:{started:false,activeCode:'note("c4").s("sine")'},scheduler:{now:() => 0,cps:0.5}};
  return {analyser,node,controller,context,repl,output:undefined as Output|undefined};
});
vi.mock('@strudel/web',() => ({
  initStrudel:vi.fn(async (options:{defaultOutput:Output;prebake:()=>Promise<unknown>}) => {mock.output=options.defaultOutput;await options.prebake();return mock.repl;}),
  getAudioContext:() => mock.context,initAudio:async () => {},samples:async () => {},
  valueToMidi:(value:{note:number}) => value.note,webaudioOutput:vi.fn(),getSuperdoughAudioController:() => mock.controller
}));
import { createRuntime } from './runtime';
import { webaudioOutput } from '@strudel/web';
describe('runtime output tap', () => {
  it('keeps observation lazy, forwards audio unchanged and disconnects only its own analyser branch', async () => {
    expect(mock.context.createAnalyser).not.toHaveBeenCalled();
    const runtime=await createRuntime(), observed=vi.fn(); runtime.onEvent!(observed);
    expect(mock.context.createAnalyser).not.toHaveBeenCalled();
    const hap={value:{note:60,s:'sine'},context:{locations:[{start:6,end:8}]},ensureObjectValue:vi.fn()};
    mock.output!(hap,0.1,0.5,0.5,10.1);
    expect(webaudioOutput).toHaveBeenCalledWith(hap,0.1,0.5,0.5,10.1);
    expect(observed).toHaveBeenCalledOnce();
    expect(runtime.events!().events[0]).toMatchObject({source:mock.repl.state.activeCode,locations:[{from:6,to:8}]});
    expect(mock.context.createAnalyser).not.toHaveBeenCalled();
    const first=mock.controller.output.destinationGain;
    const snapshot=runtime.monitor!(); expect(snapshot.events[0].note).toBe(60); expect(snapshot.waveform).toHaveLength(512);
    expect(first.connect).toHaveBeenCalledWith(mock.analyser);
    mock.controller.output.destinationGain=mock.node(); runtime.monitor!();
    expect(first.disconnect).toHaveBeenCalledWith(mock.analyser);
    expect(first.disconnect).not.toHaveBeenCalledWith();
    runtime.stop(); expect(runtime.monitor!().events).toEqual([]);
    runtime.releaseMonitor!(); runtime.destroy!(); expect(mock.analyser.disconnect).toHaveBeenCalled();
  });
});
