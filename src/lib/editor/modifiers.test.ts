import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument, setEffect, type ParsedDocument, type Track } from '../project';
import { convertToRaw } from './composition';
import { projectFile, readProjectFile, serializeProject } from '../persistence/project-file';
import { addModifier, carryModifierReferences, modifierIsCodeOnly, modifierView, moveModifier, removeModifier, setEveryTransform, setModifierNumber } from './modifiers';
const parse = (code: string, previous?: ParsedDocument) => { const result = parseDocument(code, previous); if (!result.ok) throw new Error(result.error.message); return result.document; };
const track = (document: ParsedDocument) => document.project.items.find((item): item is Track => item.kind === 'track')!;
const view = (document: ParsedDocument, index: number) => modifierView(track(document), index)!;

describe('source-preserving modifier controls', () => {
  it('validates the independently authored populated accessibility fixture', () => {
    const restored = readProjectFile(readFileSync('src/lib/project/fixtures/modifiers.loopsmith.json', 'utf8'));
    expect(track(restored.document).calls).toHaveLength(6);
    expect(view(restored.document,0).factor?.value).toBe(2);
    expect(view(restored.document,1).factor?.value).toBeNull();
    expect(view(restored.document,4).callback?.name).toBeUndefined();
  });
  it('derives exact fields from opaque calls without changing the version-1 model', () => {
    const document = parse('drums: s("bd sd").fast(/* keep */ 2).slow(0.5).rev(/* reverse */).every(3, (x) => x.fast(4))');
    expect(track(document).calls.every(call => call.kind === 'opaque')).toBe(true);
    expect(view(document,0).factor).toMatchObject({value:2,code:'2'});
    expect(view(document,1).factor?.value).toBe(0.5);
    expect(view(document,2)).toMatchObject({name:'rev',locked:false});
    expect(view(document,3)).toMatchObject({name:'every',period:{value:3},callback:{name:'fast',argument:{value:4}}});
    expect(modifierIsCodeOnly(view(document,3))).toBe(false);
  });
  it('preserves preambles, aliases, CRLF, comments and unknown call order during numeric edits', () => {
    const source = '// keep\r\nsamples("custom.json");\r\ndrums: s("bd sd").jux( rev ).fast( /* factor */ 2 ).cutoff(800).mystery(foo); // tail\r\n';
    const document = parse(source);
    const next = setModifierNumber(document,view(document,1).reference,'factor',3);
    expect(next.code).toBe(source.replace('/* factor */ 2','/* factor */ 3'));
    expect(track(next).id).toBe(track(document).id);
  });
  it('keeps expressions and out-of-range values read-only until explicitly replaced', () => {
    const document = parse('drums: s("bd").fast(1/3).slow(-2).fast(0).every(2.5, rev)');
    for (const index of [0,1,2,3]) expect(modifierIsCodeOnly(view(document,index))).toBe(true);
    expect(() => setModifierNumber(document,view(document,0).reference,'factor',2)).toThrow('read-only');
    const next = setModifierNumber(document,view(document,0).reference,'factor',2,true);
    expect(next.code).toContain('.fast(2).slow(-2).fast(0).every(2.5, rev)');
    expect(() => setModifierNumber(document,view(document,0).reference,'factor',0,true)).toThrow('0.125 to 16');
    expect(() => setModifierNumber(document,view(document,3).reference,'period',0,true)).toThrow('1 to 1024');
    expect(() => setModifierNumber(document,view(document,0).reference,'factor',0.3333,true)).toThrow('exact-thousandth');
  });
  it('edits the selected repeated modifier rather than treating it as a last-write control', () => {
    const document = parse('drums: s("bd sd").fast(2).jux(rev).fast(2)');
    const next = setModifierNumber(document,view(document,2).reference,'factor',4);
    expect(next.code).toBe('drums: s("bd sd").fast(2).jux(rev).fast(4)');
  });
  it('moves one modifier past one complete neighboring call and removes only the selected suffix', () => {
    const document = parse('drums: s("bd sd").gain(0.5).fast(2).jux( rev ).rev()');
    const reference = view(document,1).reference;
    const moved = moveModifier(document,reference,1);
    expect(moved.code).toBe('drums: s("bd sd").gain(0.5).jux( rev ).fast(2).rev()');
    const removed = removeModifier(moved,reference);
    expect(removed.code).toBe('drums: s("bd sd").gain(0.5).jux( rev ).rev()');
    expect(track(removed).id).toBe(track(document).id);
  });
  it('changes every transforms with targeted method/argument edits, retaining callback formatting/comments', () => {
    let document = parse('drums: s("bd sd").every( /* period */ 4, (beat) => beat.rev(/* keep */))');
    const reference = view(document,0).reference;
    document = setEveryTransform(document,reference,'fast');
    expect(document.code).toContain('(beat) => beat.fast(/* keep */2)');
    document = setModifierNumber(document,reference,'callbackFactor',3);
    document = setEveryTransform(document,reference,'slow');
    expect(document.code).toContain('every( /* period */ 4, (beat) => beat.slow(/* keep */3))');
    document = setEveryTransform(document,reference,'rev');
    expect(document.code).toContain('beat.rev(/* keep */)');
  });
  it('never infers the meaning of global/custom callbacks, and can edit their period without rewriting them', () => {
    const document = parse('const rev = customTransform;\ndrums: s("bd sd").every(3, rev).every(4, x => { return custom(x); })');
    const reference = view(document,0).reference;
    expect(view(document,0).callback?.name).toBeUndefined();
    expect(view(document,1).callback?.name).toBeUndefined();
    const next = setModifierNumber(document,reference,'period',5);
    expect(next.code).toBe(document.code.replace('every(3, rev)','every(5, rev)'));
    expect(() => setEveryTransform(document,reference,'rev')).toThrow('explicitly replace');
    expect(setEveryTransform(document,reference,'rev',true).code).toContain('.every(3, p => p.rev()).every(4, x => { return custom(x); })');
  });
  it('preserves complex arguments as locked calls and leaves unrelated methods unclassified', () => {
    const document = parse('drums: s("bd").fast(2, foo).rev(123).every(4, rev, foo).density(2).every(4, p => p["rev"]())');
    for (const index of [0,1,2]) expect(view(document,index).locked).toBe(true);
    expect(modifierView(track(document),3)).toBeUndefined();
    expect(track(parse('drums: s("bd").every(...args)')).source.kind).toBe('raw');
    expect(view(document,4).callback?.name).toBeUndefined();
    expect(() => setModifierNumber(document,view(document,0).reference,'factor',2)).toThrow('edited in code');
  });
  it('reconciles a unique unchanged call after typing inserts calls/preamble, but rejects changed or ambiguous targets', () => {
    const document = parse('drums: s("bd sd").fast(2).gain(0.5)');
    const reference = view(document,0).reference;
    const typed = parse('// longer\ndrums: s("bd sd").jux(rev).fast(2).gain(0.7)',document);
    expect(setModifierNumber(typed,reference,'factor',3).code).toContain('.jux(rev).fast(3).gain(0.7)');
    const changed = parse(document.code.replace('.fast(2)','.fast(4)'),document);
    expect(() => setModifierNumber(changed,reference,'factor',3)).toThrow('changed while');
    const duplicate = parse('drums: s("bd").fast(2).fast(2)');
    const reordered = parse('drums: s("bd").jux(rev).fast(2).fast(2)',duplicate);
    expect(() => removeModifier(reordered,view(duplicate,0).reference)).toThrow('changed while');
  });
  it('carries references across a queued edit batch, including intervening effect edits', () => {
    let document = parse('drums: s("bd sd").fast(2).gain(0.5).rev()');
    const reference = view(document,0).reference;
    document = setModifierNumber(document,reference,'factor',4);
    const afterEffect = setEffect(document,track(document).id,'gain',0.7);
    carryModifierReferences(document,afterEffect);
    document = moveModifier(afterEffect,reference,1);
    expect(document.code).toBe('drums: s("bd sd").gain(0.7).fast(4).rev()');
    document = removeModifier(document,reference);
    const appended = addModifier(document,track(document).id,'fast');
    carryModifierReferences(document,appended);
    expect(() => setModifierNumber(appended,reference,'factor',3)).toThrow('changed while');
  });
  it('rejects modifier operations on explicit raw tracks and retains native flags during normal edits', () => {
    let document = parse('_Sdrums: s("bd sd").fast(2)');
    const reference = view(document,0).reference;
    document = setModifierNumber(document,reference,'factor',4);
    expect(track(document)).toMatchObject({muted:true,solo:true});
    document = convertToRaw(document,track(document).id);
    expect(() => addModifier(document,track(document).id,'fast')).toThrow('edited in code');
    expect(() => removeModifier(document,reference)).toThrow('changed while');
  });
  it('round-trips edited modifiers through version-1 JSON without normalizing custom callbacks', () => {
    let document = parse('drums: s("bd sd").fast(2).every(3, p => p.jux(rev))');
    document = addModifier(document,track(document).id,'slow');
    const restored = readProjectFile(serializeProject(projectFile('Modifiers',document.code,document)));
    expect(restored.document.project).toEqual(document.project);
    expect(restored.file.code).toBe(document.code);
    expect(restored.file.version).toBe(1);
  });
});
