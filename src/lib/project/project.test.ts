import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parse } from 'acorn';
import { parseDocument, generateProject, parseMini, emitMini, noteEvents, setEffect, setPattern, setTrackFlags, applyEdits, ProjectSession, formatNumber, trackLabel, bpmToCps, cpsToBpm, bpmToCpm, type Project, type Track, type MiniPattern, type MiniNode } from './index';
import corpus from './fixtures/corpus.json';

function document(code: string) {
  const result = parseDocument(code);
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}
const tracks = (p: Project) => p.items.filter((i): i is Track => i.kind === 'track');
const track = (code: string) => tracks(document(code).project)[0];

describe('golden corpus and preservation', () => {
  it.each(corpus)('$name', fixture => {
    const result = parseDocument(fixture.code);
    expect(result.ok).toBe(fixture.valid);
    if (!result.ok) { expect(result.error.line).toBeGreaterThan(0); return; }
    expect(result.document.code).toBe(fixture.code);
    expect(tracks(result.document.project)).toHaveLength(fixture.tracks);
    if (fixture.rawTracks !== undefined) expect(tracks(result.document.project).filter(t => t.source.kind === 'raw')).toHaveLength(fixture.rawTracks);
    if (fixture.opaqueCalls !== undefined) expect(tracks(result.document.project).flatMap(t => t.calls).filter(c => c.kind === 'opaque')).toHaveLength(fixture.opaqueCalls);
    const generated = generateProject(result.document.project);
    expect(document(generated).project).toEqual(result.document.project);
    expect(generateProject(document(generated).project)).toBe(generated);
  });

  it('recognizes literal sources, scale/instrument controls, numbers and expressions explicitly', () => {
    const t = track('lead: n("0 2 ~ 4").scale("C:minor").s("sawtooth").gain(0.6).lpf(sine.range(200,800))');
    expect(t.source).toEqual({ kind: 'notes', mode: 'n', pattern: { kind: 'mini', rows: [[{ kind: 'atom', value: '0' }, { kind: 'atom', value: '2' }, { kind: 'rest' }, { kind: 'atom', value: '4' }]] } });
    expect(t.calls).toEqual([
      { kind: 'control', name: 'scale', value: 'C:minor' },
      { kind: 'control', name: 's', value: 'sawtooth' },
      { kind: 'effect', name: 'gain', value: { kind: 'number', value: 0.6 } },
      { kind: 'effect', name: 'lpf', value: { kind: 'expression', code: 'sine.range(200,800)' } }
    ]);
  });

  it('I3 edits only the selected argument and retains unknown calls, comments, raw blocks, and CRLF', () => {
    const code = '// coastline-style custom code\r\nconst sea = sine.range(100,800);\r\nawait samples("github:user/samples");\r\ndrums: s("bd ~ sd ~") /* keep */ .jux( rev ) .gain( 0.5 )\r\nlead: stack(note("c3"),note("g3")).room(.2);\r\n// end\r\n';
    const doc = document(code);
    const first = tracks(doc.project)[0];
    const next = setEffect(doc, first.id, 'gain', 0.75);
    expect(next.code).toBe(code.replace('0.5', '0.75'));
    expect(next.tracks[first.id].calls[1].argument).toEqual({ from: next.code.indexOf('0.75'), to: next.code.indexOf('0.75') + 4 });
    expect(doc.code).toBe(code);
  });

  it('requires explicit replacement of opaque expressions and mini notation', () => {
    const doc = document('drums: s("bd(3,8)").gain(sine.range(.2, .8))');
    const id = tracks(doc.project)[0].id;
    expect(() => setEffect(doc, id, 'gain', 0.4)).toThrow('explicitly replace');
    const replaced = setEffect(doc, id, 'gain', 0.4, true);
    expect(replaced.code).toBe('drums: s("bd(3,8)").gain(0.4)');
    expect(() => setPattern(doc, id, parseMini('bd ~'))).toThrow('explicitly replace');
    expect(setPattern(doc, id, parseMini('bd ~'), true).code).toBe('drums: s("bd ~").gain(sine.range(.2, .8))');
  });

  it('retains every chain position including duplicate effects, aliases, and opaque multi-argument calls', () => {
    const code = 'drums: s("bd").gain(.2).jux(rev).cutoff(400).gain(.7).delay(.2,.1,.5)';
    const doc = document(code);
    const id = tracks(doc.project)[0].id;
    expect(setEffect(doc, id, 'gain', 0.8).code).toBe(code.replace('.7', '0.8'));
    expect(setEffect(doc, id, 'lpf', 500).code).toBe(code.replace('400', '500'));
    const emitted = generateProject(doc.project);
    expect(emitted.indexOf('.gain(0.2)')).toBeLessThan(emitted.indexOf('.jux(rev)'));
    expect(emitted.indexOf('.jux(rev)')).toBeLessThan(emitted.indexOf('.lpf(400)'));
    expect(emitted).toContain('.delay(.2,.1,.5)');
  });

  it('preserves raw track expressions under native mute and solo edits', () => {
    const doc = document('ocean: stack(s("bd"),note("c3")).jux(rev);');
    const t = tracks(doc.project)[0];
    const muted = setTrackFlags(doc, t.id, { muted: true, solo: true });
    expect(muted.code).toBe('_Socean: stack(s("bd"),note("c3")).jux(rev);');
    expect(tracks(muted.project)[0]).toMatchObject({ id: t.id, muted: true, solo: true });
    expect(setTrackFlags(muted, t.id, { muted: false, solo: false }).code).toBe(doc.code);
    expect(() => setEffect(doc, t.id, 'gain', 1)).toThrow('code-only');
  });

  it('I4 retains last good document by identity and useful source locations on invalid edits', () => {
    const session = new ProjectSession('drums: s("bd")');
    const good = session.document;
    const result = session.update('drums: s("bd")\n.gain(');
    expect(result).toMatchObject({ ok: false, document: good, error: { line: 2, column: 6 } });
    expect(session.document).toBe(good);
    expect(result.document).toBe(good);
    expect(session.update('drums: s("bd sd")').ok).toBe(true);
    expect(tracks(session.document.project)[0].id).toBe(tracks(good.project)[0].id);
    expect(parseDocument('bad(')).not.toHaveProperty('document');
  });

  it('I5 retains identities through parameter edits, label rename, insertion, deletion, reorder, and duplicate labels', () => {
    const session = new ProjectSession('drums: s("bd"); hats: s("hh")');
    const [drums, hats] = tracks(session.document.project);
    session.update('hats: s("hh"); renamed: s("bd")');
    expect(tracks(session.document.project).map(t => t.id)).toEqual([hats.id, drums.id]);
    session.update('newTrack: note("c3"); hats: s("hh").gain(.5); renamed: s("bd sd")');
    expect(tracks(session.document.project).slice(1).map(t => t.id)).toEqual([hats.id, drums.id]);
    session.update('renamed: s("bd sd")');
    expect(tracks(session.document.project)[0].id).toBe(drums.id);
    const duplicates = new ProjectSession('x: s("bd"); x: s("sd")');
    const ids = tracks(duplicates.document.project).map(t => t.id);
    expect(new Set(ids).size).toBe(2);
    expect(duplicates.document.warnings).toHaveLength(1);
    duplicates.update('x: s("bd").gain(.3); x: s("sd")');
    expect(tracks(duplicates.document.project).map(t => t.id)).toEqual(ids);
  });

  it('keeps anonymous IDs stable on insertion and detects duplicate metadata IDs', () => {
    const session = new ProjectSession('$: s("bd"); $: s("hh")');
    const ids = tracks(session.document.project).map(t => t.id);
    session.update('$: note("c3"); $: s("bd"); $: s("hh")');
    expect(tracks(session.document.project).slice(1).map(t => t.id)).toEqual(ids);
    const meta = '// @loopsmith-track/v1 {"id":"same","name":"Name"}\n';
    const doc = document(`${meta}a: s("bd");\n${meta}b: s("hh")`);
    expect(new Set(tracks(doc.project).map(t => t.id)).size).toBe(2);
    expect(doc.warnings[0].message).toContain('Duplicate metadata');
  });

  it('rejects overlapping/broken edits atomically', () => {
    const doc = document('s("bd")');
    expect(() => applyEdits(doc, [{ from: 0, to: 3, insert: 's(' }, { from: 2, to: 4, insert: '' }])).toThrow('overlapping');
    expect(() => applyEdits(doc, [{ from: 0, to: 1, insert: ')' }])).toThrow('rejected');
    expect(doc.code).toBe('s("bd")');
  });
});

