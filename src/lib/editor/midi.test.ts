import { afterEach, describe, expect, it, vi } from 'vitest';
import { MidiMirror, type MidiAccess, type MidiPort } from './midi';
const event = (note: number|null=60,start=100,end=600) => ({id:1,note,start,end,sound:'sine'});
function fixture() {
  let now = 0; const ports: MidiPort[] = [];
  const port: MidiPort = {id:'synth',name:'Synth',state:'connected',open:vi.fn(async () => {}),close:vi.fn(async () => {}),send:vi.fn(),clear:vi.fn()}; ports.push(port);
  let statechange = () => {};
  const access: MidiAccess = {outputs:{values:() => ports.values()},addEventListener:(_,listener) => {statechange=listener;},removeEventListener:vi.fn()};
  const request = vi.fn(async () => access);
  const mirror = new MidiMirror(() => {},request,() => now);
  return {mirror,port,ports,request,access,change:() => statechange(),time:(time:number) => {now=time;mirror.flush();}};
}
afterEach(() => vi.useRealTimers());
describe('opt-in MIDI mirror', () => {
  it('never requests access or opens devices until explicit actions', async () => {
    vi.useFakeTimers(); const f = fixture();
    expect(f.request).not.toHaveBeenCalled(); f.mirror.receive(event()); expect(f.port.send).not.toHaveBeenCalled();
    await f.mirror.connect(); expect(f.request).toHaveBeenCalledOnce(); expect(f.port.open).not.toHaveBeenCalled();
    expect(f.mirror.state.selected).toBe(''); f.mirror.select('synth'); await f.mirror.enable(2,90);
    f.mirror.receive(event()); f.time(80); expect(f.port.send).toHaveBeenCalledWith([0x91,60,90],100);
    f.time(600); expect(f.port.send).toHaveBeenCalledWith([0x81,60,0],600); f.mirror.destroy();
  });
  it('sorts chords by timestamp and suppresses obsolete overlapping-note offs', async () => {
    vi.useFakeTimers(); const f=fixture(); await f.mirror.connect(); f.mirror.select('synth'); await f.mirror.enable(1,100);
    f.mirror.receive(event(60,100,500)); f.mirror.receive(event(64,100,500)); f.mirror.receive(event(60,200,800));
    f.time(80); f.time(180); f.time(480);
    expect(vi.mocked(f.port.send).mock.calls.filter(([data,time]) => data[0]===0x80 && data[1]===60 && time===500)).toHaveLength(0);
    f.time(800); expect(f.port.send).toHaveBeenCalledWith([0x80,60,0],800); f.mirror.destroy();
  });
  it('keeps future note-offs cancellable when a retrigger arrives near the gate boundary', async () => {
    vi.useFakeTimers(); const f=fixture(); await f.mirror.connect(); f.mirror.select('synth'); await f.mirror.enable(1,100);
    f.mirror.receive(event(60,100,500)); f.time(80); f.time(490);
    expect(vi.mocked(f.port.send).mock.calls.some(([data,time]) => data[0]===0x80 && time===500)).toBe(false);
    f.mirror.receive(event(60,495,800)); f.time(500);
    expect(vi.mocked(f.port.send).mock.calls.some(([data,time]) => data[0]===0x80 && time===500)).toBe(false);
    f.time(800); expect(f.port.send).toHaveBeenLastCalledWith([0x80,60,0],800); f.mirror.destroy();
  });
  it('panic clears native and application queues and releases sent notes', async () => {
    vi.useFakeTimers(); const f=fixture(); await f.mirror.connect(); f.mirror.select('synth'); await f.mirror.enable(16,127);
    f.mirror.receive(event()); f.time(80); f.mirror.panic();
    expect(f.port.clear).toHaveBeenCalled(); expect(f.port.send).toHaveBeenLastCalledWith([0x8f,60,0]);
    const count=vi.mocked(f.port.send).mock.calls.length; f.time(1000); expect(f.port.send).toHaveBeenCalledTimes(count);
    f.mirror.destroy();
  });
  it('does not send drums, invalid pitches or expired events and validates channel/velocity', async () => {
    vi.useFakeTimers(); const f=fixture(); await f.mirror.connect(); f.mirror.select('synth'); await f.mirror.enable(0,100);
    expect(f.mirror.state.error).toContain('channel'); expect(f.port.open).not.toHaveBeenCalled();
    await f.mirror.enable(1,100);
    for(const note of [null,-1,128,60.5]) f.mirror.receive(event(note));
    f.mirror.receive(event(60,-100,-50)); f.time(1000); expect(f.port.send).not.toHaveBeenCalled(); f.mirror.destroy();
  });
  it('disables on disconnect and surfaces denied access and send failures without throwing', async () => {
    vi.useFakeTimers(); const denied = new MidiMirror(() => {},async () => {throw Error('Denied');}); await denied.connect(); expect(denied.state.error).toContain('Denied');
    const f=fixture(); await f.mirror.connect(); f.mirror.select('synth'); await f.mirror.enable(1,100);
    f.port.state='disconnected'; f.change(); expect(f.mirror.state.enabled).toBe(false); expect(f.mirror.state.error).toContain('disconnected');
    f.port.state='connected'; f.change(); f.mirror.select('synth'); await f.mirror.enable(1,100);
    vi.mocked(f.port.send).mockImplementation(() => {throw Error('Device failed');});
    f.mirror.receive(event()); f.time(80); expect(f.mirror.state.error).toContain('Device failed'); expect(f.mirror.state.enabled).toBe(false); f.mirror.destroy();
  });
  it('cancels an in-flight port open and serializes a subsequent enable', async () => {
    vi.useFakeTimers(); const f=fixture(); await f.mirror.connect(); f.mirror.select('synth');
    let finish!: () => void; vi.mocked(f.port.open).mockImplementationOnce(() => new Promise<void>(resolve => finish=resolve));
    const first=f.mirror.enable(1,100); await Promise.resolve(); f.mirror.disable(); const second=f.mirror.enable(3,80);
    finish(); await first; await second; expect(f.mirror.state.enabled).toBe(true);
    f.mirror.receive(event()); f.time(80); expect(f.port.send).toHaveBeenCalledWith([0x92,60,80],100); f.mirror.destroy();
  });
  it('disposal during a permission request never installs a device listener', async () => {
    let finish!: (value:MidiAccess) => void; const f=fixture();
    const mirror=new MidiMirror(() => {},() => new Promise(resolve => finish=resolve));
    const connecting=mirror.connect(); mirror.destroy(); finish(f.access); await connecting;
    expect(mirror.state.enabled).toBe(false); expect(f.port.open).not.toHaveBeenCalled();
  });
});
