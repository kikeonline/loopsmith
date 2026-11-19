import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseDocument, setEffect, type Track } from '../project';
import { projectFile, readProjectFile, safeFilename, serializeProject, MAX_FILE_BYTES } from './project-file';
import { TEMPLATES } from './templates';
const parse = (code: string) => { const result = parseDocument(code); if (!result.ok) throw new Error(result.error.message); return result.document; };

describe('versioned project files', () => {
  it('evaluates every exported template against the pinned Strudel bundle', () => {
    const output = execFileSync(process.execPath, ['scripts/verify-strudel.mjs', JSON.stringify(TEMPLATES.map(({ id, code }) => ({ id, code })))], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(output).toContain('4 exported starter templates evaluate');
  });
  it('round-trips mixed line endings, unsupported code, expression text and reconciled IDs', () => {
    const input = '// keep\r\nsamples("custom.json");\nraw: stack(s("bd"), s("hh")).jux(rev);\r\ndrums: s("bd ~").jux( rev ).gain(0.7).pan(sine.range(0, 1));\r\n';
    const before = parse(input);
    const track = before.project.items.find((item): item is Track => item.kind === 'track' && item.source.kind === 'drums')!;
    const document = setEffect(before, track.id, 'gain', 0.6);
    const encoded = serializeProject(projectFile('My loop', document.code, document));
    const restored = readProjectFile(encoded);
    expect(restored.file.code).toBe(document.code);
    expect(restored.document.project).toEqual(document.project);
    expect(restored.document.code).toBe(document.code);
    expect(restored.document.tracks[track.id]).toBeDefined();
  });
  it('keeps an invalid draft separately from the last-good model without executing code', () => {
    const document = parse('drums: s("bd ~").gain(0.5);');
    const result = readProjectFile(serializeProject(projectFile('Draft', 'globalThis.doNotRun = true; s(', document)));
    expect(result.file.code).toBe('globalThis.doNotRun = true; s(');
    expect(result.document).toEqual(document);
    expect(Object.hasOwn(globalThis, 'doNotRun')).toBe(false);
  });
  it('rejects malformed, wrong-version, missing and inconsistent files', () => {
    const document = parse('drums: s("bd ~").gain(0.5);');
    const file = projectFile('Example', document.code, document);
    expect(() => readProjectFile('{bad')).toThrow('valid JSON');
    expect(() => readProjectFile('[]')).toThrow('object');
    expect(() => readProjectFile('{}')).toThrow('not a Loopsmith');
    expect(() => readProjectFile(JSON.stringify({ ...file, version: 2 }))).toThrow('version: 2');
    expect(() => readProjectFile(JSON.stringify({ ...file, code: 42 }))).toThrow('missing');
    expect(() => readProjectFile(JSON.stringify({ ...file, lastGoodCode: 's(' }))).toThrow('syntax error');
    expect(() => readProjectFile(JSON.stringify({ ...file, lastGoodCode: 'drums: s("hh")' }))).toThrow('does not match');
    expect(() => readProjectFile(JSON.stringify({ ...file, project: { version: 999, items: [] } }))).toThrow('validation failed');
  });
  it('bounds file/source sizes and produces safe portable filenames', () => {
    const document = parse('');
    expect(() => readProjectFile(' '.repeat(MAX_FILE_BYTES + 1))).toThrow('8 MiB');
    expect(() => projectFile('test', 'x'.repeat(1_000_001), document)).toThrow('1,000,000');
    expect(() => projectFile('x'.repeat(161), '', document)).toThrow('160');
    expect(safeFilename('../../My loop / test')).toBe('-My-loop-test');
    expect(safeFilename('')).toBe('loopsmith-project');
  });
  it.each(TEMPLATES)('$name is a deterministic, portable project using editable sources', template => {
    const document = parse(template.code);
    const file = projectFile(template.name, template.code, document);
    const loaded = readProjectFile(serializeProject(file));
    expect(loaded.document.project).toEqual(document.project);
    expect(loaded.file.code).toBe(template.code);
    expect(document.project.items.filter(item => item.kind === 'track').every(item => item.kind === 'track' && item.source.kind !== 'raw')).toBe(true);
  });
});
