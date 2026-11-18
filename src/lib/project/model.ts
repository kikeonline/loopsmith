import type { MiniPattern } from './mini';

export const EFFECTS = {
  gain: { label: 'Volume', min: 0, max: 2 },
  pan: { label: 'Pan', min: 0, max: 1 },
  lpf: { label: 'Low-pass filter', min: 20, max: 20000 },
  hpf: { label: 'High-pass filter', min: 20, max: 20000 },
  room: { label: 'Reverb', min: 0, max: 1 },
  delay: { label: 'Delay', min: 0, max: 1 },
  delaytime: { label: 'Delay time', min: 0, max: 1 },
  delayfeedback: { label: 'Delay feedback', min: 0, max: 0.98 },
  attack: { label: 'Attack', min: 0, max: 4 },
  release: { label: 'Release', min: 0, max: 4 },
  speed: { label: 'Sample speed', min: -4, max: 4 }
} as const;
export type EffectName = keyof typeof EFFECTS;
export const EFFECT_ALIASES: Record<string, EffectName> = { cutoff: 'lpf', ctf: 'lpf', lp: 'lpf', hcutoff: 'hpf', hp: 'hpf', att: 'attack', rel: 'release', delayfb: 'delayfeedback', dfb: 'delayfeedback', delayt: 'delaytime', dt: 'delaytime' };
export function effectName(name: string): EffectName | undefined {
  return Object.hasOwn(EFFECTS, name) ? name as EffectName : Object.hasOwn(EFFECT_ALIASES, name) ? EFFECT_ALIASES[name] : undefined;
}
export type Parameter = { kind: 'number'; value: number } | { kind: 'expression'; code: string };
export type ChainCall =
  | { kind: 'effect'; name: EffectName; value: Parameter }
  | { kind: 'control'; name: 's' | 'scale'; value: string }
  | { kind: 'opaque'; code: string };
export type TrackSource =
  | { kind: 'drums'; pattern: MiniPattern }
  | { kind: 'notes'; mode: 'note' | 'n'; pattern: MiniPattern }
  | { kind: 'raw'; code: string };
export interface Track {
  kind: 'track';
  id: string;
  /** Native registration key without mute/solo label affixes. May repeat or contain $. */
  key: string;
  name: string;
  muted: boolean;
  solo: boolean;
  source: TrackSource;
  calls: ChainCall[];
}
export interface RawBlock { kind: 'raw'; code: string }
export interface Tempo { kind: 'tempo'; unit: 'cps' | 'cpm'; value: Parameter }
export interface Project { version: 1; items: (Track | RawBlock | Tempo)[] }
export const emptyProject = (): Project => ({ version: 1, items: [] });

// Numeric model fields are exact thousandths, including negative values, within a bounded range.
export function representable(value: number): boolean {
  return Number.isFinite(value) && !Object.is(value, -0) && Math.abs(value) <= 1e9 && Math.round(value * 1000) / 1000 === value;
}
export function formatNumber(value: number): string {
  if (!representable(value)) throw new Error('Numbers must be finite exact thousandths within ±1e9 (excluding -0)');
  return String(value);
}
export function bpmToCps(bpm: number): number { return bpm / 240; }
export function cpsToBpm(cps: number): number { return cps * 240; }
export function bpmToCpm(bpm: number): number { return bpm / 4; }

/** Generated identifiers avoid keywords, arbitrary names, and native S/_ semantics. */
export function trackLabel(track: Pick<Track, 'id' | 'muted' | 'solo'> & { key?: string }): string {
  const id = Array.from(new TextEncoder().encode(track.id), n => n.toString(16).padStart(2, '0')).join('');
  if (!id) throw new Error('Track ID must not be empty');
  return `${track.muted ? '_' : ''}${track.solo ? 'S' : ''}${track.key ?? `t_${id}`}`;
}
export const quote = (text: string): string => JSON.stringify(text).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function createTrack(input: Pick<Track, 'id' | 'name' | 'source'> & Partial<Pick<Track, 'calls' | 'muted' | 'solo'>>): Track {
  const key = trackLabel({ id: input.id, muted: false, solo: false });
  return { kind: 'track', id: input.id, key, name: input.name, source: input.source, calls: input.calls ?? [], muted: input.muted ?? false, solo: input.solo ?? false };
}
