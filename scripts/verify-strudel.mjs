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
assert.equal(typeof api.getSampleBuffer, 'function');
const song = await evaluate('drums:s("bd ~ bd ~"); hats:s("hh hh hh hh"); bass:note("c3 ~ eb3 ~").s("sawtooth"); lead:n("0 5 2 ~").scale("D:dorian").s("sine");');
const events = song.queryArc(0, 1).map(h => h.value);
assert.equal(events.filter(h => h.s === 'bd').length, 2);
assert.equal(events.filter(h => h.s === 'hh').length, 4);
assert.deepEqual(events.filter(h => h.s === 'sawtooth').map(h => h.note), ['c3', 'eb3']);
assert.deepEqual(events.filter(h => h.s === 'sine').map(h => h.note), ['D3', 'B3', 'F3']);
console.log('PASS: sources, labels, mute, solo, tempo, error recovery, controls, arrangement, locations, registry APIs');

// Optional caller-supplied template programs are queried without audio or network.
if (process.argv[2]) {
  const templates = JSON.parse(process.argv[2]);
  for (const { id, code } of templates) {
    const pattern = await evaluate(code);
    assert.ok(pattern.queryArc(0, 2).length > 0, `${id}: template must emit events`);
  }
  console.log(`PASS: ${templates.length} exported starter templates evaluate in the pinned Strudel bundle`);
}

// Modifier timing/order probes use the exact installed web bundle and eight cycles.
const onsets = (pattern, cycle) => pattern.queryArc(cycle, cycle + 1).filter(h => h.hasOnset()).sort((a, b) => Number(a.whole.begin) - Number(b.whole.begin)).map(h => h.value.s);
const baseSounds = ['bd', 'sd', 'cp', 'hh'];
const fastPattern = await evaluate('s("bd sd cp hh").fast(2)');
const slowPattern = await evaluate('s("bd sd cp hh").slow(2)');
const reversePattern = await evaluate('s("bd sd cp hh").rev()');
const everyReverse = await evaluate('s("bd sd cp hh").every(3, p => p.rev())');
const everyFast = await evaluate('s("bd sd cp hh").every(3, p => p.fast(2))');
const everySlow = await evaluate('s("bd sd cp hh").every(3, p => p.slow(2))');
for (let cycle = 0; cycle < 8; cycle++) {
  assert.deepEqual(onsets(fastPattern, cycle), [...baseSounds, ...baseSounds]);
  const timed = fastPattern.queryArc(cycle, cycle + 1).filter(h => h.hasOnset()).sort((a, b) => Number(a.whole.begin) - Number(b.whole.begin));
  assert.deepEqual(timed.map(h => Number(h.whole.begin)), Array.from({ length: 8 }, (_, i) => cycle + i / 8));
  assert.ok(timed.every(h => Number(h.whole.end.sub(h.whole.begin)) === 1 / 8));
  assert.deepEqual(onsets(slowPattern, cycle), cycle % 2 === 0 ? ['bd', 'sd'] : ['cp', 'hh']);
  assert.deepEqual(onsets(reversePattern, cycle), [...baseSounds].reverse());
  assert.deepEqual(onsets(everyReverse, cycle), cycle % 3 === 0 ? [...baseSounds].reverse() : baseSounds);
  assert.deepEqual(onsets(everyFast, cycle), cycle % 3 === 0 ? [...baseSounds, ...baseSounds] : baseSounds);
  assert.deepEqual(onsets(everySlow, cycle), cycle % 3 === 0 ? cycle % 2 === 0 ? ['bd', 'sd'] : ['cp', 'hh'] : baseSounds);
}
const slowThenReverse = await evaluate('s("bd sd cp hh").slow(2).rev()');
const reverseThenSlow = await evaluate('s("bd sd cp hh").rev().slow(2)');
assert.notDeepEqual(onsets(slowThenReverse, 0), onsets(reverseThenSlow, 0));
console.log('PASS: fast/slow/rev/every timing, first-cycle behavior, and noncommuting call order');

// Native arrange advances each section by its own duration on every repeat.
const phaseArrangement = await evaluate('arrange([1,s("<bd hh>")],[2,s("<cp sd>")])');
assert.deepEqual(Array.from({length:9},(_,cycle) => onsets(phaseArrangement,cycle)), [['bd'],['cp'],['sd'],['hh'],['cp'],['sd'],['bd'],['cp'],['sd']]);
const longFirst = await evaluate('arrange([2,s("<bd hh>")],[1,s("<cp sd>")])');
assert.deepEqual(Array.from({length:9},(_,cycle) => onsets(longFirst,cycle)), [['bd'],['hh'],['cp'],['bd'],['hh'],['sd'],['bd'],['hh'],['cp']]);
const innerTiming = await evaluate('arrange([1,s("bd sd").slow(2)],[2,s("cp hh").fast(2)])');
assert.deepEqual(Array.from({length:6},(_,cycle) => onsets(innerTiming,cycle)), [['bd'],['cp','hh','cp','hh'],['cp','hh','cp','hh'],['sd'],['cp','hh','cp','hh'],['cp','hh','cp','hh']]);
const restArrangement = await evaluate('arrange([1,s("bd")],[2,s("~")]).gain(0.25)');
assert.deepEqual(Array.from({length:6},(_,cycle) => onsets(restArrangement,cycle)), [['bd'],[],[],['bd'],[],[]]);
assert.equal(restArrangement.queryArc(0,1)[0].value.gain,0.25);
console.log('PASS: arrangement section boundaries, advancing alternation phase, inner modifiers, rests, and shared effects');
