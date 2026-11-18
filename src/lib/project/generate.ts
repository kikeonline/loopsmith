import { parse, parseExpressionAt, type Comment } from 'acorn';
import { emitMini } from './mini';
import { formatNumber, quote, trackLabel, type ChainCall, type Parameter, type Project, type Track } from './model';

import { PROJECT_MARKER, TRACK_MARKER, stableJSON } from './metadata';
import { parseDocument } from './parse';
const options = { ecmaVersion: 'latest', allowAwaitOutsideFunction: true, preserveParens: true } as const;

export function emitParameter(param: Parameter): string {
  if (param.kind === 'number') return formatNumber(param.value);
  // Do not add parentheses to preserved expression arguments: their source is authoritative.
  const node = parseExpressionAt(param.code, 0, options);
  if (node.start !== 0 || node.end !== param.code.length || node.type === 'SequenceExpression') throw new Error('Parameter must be one complete expression');
  return param.code;
}
export function emitCall(call: ChainCall): string {
  if (call.kind === 'effect') return `.${call.name}(${emitParameter(call.value)})`;
  if (call.kind === 'control') return `.${call.name}(${quote(call.value)})`;
  // Validate the suffix as a chain while preserving every byte, including unknown callbacks.
  const expression = parseExpressionAt(`s("bd")${call.code}`, 0, options);
  if (expression.end !== `s("bd")${call.code}`.length || expression.type !== 'CallExpression' || expression.callee.type !== 'MemberExpression') throw new Error('Opaque call must be a complete method suffix');
  return call.code;
}
export function emitTrackExpression(track: Track): string {
  if (track.source.kind === 'raw') {
    if (track.calls.length) throw new Error('Raw tracks keep their complete expression; no editable calls');
    const node = parseExpressionAt(track.source.code, 0, options);
    if (node.start !== 0 || node.end !== track.source.code.length) throw new Error('Raw track must be one complete expression');
    return track.source.code;
  }
  const name = track.source.kind === 'drums' ? 's' : track.source.mode;
  return `${name}(${quote(emitMini(track.source.pattern))})${track.calls.map(emitCall).join('')}`;
}

/** Explicit canonical regeneration only. Use source edits for ordinary UI changes. */
export function generateProject(project: Project): string {
  if (project.version !== 1) throw new Error('Unsupported project version');
  const ids = new Set<string>();
  const lines = [PROJECT_MARKER];
  for (const item of project.items) {
    if (item.kind === 'track') {
      if (!item.id || ids.has(item.id)) throw new Error('Track IDs must be nonempty and unique');
      ids.add(item.id);
      if (typeof item.name !== 'string' || typeof item.muted !== 'boolean' || typeof item.solo !== 'boolean') throw new Error('Invalid track metadata');
      const json = JSON.stringify({ id: item.id, name: item.name, ...(item.source.kind === 'raw' ? { raw: true } : {}) });
      lines.push(TRACK_MARKER + json.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'));
      lines.push(`${trackLabel(item)}: ${emitTrackExpression(item)};`);
    } else if (item.kind === 'tempo') {
      lines.push(`set${item.unit}(${emitParameter(item.value)});`);
    } else {
      const code = item.code;
      if (!code) throw new Error('Raw block must not be empty');
      const comments: Comment[] = [];
      const ast = parse(code, { ...options, onComment: comments });
      const nodes = ast.body.length ? ast.body : comments;
      if (nodes.length !== 1 || nodes[0].start !== 0 || nodes[0].end !== code.length) throw new Error('Raw block must be one complete top-level statement or comment');
      lines.push(code);
    }
  }
  const output = lines.join('\n') + '\n';
  parse(output, options); // Reject invalid combinations rather than return broken JavaScript.
  const verified = parseDocument(output);
  if (!verified.ok || stableJSON(verified.document.project) !== stableJSON(project)) {
    throw new Error('Project is not representable: check native keys/flags, raw blocks, and numeric/opaque parameters');
  }
  return output;
}
