import type { OutputEvent } from './output';
export interface MidiPort {
  id: string; name: string | null; state: string;
  open(): Promise<unknown>; close(): Promise<unknown>;
  send(data: number[], timestamp?: number): void; clear(): void;
}
export interface MidiAccess {
  outputs: { values(): IterableIterator<MidiPort> };
  addEventListener(type: 'statechange', listener: () => void): void;
  removeEventListener(type: 'statechange', listener: () => void): void;
}
export interface MidiState { available: boolean; requesting: boolean; outputs: {id:string;name:string}[]; selected: string; enabled: boolean; error: string }
interface Message { time: number; note: number; on: boolean; generation: number }
/** One explicitly selected output/channel. No sysex, input, program changes, or source mutation. */
export class MidiMirror {
  state: MidiState;
  private access?: MidiAccess;
  private port?: MidiPort;
  private revision = 0;
  private disposed = false;
  private channel = 0;
  private velocity = 100;
  private queue: Message[] = [];
  private voices = new Map<number,number>();
  private sent = new Set<number>();
  private sequence = 0;
  private transition: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  constructor(private changed: (state: MidiState) => void, private request?: () => Promise<MidiAccess>, private now = () => performance.now()) {
    this.state = {available:!!request,requesting:false,outputs:[],selected:'',enabled:false,error:''};
  }
  private notify() { this.changed({...this.state,outputs:[...this.state.outputs]}); }
  private refresh = () => {
    this.state.outputs = [...(this.access?.outputs.values() ?? [])].filter(port => port.state === 'connected').map(port => ({id:port.id,name:port.name || 'Unnamed MIDI output'}));
    if (this.port && !this.state.outputs.some(port => port.id === this.port!.id)) { this.disable(); this.state.error = 'MIDI output disconnected. Choose an output and enable mirroring again.'; }
    if (!this.state.outputs.some(port => port.id === this.state.selected)) this.state.selected = '';
    this.notify();
  };
  async connect() {
    if (!this.request || this.disposed || this.state.requesting) return;
    this.disable();
    this.state.requesting = true; this.state.error = ''; this.notify();
    try {
      const access = await this.request();
      if (this.disposed) return;
      this.access?.removeEventListener('statechange',this.refresh);
      this.access = access; access.addEventListener('statechange',this.refresh); this.refresh();
    } catch (cause) { if (!this.disposed) this.state.error = `Could not access MIDI: ${cause instanceof Error ? cause.message : String(cause)}`; }
    finally { this.state.requesting = false; if (!this.disposed) this.notify(); }
  }
  select(id: string) { this.disable(); this.state.selected = id; this.state.error = ''; this.notify(); }
  async enable(channel: number, velocity: number) {
    if (!Number.isInteger(channel) || channel < 1 || channel > 16 || !Number.isInteger(velocity) || velocity < 1 || velocity > 127) { this.state.error = 'Choose channel 1–16 and velocity 1–127.'; this.notify(); return; }
    this.disable(); const revision = this.revision;
    const port = [...(this.access?.outputs.values() ?? [])].find(port => port.id === this.state.selected && port.state === 'connected');
    if (!port) { this.state.error = 'Choose a connected MIDI output first.'; this.notify(); return; }
    const opening = this.transition.then(async () => {
      if (this.disposed || revision !== this.revision) return;
      try {
        await port.open();
        if (this.disposed || revision !== this.revision || port.state !== 'connected') { await port.close(); return; }
        this.port = port; this.channel = channel - 1; this.velocity = velocity;
        this.state.enabled = true; this.state.error = '';
        this.timer = setInterval(() => this.flush(),10); this.notify();
      } catch (cause) { if (!this.disposed && revision === this.revision) { this.state.error = `Could not open MIDI output: ${cause instanceof Error ? cause.message : String(cause)}`; this.notify(); } }
    });
    this.transition = opening.catch(() => {});
    await opening;
  }

  receive(event: OutputEvent) {
    if (!this.state.enabled || event.note === null || !Number.isInteger(event.note) || event.note < 0 || event.note > 127 || !Number.isFinite(event.start) || !Number.isFinite(event.end) || event.end <= event.start || event.end < this.now()) return;
    if (this.queue.length >= 1024) { this.fail(new Error('MIDI event limit reached; mirroring stopped.')); return; }
    const generation = ++this.sequence;
    this.queue.push({time:event.start,note:event.note,on:true,generation},{time:event.end,note:event.note,on:false,generation});
    this.flush();
  }
  /** Look ahead for note-ons; retain note-offs locally until due so retriggers can cancel them. */
  flush() {
    if (!this.port || !this.state.enabled) return;
    const now = this.now();
    const ready = this.queue.filter(message => message.time <= now + (message.on ? 20 : 0));
    this.queue = this.queue.filter(message => message.time > now + (message.on ? 20 : 0));
    ready.sort((a,b) => a.time-b.time || Number(a.on)-Number(b.on));
    try {
      for (const message of ready) {
        if (message.on) {
          if (this.voices.has(message.note)) this.port.send([0x80+this.channel,message.note,0],message.time);
          this.voices.set(message.note,message.generation); this.sent.add(message.note);
          this.port.send([0x90+this.channel,message.note,this.velocity],message.time);
        } else if (this.voices.get(message.note) === message.generation) {
          this.port.send([0x80+this.channel,message.note,0],message.time);
          this.voices.delete(message.note);
        }
      }
    } catch (cause) { this.fail(cause); }
  }
  private fail(cause: unknown) { this.disable(); this.state.error = `MIDI stopped: ${cause instanceof Error ? cause.message : String(cause)}`; this.notify(); }
  panic() {
    this.queue = []; this.voices.clear();
    if (this.port) {
      try { this.port.clear(); } catch { /* Port may have disappeared. */ }
      for (const note of this.sent) { try { this.port.send([0x80+this.channel,note,0]); } catch { /* Continue releasing other notes. */ } }
    }
    this.sent.clear();
  }
  disable() {
    this.revision++; if (this.timer !== undefined) clearInterval(this.timer); this.timer = undefined;
    this.panic(); const port = this.port; this.port = undefined;
    if (port) this.transition = this.transition.then(() => port.close()).catch(() => {});
    this.state.enabled = false; this.notify();
  }
  destroy() { this.disposed = true; this.disable(); this.access?.removeEventListener('statechange',this.refresh); }
}
