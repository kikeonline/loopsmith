import { parse, type Node, type Expression, type CallExpression, type Comment, type Pattern } from 'acorn';
import { parseMini } from './mini';
import { representable, type Parameter, type Project, type Track, type ChainCall, type Tempo } from './model';
import { effectName } from './model';
import { PROJECT_MARKER, TRACK_MARKER } from './metadata';

export interface Span { from: number; to: number }
export interface CallLocation { range: Span; argument?: Span }
export interface TrackLocation {
  statement: Span;
  expression: Span;
  label?: Span;
  metadata?: Span;
  labelName?: string;
  sourceArgument?: Span;
  calls: CallLocation[];
}
export interface Diagnostic { message: string; from: number; line: number; column: number }
export interface ParsedDocument {
  code: string;
  project: Project;
  tracks: Record<string, TrackLocation>;
  itemRanges: Span[];
  tempos: { range: Span; argument: Span; itemIndex: number }[];
  warnings: Diagnostic[];
}
export type ParseResult = { ok: true; document: ParsedDocument } | { ok: false; error: Diagnostic; document?: ParsedDocument };
const span = (node: Node): Span => ({ from: node.start, to: node.end });
const source = (code: string, node: Node): string => code.slice(node.start, node.end);
const diag = (code: string, message: string, from: number): Diagnostic => {
  const lines = code.slice(0, from).split(/\r\n?|\n|\u2028|\u2029/);
  return { message, from, line: lines.length, column: lines[lines.length - 1].length };
};
function numeric(node: Expression): number | undefined {
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') return -node.argument.value;
}
function parameter(code: string, node: Expression): Parameter {
  const value = numeric(node);
  return value !== undefined && representable(value) ? { kind: 'number', value } : { kind: 'expression', code: source(code, node) };
}
function stringValue(node: Expression): string | undefined {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked ?? undefined;
}
function plainCall(node: Expression): node is CallExpression {
  return node.type === 'CallExpression' && !node.optional && node.arguments.every(arg => arg.type !== 'SpreadElement');
}
function argument(node: CallExpression): Expression | undefined {
  return node.arguments.length === 1 && node.arguments[0].type !== 'SpreadElement' ? node.arguments[0] : undefined;
}
interface ParsedSource { source: Track['source']; calls: ChainCall[]; locations: CallLocation[]; sourceArgument?: Span }
function parseSource(code: string, expression: Expression): ParsedSource {
  const raw = () => ({ source: { kind: 'raw', code: source(code, expression) } as Track['source'], calls: [], locations: [] });
  let base = expression;
  const links: CallExpression[] = [];
  while (plainCall(base) && base.callee.type === 'MemberExpression' && !base.callee.computed && !base.callee.optional && base.callee.property.type === 'Identifier' && base.callee.object.type !== 'Super') {
    links.unshift(base);
    base = base.callee.object;
  }
  if (!plainCall(base) || base.callee.type !== 'Identifier' || !['s', 'sound', 'note', 'n'].includes(base.callee.name)) return raw();
  const arg = argument(base);
  const text = arg && stringValue(arg);
  if (!arg || text === undefined) return raw();
  const pattern = parseMini(text);
  const trackSource: Track['source'] = ['s', 'sound'].includes(base.callee.name) ? { kind: 'drums', pattern } : { kind: 'notes', mode: base.callee.name as 'note' | 'n', pattern };
  const calls: ChainCall[] = [];
  const locations: CallLocation[] = [];
  for (const link of links) {
    if (link.callee.type !== 'MemberExpression' || link.callee.property.type !== 'Identifier') return raw();
    const name = link.callee.property.name;
    // Native registration calls are code-only: adding an outer label can register them twice.
    if (name === 'p' || name === 'q') return raw();
    const arg = argument(link);
    const range = { from: link.callee.object.end, to: link.end };
    const effect = effectName(name);
    if (effect && arg) {
      calls.push({ kind: 'effect', name: effect, value: parameter(code, arg) });
    } else if (['s', 'sound', 'scale'].includes(name) && arg && stringValue(arg) !== undefined) {
      calls.push({ kind: 'control', name: name === 'scale' ? 'scale' : 's', value: stringValue(arg)! });
    } else calls.push({ kind: 'opaque', code: code.slice(range.from, range.to) });
    locations.push({ range, ...(arg ? { argument: span(arg) } : {}) });
  }
  return { source: trackSource, calls, locations, sourceArgument: span(arg) };
}
function retainsComment(parsed: ParsedSource, comment: Comment): boolean {
  return parsed.locations.some((location, i) => {
    const call = parsed.calls[i];
    const range = call.kind === 'opaque' ? location.range : call.kind === 'effect' && call.value.kind === 'expression' ? location.argument : undefined;
    return range !== undefined && comment.start >= range.from && comment.end <= range.to;
  });
}
function hash(text: string): string {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(36);
}
const fingerprint = (track: Track): string => JSON.stringify([track.source, track.calls]);

