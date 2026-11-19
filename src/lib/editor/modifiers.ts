import { parseExpressionAt, type CallExpression, type Expression, type Node } from 'acorn';
import { applyEdits, formatNumber, representable, type ParsedDocument, type Span, type Track } from '../project';
import { trackById } from './visual';

export const MODIFIERS = ['fast', 'slow', 'rev', 'every'] as const;
export type ModifierName = typeof MODIFIERS[number];
export type TransformName = 'fast' | 'slow' | 'rev';
export interface ModifierNumber { code: string; range: Span; value: number | null }
export interface ModifierReference { trackId: string; index: number; code: string; chain: string; copies: number; key: string; name: ModifierName }
export interface ModifierView {
  name: ModifierName; code: string; index: number; reference: ModifierReference;
  locked: boolean; factor?: ModifierNumber; period?: ModifierNumber;
  callback?: { code: string; range: Span; name?: TransformName; method?: Span; argument?: ModifierNumber; close?: number };
}
const relative = (node: Node): Span => ({ from: node.start - 1, to: node.end - 1 });
const rate = (value: number) => representable(value) && value >= 0.125 && value <= 16;
const period = (value: number) => Number.isInteger(value) && value >= 1 && value <= 1024;
function scalar(code: string, node: Expression, valid: (value: number) => boolean): ModifierNumber {
  const value = node.type === 'Literal' && typeof node.value === 'number' ? node.value : null;
  const range = relative(node);
  return { range, code: code.slice(range.from, range.to), value: value !== null && valid(value) ? value : null };
}
function method(node: Expression): { call: CallExpression; name: string; property: Span; object: Expression } | null {
  if (node.type !== 'CallExpression' || node.optional || node.callee.type !== 'MemberExpression' || node.callee.optional || node.callee.computed || node.callee.object.type === 'Super' || node.callee.property.type !== 'Identifier') return null;
  return { call: node, name: node.callee.property.name, property: relative(node.callee.property), object: node.callee.object };
}

/** A lossless view over existing opaque calls. The version-1 canonical model stays unchanged. */
export function modifierView(track: Track, index: number): ModifierView | undefined {
  const source = track.calls[index];
  if (track.source.kind === 'raw' || source?.kind !== 'opaque') return;
  try {
    const expression = parseExpressionAt(`_${source.code}`, 0, { ecmaVersion: 'latest', preserveParens: true });
    const outer = method(expression);
    if (!outer || outer.object.type !== 'Identifier' || outer.object.name !== '_' || expression.end !== source.code.length + 1 || !MODIFIERS.includes(outer.name as ModifierName)) return;
    const name = outer.name as ModifierName;
    const chain = JSON.stringify(track.calls);
    const reference: ModifierReference = { trackId: track.id, index, code: source.code, chain, copies: track.calls.filter(call => call.kind === 'opaque' && call.code === source.code).length, key: JSON.stringify([track.id, chain, index]), name };
    const view: ModifierView = { name, code: source.code, index, reference, locked: false };
    const args = outer.call.arguments;
    if (args.some(arg => arg.type === 'SpreadElement') || args.length !== (name === 'rev' ? 0 : name === 'every' ? 2 : 1)) return { ...view, locked: true };
    const expressions = args as Expression[];
    if (name === 'fast' || name === 'slow') view.factor = scalar(source.code, expressions[0], rate);
    if (name === 'every') {
      view.period = scalar(source.code, expressions[0], period);
      const callback = expressions[1];
      const range = relative(callback);
      view.callback = { range, code: source.code.slice(range.from, range.to) };
      // Never infer the meaning of global identifiers or arbitrary callback code.
      if (callback.type === 'ArrowFunctionExpression' && !callback.async && callback.params.length === 1 && callback.params[0].type === 'Identifier' && callback.body.type !== 'BlockStatement') {
        const transform = method(callback.body);
        if (transform && transform.object.type === 'Identifier' && transform.object.name === callback.params[0].name && ['fast','slow','rev'].includes(transform.name) && transform.call.arguments.length === (transform.name === 'rev' ? 0 : 1) && transform.call.arguments.every(arg => arg.type !== 'SpreadElement')) {
          view.callback.name = transform.name as TransformName;
          view.callback.method = transform.property;
          view.callback.close = transform.call.end - 2;
          if (transform.name !== 'rev') view.callback.argument = scalar(source.code, transform.call.arguments[0] as Expression, rate);
        }
      }
    }
    return view;
  } catch { return; }
}
export function modifierIsCodeOnly(view: ModifierView): boolean {
  return view.locked || !!(view.factor && view.factor.value === null) || !!(view.period && view.period.value === null) || !!(view.callback && (!view.callback.name || view.callback.argument?.value === null));
}
export function callIsCodeOnly(track: Track, index: number): boolean {
  const call = track.calls[index];
  if (call.kind === 'effect') return call.value.kind === 'expression';
  if (call.kind !== 'opaque') return false;
  const view = modifierView(track, index);
  return !view || modifierIsCodeOnly(view);
}

