import { parse, type AnyNode as Node } from 'acorn';
import type { ParsedDocument, Span } from '../project';
import type { OutputEvent } from './output';
import { drumRows } from './visual';
import { melodicRows } from './composition';
const cache = new Map<string,Span[]>();
/** The pinned transpiler's offsets are unreliable for cooked escape sequences. */
function literalRanges(code: string): Span[] {
  const cached = cache.get(code); if (cached) return cached;
  const ranges: Span[] = [];
  try {
    const ast = parse(code,{ecmaVersion:'latest',allowAwaitOutsideFunction:true});
    const visit = (node: Node, parent?: Node) => {
      const raw = code.slice(node.start,node.end);
      if (node.type === 'Literal' && typeof node.value === 'string' || node.type === 'TemplateLiteral' && node.expressions.length === 0 && parent?.type !== 'TaggedTemplateExpression') {
        if (!raw.includes('\\')) ranges.push({from:node.start+1,to:node.end-1});
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) for (const child of value) { if (child && typeof child === 'object' && typeof child.type === 'string') visit(child,node); }
        else if (value && typeof value === 'object' && 'type' in value && typeof value.type === 'string') visit(value as Node,node);
      }
    };
    visit(ast);
  } catch { ranges.length = 0; /* Invalid/incomplete drafts have no eligible source spans. */ }
  if (cache.size >= 4) cache.delete(cache.keys().next().value!);
  ranges.sort((a,b) => a.from-b.from);
  cache.set(code,ranges); return ranges;
}
export function mergeSpans(ranges: readonly Span[]): Span[] {
  const result: Span[] = [];
  for (const range of [...ranges].sort((a,b) => a.from-b.from || a.to-b.to)) {
    const last = result[result.length-1];
    if (last && range.from <= last.to) last.to = Math.max(last.to,range.to);
    else result.push({...range});
  }
  return result;
}
/** Follow reported scheduled gates, never predict a transformed step from the wall clock. */
export function activeSourceSpans(events: readonly OutputEvent[], now: number, code: string): Span[] {
  if (!Number.isFinite(now)) return [];
  const literals = literalRanges(code), ranges: Span[] = [];
  for (const event of events) {
    if (event.source !== code || !(event.start <= now && now < event.end)) continue;
    for (const range of event.locations ?? []) {
      if (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from >= range.to) continue;
      let low = 0, high = literals.length;
      while (low < high) { const middle = (low+high) >>> 1; if (literals[middle].from <= range.from) low = middle+1; else high = middle; }
      const literal = literals[low-1];
      if (literal && literal.from <= range.from && range.to <= literal.to) ranges.push(range);
    }
  }
  return mergeSpans(ranges);
}
export function overlaps(a: Span,b: Span) { return a.from < b.to && b.from < a.to; }
/** Flat editable slots are mapped to original literal bytes; unsupported timing remains in code. */
export function eventSteps(document: ParsedDocument, trackId: string, active: readonly Span[], sourceOffset = 0): boolean[][] {
  const track = document.project.items.find(item => item.kind === 'track' && item.id === trackId);
  if (!track || track.kind !== 'track') return [];
  const rows = drumRows(track) ?? melodicRows(track);
  const argument = document.tracks[trackId]?.sourceArgument;
  if (!rows || !argument) return [];
  const literal = document.code.slice(argument.from,argument.to);
  if (literal.includes('\\') || !['"',"'",'`'].includes(literal[0])) return [];
  const text = literal.slice(1,-1), tokens = [...text.matchAll(/[^\s,]+|,/g)];
  const spans: Span[][] = [[]];
  for (const token of tokens) {
    if (token[0] === ',') spans.push([]);
    else spans[spans.length-1].push({from:argument.from+1+token.index!+sourceOffset,to:argument.from+1+token.index!+token[0].length+sourceOffset});
  }
  if (spans.length !== rows.length || spans.some((row,index) => row.length !== rows[index].length)) return [];
  return spans.map((row,i) => row.map((span,j) => rows[i][j].kind === 'atom' && active.some(range => overlaps(span,range))));
}