function bindingNames(pattern: Pattern): string[] {
  switch (pattern.type) {
    case 'Identifier': return [pattern.name];
    case 'RestElement': return bindingNames(pattern.argument);
    case 'AssignmentPattern': return bindingNames(pattern.left);
    case 'ArrayPattern': return pattern.elements.flatMap(item => item ? bindingNames(item) : []);
    case 'ObjectPattern': return pattern.properties.flatMap(property => property.type === 'RestElement' ? bindingNames(property.argument) : bindingNames(property.value as Pattern));
    default: return [];
  }
}

/** No evaluation. On failure, the previous document/model is returned by identity. */
export function parseDocument(code: string, previous?: ParsedDocument): ParseResult {
  try {
    const comments: Comment[] = [];
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, locations: true, preserveParens: true, onComment: comments });
    const shadowed = new Set(ast.body.flatMap(node => {
      if (node.type === 'VariableDeclaration') return node.declarations.flatMap(declaration => bindingNames(declaration.id));
      if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return node.id ? [node.id.name] : [];
      if (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression') return bindingNames(node.expression.left);
      return [];
    }));
    // Resolve only direct program bindings; dynamic globals and arbitrary JS side effects are not inferred.
    const shadowsSource = ['s', 'sound', 'note', 'n'].some(name => shadowed.has(name));
    const hasLabels = ast.body.some(node => node.type === 'LabeledStatement' && node.body.type === 'ExpressionStatement');
    const project: Project = { version: 1, items: [] };
    const tracks: ParsedDocument['tracks'] = Object.create(null);
    const tempos: ParsedDocument['tempos'] = [];
    const warnings: Diagnostic[] = [];
    const consumed = new Set<Comment>();
    const candidates: { track: Track; location: TrackLocation; metadata?: { id: string; name: string; raw?: true } }[] = [];
    const nodes: { start: number; range: Span; item: Project['items'][number] }[] = [];
    for (const statement of ast.body) {
      const expr = statement.type === 'ExpressionStatement' ? statement.expression : statement.type === 'LabeledStatement' && statement.body.type === 'ExpressionStatement' ? statement.body.expression : undefined;
      const label = statement.type === 'LabeledStatement' ? statement.label : undefined;
      if (expr && !label && plainCall(expr) && expr.callee.type === 'Identifier' && !shadowed.has(expr.callee.name) && ['setcps', 'setCps', 'setcpm', 'setCpm'].includes(expr.callee.name) && argument(expr)) {
        const arg = argument(expr)!;
        if (comments.some(c => c.start >= statement.start && c.end <= statement.end && !(c.start >= arg.start && c.end <= arg.end))) {
          nodes.push({ start: statement.start, range: span(statement), item: { kind: 'raw', code: source(code, statement) } });
          continue;
        }
        const item: Tempo = { kind: 'tempo', unit: expr.callee.name.toLowerCase().endsWith('cps') ? 'cps' : 'cpm', value: parameter(code, arg) };
        nodes.push({ start: statement.start, range: span(statement), item });
        tempos.push({ range: span(statement), argument: span(arg), itemIndex: -1 });
        continue;
      }
      let parsed = expr && parseSource(code, expr);
      if (expr && parsed && shadowsSource) parsed = { source: { kind: 'raw', code: source(code, expr) }, calls: [], locations: [] };
      if (expr && parsed && comments.some(comment => comment.start >= expr.start && comment.end <= expr.end && !retainsComment(parsed!, comment))) {
        parsed = { source: { kind: 'raw', code: source(code, expr) }, calls: [], locations: [] };
      }
      if (!expr || !parsed || (!label && (parsed.source.kind === 'raw' || hasLabels || statement !== ast.body.at(-1)))) {
        nodes.push({ start: statement.start, range: span(statement), item: { kind: 'raw', code: source(code, statement) } });
        continue;
      }
      const labelName = label?.name;
      const muted = !!labelName && (labelName.startsWith('_') || labelName.endsWith('_'));
      const bareName = labelName?.replace(/^_+/, '').replace(/_+$/, '');
      const solo = !!bareName && bareName.length > 1 && bareName.startsWith('S');
      const name = bareName && bareName !== '$' ? (solo ? bareName.slice(1) : bareName) : `Track ${candidates.length + 1}`;
      const key = (solo ? bareName!.slice(1) : bareName) || `t_empty_${candidates.length + 1}`;
      const track: Track = { kind: 'track', id: '', key, name, muted, solo, source: parsed.source, calls: parsed.calls };
      const location: TrackLocation = { statement: span(statement), expression: span(expr), calls: parsed.locations, ...(label ? { label: span(label), labelName } : {}), ...(parsed.sourceArgument ? { sourceArgument: parsed.sourceArgument } : {}) };
      // Only immediately preceding, well-formed metadata is authoritative.
      const comment = comments.find(c => c.type === 'Line' && code.slice(c.start, c.end).startsWith(TRACK_MARKER) && c.end < statement.start && /^\s*$/.test(code.slice(c.end, statement.start)));
      let metadata: { id: string; name: string; raw?: true } | undefined;
      if (comment) {
        try {
          const data: unknown = JSON.parse(code.slice(comment.start + TRACK_MARKER.length, comment.end));
          if (!data || typeof data !== 'object' || !('id' in data) || !('name' in data) || typeof data.id !== 'string' || !data.id || typeof data.name !== 'string' || !['id,name', 'id,name,raw'].includes(Object.keys(data).sort().join(',')) || ('raw' in data && data.raw !== true)) throw new Error('Invalid metadata');
          metadata = { id: data.id, name: data.name, ...('raw' in data ? { raw: true as const } : {}) };
          if (metadata.raw) {
            track.source = { kind: 'raw', code: source(code, expr) };
            track.calls = [];
            location.calls = [];
            delete location.sourceArgument;
          }
          location.metadata = span(comment);
          consumed.add(comment);
          track.name = metadata.name;
        } catch { warnings.push(diag(code, 'Invalid Loopsmith track metadata retained as raw code', comment.start)); }
      }
      candidates.push({ track, location, metadata });
      nodes.push({ start: statement.start, range: span(statement), item: track });
    }
    for (const comment of comments) {
      if (consumed.has(comment) || ast.body.some(n => n.start <= comment.start && n.end >= comment.end)) continue;
      if (code.slice(comment.start, comment.end) === PROJECT_MARKER && code.slice(0, comment.start).trim() === '') continue;
      nodes.push({ start: comment.start, range: span(comment), item: { kind: 'raw', code: code.slice(comment.start, comment.end) } });
    }
    // Resolve identities in passes so inserted tracks cannot steal the identity of later tracks.
    const used = new Set<string>();
    const old = previous?.project.items.filter((item): item is Track => item.kind === 'track') ?? [];
    const assign = (candidate: typeof candidates[number], id: string) => { candidate.track.id = id; used.add(id); };
    for (const c of candidates) if (c.metadata) {
      if (!used.has(c.metadata.id)) assign(c, c.metadata.id);
      else warnings.push(diag(code, 'Duplicate metadata ID; assigned a fresh track ID', c.location.statement.from));
    }
    // Reserve exact matches among duplicate labels before assigning changed/new occurrences.
    for (const c of candidates.filter(c => !c.track.id)) {
      const label = c.location.labelName;
      if (!label || label.includes('$')) continue;
      const duplicated = candidates.filter(other => other.location.labelName === label).length > 1 || old.filter(t => previous?.tracks[t.id]?.labelName === label).length > 1;
      if (!duplicated) continue;
      const exact = old.find(t => !used.has(t.id) && previous?.tracks[t.id]?.labelName === label && fingerprint(t) === fingerprint(c.track));
      if (exact) assign(c, exact.id);
    }
    for (const c of candidates.filter(c => !c.track.id)) {
      if (c.location.labelName && !c.location.labelName.includes('$')) {
        const labelMatches = old.filter(t => !used.has(t.id) && previous?.tracks[t.id]?.labelName === c.location.labelName);
        const duplicated = candidates.filter(other => other.location.labelName === c.location.labelName).length > 1 || old.filter(t => previous?.tracks[t.id]?.labelName === c.location.labelName).length > 1;
        const match = duplicated ? labelMatches.find(t => fingerprint(t) === fingerprint(c.track)) ?? labelMatches[0] : labelMatches[0];
        if (match) assign(c, match.id);
      }
    }
    for (const c of candidates.filter(c => !c.track.id)) {
      const matches = old.filter(t => !used.has(t.id) && fingerprint(t) === fingerprint(c.track));
      if (matches.length === 1) assign(c, matches[0].id);
    }
    // Same-size unmatched sets cover simultaneous label/expression renames; warn about the ambiguity.
    const unmatched = candidates.filter(c => !c.track.id);
    const remaining = old.filter(t => !used.has(t.id));
    if (unmatched.length && unmatched.length === remaining.length) {
      unmatched.forEach((c, i) => {
        assign(c, remaining[i].id);
        warnings.push(diag(code, 'Track identity reconciled by position after label/expression changes', c.location.statement.from));
      });
    }
    const labels = new Set<string>();
    for (const c of candidates) {
      const label = c.location.labelName;
      if (label && !label.includes('$') && labels.has(label)) warnings.push(diag(code, `Duplicate label ${label}: Strudel keeps its last registered pattern`, c.location.statement.from));
      if (label) labels.add(label);
      if (!c.track.id) {
        const base = `track-${hash(`${label ?? '$'}:${fingerprint(c.track)}`)}`;
        let id = base;
        let suffix = 2;
        while (used.has(id) || old.some(t => t.id === id)) id = `${base}-${suffix++}`;
        assign(c, id);
      }
      tracks[c.track.id] = c.location;
    }
    nodes.sort((a, b) => a.start - b.start);
    project.items = nodes.map(n => n.item);
    for (const tempo of tempos) tempo.itemIndex = nodes.findIndex(n => n.start === tempo.range.from);
    return { ok: true, document: { code, project, tracks, itemRanges: nodes.map(n => n.range), tempos, warnings } };
  } catch (cause) {
    const error = cause as Error & { pos?: number };
    return { ok: false, error: diag(code, error.message, error.pos ?? 0), ...(previous ? { document: previous } : {}) };
  }
}
