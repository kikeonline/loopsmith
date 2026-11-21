import { describe, expect, it, vi } from 'vitest';
import { Playback } from './playback';
import type { LiveRuntime } from '../runtime';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(play: (code: string) => Promise<void>) {
  const runtime: LiveRuntime = { play: vi.fn(play), evaluate: play, stop: vi.fn(), cycle: () => 2.5, onError: () => () => {} };
  const playback = new Playback(() => {}, async () => runtime);
  return { runtime, playback };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('serialized playback', () => {
  it('reinstalls A when an undo to active A arrives during evaluation of B', async () => {
    const wait = deferred();
    const { runtime, playback } = fixture(async code => { if (code === 'B') await wait.promise; });
    playback.play('A'); await flush();
    playback.update('B'); await flush();
    playback.update('A'); wait.resolve(); await flush();
    expect(runtime.play).toHaveBeenNthCalledWith(3, 'A');
    expect(playback.state.activeCode).toBe('A');
  });
  it('cancels initial audio loading on Stop without evaluating', async () => {
    const wait = deferred();
    const { runtime } = fixture(async () => {});
    const playback = new Playback(() => {}, async () => { await wait.promise; return runtime; });
    playback.play('A'); playback.stop(); wait.resolve(); await flush();
    expect(runtime.play).not.toHaveBeenCalled();
    expect(playback.state.playing).toBe(false);
  });
  it('serializes Stop/restart while an evaluation is in flight', async () => {
    const wait = deferred();
    const { runtime, playback } = fixture(async code => { if (code === 'A') await wait.promise; });
    playback.play('A'); await flush(); playback.stop(); playback.play('B');
    wait.resolve(); await flush();
    expect(runtime.stop).toHaveBeenCalledTimes(2);
    expect(runtime.play).toHaveBeenLastCalledWith('B');
    expect(playback.state).toMatchObject({ playing: true, activeCode: 'B', loading: false });
  });
  it('keeps last-good state after failure and recovers on the next edit', async () => {
    const { playback } = fixture(async code => { if (code === 'bad') throw new Error('bad pattern'); });
    playback.play('A'); await flush(); playback.update('bad'); await flush();
    expect(playback.state).toMatchObject({ playing: true, activeCode: 'A', error: 'bad pattern' });
    playback.update('C'); await flush();
    expect(playback.state).toMatchObject({ playing: true, activeCode: 'C', error: '' });
    expect(playback.cycle()).toBe(2.5);
  });
});

describe('sound browser runtime lifecycle', () => {
  it('shares initialization between sound browsing and transport play', async () => {
    const { runtime } = fixture(async () => {});
    runtime.sounds = () => [{ name: 'bd', type: 'sample', samples: 1 }];
    const factory = vi.fn(async () => runtime);
    const playback = new Playback(() => {}, factory);
    const sounds = playback.sounds(); playback.play('A');
    expect(await sounds).toHaveLength(1); await flush();
    expect(factory).toHaveBeenCalledOnce();
    expect(runtime.play).toHaveBeenCalledWith('A');
  });
  it('Stop cancels preview requested before initialization completes', async () => {
    const wait = deferred();
    const { runtime } = fixture(async () => {});
    runtime.preview = vi.fn(async () => {});
    const playback = new Playback(() => {}, async () => { await wait.promise; return runtime; });
    const preview = playback.preview('bd'); playback.stop(); wait.resolve();
    await preview;
    expect(runtime.preview).not.toHaveBeenCalled();
    expect(playback.state.playing).toBe(false);
  });
});

describe('output observation lifecycle', () => {
  it('keeps monitoring lazy and forwards events only while transport wants playback', async () => {
    const {runtime}=fixture(async () => {});
    let emit!:(event: import('./output').OutputEvent) => void;
    const unsubscribe=vi.fn(); runtime.onEvent=callback => {emit=callback;return unsubscribe;};
    runtime.releaseMonitor=vi.fn(); runtime.destroy=vi.fn();
    const factory=vi.fn(async () => runtime), playback=new Playback(() => {},factory), listener=vi.fn(), stopped=vi.fn();
    playback.onEvent(listener); playback.onStop(stopped); playback.monitor(); expect(factory).not.toHaveBeenCalled();
    playback.play('good'); await flush();
    const event={id:1,start:0,end:100,note:60,sound:'sine'};
    emit(event); expect(listener).toHaveBeenCalledWith(event);
    playback.stop(); expect(stopped).toHaveBeenCalledOnce(); emit(event); expect(listener).toHaveBeenCalledOnce();
    playback.releaseMonitor(); expect(runtime.releaseMonitor).toHaveBeenCalledOnce();
    playback.destroy(); expect(unsubscribe).toHaveBeenCalledOnce(); expect(runtime.destroy).toHaveBeenCalledOnce();
  });
});