describe('model precision and mini notation', () => {
  it.each(['bd ~ sd ~', '[bd sd] hh', 'bd*4', '<bd sd>', 'bd@3 sd', 'bd!3 sd', 'bd:3 hh:1', '[c3 e3, g3 b3]', '[bd [hh*2 sd]] <cp hh>', 'c#3 -2 0.25'])('exact structure: %s', code => {
    const mini = parseMini(code);
    expect(mini.kind).toBe('mini');
    expect(parseMini(emitMini(mini))).toEqual(mini);
  });
  it.each(['bd(3,8)', '{bd sd, hh*3}', 'bd?', 'bd | sd', '1..8', '<bd hh, cp>', 'bd*2!3', 'bd*0.5', '_', '[bd', 'bd]','', 'bd:03'])('opaque fallback: %s', code => {
    expect(parseMini(code)).toEqual({ kind: 'opaque', code });
    expect(emitMini(parseMini(code))).toBe(code);
  });
  it('uses rational flat note events and refuses to flatten variable timing', () => {
    expect(noteEvents(parseMini('c3 ~ e3, g3 b3'))).toEqual([
      { note: 'c3', row: 0, start: { numerator: 0, denominator: 3 }, duration: { numerator: 1, denominator: 3 } },
      { note: 'e3', row: 0, start: { numerator: 2, denominator: 3 }, duration: { numerator: 1, denominator: 3 } },
      { note: 'g3', row: 1, start: { numerator: 0, denominator: 2 }, duration: { numerator: 1, denominator: 2 } },
      { note: 'b3', row: 1, start: { numerator: 1, denominator: 2 }, duration: { numerator: 1, denominator: 2 } }
    ]);
    expect(noteEvents(parseMini('c3 [e3 g3]'))).toBeNull();
    expect(noteEvents(parseMini('<c3 e3>'))).toBeNull();
  });
  it('bounds numeric precision and tempo math without silent rounding', () => {
    expect(formatNumber(-0.125)).toBe('-0.125');
    for (const n of [0.0001, NaN, Infinity, -0, 1e10]) expect(() => formatNumber(n)).toThrow();
    expect(track('s("bd").gain(.12345)').calls[0]).toMatchObject({ value: { kind: 'expression', code: '.12345' } });
    expect(bpmToCps(120)).toBe(0.5);
    expect(cpsToBpm(0.5)).toBe(120);
    expect(bpmToCpm(120)).toBe(30);
  });
  it('preserves tempo statements in their original order and never evaluates expressions', () => {
    const code = 'const bpm = 128; setcpm(bpm/4); drums: s("bd"); setcps(0.5);';
    const doc = document(code);
    expect(doc.project.items.map(i => i.kind)).toEqual(['raw', 'tempo', 'track', 'tempo']);
    expect(doc.project.items[1]).toMatchObject({ value: { kind: 'expression', code: 'bpm/4' } });
    expect(generateProject(doc.project).indexOf('const bpm')).toBeLessThan(generateProject(doc.project).indexOf('setcpm'));
    expect(doc.tempos.map(t => code.slice(t.argument.from, t.argument.to))).toEqual(['bpm/4', '0.5']);
  });
  it('keeps raw tracks explicitly raw through generation, even for otherwise supported code', () => {
    const t = track('s("bd")');
    t.source = { kind: 'raw', code: 's("bd")' };
    expect(document(generateProject({ version: 1, items: [t] })).project.items[0]).toEqual(t);
  });
});

