// Loaded only by Vite's e2e mode. Production builds remove the import branches.
import type { EditorView } from '@codemirror/view';
import type { LiveRuntime } from '../runtime';
export const probe = {
  plays: [] as string[], stops: 0, activeCode: '', started: false, delay: 0,
  editor: undefined as EditorView | undefined,
  previews: [] as string[], previewDelay: 0
};
declare global { interface Window { __loopsmithTest: typeof probe } }
export function connectEditor(editor: EditorView) { probe.editor = editor; window.__loopsmithTest = probe; }
export async function createFakeRuntime(): Promise<LiveRuntime> {
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
  return { play, evaluate: play, stop() { previewRevision++; probe.stops++; probe.started = false; }, cycle: () => probe.started ? (performance.now() - startedAt) / 2000 : 0, onError(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    sounds: () => [...['bd','sd','hh','cp'].map(name => ({ name, type: 'sample', samples: 3 })), ...['sine','sawtooth','broken'].map(name => ({ name, type: 'synth', samples: 0 })), ...(probe.activeCode.includes('samples(') ? [{ name: 'custom_kick', type: 'sample', samples: 1 }] : [])],
    async preview(name) { const request = ++previewRevision; if (probe.previewDelay) await new Promise(resolve => setTimeout(resolve, probe.previewDelay)); if (request !== previewRevision) return; if (name === 'broken') throw new Error('Preview failed to load'); probe.previews.push(name); },
    stopPreview() { previewRevision++; }
  };
}
