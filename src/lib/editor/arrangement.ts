import { parse, parseExpressionAt, tokenizer, type Comment, type Expression, type Pattern } from 'acorn';
import { applyEdits, parseDocument, setTrackFlags, type ParsedDocument, type SourceEdit, type Span, type Track } from '../project';
import { TRACK_MARKER } from '../project/metadata';
import { trackById } from './visual';
import { carryModifierReferences } from './modifiers';

export const SECTION_MARKER = '// @loopsmith-section/v1 ';
export const MAX_SECTIONS = 32;
export const MAX_SECTION_CYCLES = 1024;
export interface SectionReference { trackId: string; id: string; arrayCode: string; copies: number; pinned: boolean; chain: string }
export interface ArrangementSection {
  id: string; name: string; metadata?: Span; range: Span; pattern: Span; patternCode: string;
  cycles: { range: Span; code: string; value: number | null };
  reference: SectionReference;
}
export interface ArrangementView {
  trackId: string; root: Span; expression: Span; sections: ArrangementSection[];
  suffix: string; shadowedSources: boolean; totalCycles: number | null;
}
export interface PatternProxy { document: ParsedDocument; track: Track; prefix: string; suffix: string; expression: string }
const views = new WeakMap<ParsedDocument, Map<string, ArrangementView | null>>();
const bindings = new WeakMap<ParsedDocument, Set<string>>();
const proxies = new WeakMap<ParsedDocument, Map<string, PatternProxy>>();
const removedReferences = new WeakMap<ParsedDocument, Set<string>>();
const span = (node: { start: number; end: number }): Span => ({ from: node.start, to: node.end });
const json = (value: unknown) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
function names(pattern: Pattern): string[] {
  switch (pattern.type) {
    case 'Identifier': return [pattern.name];
    case 'RestElement': return names(pattern.argument);
    case 'AssignmentPattern': return names(pattern.left);
    case 'ArrayPattern': return pattern.elements.flatMap(item => item ? names(item) : []);
    case 'ObjectPattern': return pattern.properties.flatMap(item => item.type === 'RestElement' ? names(item.argument) : names(item.value as Pattern));
    default: return [];
  }
}
function programBindings(document: ParsedDocument): Set<string> {
  let result = bindings.get(document);
  if (!result) {
    const ast = parse(document.code, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true });
    result = new Set(ast.body.flatMap(node => {
      if (node.type === 'VariableDeclaration') return node.declarations.flatMap(item => names(item.id));
      if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return node.id ? [node.id.name] : [];
      if (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression') return names(node.expression.left);
      return [];
    }));
    bindings.set(document, result);
  }
  return result;
}
function sourceShadowed(document: ParsedDocument) { return ['s','sound','note','n'].some(name => programBindings(document).has(name)); }
function explicitlyRaw(document: ParsedDocument, id: string): boolean {
  const location = document.tracks[id]?.metadata;
  return !!location && JSON.parse(document.code.slice(location.from + TRACK_MARKER.length, location.to)).raw === true;
}
function hash(value: string) { let result = 2166136261; for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619); return (result >>> 0).toString(36); }

