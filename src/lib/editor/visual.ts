import { applyEdits, bpmToCpm, formatNumber, setPattern, type ParsedDocument, type Track, type MiniNode } from '../project';

export const INITIAL_CODE = 'setcpm(30);\n\ndrums: s("bd ~ sd ~, hh hh hh hh").gain(0.8).pan(0.5).lpf(12000);';
export function trackById(document: ParsedDocument, id: string): Track {
  const track = document.project.items.find((item): item is Track => item.kind === 'track' && item.id === id);
  if (!track) throw new Error('This track was removed while you were typing.');
  return track;
}
export function drumRows(track: Track): MiniNode[][] | null {
  if (track.source.kind !== 'drums' || track.source.pattern.kind !== 'mini') return null;
  const rows = track.source.pattern.rows;
  return rows.every(row => row.length <= 64 && row.every(node => node.kind === 'atom' || node.kind === 'rest')) ? rows : null;
}
export function changeStep(document: ParsedDocument, id: string, rowIndex: number, step: number): ParsedDocument {
  const rows = drumRows(trackById(document, id));
  if (!rows?.[rowIndex]?.[step]) throw new Error('This pattern changed while you were typing. Try the step again.');
  const next = rows.map(row => [...row]);
  const sound = rows[rowIndex].find(node => node.kind === 'atom') ?? { kind: 'atom' as const, value: 'bd' };
  next[rowIndex][step] = next[rowIndex][step].kind === 'rest' ? { ...sound } : { kind: 'rest' };
  return setPattern(document, id, { kind: 'mini', rows: next });
}
export function changeLength(document: ParsedDocument, id: string, rowIndex: number, length: number): ParsedDocument {
  const rows = drumRows(trackById(document, id));
  if (!rows?.[rowIndex] || !Number.isInteger(length) || length < 1 || length > 64) throw new Error('Row is no longer editable');
  const next = rows.map(row => [...row]);
  next[rowIndex] = Array.from({ length }, (_, i) => next[rowIndex][i] ?? { kind: 'rest' });
  return setPattern(document, id, { kind: 'mini', rows: next });
}
export function setBpm(document: ParsedDocument, bpm: number): ParsedDocument {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new Error('Tempo must be a positive number');
  if (hasRawTempo(document)) throw new Error('Tempo includes code-only parts. Edit it in the code pane.');
  const tempoIndex = document.project.items.findLastIndex(item => item.kind === 'tempo');
  const tempo = document.project.items[tempoIndex];
  if (tempo?.kind === 'tempo') {
    if (tempo.value.kind !== 'number') throw new Error('Tempo uses an expression. Edit it in the code pane.');
    const location = document.tempos.find(location => location.itemIndex === tempoIndex)!;
    return applyEdits(document, [
      { from: location.range.from, to: location.range.from + 6, insert: 'setcpm' },
      { ...location.argument, insert: formatNumber(bpmToCpm(bpm)) }
    ]);
  }
  const next = applyEdits(document, [{ from: 0, to: 0, insert: `setcpm(${formatNumber(bpmToCpm(bpm))});\n` }]);
  if (!next.project.items.some(item => item.kind === 'tempo')) throw new Error('Tempo function is shadowed; edit tempo in code.');
  return next;
}
export function hasRawTempo(document: ParsedDocument): boolean {
  return document.project.items.some(item => item.kind === 'raw' && /\bset[cC]p[sm]\b/.test(item.code));
}
