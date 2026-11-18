// Exercise the exact browser bundle in Node without creating audio.
import assert from 'node:assert/strict';
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
const api = await import('../node_modules/@strudel/web/dist/index.mjs');
await api.evalScope(api);
let lastError;
const repl = api.repl({
  defaultOutput: () => {}, getTime: () => 0,
  transpiler: api.transpiler,
  onEvalError: (error) => { lastError = error; }
});
const query = (p, from = 0, to = 1) => p.queryArc(from, to).map(h => h.value.s);
const evaluate = async (code) => {
  lastError = undefined;
  const pattern = await repl.evaluate(code, false);
  assert.equal(lastError, undefined, `evaluation failed: ${code}`);
  return pattern;
};

assert.deepEqual(query(await evaluate('s("bd sd cp hh")')), ['bd', 'sd', 'cp', 'hh']);
assert.deepEqual(query(await evaluate('drums: s("bd"); hats: s("hh")')), ['bd', 'hh']);
assert.deepEqual(query(await evaluate('$: s("bd"); $: s("hh")')), ['bd', 'hh']);
assert.deepEqual(query(await evaluate('_drums: s("bd"); hats: s("hh")')), ['hh']);
assert.deepEqual(query(await evaluate('drums_: s("bd"); hats: s("hh")')), ['hh']);
assert.deepEqual(query(await evaluate('drums: s("bd"); Shats: s("hh")')), ['hh']);
assert.deepEqual(query(await evaluate('Sdrums: s("bd"); Shats: s("hh"); bass: s("sine")')), ['bd', 'hh']);
assert.deepEqual(query(await evaluate('_Sdrums: s("bd"); hats: s("hh")')), ['hh']);
await evaluate('setcps(0.75); s("bd")');
assert.equal(repl.scheduler.cps, 0.75);
await evaluate('setcpm(30); s("bd")');
assert.equal(repl.scheduler.cps, 0.5);
const good = await evaluate('s("bd sd")');
const goodCode = repl.state.activeCode;
await repl.evaluate('s(', false);
assert.ok(lastError);
assert.equal(repl.state.pattern, good);
assert.equal(repl.state.activeCode, goodCode);
await repl.evaluate('s("hh").missingMethod()', false);
assert.ok(lastError);
assert.equal(repl.state.pattern, good);
assert.deepEqual(query(await evaluate('s("cp")')), ['cp']);
assert.equal(repl.scheduler.pattern, repl.state.pattern);

const controls = { gain: 0.5, pan: 0.25, lpf: 800, hpf: 200, room: 0.3, delay: 0.2, delaytime: 0.125, delayfeedback: 0.3, attack: 0.01, release: 0.2, speed: 0.8 };
for (const [name, value] of Object.entries(controls)) {
  const pattern = await evaluate(`s("bd").${name}(${value})`);
  assert.equal(pattern.queryArc(0, 1)[0].value[({ lpf: 'cutoff', hpf: 'hcutoff' })[name] || name], value, name);
}
for (const name of ['fast', 'slow', 'rev', 'every', 'scale', 'note', 'n', 'onTrigger']) {
  assert.equal(typeof api.Pattern.prototype[name], 'function', name);
}
const arranged = await evaluate('arrange([2, s("bd")], [1, s("hh")])');
assert.deepEqual(query(arranged, 0, 3), ['bd', 'bd', 'hh']);
assert.deepEqual(query(arranged, 3, 6), ['bd', 'bd', 'hh']);
const alternating = await evaluate('s("<bd hh>")');
assert.deepEqual(query(alternating, 0, 2), ['bd', 'hh']);
const located = await evaluate('s("bd sd")');
assert.ok(repl.state.miniLocations.length >= 2);
assert.ok(located.queryArc(0, 1)[0].context.locations.length);
assert.equal(typeof api.soundMap.get, 'function');
assert.equal(typeof api.samples, 'function');
assert.equal(typeof api.superdough, 'function');
console.log('PASS: sources, labels, mute, solo, tempo, error recovery, controls, arrangement, locations, registry APIs');
