import { emitMini, type MiniPattern } from './mini';
import { EFFECTS, formatNumber, quote, trackLabel, type EffectName, type Track } from './model';
import { parseDocument, type ParsedDocument, type Span } from './parse';

export interface SourceEdit extends Span { insert: string }

/** All ranges belong to this exact document. Reparse atomically to refresh every range. */
export function applyEdits(document: ParsedDocument, edits: SourceEdit[]): ParsedDocument {
  const ordered = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
  let last: Span | undefined;
  for (const edit of ordered) {
    if (!Number.isInteger(edit.from) || !Number.isInteger(edit.to) || edit.from < 0 || edit.to < edit.from || edit.to > document.code.length || (last !== undefined && (edit.from < last.to || edit.from === last.from))) throw new Error('Invalid, overlapping, or ambiguous source edits');
    last = edit;
  }
  let code = document.code;
  for (const edit of ordered.reverse()) code = code.slice(0, edit.from) + edit.insert + code.slice(edit.to);
  const parsed = parseDocument(code, document);
  if (!parsed.ok) throw new Error(`Edit rejected at ${parsed.error.line}:${parsed.error.column + 1}: ${parsed.error.message}`);
  return parsed.document;
}
function findTrack(document: ParsedDocument, id: string): Track {
  const track = document.project.items.find((item): item is Track => item.kind === 'track' && item.id === id);
  if (!track || !document.tracks[id]) throw new Error(`Unknown track ${id}`);
  return track;
}

export function setEffect(document: ParsedDocument, id: string, name: EffectName, value: number, replaceExpression = false): ParsedDocument {
  const text = formatNumber(value);
  if (!Object.hasOwn(EFFECTS, name)) throw new Error('Unknown effect');
  const track = findTrack(document, id);
  if (track.source.kind === 'raw') throw new Error('Track is code-only');
  const index = track.calls.findLastIndex(call => call.kind === 'effect' && call.name === name);
  const location = document.tracks[id];
  if (index >= 0) {
    const call = track.calls[index];
    if (call.kind === 'effect' && call.value.kind === 'expression' && !replaceExpression) throw new Error('Expression is read-only; explicitly replace with a value');
    const range = location.calls[index].argument;
    if (!range) throw new Error('Effect argument has no editable range');
    return applyEdits(document, [{ ...range, insert: text }]);
  }
  return applyEdits(document, [{ from: location.expression.to, to: location.expression.to, insert: `.${name}(${text})` }]);
}

export function setPattern(document: ParsedDocument, id: string, pattern: MiniPattern, replaceOpaque = false): ParsedDocument {
  const track = findTrack(document, id);
  if (track.source.kind === 'raw') throw new Error('Track is code-only');
  if (track.source.pattern.kind === 'opaque' && !replaceOpaque) throw new Error('Pattern is code-only; explicitly replace it');
  const range = document.tracks[id].sourceArgument;
  if (!range) throw new Error('Pattern has no editable source range');
  return applyEdits(document, [{ ...range, insert: quote(emitMini(pattern)) }]);
}

/** Mute/solo are always native code, including on raw tracks. */
export function setTrackFlags(document: ParsedDocument, id: string, flags: { muted?: boolean; solo?: boolean }): ParsedDocument {
  const track = findTrack(document, id);
  const location = document.tracks[id];
  const desired = { muted: flags.muted ?? track.muted, solo: flags.solo ?? track.solo };
  const label = trackLabel({ ...track, ...desired });
  const updated = applyEdits(document, location.label ? [{ ...location.label, insert: label }] : [{ from: location.statement.from, to: location.statement.from, insert: `${label}: ` }]);
  const actual = findTrack(updated, id);
  if (actual.muted !== desired.muted || actual.solo !== desired.solo) throw new Error('This native key needs an explicit rename before changing these flags');
  return updated;
}

/** Parsing invalid edits never replaces this last successful document or model. */
export class ProjectSession {
  document: ParsedDocument;
  constructor(code = '') {
    const result = parseDocument(code);
    if (!result.ok) throw new Error(result.error.message);
    this.document = result.document;
  }
  update(code: string) {
    const result = parseDocument(code, this.document);
    if (result.ok) this.document = result.document;
    return result;
  }
}
