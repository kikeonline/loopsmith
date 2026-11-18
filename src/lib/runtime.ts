import type { Repl } from '@strudel/web';

export interface Runtime {
  evaluate(code: string): Promise<void>;
  stop(): void;
  cycle(): number;
}

/** Called only by the Play/Update user gesture; importing the page creates no audio. */
export async function createRuntime(): Promise<Runtime> {
  const api = await import('@strudel/web');
  // initStrudel's first-mousedown listener misses the click that loaded this module.
  // Explicitly initialize and resume here, including keyboard-generated clicks.
  const ready = api.initStrudel({
    prebake: () => api.samples('github:tidalcycles/dirt-samples')
  });
  const [repl] = await Promise.all([ready, api.getAudioContext().resume(), api.initAudio()]);
  return wrapRepl(repl);
}

export function wrapRepl(repl: Repl): Runtime {
  return {
    async evaluate(code) {
      await repl.evaluate(code);
      // Strudel catches evaluation errors rather than rejecting its promise.
      if (repl.state.evalError) throw repl.state.evalError;
    },
    stop: () => repl.stop(),
    cycle: () => repl.scheduler.now()
  };
}
