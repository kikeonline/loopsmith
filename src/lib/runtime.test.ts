import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { wrapRepl } from './runtime';
import type { Repl } from '@strudel/web';

describe('Strudel boundary', () => {
  it('surfaces errors that Strudel catches internally, then allows recovery', async () => {
    const state: Repl['state'] = { started: true };
    const evaluate = vi.fn(async (code: string) => {
      state.evalError = code === 'bad' ? new SyntaxError('Unexpected token') : undefined;
    });
    const repl: Repl = { evaluate, stop: vi.fn(), state, scheduler: { now: () => 3.25, cps: 0.5 } };
    const runtime = wrapRepl(repl);
    await expect(runtime.evaluate('bad')).rejects.toThrow('Unexpected token');
    await expect(runtime.evaluate('s("bd")')).resolves.toBeUndefined();
    expect(runtime.cycle()).toBe(3.25);
    runtime.stop();
    expect(repl.stop).toHaveBeenCalledOnce();
  });

  it('verifies the pinned browser bundle against the M0 API contract', () => {
    const output = execFileSync(process.execPath, ['scripts/verify-strudel.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(output).toContain('PASS:');
  });
});
