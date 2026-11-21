/** Runtime timestamps use performance.now() milliseconds, not pattern cycles. */
export interface OutputEvent { id: number; start: number; end: number; note: number | null; sound: string }
export interface OutputSnapshot { now: number; events: OutputEvent[]; waveform: number[] }
export interface ScheduledHap { value: unknown; whole?: { begin: { valueOf(): number } }; ensureObjectValue(): void }
export function pitchedNote(value: unknown, convert: (value: Record<string, unknown>) => number): number | null {
  if (!value || typeof value !== 'object' || !('note' in value || 'freq' in value)) return null;
  try {
    const pitch = convert(value as Record<string, unknown>);
    if (!Number.isFinite(pitch)) return null;
    const rounded = Math.round(pitch);
    return rounded >= 0 && rounded <= 127 ? rounded : null;
  } catch { return null; }
}
/** Bounded observations of scheduled default-output events; never queries/evaluates user patterns. */
export class OutputHistory {
  private events: OutputEvent[] = [];
  private sequence = 0;
  private listeners = new Set<(event: OutputEvent) => void>();
  constructor(private now = () => performance.now()) {}
  subscribe(listener: (event: OutputEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  record(hap: ScheduledHap, duration: number, targetTime: number, audioTime: number, convert: (value: Record<string, unknown>) => number) {
    if (![duration,targetTime,audioTime].every(Number.isFinite) || duration <= 0) return;
    const now = this.now(), start = now + (targetTime - audioTime) * 1000;
    const value = hap.value;
    const sound = value && typeof value === 'object' && 's' in value ? String(value.s).slice(0,80) : '';
    const event = { id: ++this.sequence, start, end: start + Math.min(duration,60) * 1000, note: pitchedNote(value,convert), sound };
    this.events = [...this.events.filter(event => event.end >= now - 4000), event].slice(-256);
    for (const listener of this.listeners) { try { listener(event); } catch { /* Observers cannot interrupt audio output. */ } }
  }
  snapshot(): OutputSnapshot {
    const now = this.now(); this.events = this.events.filter(event => event.end >= now - 4000);
    return { now, events: this.events.map(event => ({...event})), waveform: [] };
  }
  clear() { this.events = []; }
}
