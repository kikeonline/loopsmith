import type { OutputEvent, OutputSnapshot } from './output';
import { createRuntime, type LiveRuntime } from '../runtime';
export interface PlaybackState { playing: boolean; loading: boolean; error: string; activeCode: string }

/** Evaluations are serialized. Stop invalidates work already waiting for audio or evaluation. */
export class Playback {
  state: PlaybackState = { playing: false, loading: false, error: '', activeCode: '' };
  private runtime?: LiveRuntime;
  private loadingRuntime?: Promise<LiveRuntime>;
  private disposed = false;
  private previewRevision = 0;
  private pending?: string;
  private running = false;
  private wanted = false;
  private revision = 0;
  private unsubscribe?: () => void;
  private unsubscribeEvents?: () => void;
  private eventListeners = new Set<(event: OutputEvent) => void>();
  private stopListeners = new Set<() => void>();
  onEvent(callback: (event: OutputEvent) => void) { this.eventListeners.add(callback); return () => { this.eventListeners.delete(callback); }; }
  onStop(callback: () => void) { this.stopListeners.add(callback); return () => { this.stopListeners.delete(callback); }; }
  monitor(): OutputSnapshot { return this.runtime?.monitor?.() ?? {now:performance.now(),events:[],waveform:[]}; }
  releaseMonitor() { this.runtime?.releaseMonitor?.(); }
  constructor(private changed: (state: PlaybackState) => void, private factory: () => Promise<LiveRuntime> = createRuntime) {}
  private notify() { this.changed({ ...this.state }); }
  private getRuntime(): Promise<LiveRuntime> {
    if (this.runtime) return Promise.resolve(this.runtime);
    return this.loadingRuntime ??= this.factory().then(runtime => {
      if (this.disposed) { runtime.stop(); runtime.destroy?.(); throw new Error('Editor is closed'); }
      this.runtime = runtime;
      this.unsubscribeEvents = runtime.onEvent?.(event => { if (this.wanted) for (const callback of this.eventListeners) callback(event); });
      this.unsubscribe = runtime.onError(error => { if (this.wanted) { this.state.error = error.message; this.notify(); } });
      return runtime;
    }).catch(error => { this.loadingRuntime = undefined; throw error; });
  }
  async sounds() { const runtime = await this.getRuntime(); if (!runtime.sounds) throw new Error('Sound browsing is unavailable'); return runtime.sounds(); }
  async preview(name: string) { const request = ++this.previewRevision; const runtime = await this.getRuntime(); if (request !== this.previewRevision) return; if (!runtime.preview) throw new Error('Preview is unavailable'); await runtime.preview(name); }
  stopPreview() { this.previewRevision++; this.runtime?.stopPreview?.(); }
  play(code: string) { this.wanted = true; this.pending = code; void this.drain(); }
  update(code: string) { if (this.wanted && (this.running || code !== this.state.activeCode)) { this.pending = code; void this.drain(); } }
  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.wanted && this.pending !== undefined) {
      const code = this.pending;
      this.pending = undefined;
      const request = this.revision;
      this.state.loading = true; this.state.error = ''; this.notify();
      try {
        this.runtime = await this.getRuntime();
        if (request !== this.revision) continue;
        await this.runtime.play(code);
        if (request !== this.revision) { this.runtime.stop(); continue; }
        this.state.activeCode = code;
        this.state.playing = true;
      } catch (cause) {
        if (request === this.revision) this.state.error = cause instanceof Error ? cause.message : String(cause);
      } finally {
        this.state.loading = false; this.notify();
      }
    }
    this.running = false;
  }
  cycle() { return this.runtime?.cycle() ?? 0; }
  stop() { this.revision++; this.stopPreview(); this.wanted = false; this.pending = undefined; this.runtime?.stop(); for (const callback of this.stopListeners) callback(); this.state.playing = false; this.state.loading = false; this.notify(); }
  destroy() { this.disposed = true; this.stop(); this.unsubscribe?.(); this.unsubscribeEvents?.(); this.runtime?.destroy?.(); this.eventListeners.clear(); this.stopListeners.clear(); }
}
