// Differential M1 checks against the exact pinned Strudel browser bundle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
const api = await import('../node_modules/@strudel/web/dist/index.mjs');
await api.evalScope(api);
const { miniPairs, programs } = JSON.parse(fs.readFileSync(0, 'utf8'));
const events = pattern => pattern.queryArc(0, 8).map(hap => ({
  value: hap.value,
  begin: hap.whole?.begin.toString(), end: hap.whole?.end.toString(),
  partBegin: hap.part.begin.toString(), partEnd: hap.part.end.toString()
}));
for (const [original, emitted] of miniPairs) {
  assert.deepEqual(events(api.m(emitted)), events(api.m(original)), original);
}
const repl = api.repl({ defaultOutput: () => {}, getTime: () => 0, transpiler: api.transpiler });
for (const [original, emitted] of programs) {
  const before = await repl.evaluate(original, false);
  assert.equal(repl.state.evalError, undefined, original);
  const expected = events(before);
  const cps = repl.scheduler.cps;
  const after = await repl.evaluate(emitted, false);
  assert.equal(repl.state.evalError, undefined, emitted);
  assert.deepEqual(events(after), expected, original);
  assert.equal(repl.scheduler.cps, cps);
}
console.log(`PASS: ${miniPairs.length} mini timing comparisons and ${programs.length} native-code program comparisons`);
