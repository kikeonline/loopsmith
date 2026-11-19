import { describe, expect, it } from 'vitest';
import { parseDocument, setEffect, setTrackFlags, generateProject, type ParsedDocument, type Track } from '../project';
import { addTrack, deleteTrack, duplicateTrack, moveTrack, renameTrack, convertToRaw, setControl, controlValue, melodicRows, midi, setMelodicStep, setMelodicLength, setRowSound } from './composition';
const parse = (code: string) => { const result = parseDocument(code); if (!result.ok) throw new Error(result.error.message); return result.document; };
const tracks = (document: ParsedDocument) => document.project.items.filter((item): item is Track => item.kind === 'track');

describe('M3 source-preserving composition', () => {
  it('adds four tracks without changing custom declarations, comments or unknown calls', () => {
    let document = parse('// samples remain\nsamples("custom.json");\nkit: s("bd ~").jux(rev).gain(0.5); // tail\n');
    const original = document.code;
    for (const [kind, id] of [['drums','hat'], ['note','bass'], ['n','lead']] as const) document = addTrack(document, kind, id);
    expect(tracks(document)).toHaveLength(4);
    expect(document.code.startsWith(original)).toBe(true);
    expect(tracks(document).map(t => t.id).slice(1)).toEqual(['hat','bass','lead']);
    expect(tracks(parse(generateProject(document.project)))).toEqual(tracks(document));
  });
  it('promotes an imported bare track before adding another, preserving both identities', () => {
    let document = parse('s("bd ~").jux(rev)');
    const id = tracks(document)[0].id;
    document = addTrack(document, 'note', 'new');
    expect(tracks(document).map(t => t.id)).toEqual([id,'new']);
    expect(document.code).toContain('.jux(rev)');
    expect(document.tracks[id].label).toBeDefined();
  });
  it('duplicates expressions exactly, assigns an independent native key, and moves metadata with IDs', () => {
    let document = parse('// preamble\nfirst: s("bd").jux( rev ).gain(0.8);\n// between\nsecond: note("c4 e4").s("sine");\n');
    const first = tracks(document)[0].id;
    const second = tracks(document)[1].id;
    document = renameTrack(document, first, 'Kick "one"');
    document = duplicateTrack(document, first, 'copy');
    const copy = tracks(document).find(t => t.id === 'copy')!;
    expect(copy.key).not.toBe(tracks(document)[0].key);
    expect(document.code.match(/\.jux\( rev \)/g)).toHaveLength(2);
    document = moveTrack(document, 'copy', -1);
    expect(tracks(document).map(t => t.id)).toEqual([first,'copy',second]);
    expect(tracks(document)[0].name).toBe('Kick "one"');
    expect(document.code).toContain('// between');
    document = deleteTrack(document, first);
    expect(tracks(document).map(t => t.id)).toEqual(['copy',second]);
    expect(document.code).not.toContain('"name":"Kick \\"one\\""');
  });
  it('deleting the final track cannot expose a previously discarded raw return value', () => {
    let document = parse('s("hh");\ns("bd")');
    const id = tracks(document)[0].id;
    document = deleteTrack(document, id);
    expect(tracks(document)).toHaveLength(0);
    expect(document.code).toContain('s("hh");');
    expect(document.code.trimEnd()).toMatch(/null;$/);
  });
  it('converts to raw through metadata only and retains flags and source', () => {
    const document = parse('drums: s("bd [hh hh]").jux(rev).gain(0.8)');
    const original = tracks(document)[0];
    let next = convertToRaw(document, original.id);
    const raw = tracks(next)[0];
    expect(raw.source).toEqual({ kind:'raw', code:'s("bd [hh hh]").jux(rev).gain(0.8)' });
    expect(next.code.endsWith(document.code)).toBe(true);
    expect(() => setEffect(next, original.id, 'gain', 1)).toThrow('code-only');
    next = setTrackFlags(next, original.id, { muted:true, solo:true });
    expect(tracks(next)[0]).toMatchObject({ id:original.id, muted:true, solo:true, source:raw.source });
  });
  it('edits all flat note rows without changing other notes, calls or comments', () => {
    let document = parse('// keep\nmelody: note("c4 ~ e4 ~, c3 ~ ~ g3").s("sine").jux(rev);');
    const id = tracks(document)[0].id;
    document = setMelodicStep(document, id, 0, 1, 'd#4');
    expect(document.code).toContain('c4 d#4 e4 ~, c3 ~ ~ g3');
    document = setMelodicLength(document, id, 0, 8);
    expect(document.code).toContain('c4 d#4 e4 ~ ~ ~ ~ ~, c3 ~ ~ g3');
    expect(document.code.endsWith('.s("sine").jux(rev);')).toBe(true);
    expect(midi('db4')).toBe(midi('c#4'));
    expect(midi('60')).toBe(midi('c4'));
  });
  it('edits scale degrees and rejects variable timing / unscaled sample numbers', () => {
    let document = parse('melody: n("0 ~ -2 4").scale("C:minor").s("sine")');
    const id = tracks(document)[0].id;
    document = setMelodicStep(document, id, 0, 1, '5');
    document = setControl(document, id, 'scale', 'D:dorian');
    expect(document.code).toContain('n("0 5 -2 4").scale("D:dorian")');
    for (const input of ['note("c4 [e4 g4]")', 'note("c4@2 g4")', 'n("0 2").s("bd")']) expect(melodicRows(tracks(parse(input))[0])).toBeNull();
  });
  it('sets row sounds while preserving rests, indices and other parallel rows', () => {
    let document = parse('drums: s("bd ~ bd ~, hh hh ~ hh").rev()');
    const id = tracks(document)[0].id;
    document = setRowSound(document, id, 0, 'cp:2');
    expect(document.code).toBe('drums: s("cp:2 ~ cp:2 ~, hh hh ~ hh").rev()');
    expect(() => setRowSound(document,id,0,'bd hh')).toThrow('one sound');
  });
  it('requires explicit replacement for opaque instrument/scale calls, even after earlier string controls', () => {
    let document = parse('melody: note("c4 e4").s("sine").jux(rev).s(instrument).scale("C:minor").scale(scaleName)');
    const id = tracks(document)[0].id;
    expect(controlValue(tracks(document)[0], 's').expression).toBe(true);
    expect(() => setControl(document,id,'s','sawtooth')).toThrow('expression');
    document = setControl(document,id,'s','sawtooth',true);
    expect(document.code).toContain('.s("sine").jux(rev).s("sawtooth")');
    document = setControl(document,id,'scale','D:minor',true);
    expect(document.code).toContain('.scale("C:minor").scale("D:minor")');
  });
});
