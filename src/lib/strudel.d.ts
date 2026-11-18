// The pinned @strudel/web package ships no TypeScript declarations.
// Keep this boundary restricted to the exports exercised by this spike.
declare module '@strudel/web' {
  export interface Repl {
    evaluate(code: string, autostart?: boolean): Promise<unknown>;
    stop(): void;
    state: { evalError?: Error; started: boolean };
    scheduler: { now(): number; cps: number };
  }
  export function initStrudel(options?: { prebake?: () => Promise<unknown>; onEvalError?: (error: Error) => void }): Promise<Repl>;
  export function initAudio(): Promise<void>;
  export function getAudioContext(): AudioContext;
  export function samples(url: string): Promise<unknown>;
}