const atomArb: fc.Arbitrary<MiniNode> = fc.oneof(
  fc.constant({ kind: 'rest' as const }),
  fc.record({ kind: fc.constant('atom' as const), value: fc.constantFrom('bd', 'sd', 'hh', 'cp', 'c#3', 'e4', '-2'), sampleIndex: fc.nat(8) }),
  fc.record({ kind: fc.constant('atom' as const), value: fc.constantFrom('bd', 'sd', 'hh', 'c3', 'g3', '0') })
);
function miniNodeArb(depth: number): fc.Arbitrary<MiniNode> {
  if (!depth) return atomArb;
  return fc.oneof(atomArb,
    fc.record({ kind: fc.constant('group' as const), rows: fc.array(fc.array(miniNodeArb(depth - 1), { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 2 }) }),
    fc.record({ kind: fc.constant('alternate' as const), steps: fc.array(miniNodeArb(depth - 1), { minLength: 1, maxLength: 4 }) }),
    fc.record({ kind: fc.constant('modify' as const), operator: fc.constantFrom('*' as const, '@' as const, '!' as const), count: fc.integer({ min: 1, max: 8 }), node: atomArb })
  );
}
const miniArb: fc.Arbitrary<MiniPattern> = fc.record({ kind: fc.constant('mini' as const), rows: fc.array(fc.array(miniNodeArb(2), { minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 3 }) });
const parameterArb = fc.oneof(
  fc.integer({ min: -1000000, max: 1000000 }).map(value => ({ kind: 'number' as const, value: value / 1000 })),
  fc.constantFrom('sine.range(0, 1)', '(120 / 4)', '0.123456', 'foo /* retained */ + 1').map(code => ({ kind: 'expression' as const, code }))
);
const trackArb: fc.Arbitrary<Track> = fc.record({
  kind: fc.constant('track' as const), id: fc.uuid(), key: fc.constantFrom('drums', 'melody', '$', 'x$'), name: fc.string(), muted: fc.boolean(), solo: fc.boolean(),
  source: fc.oneof(
    miniArb.map(pattern => ({ kind: 'drums' as const, pattern })),
    fc.tuple(fc.constantFrom('note' as const, 'n' as const), miniArb).map(([mode, pattern]) => ({ kind: 'notes' as const, mode, pattern }))
  ),
  calls: fc.array(fc.oneof(
    fc.tuple(fc.constantFrom('gain' as const, 'pan' as const, 'lpf' as const), parameterArb).map(([name, value]) => ({ kind: 'effect' as const, name, value })),
    fc.constant({ kind: 'opaque' as const, code: '.jux( rev )' }),
    fc.constant({ kind: 'control' as const, name: 'scale' as const, value: 'C:minor' })
  ), { maxLength: 5 })
});

const completeTrackArb: fc.Arbitrary<Track> = fc.oneof(
  trackArb,
  trackArb.map(t => ({ ...t, calls: [], source: { kind: 'raw' as const, code: 'stack(s("bd"),note("c3")).jux(rev)' } })),
  trackArb.map(t => ({ ...t, source: { kind: 'drums' as const, pattern: { kind: 'opaque' as const, code: 'bd(3,8) hh?' } } }))
);

describe('property invariants', () => {
  it('I1 / I2: model → generate → parse equality and byte-stable generation', () => {
    fc.assert(fc.property(fc.uniqueArray(completeTrackArb, { selector: t => t.id, maxLength: 6 }), parameterArb, (items, value) => {
      const project: Project = { version: 1, items: [{ kind: 'raw', code: '// user header' }, { kind: 'tempo', unit: 'cpm', value }, ...items, { kind: 'raw', code: 'const untouched = [1, 2, 3];' }] };
      const code = generateProject(project);
      parse(code, { ecmaVersion: 'latest' });
      expect(document(code).project).toEqual(project);
      expect(generateProject(document(code).project)).toBe(code);
      expect(code).not.toContain('\r');
      for (const t of items) expect(trackLabel(t)).toMatch(/^_?S?(?:drums|melody|\$|x\$)$/);
    }), { numRuns: 500, seed: 81357 });
  });

  it('I3 / I5: arbitrary numeric edits retain unknown source bytes and identity', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1000 }), n => {
      const code = '// untouched\nconst custom = { x: 1 };\ndrums: s("bd sd").jux(rev).gain(.5).every(3, x => x.rev());\n// tail';
      const doc = document(code);
      const id = tracks(doc.project)[0].id;
      const next = setEffect(doc, id, 'gain', n / 1000);
      expect(next.code).toBe(code.replace('.5', String(n / 1000)));
      expect(tracks(next.project)[0].id).toBe(id);
    }), { numRuns: 100, seed: 4210 });
  });
});

