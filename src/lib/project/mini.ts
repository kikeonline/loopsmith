import { stableJSON } from './metadata';
/** Lossless structural subset. Unsupported grammar stays opaque, never approximated. */
export type MiniNode =
  | { kind: 'atom'; value: string; sampleIndex?: number }
  | { kind: 'rest' }
  | { kind: 'group'; rows: MiniNode[][] }
  | { kind: 'alternate'; steps: MiniNode[] }
  | { kind: 'modify'; operator: '*' | '@' | '!'; count: number; node: MiniNode };
export type MiniPattern = { kind: 'mini'; rows: MiniNode[][] } | { kind: 'opaque'; code: string };

const atom = /^(?:[a-zA-Z_][a-zA-Z0-9_#-]*|-?\d+(?:\.\d+)?)(?::\d+)?$/;

export function parseMini(code: string): MiniPattern {
  let at = 0;
  let nodes = 0;
  const space = () => { while (/\s/.test(code[at] ?? '') && at < code.length) at++; };
  function rows(close = '', depth = 0): MiniNode[][] {
    if (depth > 32) throw new Error('Too deeply nested');
    const result: MiniNode[][] = [[]];
    while (at < code.length) {
      space();
      if (close && code[at] === close) { at++; return finish(); }
      if (at === code.length) break;
      if (code[at] === ',') { at++; result.push([]); continue; }
      if (++nodes > 4096) throw new Error('Too many nodes');
      let node: MiniNode;
      if (code[at] === '[') { at++; node = { kind: 'group', rows: rows(']', depth + 1) }; }
      else if (code[at] === '<') {
        at++;
        const options = rows('>', depth + 1);
        if (options.length !== 1) throw new Error('Parallel alternation is opaque');
        node = { kind: 'alternate', steps: options[0] };
      } else {
        const begin = at;
        while (at < code.length && !/[\s,\[\]<>*!@]/.test(code[at])) at++;
        const token = code.slice(begin, at);
        if (token === '~') node = { kind: 'rest' };
        else {
          if (!atom.test(token) || token === '_' || token.includes('..')) throw new Error('Unsupported atom');
          const [value, index] = token.split(':');
          if (index !== undefined && (!Number.isSafeInteger(Number(index)) || String(Number(index)) !== index)) throw new Error('Unsupported sample index');
          node = index === undefined ? { kind: 'atom', value } : { kind: 'atom', value, sampleIndex: Number(index) };
        }
      }
      // A single postfix is exact. Mixed/repeated postfix semantics stay opaque.
      if (/[*@!]/.test(code[at] ?? '') && at < code.length) {
        const operator = code[at++] as '*' | '@' | '!';
        const begin = at;
        while (/\d/.test(code[at] ?? '') && at < code.length) at++;
        const count = Number(code.slice(begin, at));
        if (!Number.isSafeInteger(count) || count < 1 || count > 1024 || String(count) !== code.slice(begin, at)) throw new Error('Unsupported modifier');
        node = { kind: 'modify', operator, count, node };
      }
      result[result.length - 1].push(node);
      if (at < code.length && !/[\s,\]>]/.test(code[at])) throw new Error('Unsupported adjacency');
    }
    if (close) throw new Error('Unclosed group');
    return finish();
    function finish() {
      if (result.some(row => row.length === 0)) throw new Error('Empty sequence');
      return result;
    }
  }
  try { return { kind: 'mini', rows: rows() }; }
  catch { return { kind: 'opaque', code }; }
}

export function emitMini(pattern: MiniPattern): string {
  if (pattern.kind === 'opaque') return pattern.code;
  const emitRows = (rows: MiniNode[][]): string => rows.map(row => row.map(emitNode).join(' ')).join(', ');
  function emitNode(node: MiniNode): string {
    switch (node.kind) {
      case 'atom': return node.value + (node.sampleIndex === undefined ? '' : `:${node.sampleIndex}`);
      case 'rest': return '~';
      case 'group': return `[${emitRows(node.rows)}]`;
      case 'alternate': return `<${node.steps.map(emitNode).join(' ')}>`;
      case 'modify': return `${emitNode(node.node)}${node.operator}${node.count}`;
    }
  }
  const code = emitRows(pattern.rows);
  // Reject models that cannot be represented exactly by the supported grammar.
  if (stableJSON(parseMini(code)) !== stableJSON(pattern)) throw new Error('Mini model is not representable');
  return code;
}

export interface NoteEvent {
  note: string;
  row: number;
  start: { numerator: number; denominator: number };
  duration: { numerator: number; denominator: number };
}

/** Flat, equally spaced note rows only. Nested/variable timing returns null. */
export function noteEvents(pattern: MiniPattern): NoteEvent[] | null {
  if (pattern.kind !== 'mini' || pattern.rows.some(row => row.some(n => (n.kind !== 'atom' && n.kind !== 'rest') || (n.kind === 'atom' && n.sampleIndex !== undefined)))) return null;
  return pattern.rows.flatMap((row, r) => row.flatMap((node, i) => node.kind === 'atom' ? [{
    note: node.value, row: r,
    start: { numerator: i, denominator: row.length },
    duration: { numerator: 1, denominator: row.length }
  }] : []));
}
