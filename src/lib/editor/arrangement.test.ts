import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument, setEffect, type ParsedDocument, type Track } from '../project';
import { createArrangement, readArrangement, sectionProxy, outerProxy, setSectionCycles, renameSection, addSection, moveSection, removeSection, flattenSection, editSection, editArrangementEffects, arrangementPosition } from './arrangement';
import { changeStep } from './visual';
import { convertToRaw, renameTrack, duplicateTrack } from './composition';
import { modifierView, setModifierNumber, moveModifier } from './modifiers';
import { projectFile, readProjectFile, serializeProject } from '../persistence/project-file';
const parse = (code: string, previous?: ParsedDocument) => { const result = parseDocument(code, previous); if (!result.ok) throw new Error(result.error.message); return result.document; };
const track = (d: ParsedDocument) => d.project.items.find((x): x is Track => x.kind === 'track')!;
const view = (d: ParsedDocument) => readArrangement(d, track(d).id)!;
const ref = (d: ParsedDocument, i = 0) => view(d).sections[i].reference;

describe('source-preserving native arrangements', () => {
  it('validates the populated arrangement accessibility fixture', () => {
    const restored = readProjectFile(readFileSync('src/lib/project/fixtures/arrangement.loopsmith.json','utf8'));
    expect(view(restored.document).sections).toHaveLength(2);
    expect(view(restored.document).sections[1].cycles.value).toBeNull();
  });
  it('keeps operator precedence when flattening a custom section', () => {
    const d = parse('drums: arrange([1,a + b],[2,s("bd")]).gain(0.5)');
    expect(flattenSection(d,ref(d)).code).toBe('drums: (a + b).gain(0.5)');
  });
  it('wraps a complete visual expression while retaining track identity, flags and unrelated bytes', () => {
    const source = '// preamble\r\nsetcpm(30);\r\nSdrums: s("bd ~").fast(2).gain(0.7); // tail\r\n';
    const document = parse(source), id = track(document).id;
    const next = createArrangement(document, id, 'intro');
    expect(track(next)).toMatchObject({id,solo:true});
    expect(view(next).sections[0]).toMatchObject({id:'intro',cycles:{value:4},patternCode:'s("bd ~").fast(2).gain(0.7)'});
    expect(next.code.startsWith('// preamble\r\nsetcpm(30);\r\nSdrums: ')).toBe(true);
    expect(next.code.endsWith('; // tail\r\n')).toBe(true);
  });
  it('registers a bare expression before wrapping and persists through v1 JSON', () => {
    const document = parse('s("bd sd")');
    const next = createArrangement(document,track(document).id,'a');
    expect(view(next)).toBeDefined();
    const restored = readProjectFile(serializeProject(projectFile('Song',next.code,next)));
    expect(view(restored.document).sections[0].id).toBe('a');
    expect(restored.document.code).toBe(next.code);
  });
  it('pins imported section identities and changes only requested cycle/name fields', () => {
    const d = parse('drums: arrange([2, s("bd")], /* keep */ [3, note("c3").s("sine")]).gain(amount);');
    const reference = ref(d), renamed = renameSection(d,reference,'Intro');
    const changed = setSectionCycles(renamed,reference,5);
    expect(view(changed).sections[0]).toMatchObject({id:reference.id,name:'Intro',cycles:{value:5}});
    expect(changed.code).toContain('/* keep */ [3, note("c3").s("sine")]).gain(amount)');
    expect(() => setSectionCycles(changed,reference,0)).toThrow('1 to 1024');
  });
  it('keeps custom duration expressions until explicit replacement', () => {
    const d = parse('drums: arrange([bars * 2, custom(foo)], [1/2, s("hh")])');
    expect(view(d).totalCycles).toBeNull();
    expect(sectionProxy(d,track(d).id,ref(d).id).track.source.kind).toBe('raw');
    expect(() => setSectionCycles(d,ref(d),4)).toThrow('read-only');
    expect(setSectionCycles(d,ref(d),4,true).code).toContain('[4, custom(foo)]');
  });
  it('duplicates exact custom patterns and appends rests around trailing comments/commas', () => {
    for (const ending of [' // tail, comma\n', ', /* tail, */']) {
      const d = parse(`drums: arrange([2, custom(foo)]${ending})`);
      const copied = addSection(d,track(d).id,'copy',ref(d));
      expect(view(copied).sections.map(s => s.patternCode)).toEqual(['custom(foo)','custom(foo)']);
      expect(copied.code).toContain(ending);
      const rest = addSection(copied,track(d).id,'rest');
      expect(view(rest).sections[2].patternCode).toBe('s("~")');
    }
  });
  it('moves identical imports by stable identity and removes only owned bytes and separator', () => {
    const d = parse('drums: arrange([2,s("bd")], /* between, keep */ [2,s("bd")], [1,s("hh")],)');
    const reference = ref(d,1);
    const moved = moveSection(d,reference,-1);
    expect(view(moved).sections[0].id).toBe(reference.id);
    expect(moved.code).toContain('/* between, keep */');
    const removed = removeSection(moved,reference);
    expect(view(removed).sections).toHaveLength(2);
    expect(removed.code).toContain('/* between, keep */');
    expect(() => renameSection(removed,reference,'Wrong')).toThrow('removed');
  });
  it('rejects ambiguous stale imports instead of retargeting duplicates after typing', () => {
    const d = parse('drums: arrange([2,s("bd")], [2,s("bd")])');
    const typed = parse('drums: arrange([2,s("bd")], [3,s("bd")])', d);
    expect(() => renameSection(typed,ref(d,1),'Wrong')).toThrow('changed');
  });
  it('edits nested steps/effects while preserving other sections and the outer chain', () => {
    const d = parse('// keep\ndrums: arrange([2,s("bd ~").gain(0.2)], [3,note("c3 ~").s("sine")]).jux(rev).gain(0.5);');
    const reference = ref(d), proxy = sectionProxy(d,track(d).id,reference.id);
    let next = editSection(d,reference,p => changeStep(p,proxy.track.id,0,1));
    next = editSection(next,reference,p => setEffect(p,proxy.track.id,'pan',0.2));
    expect(view(next).sections[0].patternCode).toBe('s("bd bd").gain(0.2).pan(0.2)');
    expect(view(next).sections[1].patternCode).toBe('note("c3 ~").s("sine")');
    expect(view(next).suffix).toBe('.jux(rev).gain(0.5)');
    const outer = outerProxy(next,track(d).id);
    next = editArrangementEffects(next,track(d).id,p => setEffect(p,outer.track.id,'gain',0.8));
    expect(view(next).suffix).toBe('.jux(rev).gain(0.8)');
    expect(next.code.startsWith('// keep\n')).toBe(true);
  });
  it('carries queued nested modifier references across section and whole-track edits', () => {
    const d = parse('drums: arrange([2,s("bd").fast(2).gain(0.5)], [1,s("hh")])');
    const reference = ref(d), p = sectionProxy(d,track(d).id,reference.id);
    const modifier = modifierView(p.track,0)!.reference;
    let next = editSection(d,reference,p => setModifierNumber(p,modifier,'factor',3));
    next = setSectionCycles(next,reference,4);
    next = editArrangementEffects(next,track(d).id,p => setEffect(p,`${track(d).id}/outer`,'gain',0.7));
    next = editSection(next,reference,p => moveModifier(p,modifier,1));
    expect(view(next).sections[0].patternCode).toBe('s("bd").gain(0.5).fast(3)');
  });
  it('keeps arrangements editable after track rename and duplication and respects explicit raw locks', () => {
    let d = parse('drums: arrange([2,s("bd")])');
    const id = track(d).id;
    d = renameTrack(d,id,'Song'); d = duplicateTrack(d,id,'copy');
    expect(readArrangement(d,id)).toBeDefined(); expect(readArrangement(d,'copy')).toBeDefined();
    expect(readArrangement(convertToRaw(d,id),id)).toBeUndefined();
  });
  it('rejects unsupported roots and shadowed helpers without rewriting them', () => {
    for (const code of ['const arrange = custom; drums: arrange([2,s("bd")])','drums: arrange(...parts)','drums: arrange([2,s("bd"),extra])','drums: arrange([2,s("bd")]).p("x")']) expect(view(parse(code))).toBeUndefined();
    const d = parse('const s = custom; drums: arrange([2,s("bd")])');
    expect(sectionProxy(d,track(d).id,ref(d).id).track.source.kind).toBe('raw');
    expect(() => addSection(d,track(d).id,'rest')).toThrow('shadowed');
  });
  it('uses section-local advancing phase across repeated arrangement loops', () => {
    const d = parse('drums: arrange([1,s("<bd hh>")],[2,s("<cp sd>")])');
    expect(Array.from({length:9},(_,c) => { const p = arrangementPosition(view(d),c)!; return [p.index,p.sourceCycle]; })).toEqual([[0,0],[1,0],[1,1],[0,1],[1,2],[1,3],[0,2],[1,4],[1,5]]);
    expect(arrangementPosition(view(d),-1)).toBeNull();
    expect(arrangementPosition(view(parse('drums: arrange([bars,s("bd")])')),0)).toBeNull();
  });
  it('explicitly flattens one section retaining shared effects and forbids removing the last section', () => {
    const d = parse('drums: arrange([1,s("bd")], [2,note("c3").s("sine")]).gain(0.5)');
    expect(flattenSection(d,ref(d,1)).code).toBe('drums: note("c3").s("sine").gain(0.5)');
    const one = removeSection(d,ref(d));
    expect(() => removeSection(one,ref(one))).toThrow('at least one');
  });
});