describe('independent runtime semantics', () => {
  it('matches Strudel timing and native-code playback after generation', async () => {
    const { execFileSync } = await import('node:child_process');
    const minis = [
      'bd  ~ sd  ~', '[bd sd] hh', 'bd*4 hh', '<bd sd> hh', 'bd@3 sd', 'bd!3 sd', 'bd:3 sd:1',
      '[bd sd, hh*4] cp', 'bd sd, hh*8', '<[c3 e3] [g3 b3]>', '[[bd sd] cp] hh',
      '~!2 bd', '[bd sd]@3 hh', '[bd sd]!2 hh', '<bd hh>*2 sd', '<bd [sd cp]> hh',
      '0 2 4 -1', 'c#3 e3 g3', '[bd*2 hh!3] sd@2', '<[bd sd] hh> cp'
    ];
    const programs = [
      's("bd sd cp hh").gain(.5).jux(rev).pan(.3)',
      'setcpm(30); drums: s("bd"); hats: s("hh");',
      '_drums: s("bd"); Shats: s("hh");',
      'drums_: s("bd"); hats: s("hh");',
      '$: s("bd"); $: s("hh");',
      'x: s("bd"); x: s("sd");',
      'Slead: note("c3 ~ [e3 g3]").s("sine"); bass: note("c2");',
      'ocean: stack(s("bd"), note("c3")).jux(rev);',
      's("bd").cutoff(400).gain(.3).jux(rev).gain(.8)',
      'let x = .5; setcps(x); drums: s("bd").gain(x);',
      's("sd"); s("bd");',
      'drums: s("bd"); s("hh");',
      's("bd"); all(p => p.slow(2));',
      `s("bd").p('native');`,
      'const s = () => note("c3"); s("bd");'
    ];
    const output = execFileSync(process.execPath, ['scripts/verify-project-runtime.mjs'], {
      input: JSON.stringify({ miniPairs: minis.map(code => [code, emitMini(parseMini(code))]), programs: programs.map(code => [code, generateProject(document(code).project)]) }),
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    });
    expect(output).toContain('PASS: 20 mini timing comparisons and 15 native-code program comparisons');
  });

  it('preserves the attributed upstream coastline demo as code-only source', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/lib/project/fixtures/coastline.strudel', 'utf8');
    const doc = document(code);
    expect(doc.code).toBe(code);
    expect(doc.project.items.filter(i => i.kind === 'raw').some(i => i.code.startsWith('stack('))).toBe(true);
    expect(document(generateProject(doc.project)).project).toEqual(doc.project);
    const withTrack = document(`${code}\nextra: s("bd").gain(.5);`);
    const t = tracks(withTrack.project)[0];
    expect(setEffect(withTrack, t.id, 'gain', 0.6).code).toBe(`${code}\nextra: s("bd").gain(0.6);`);
  });
});

