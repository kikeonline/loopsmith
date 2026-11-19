import { parseExpressionAt } from 'acorn';
import { EFFECTS, applyEdits, createTrack, generateProject, parseMini, quote, setPattern, setTrackFlags, trackLabel, type ParsedDocument, type Track, type MiniNode, type EffectName } from '../project';
import { TRACK_MARKER } from '../project/metadata';
import { trackById } from './visual';
import { readArrangement } from './arrangement';

export type TrackKind = 'drums' | 'note' | 'n';
const metadata = (track: Track, raw = track.source.kind === 'raw') => TRACK_MARKER + quoteMetadata({ id: track.id, name: track.name, ...(raw ? { raw: true } : {}) });
const quoteMetadata = (value: unknown) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const tracks = (document: ParsedDocument) => document.project.items.filter((item): item is Track => item.kind === 'track');
function ownedRange(document: ParsedDocument, id: string) {
  const location = document.tracks[id];
  if (!location) throw new Error('Track was removed while editing');
  return { from: location.metadata?.from ?? location.statement.from, to: location.statement.to };
}
function promoteBare(document: ParsedDocument): ParsedDocument {
  const bare = tracks(document).find(track => !document.tracks[track.id].label);
  return bare ? setTrackFlags(document, bare.id, {}) : document;
}
function freshId(document: ParsedDocument, id: string) {
  if (!id || tracks(document).some(track => track.id === id)) throw new Error('Track identity must be new');
}
function newKey(document: ParsedDocument, base: string): string {
  const keys = new Set(tracks(document).map(track => track.key));
  let suffix = tracks(document).length + 1;
  while (keys.has(`${base}${suffix}`)) suffix++;
  return `${base}${suffix}`;
}
export function addTrack(document: ParsedDocument, kind: TrackKind, id: string): ParsedDocument {
  freshId(document, id);
  document = promoteBare(document);
  const name = `${kind === 'drums' ? 'Drums' : kind === 'note' ? 'Melody' : 'Scale melody'} ${tracks(document).length + 1}`;
  const track = createTrack({ id, name, source: kind === 'drums' ? { kind: 'drums', pattern: parseMini('bd ~ bd ~') } : { kind: 'notes', mode: kind, pattern: parseMini(kind === 'note' ? 'c4 ~ e4 ~' : '0 ~ 2 ~') }, calls: [
    ...(kind === 'drums' ? [] : [...(kind === 'n' ? [{ kind: 'control' as const, name: 'scale' as const, value: 'C:minor' }] : []), { kind: 'control' as const, name: 's' as const, value: 'sine' }]),
    { kind: 'effect', name: 'gain', value: { kind: 'number', value: 0.5 } }
  ] });
  track.key = newKey(document, kind === 'drums' ? 'drums' : kind === 'note' ? 'melody' : 'lead');
  const snippet = generateProject({ version: 1, items: [track] }).split('\n').slice(1).join('\n');
  const next = applyEdits(document, [{ from: document.code.length, to: document.code.length, insert: `\n\n${snippet}` }]);
  if (trackById(next, id).source.kind !== track.source.kind) throw new Error('A source constructor is shadowed by your code. Add this track in code.');
  return next;
}
export function deleteTrack(document: ParsedDocument, id: string): ParsedDocument {
  trackById(document, id);
  const edits = [{ ...ownedRange(document, id), insert: '' }];
  // An earlier discarded bare expression must not become the program's return value.
  if (tracks(document).length === 1) edits.push({ from: document.code.length, to: document.code.length, insert: '\nnull;\n' });
  return applyEdits(document, edits);
}
export function duplicateTrack(document: ParsedDocument, id: string, newId: string): ParsedDocument {
  freshId(document, newId);
  document = promoteBare(document);
  const original = trackById(document, id);
  const track = createTrack({ ...original, id: newId, name: `${original.name} copy` });
  track.key = newKey(document, 'copy');
  const expression = document.tracks[id].expression;
  const snippet = `\n\n${metadata(track, original.source.kind === 'raw' && !readArrangement(document, id))}\n${trackLabel(track)}: ${document.code.slice(expression.from, expression.to)};\n`;
  return applyEdits(document, [{ from: document.code.length, to: document.code.length, insert: snippet }]);
}
export function moveTrack(document: ParsedDocument, id: string, direction: -1 | 1): ParsedDocument {
  const list = tracks(document);
  const index = list.findIndex(track => track.id === id);
  const other = list[index + direction];
  if (index < 0) throw new Error('Track was removed');
  if (!other) return document;
  const a = ownedRange(document, id), b = ownedRange(document, other.id);
  // Swap only owned statements/metadata. All other source stays in place.
  return applyEdits(document, [
    { ...a, insert: document.code.slice(b.from, b.to) },
    { ...b, insert: document.code.slice(a.from, a.to) }
  ]);
}
export function renameTrack(document: ParsedDocument, id: string, name: string): ParsedDocument {
  const track = trackById(document, id);
  if (!name.trim()) throw new Error('Give the track a name');
  const location = document.tracks[id];
  return applyEdits(document, [{ ...(location.metadata ?? { from: location.statement.from, to: location.statement.from }), insert: metadata({ ...track, name }, track.source.kind === 'raw' && !readArrangement(document, id)) + (location.metadata ? '' : '\n') }]);
}
export function convertToRaw(document: ParsedDocument, id: string): ParsedDocument {
  const track = trackById(document, id);
  const location = document.tracks[id];
  return applyEdits(document, [{ ...(location.metadata ?? { from: location.statement.from, to: location.statement.from }), insert: metadata(track, true) + (location.metadata ? '' : '\n') }]);
}
function opaqueControl(code: string): string | undefined {
  const expression = parseExpressionAt(`_${code}`, 0, { ecmaVersion: 'latest' });
  if (expression.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression' || expression.callee.property.type !== 'Identifier') return;
  const name = expression.callee.property.name;
  return name === 'sound' ? 's' : name;
}
export function setControl(document: ParsedDocument, id: string, name: 's' | 'scale', value: string, replaceOpaque = false): ParsedDocument {
  const track = trackById(document, id);
  if (track.source.kind === 'raw') throw new Error('This track is edited in code');
  if (!value.trim()) throw new Error('A control value cannot be empty');
  const index = track.calls.findLastIndex(call => call.kind === 'control' ? call.name === name : call.kind === 'opaque' && opaqueControl(call.code) === name);
  const location = document.tracks[id];
  if (index >= 0) {
    const call = track.calls[index];
    if (call.kind === 'opaque') {
      if (!replaceOpaque) throw new Error('This control is an expression. Use the explicit replacement action.');
      return applyEdits(document, [{ ...location.calls[index].range, insert: `.${name}(${quote(value)})` }]);
    }
    const range = location.calls[index].argument;
    if (!range) throw new Error('Control is code-only');
    return applyEdits(document, [{ ...range, insert: quote(value) }]);
  }
  return applyEdits(document, [{ from: location.expression.to, to: location.expression.to, insert: `.${name}(${quote(value)})` }]);
}
export function controlValue(track: Track, name: 's' | 'scale'): { value: string; expression: boolean } {
  for (const call of [...track.calls].reverse()) {
    if (call.kind === 'control' && call.name === name) return { value: call.value, expression: false };
    if (call.kind === 'opaque' && opaqueControl(call.code) === name) return { value: call.code, expression: true };
  }
  return { value: '', expression: false };
}
export const EFFECT_DEFAULTS = Object.fromEntries(Object.entries(EFFECTS).map(([name, spec]) => [name, spec.default])) as Record<EffectName, number>;
export function effectParameter(track: Track, name: EffectName) {
  const call = track.calls.findLast(call => call.kind === 'effect' && call.name === name);
  return call?.kind === 'effect' ? call.value : { kind: 'number' as const, value: EFFECT_DEFAULTS[name] };
}

export function setRowSound(document: ParsedDocument, id: string, rowIndex: number, sound: string): ParsedDocument {
  const track = trackById(document, id);
  if (track.source.kind !== 'drums' || track.source.pattern.kind !== 'mini') throw new Error('Pattern is edited in code');
  const parsed = parseMini(sound);
  if (parsed.kind !== 'mini' || parsed.rows.length !== 1 || parsed.rows[0].length !== 1 || parsed.rows[0][0].kind !== 'atom') throw new Error('Choose one sound, optionally with a sample index');
  const atom = parsed.rows[0][0];
  const rows = track.source.pattern.rows.map(row => [...row]);
  if (!rows[rowIndex] || rows[rowIndex].some(node => node.kind !== 'atom' && node.kind !== 'rest')) throw new Error('Row is edited in code');
  // Keep the sound represented in code even when a row was all rests.
  rows[rowIndex] = rows[rowIndex].every(node => node.kind === 'rest') ? rows[rowIndex].map((node, i) => i === 0 ? { ...atom } : node) : rows[rowIndex].map(node => node.kind === 'atom' ? { ...atom } : node);
  return setPattern(document, id, { kind: 'mini', rows });
}

const names = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
export function midi(value: string): number | null {
  if (/^\d+$/.test(value) && +value <= 127) return +value;
  const match = /^([a-g])([#b]?)(-?\d)$/i.exec(value);
  if (!match) return null;
  const pitch = ({ c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[match[1].toLowerCase()]! + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0)) + (+match[3] + 1) * 12;
  return pitch >= 0 && pitch <= 127 ? pitch : null;
}
export const pitchName = (pitch: number) => names[pitch % 12] + (Math.floor(pitch / 12) - 1);
export function melodicRows(track: Track): MiniNode[][] | null {
  if (track.source.kind !== 'notes' || track.source.pattern.kind !== 'mini') return null;
  if (track.source.mode === 'n' && (!controlValue(track, 'scale').value || controlValue(track, 'scale').expression)) return null;
  const degree = track.source.mode === 'n';
  return track.source.pattern.rows.every(row => row.length <= 64 && row.every(node => node.kind === 'rest' || (node.kind === 'atom' && node.sampleIndex === undefined && (degree ? /^-?\d+$/.test(node.value) && Math.abs(+node.value) <= 128 : midi(node.value) !== null)))) ? track.source.pattern.rows : null;
}
export function setMelodicStep(document: ParsedDocument, id: string, rowIndex: number, step: number, value: string): ParsedDocument {
  const track = trackById(document, id);
  const rows = melodicRows(track);
  if (!rows?.[rowIndex]?.[step]) throw new Error('Notes changed while editing; try again');
  const next = rows.map(row => [...row]);
  const atom = rows[rowIndex][step];
  const same = atom.kind === 'atom' && (track.source.kind === 'notes' && track.source.mode === 'n' ? +atom.value === +value : midi(atom.value) === midi(value));
  next[rowIndex][step] = same ? { kind: 'rest' } : { kind: 'atom', value };
  const result = setPattern(document, id, { kind: 'mini', rows: next });
  if (!melodicRows(trackById(result, id))) throw new Error('Unsupported pitch');
  return result;
}
export function setMelodicLength(document: ParsedDocument, id: string, rowIndex: number, length: number): ParsedDocument {
  const rows = melodicRows(trackById(document, id));
  if (!rows?.[rowIndex] || !Number.isInteger(length) || length < 1 || length > 64) throw new Error('Invalid note row length');
  const next = rows.map(row => [...row]);
  next[rowIndex] = Array.from({ length }, (_, i) => next[rowIndex][i] ?? { kind: 'rest' });
  return setPattern(document, id, { kind: 'mini', rows: next });
}
export function canHighlight(track: Track): boolean { return !track.muted && track.source.kind !== 'raw' && !track.calls.some(call => call.kind === 'opaque'); }