/** Native arrange(...) only. Unsupported shape/registration/explicit raw choice stays code-only. */
export function readArrangement(document: ParsedDocument, id: string): ArrangementView | undefined {
  let cache = views.get(document);
  if (!cache) { cache = new Map(); views.set(document, cache); }
  if (cache.has(id)) return cache.get(id) ?? undefined;
  cache.set(id, null);
  const track = document.project.items.find((item): item is Track => item.kind === 'track' && item.id === id);
  if (!track || track.source.kind !== 'raw' || explicitlyRaw(document, id) || programBindings(document).has('arrange')) return;
  try {
    const comments: Comment[] = [];
    const location = document.tracks[id];
    const expression = parseExpressionAt(document.code, location.expression.from, { ecmaVersion: 'latest', preserveParens: true, onComment: comments });
    if (expression.end !== location.expression.to) return;
    let root = expression;
    while (root.type === 'CallExpression' && !root.optional && root.callee.type === 'MemberExpression' && !root.callee.computed && !root.callee.optional && root.callee.property.type === 'Identifier' && root.callee.object.type !== 'Super' && root.arguments.every(arg => arg.type !== 'SpreadElement')) {
      if (['p','q'].includes(root.callee.property.name)) return;
      root = root.callee.object;
    }
    if (root.type !== 'CallExpression' || root.optional || root.callee.type !== 'Identifier' || root.callee.name !== 'arrange' || root.arguments.length < 1 || root.arguments.length > MAX_SECTIONS) return;
    const sections: ArrangementSection[] = [];
    const used = new Set<string>();
    for (const [index, argument] of root.arguments.entries()) {
      if (argument.type !== 'ArrayExpression' || argument.elements.length !== 2 || argument.elements.some(item => !item || item.type === 'SpreadElement')) return;
      const [cycles, pattern] = argument.elements as Expression[];
      const range = span(argument), arrayCode = document.code.slice(range.from, range.to);
      const comment = comments.find(comment => comment.type === 'Line' && comment.end < argument.start && /^\s*$/.test(document.code.slice(comment.end, argument.start)) && document.code.slice(comment.start, comment.end).startsWith(SECTION_MARKER));
      let metadata: Span | undefined, sectionId = '', name = `Section ${index + 1}`;
      if (comment) {
        try {
          const data: unknown = JSON.parse(document.code.slice(comment.start + SECTION_MARKER.length, comment.end));
          if (data && typeof data === 'object' && Object.keys(data).sort().join(',') === 'id,name' && 'id' in data && typeof data.id === 'string' && data.id && 'name' in data && typeof data.name === 'string') {
            sectionId = data.id; name = data.name; metadata = span(comment);
          }
        } catch { /* Malformed metadata remains untouched trivia. */ }
      }
      if (sectionId && used.has(sectionId)) return;
      if (!sectionId) {
        const base = `section-${hash(arrayCode)}`;
        sectionId = base; let suffix = 2;
        while (used.has(sectionId)) sectionId = `${base}-${suffix++}`;
      }
      used.add(sectionId);
      const value = cycles.type === 'Literal' && typeof cycles.value === 'number' && Number.isInteger(cycles.value) && cycles.value >= 1 && cycles.value <= MAX_SECTION_CYCLES ? cycles.value : null;
      sections.push({ id: sectionId, name, metadata, range, pattern: span(pattern), patternCode: document.code.slice(pattern.start, pattern.end), cycles: { range: span(cycles), code: document.code.slice(cycles.start, cycles.end), value }, reference: { trackId: id, id: sectionId, arrayCode, copies: root.arguments.filter(item => document.code.slice(item.start, item.end) === arrayCode).length, pinned: !!metadata, chain: '' } });
    }
    // A generated fallback ID must not collide with a later explicit one either.
    if (new Set(sections.map(section => section.id)).size !== sections.length) return;
    const chain = JSON.stringify(sections.map(section => document.code.slice(section.range.from, section.range.to)));
    sections.forEach(section => { section.reference.chain = chain; });
    const view: ArrangementView = { trackId: id, root: span(root), expression: location.expression, sections, suffix: document.code.slice(root.end, expression.end), shadowedSources: sourceShadowed(document), totalCycles: sections.every(section => section.cycles.value !== null) ? sections.reduce((sum, section) => sum + section.cycles.value!, 0) : null };
    cache.set(id, view);
    return view;
  } catch { return; }
}
function requireArrangement(document: ParsedDocument, trackId: string): ArrangementView {
  const view = readArrangement(document, trackId);
  if (!view) throw new Error('This arrangement is edited in code or changed while typing.');
  return view;
}
function resolve(document: ParsedDocument, reference: SectionReference) {
  const view = requireArrangement(document, reference.trackId);
  if (removedReferences.get(document)?.has(proxyKey(reference.trackId, reference.id))) throw new Error('This section was removed while editing.');
  let section = view.sections.find(section => !!section.metadata && section.id === reference.id);
  if (!section && !reference.pinned && JSON.stringify(view.sections.map(section => document.code.slice(section.range.from, section.range.to))) === reference.chain) section = view.sections.find(section => section.id === reference.id);
  if (!section && !reference.pinned && reference.copies === 1) {
    const exact = view.sections.filter(section => document.code.slice(section.range.from, section.range.to) === reference.arrayCode);
    if (exact.length === 1) section = exact[0];
  }
  if (!section) throw new Error('This section changed or was removed while typing. Try the control again.');
  return { view, section, index: view.sections.indexOf(section) };
}
function mark(section: Pick<ArrangementSection, 'id' | 'name'>) { return SECTION_MARKER + json({ id: section.id, name: section.name }); }
function identityEdits(section: ArrangementSection): SourceEdit[] { return section.metadata ? [] : [{ from: section.range.from, to: section.range.from, insert: `${mark(section)}\n` }]; }
function proxyKey(trackId: string, sectionId?: string) { return JSON.stringify([trackId, sectionId ?? null]); }
function buildProxy(document: ParsedDocument, view: ArrangementView, expression: string, id: string, name: string, previous?: PatternProxy): PatternProxy {
  const prefix = `${view.shadowedSources ? 'const s = undefined;\n' : ''}${TRACK_MARKER}${json({ id, name })}\npart: `;
  const suffix = ';\n';
  const result = parseDocument(prefix + expression + suffix, previous?.document);
  if (!result.ok) throw new Error('This section cannot be edited visually');
  if (previous) carryModifierReferences(previous.document, result.document);
  return { document: result.document, track: trackById(result.document, id), prefix, suffix, expression };
}
function cacheProxy(document: ParsedDocument, key: string, proxy: PatternProxy) { let cache = proxies.get(document); if (!cache) { cache = new Map(); proxies.set(document, cache); } cache.set(key, proxy); }
export function sectionProxy(document: ParsedDocument, trackId: string, sectionId: string): PatternProxy {
  const key = proxyKey(trackId, sectionId), cached = proxies.get(document)?.get(key);
  if (cached) return cached;
  const view = requireArrangement(document, trackId), section = view.sections.find(section => section.id === sectionId);
  if (!section) throw new Error('Unknown section');
  const proxy = buildProxy(document, view, section.patternCode, `${trackId}/section/${sectionId}`, section.name);
  cacheProxy(document, key, proxy); return proxy;
}
export function outerProxy(document: ParsedDocument, trackId: string): PatternProxy {
  const key = proxyKey(trackId), cached = proxies.get(document)?.get(key);
  if (cached) return cached;
  const view = requireArrangement(document, trackId);
  const proxy = buildProxy(document, view, `s("~")${view.suffix}`, `${trackId}/outer`, 'Whole track');
  cacheProxy(document, key, proxy); return proxy;
}
/** Carry nested modifier identity through a batch of outer-document UI transactions. */
export function carryArrangementReferences(before: ParsedDocument, after: ParsedDocument) {
  if (before === after) return;
  const removed = removedReferences.get(before);
  if (removed) removedReferences.set(after, new Set([...(removedReferences.get(after) ?? []), ...removed]));
  const cache = proxies.get(before);
  if (!cache) return;
  for (const [key, old] of cache) {
    if (proxies.get(after)?.has(key)) continue;
    const [trackId, sectionId] = JSON.parse(key) as [string, string | null];
    const view = readArrangement(after, trackId);
    if (!view) continue;
    const section = sectionId === null ? undefined : view.sections.find(section => section.id === sectionId);
    if (sectionId !== null && !section) continue;
    const expression = section ? section.patternCode : `s("~")${view.suffix}`;
    if (expression !== old.expression) continue;
    const next = buildProxy(after, view, expression, section ? `${trackId}/section/${section.id}` : `${trackId}/outer`, section?.name ?? 'Whole track', old);
    cacheProxy(after, key, next);
  }
}
function transact(document: ParsedDocument, edits: SourceEdit[]): ParsedDocument {
  const next = applyEdits(document, edits); carryArrangementReferences(document, next); return next;
}
export function createArrangement(document: ParsedDocument, trackId: string, sectionId: string): ParsedDocument {
  const track = trackById(document, trackId);
  if (track.source.kind === 'raw') throw new Error('Only visual drum or note tracks can be wrapped automatically');
  if (programBindings(document).has('arrange')) throw new Error('arrange is shadowed by your code; edit this track in code');
  if (!sectionId) throw new Error('A section needs an identity');
  if (!document.tracks[trackId].label) document = setTrackFlags(document, trackId, {});
  const range = document.tracks[trackId].expression;
  const expression = document.code.slice(range.from, range.to);
  const next = transact(document, [{ ...range, insert: `arrange(\n  ${mark({ id: sectionId, name: 'Section 1' })}\n  [4, ${expression}]\n)` }]);
  requireArrangement(next, trackId);
  return next;
}
export function setSectionCycles(document: ParsedDocument, reference: SectionReference, cycles: number, replaceExpression = false): ParsedDocument {
  const { section } = resolve(document, reference);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > MAX_SECTION_CYCLES) throw new Error('Choose a whole cycle count from 1 to 1024');
  if (section.cycles.value === null && !replaceExpression) throw new Error('Cycle expression is read-only; explicitly replace it with a number');
  return transact(document, [...identityEdits(section), { ...section.cycles.range, insert: String(cycles) }]);
}
export function renameSection(document: ParsedDocument, reference: SectionReference, name: string): ParsedDocument {
  const { section } = resolve(document, reference);
  if (!name.trim() || name.length > 160) throw new Error('Section names need 1–160 characters');
  return transact(document, [{ ...(section.metadata ?? { from: section.range.from, to: section.range.from }), insert: mark({ ...section, name }) + (section.metadata ? '' : '\n') }]);
}
export function addSection(document: ParsedDocument, trackId: string, id: string, source?: SectionReference): ParsedDocument {
  const view = requireArrangement(document, trackId);
  if (!id || view.sections.some(section => section.id === id)) throw new Error('Section identity must be new');
  if (view.sections.length >= MAX_SECTIONS) throw new Error('An arrangement supports at most 32 sections');
  if (!source && view.shadowedSources) throw new Error('Sound constructors are shadowed; duplicate a section or edit in code');
  const original = source ? resolve(document, source).section : undefined;
  if (source && source.trackId !== trackId) throw new Error('Choose a section from this track');
  const name = original ? `${original.name} copy` : `Rest ${view.sections.length + 1}`;
  const cycles = original?.cycles.code ?? '4';
  const pattern = original?.patternCode ?? 's("~")';
  // Insert the separator before any trailing line comments, leaving every old byte intact.
  const last = view.sections[view.sections.length - 1];
  const trailing = document.code.slice(last.range.to, view.root.to - 1);
  const hasComma = tokenizer(trailing, { ecmaVersion: 'latest' }).getToken().type.label === ',';
  const edits: SourceEdit[] = hasComma ? [] : [{ from: last.range.to, to: last.range.to, insert: ',' }];
  edits.push({ from: view.root.to - 1, to: view.root.to - 1, insert: `\n  ${mark({ id, name })}\n  [${cycles}, ${pattern}]\n` });
  return transact(document, edits);
}
export function moveSection(document: ParsedDocument, reference: SectionReference, direction: -1 | 1): ParsedDocument {
  if (direction !== -1 && direction !== 1) throw new Error('Invalid move direction');
  const { view, section, index } = resolve(document, reference);
  const other = view.sections[index + direction];
  if (!other) return document;
  // Pin both identities before swapping so unannotated identical imports remain distinguishable.
  const pinned = transact(document, [...identityEdits(section), ...identityEdits(other)]);
  const current = requireArrangement(pinned, reference.trackId);
  const a = current.sections.find(item => item.id === section.id)!;
  const b = current.sections.find(item => item.id === other.id)!;
  const aRange = { from: a.metadata!.from, to: a.range.to }, bRange = { from: b.metadata!.from, to: b.range.to };
  return transact(pinned, [{ ...aRange, insert: pinned.code.slice(bRange.from, bRange.to) }, { ...bRange, insert: pinned.code.slice(aRange.from, aRange.to) }]);
}
export function removeSection(document: ParsedDocument, reference: SectionReference): ParsedDocument {
  const { view, section, index } = resolve(document, reference);
  if (view.sections.length === 1) throw new Error('Keep at least one section, or keep the selected pattern as a regular track');
  const next = view.sections[index + 1], previous = view.sections[index - 1];
  const edits: SourceEdit[] = [{ from: section.metadata?.from ?? section.range.from, to: section.range.to, insert: '' }];
  const separator = next ? document.code.slice(section.range.to, next.metadata?.from ?? next.range.from) : document.code.slice(previous.range.to, section.metadata?.from ?? section.range.from);
  // Remove only the comma token, never comments/trivia between sections.
  const offset = next ? section.range.to : previous.range.to;
  const comma = tokenizer(separator, { ecmaVersion: 'latest' }).getToken();
  if (comma.type.label !== ',') throw new Error('Section separator changed; edit it in code');
  edits.push({ from: offset + comma.start, to: offset + comma.end, insert: '' });
  const after = transact(document, edits);
  removedReferences.set(after, new Set([...(removedReferences.get(after) ?? []), proxyKey(reference.trackId, reference.id), proxyKey(reference.trackId, section.id)]));
  return after;
}
export function flattenSection(document: ParsedDocument, reference: SectionReference): ParsedDocument {
  const { view, section } = resolve(document, reference);
  // Explicitly replaces the whole arrangement with the chosen pattern and existing outer chain.
  return transact(document, [{ ...view.expression, insert: `${sectionProxy(document, reference.trackId, section.id).track.source.kind === 'raw' ? `(${section.patternCode})` : section.patternCode}${view.suffix}` }]);
}
export function editSection(document: ParsedDocument, reference: SectionReference, operation: (document: ParsedDocument) => ParsedDocument): ParsedDocument {
  let { section } = resolve(document, reference);
  if (!section.metadata) { document = transact(document, identityEdits(section)); section = resolve(document, reference).section; }
  const proxy = sectionProxy(document, reference.trackId, section.id);
  const nextProxy = operation(proxy.document);
  if (!nextProxy.code.startsWith(proxy.prefix) || !nextProxy.code.endsWith(proxy.suffix)) throw new Error('A section edit must keep its source scaffold');
  const expression = nextProxy.code.slice(proxy.prefix.length, -proxy.suffix.length);
  const next = transact(document, [{ ...section.pattern, insert: expression }]);
  const nextView = requireArrangement(next, reference.trackId);
  const nextSection = nextView.sections.find(item => item.id === section.id)!;
  cacheProxy(next, proxyKey(reference.trackId, section.id), { ...proxy, document: nextProxy, track: trackById(nextProxy, proxy.track.id), expression: nextSection.patternCode });
  return next;
}
export function editArrangementEffects(document: ParsedDocument, trackId: string, operation: (document: ParsedDocument) => ParsedDocument): ParsedDocument {
  const view = requireArrangement(document, trackId), proxy = outerProxy(document, trackId);
  const nextProxy = operation(proxy.document);
  const head = proxy.prefix + 's("~")';
  if (!nextProxy.code.startsWith(head) || !nextProxy.code.endsWith(proxy.suffix)) throw new Error('Only the arrangement effect chain can be edited here');
  const suffix = nextProxy.code.slice(head.length, -proxy.suffix.length);
  const next = transact(document, [{ from: view.root.to, to: view.expression.to, insert: suffix }]);
  cacheProxy(next, proxyKey(trackId), { ...proxy, document: nextProxy, track: trackById(nextProxy, proxy.track.id), expression: `s("~")${suffix}` });
  return next;
}
export function arrangementPosition(view: ArrangementView, cycle: number): { section: ArrangementSection; index: number; sourceCycle: number } | null {
  if (view.totalCycles === null || !Number.isFinite(cycle) || cycle < 0) return null;
  const loop = Math.floor(cycle / view.totalCycles), phase = cycle % view.totalCycles;
  let start = 0;
  for (const [index, section] of view.sections.entries()) {
    const length = section.cycles.value!;
    if (phase < start + length) return { section, index, sourceCycle: loop * length + phase - start };
    start += length;
  }
  return null;
}