describe('explicit input/model golden fixtures', () => {
  it('matches independently authored model expectations', async () => {
    const { default: fixtures } = await import('./fixtures/golden.json');
    for (const fixture of fixtures) {
      expect(document(fixture.code).project, fixture.name).toEqual(fixture.project);
      expect(document(generateProject(fixture.project as Project)).project, fixture.name).toEqual(fixture.project);
    }
  });

  it('retains failed edits by document and model identity (I4)', () => {
    const session = new ProjectSession('drums: s("bd").gain(.5)');
    const original = session.document;
    const failed = session.update('drums: s(');
    expect(failed.ok).toBe(false);
    expect(failed.document).toBe(original);
    expect(session.document).toBe(original);
    expect(session.document.project).toBe(original.project);
    expect(session.update('drums: s("sd")').ok).toBe(true);
    expect(tracks(session.document.project)[0].id).toBe(tracks(original.project)[0].id);
  });

  it('rejects invalid canonical model states instead of silently changing their meaning', () => {
    const t = track('drums: s("bd")');
    expect(() => generateProject({ version: 1, items: [{ ...t, key: 'Sdrums', solo: false }] })).toThrow('not representable');
    expect(() => generateProject({ version: 1, items: [t, t] })).toThrow('unique');
    expect(() => generateProject({ version: 1, items: [{ kind: 'raw', code: 'const x=1; const y=2;' }] })).toThrow('one complete');
    expect(() => generateProject({ version: 1, items: [{ ...t, calls: [{ kind: 'effect', name: 'gain', value: { kind: 'expression', code: '0.5' } }] }] })).toThrow('not representable');
  });

  it('does not accidentally turn discarded bare expressions into stacked tracks', () => {
    const doc = document('s("sd"); s("bd");');
    expect(doc.project.items.map(i => i.kind)).toEqual(['raw', 'track']);
    expect(document('drums: s("bd"); s("hh");').project.items.map(i => i.kind)).toEqual(['track', 'raw']);
    expect(document('s("bd"); all(p => p.slow(2));').project.items.map(i => i.kind)).toEqual(['raw', 'raw']);
  });
});

