// The pinned @strudel/web package ships no TypeScript declarations.
// Keep this boundary restricted to the exports exercised by this spike.
declare module '@strudel/web' {
  export interface ScheduledHap { value: unknown; whole?: { begin: { valueOf(): number } }; ensureObjectValue(): void }
  export type Output = (hap: ScheduledHap, deadline: number, duration: number, cps: number, time: number) => unknown;
  export const webaudioOutput: Output;
  export function valueToMidi(value: Record<string, unknown>): number;
  export function getSuperdoughAudioController(): { output: { destinationGain: AudioNode | null } };
  export interface Repl {
    evaluate(code: string, autostart?: boolean): Promise<unknown>;
    stop(): void;
    state: { evalError?: Error; started: boolean };
    scheduler: { now(): number; cps: number };
  }
  export function initStrudel(options?: { prebake?: () => Promise<unknown>; defaultOutput?: Output; onEvalError?: (error: Error) => void }): Promise<Repl>;
  export function initAudio(): Promise<void>;
  export function getAudioContext(): AudioContext;
  export function samples(url: string): Promise<unknown>;
  export interface SoundEntry {
    data?: { type?: string; samples?: unknown };
    onTrigger(time: number, value: Record<string, string | number>, onEnded: () => void, cps: number): Promise<{ node: AudioNode; stop?: (time: number) => void } | undefined>;
  }
  export const soundMap: { get(): Record<string, SoundEntry> };
  export function getSampleBuffer(value: Record<string, string | number>, bank: unknown): Promise<unknown>;
}
