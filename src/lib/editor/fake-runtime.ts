// Loaded only by Vite's e2e mode. Production builds remove the import branches.
import type { EditorView } from '@codemirror/view';
import type { OutputEvent } from './output';
import type { LiveRuntime } from '../runtime';
export const probe = {
  plays: [] as string[], stops: 0, activeCode: '', started: false, delay: 0,
  editor: undefined as EditorView | undefined,
  previews: [] as string[], previewDelay: 0, initializations: 0, monitorReleases: 0,
  emitOutput: undefined as ((note: number | null, duration?: number) => void) | undefined
};
declare global { interface Window { __loopsmithTest: typeof probe } }
export function connectEditor(editor: EditorView) { probe.editor = editor; window.__loopsmithTest = probe; }
export async function createFakeRuntime(): Promise<LiveRuntime> {
  probe.initializations++;
  let events: OutputEvent[] = [];
  let sequence = 0;
  const eventListeners = new Set<(event: OutputEvent) => void>();
  probe.emitOutput = (note, duration = 500) => { if (!probe.started) return; const start = performance.now()+30; const event = {id:++sequence,note,start,end:start+duration,sound:note === null ? 'bd' : 'sine'}; events.push(event); eventListeners.forEach(listener => listener(event)); };
  const listeners = new Set<(error: Error) => void>();
  let startedAt = 0;
  let previewRevision = 0;
  const play = async (code: string) => {
    probe.plays.push(code);
    if (probe.delay) await new Promise(resolve => setTimeout(resolve, probe.delay));
    if (code.includes('fake-evaluation-error')) {
      const error = new Error('Fake evaluation error');
      listeners.forEach(listener => listener(error)); throw error;
    }
    if (!probe.started) startedAt = performance.now();
    probe.activeCode = code; probe.started = true;
  };
  return { onEvent(callback) { eventListeners.add(callback); return () => { eventListeners.delete(callback); }; },
    monitor() { const now = performance.now(); events = events.filter(event => event.end >= now-4000).slice(-256); return {now,events:[...events],waveform:Array.from({length:64},(_,index) => Math.sin(index/3)*0.2)}; },
    releaseMonitor() { probe.monitorReleases++; },
    destroy() { eventListeners.clear(); probe.emitOutput = undefined; },
    play, evaluate: play, stop() { events = []; previewRevision++; probe.stops++; probe.started = false; }, cycle: () => probe.started ? (performance.now() - startedAt) / 2000 : 0, onError(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    sounds: () => [...['bd','sd','hh','cp'].map(name => ({ name, type: 'sample', samples: 3 })), ...['sine','sawtooth','broken'].map(name => ({ name, type: 'synth', samples: 0 })), ...(probe.activeCode.includes('samples(') ? [{ name: 'custom_kick', type: 'sample', samples: 1 }] : [])],
    async preview(name) { const request = ++previewRevision; if (probe.previewDelay) await new Promise(resolve => setTimeout(resolve, probe.previewDelay)); if (request !== previewRevision) return; if (name === 'broken') throw new Error('Preview failed to load'); probe.previews.push(name); },
    stopPreview() { previewRevision++; }
  };
}