describe('source and identity edge cases', () => {
  it('preserves comments inside tempo declarations and uses modern JavaScript parsing', () => {
    const doc = document('setcps(/* keep */ .5); const settings = { rate: 1 }; drums: s("bd").gain(settings?.rate ?? .5);');
    expect(doc.project.items[0]).toEqual({ kind: 'raw', code: 'setcps(/* keep */ .5);' });
    expect(document(generateProject(doc.project)).project).toEqual(doc.project);
  });
  it('preserves IDs across duplicate-label insertion, deletion, and reorder', () => {
    const session = new ProjectSession('x: s("bd"); x: s("sd")');
    const ids = tracks(session.document.project).map(t => t.id);
    session.update('x: s("cp"); x: s("bd"); x: s("sd")');
    expect(tracks(session.document.project).slice(1).map(t => t.id)).toEqual(ids);
    session.update('x: s("sd"); x: s("bd")');
    expect(tracks(session.document.project).map(t => t.id)).toEqual([...ids].reverse());
  });
  it('handles metadata IDs as data, including prototype-like strings', () => {
    const doc = document('// @loopsmith-track/v1 {"id":"__proto__","name":"Safe"}\na: s("bd").gain(.5)');
    expect(Object.getPrototypeOf(doc.tracks)).toBeNull();
    expect(setEffect(doc, '__proto__', 'gain', 0.7).code).toContain('.gain(0.7)');
  });
  it('keeps invalid metadata as raw source with a warning', () => {
    const code = '// @loopsmith-track/v1 {broken}\na: s("bd").gain(.5)';
    const doc = document(code);
    expect(doc.warnings[0].message).toContain('Invalid');
    expect(setEffect(doc, tracks(doc.project)[0].id, 'gain', 0.7).code).toBe(code.replace('.5', '0.7'));
  });
  it('does not reinterpret ambiguous native key prefixes when removing solo', () => {
    const doc = document('S_drums: s("bd")');
    expect(() => setTrackFlags(doc, tracks(doc.project)[0].id, { solo: false })).toThrow('explicit rename');
    expect(doc.code).toBe('S_drums: s("bd")');
  });
  it('never evaluates input during parsing', () => {
    const code = 'globalThis.__loopsmithParserExecuted = true; drums: s("bd");';
    document(code);
    expect(Object.hasOwn(globalThis, '__loopsmithParserExecuted')).toBe(false);
  });
  it('restores the last good model after a syntax error and keeps IDs on recovery', () => {
    const session = new ProjectSession('drums: s("bd")');
    const original = session.document;
    const result = session.update('drums: s(\n');
    expect(result.document).toBe(original);
    expect(session.document.project).toBe(original.project);
    expect(result.ok ? null : result.error).toMatchObject({ line: 2, column: 0 });
    session.update('beat: s("bd")');
    expect(tracks(session.document.project)[0]).toMatchObject({ id: tracks(original.project)[0].id, name: 'beat' });
  });
});

it('preserves raw comment whitespace and malformed/unused metadata on regeneration', () => {
  const code = '// retained spaces   \n// @loopsmith-track/v1 {broken}\ndrums: s("bd");\n// @loopsmith-project/v1';
  const doc = document(code);
  const generated = generateProject(doc.project);
  expect(generated).toContain('// retained spaces   \n');
  expect(generated).toContain('// @loopsmith-track/v1 {broken}');
  expect(document(generated).project).toEqual(doc.project);
});

it('round-trips metadata punctuation, Unicode, line separators, and arbitrary track names', async () => {
  const { createTrack } = await import('./model');
  const t = createTrack({ id: '🎵\n__proto__', name: 'Name "quoted"\nnew\u2028line\u2029*/', source: { kind: 'drums', pattern: parseMini('bd') } });
  const project: Project = { version: 1, items: [t] };
  expect(document(generateProject(project)).project).toEqual(project);
});

it('retains line comments before unknown chain methods', () => {
  const code = 'drums: s("bd") // comment\n  .jux( rev ).gain(.5);';
  const doc = document(code);
  expect(generateProject(doc.project)).toContain(' // comment\n  .jux( rev )');
  expect(setEffect(doc, tracks(doc.project)[0].id, 'gain', 0.6).code).toBe(code.replace('.5', '0.6'));
  expect(noteEvents(parseMini('c3:2'))).toBeNull();
});

it('leaves explicit native registration and shadowed constructors code-only', () => {
  for (const code of [`s("bd").p('native');`, 'const s = () => note("c3"); s("bd");', 'const { note } = custom; lead: note("c3");']) {
    const doc = document(code);
    expect(tracks(doc.project).every(t => t.source.kind === 'raw')).toBe(true);
    expect(document(generateProject(doc.project)).project).toEqual(doc.project);
  }
});
