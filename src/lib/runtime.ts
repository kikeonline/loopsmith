import { OutputHistory, type OutputEvent, type OutputSnapshot } from './editor/output';
import type { Repl } from '@strudel/web';

export interface Runtime {
  evaluate(code: string): Promise<void>;
  stop(): void;
  cycle(): number;
}
export interface LiveRuntime extends Runtime {
  play(code: string): Promise<void>;
  onEvent?(callback: (event: OutputEvent) => void): () => void;
  monitor?(): OutputSnapshot;
  releaseMonitor?(): void;
  destroy?(): void;
  onError(callback: (error: Error) => void): () => void;
  sounds?(): SoundInfo[];
  preview?(name: string): Promise<void>;
  stopPreview?(): void;
}
export interface SoundInfo { name: string; type: string; samples: number }

/** Called only by Play or a sound-browser gesture; importing the page creates no audio. */
export async function createRuntime(): Promise<LiveRuntime> {
  const api = await import('@strudel/web');
  // initStrudel's first-mousedown listener misses the click that loaded this module.
  // Explicitly initialize and resume here, including keyboard-generated clicks.
  const history = new OutputHistory();
  const context = api.getAudioContext();
  const ready = api.initStrudel({
    defaultOutput(hap, deadline, duration, cps, time) {
      hap.ensureObjectValue();
      try { history.record(hap, duration, time, context.currentTime, api.valueToMidi); } catch { /* Observation must not block audio. */ }
      return api.webaudioOutput(hap, deadline, duration, cps, time);
    },
    prebake: () => api.samples('github:tidalcycles/dirt-samples')
  });
  const [repl] = await Promise.all([ready, api.getAudioContext().resume(), api.initAudio()]);
  const runtime = wrapRepl(repl);
  let analyser: AnalyserNode | undefined;
  let tapped: AudioNode | undefined;
  let samples: Float32Array<ArrayBuffer> | undefined;
  function releaseMonitor() {
    if (tapped && analyser) { try { tapped.disconnect(analyser); } catch { /* Graph may have been reset by user code. */ } }
    analyser?.disconnect(); analyser = undefined; tapped = undefined; samples = undefined;
  }
  function monitor(): OutputSnapshot {
    const snapshot = history.snapshot();
    const node = api.getSuperdoughAudioController().output.destinationGain;
    if (node !== tapped) releaseMonitor();
    if (node && !analyser) {
      analyser = context.createAnalyser(); analyser.fftSize = 512;
      samples = new Float32Array(analyser.fftSize); node.connect(analyser); tapped = node;
    }
    if (analyser && samples) { analyser.getFloatTimeDomainData(samples); snapshot.waveform = Array.from(samples); }
    return snapshot;
  }
  let previewRevision = 0;
  let cancelPreview: (() => void) | undefined;
  const stopPreview = () => { previewRevision++; cancelPreview?.(); cancelPreview = undefined; };
  return {
    ...runtime,
    onEvent: callback => history.subscribe(callback),
    monitor, releaseMonitor,
    destroy() { stopPreview(); runtime.stop(); releaseMonitor(); history.clear(); },
    sounds: () => Object.entries(api.soundMap.get()).map(([name, entry]) => ({ name, type: entry.data?.type ?? 'synth', samples: Array.isArray(entry.data?.samples) ? entry.data.samples.length : 0 })).sort((a, b) => a.name.localeCompare(b.name)),
    stopPreview,
    stop() { stopPreview(); runtime.stop(); releaseMonitor(); history.clear(); },
    async preview(name) {
      stopPreview();
      const request = previewRevision;
      const entry = api.soundMap.get()[name];
      if (!entry) throw new Error(`Sound ${name} is not registered. Play custom sample declarations first.`);
      const context = api.getAudioContext();
      await context.resume();
      const value = { s: name, n: 0, freq: 261.625565, duration: 0.35, attack: 0.005, release: 0.05 };
      // Warm the same sample cache before choosing a trigger time, so a cold load cannot miss it.
      if (entry.data?.type === 'sample') await api.getSampleBuffer(value, entry.data.samples);
      if (request !== previewRevision) return;
      const output = context.createGain();
      output.gain.value = 0.2;
      output.connect(context.destination);
      try {
        const handle = await entry.onTrigger(context.currentTime + 0.05, value, () => output.disconnect(), 0.5);
        if (!handle?.node) throw new Error('This sound does not support audio preview');
        const cancel = () => { try { handle.stop?.(context.currentTime); } catch { /* An already-ended source may reject another stop. */ } finally { output.disconnect(); } };
        if (request !== previewRevision) { cancel(); return; }
        handle.node.connect(output);
        handle.stop?.(context.currentTime + 0.6);
        cancelPreview = cancel;
      } catch (error) { output.disconnect(); throw error; }
    }
  };
}

export function wrapRepl(repl: Repl): LiveRuntime {
  const listeners = new Set<(error: Error) => void>();
  const evaluate = async (code: string) => {
    try {
      await repl.evaluate(code);
      // Strudel catches evaluation errors rather than rejecting its promise.
      if (repl.state.evalError) throw repl.state.evalError;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      listeners.forEach(listener => listener(error));
      throw error;
    }
  };
  return {
    evaluate,
    play: evaluate,
    onError(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    stop: () => repl.stop(),
    cycle: () => repl.scheduler.now()
  };
}