// References only live for the current sequence of immutable UI edits. Nothing is serialized.
type Anchors = Map<string, { trackId: string; index: number }>;
const anchors = new WeakMap<ParsedDocument, Anchors>();
export function carryModifierReferences(before: ParsedDocument, after: ParsedDocument) {
  const previous = anchors.get(before);
  if (!previous) return;
  const next = new Map(anchors.get(after));
  for (const [key, entry] of previous) {
    if (next.has(key)) continue;
    const oldTrack = before.project.items.find((item): item is Track => item.kind === 'track' && item.id === entry.trackId);
    const newTrack = after.project.items.find((item): item is Track => item.kind === 'track' && item.id === entry.trackId);
    if (entry.index < 0 || oldTrack && newTrack && JSON.stringify(oldTrack.calls[entry.index]) === JSON.stringify(newTrack.calls[entry.index])) next.set(key, entry);
  }
  anchors.set(after, next);
}
function resolve(document: ParsedDocument, reference: ModifierReference): { track: Track; index: number; view: ModifierView } {
  const track = trackById(document, reference.trackId);
  const carried = anchors.get(document)?.get(reference.key);
  let index = carried?.index ?? -1;
  if (!carried) {
    if (JSON.stringify(track.calls) === reference.chain) index = reference.index;
    else if (reference.copies === 1) {
      const matches = track.calls.flatMap((call, i) => call.kind === 'opaque' && call.code === reference.code ? [i] : []);
      if (matches.length === 1) index = matches[0];
    }
  }
  const view = modifierView(track, index);
  if (!view || view.name !== reference.name) throw new Error('This modifier changed while you were typing. Try the control again.');
  return { track, index, view };
}
function remember(before: ParsedDocument, after: ParsedDocument, reference: ModifierReference, index: number, remap: (index: number) => number = index => index): ParsedDocument {
  const next = new Map(anchors.get(before));
  next.set(reference.key, { trackId: reference.trackId, index });
  for (const [key, entry] of next) if (entry.trackId === reference.trackId) next.set(key, { ...entry, index: remap(entry.index) });
  anchors.set(after, next);
  return after;
}
function editPart(document: ParsedDocument, reference: ModifierReference, range: Span, insert: string): ParsedDocument {
  const { index } = resolve(document, reference);
  const location = document.tracks[reference.trackId].calls[index].range;
  return remember(document, applyEdits(document, [{ from: location.from + range.from, to: location.from + range.to, insert }]), reference, index);
}
export function addModifier(document: ParsedDocument, trackId: string, name: ModifierName): ParsedDocument {
  const track = trackById(document, trackId);
  if (track.source.kind === 'raw') throw new Error('This track is edited in code');
  if (!MODIFIERS.includes(name)) throw new Error('Unknown modifier');
  const location = document.tracks[trackId].expression;
  const suffix = name === 'every' ? '.every(4, p => p.rev())' : name === 'rev' ? '.rev()' : `.${name}(2)`;
  return applyEdits(document, [{ from: location.to, to: location.to, insert: suffix }]);
}
export function setModifierNumber(document: ParsedDocument, reference: ModifierReference, field: 'factor' | 'period' | 'callbackFactor', value: number, replaceExpression = false): ParsedDocument {
  const { view } = resolve(document, reference);
  const parameter = field === 'callbackFactor' ? view.callback?.argument : field === 'factor' ? view.factor : view.period;
  if (view.locked || !parameter) throw new Error('This modifier parameter is edited in code');
  if (!(field === 'period' ? period(value) : rate(value))) throw new Error(field === 'period' ? 'Every needs a whole cycle count from 1 to 1024' : 'Choose a finite exact-thousandth factor from 0.125 to 16');
  if (parameter.value === null && !replaceExpression) throw new Error('Expression is read-only; explicitly replace it with a value');
  return editPart(document, reference, parameter.range, formatNumber(value));
}
export function setEveryTransform(document: ParsedDocument, reference: ModifierReference, name: TransformName, replaceCallback = false): ParsedDocument {
  if (!['fast','slow','rev'].includes(name)) throw new Error('Unknown transform');
  const { view, index } = resolve(document, reference);
  const callback = view.callback;
  if (view.locked || !callback) throw new Error('This every call is edited in code');
  if (!callback.name) {
    if (!replaceCallback) throw new Error('Callback is read-only; explicitly replace it with a visual transform');
    return editPart(document, reference, callback.range, `p => p.${name}(${name === 'rev' ? '' : '2'})`);
  }
  if (name === callback.name) return document;
  const base = document.tracks[reference.trackId].calls[index].range.from;
  const edits: (Span & { insert: string })[] = [{ from: base + callback.method!.from, to: base + callback.method!.to, insert: name }];
  if (name === 'rev') edits.push({ from: base + callback.argument!.range.from, to: base + callback.argument!.range.to, insert: '' });
  else if (callback.name === 'rev') edits.push({ from: base + callback.close!, to: base + callback.close!, insert: '2' });
  return remember(document, applyEdits(document, edits), reference, index);
}
export function removeModifier(document: ParsedDocument, reference: ModifierReference): ParsedDocument {
  const { index } = resolve(document, reference);
  const range = document.tracks[reference.trackId].calls[index].range;
  return remember(document, applyEdits(document, [{ ...range, insert: '' }]), reference, index, position => position === index ? -1 : position > index ? position - 1 : position);
}
export function moveModifier(document: ParsedDocument, reference: ModifierReference, direction: -1 | 1): ParsedDocument {
  if (direction !== -1 && direction !== 1) throw new Error('Invalid move direction');
  const { track, index } = resolve(document, reference);
  const other = index + direction;
  if (other < 0 || other >= track.calls.length) return document;
  const ranges = document.tracks[reference.trackId].calls;
  const a = ranges[index].range, b = ranges[other].range;
  const after = applyEdits(document, [{ ...a, insert: document.code.slice(b.from, b.to) }, { ...b, insert: document.code.slice(a.from, a.to) }]);
  return remember(document, after, reference, index, position => position === index ? other : position === other ? index : position);
}
