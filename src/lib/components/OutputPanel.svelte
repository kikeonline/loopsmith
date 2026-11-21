<script lang="ts">
  import { onMount } from 'svelte';
  import type { Playback } from '../editor/playback';
  import { MidiMirror, type MidiAccess, type MidiState } from '../editor/midi';
  import type { OutputSnapshot } from '../editor/output';
  import { pitchName } from '../editor/composition';
  let { playback, playing, stale }: {playback:Playback;playing:boolean;stale:boolean} = $props();
  let show = $state(false);
  let channel = $state(1), velocity = $state(100);
  let midi: MidiMirror;
  let midiState = $state<MidiState>({available:false,requesting:false,outputs:[],selected:'',enabled:false,error:''});
  let snapshot = $state<OutputSnapshot>({now:0,events:[],waveform:[]});
  let visualError = $state('');
  const visibleNotes = $derived(snapshot.events.filter(event => event.note !== null && event.start <= snapshot.now && event.end >= snapshot.now - 4000));
  const active = $derived([...new Set(snapshot.events.filter(event => event.note !== null && event.start <= snapshot.now && event.end > snapshot.now).map(event => event.note!))].sort((a,b) => a-b));
  const low = $derived(Math.min(48,...visibleNotes.map(event => event.note!)));
  const high = $derived(Math.max(72,...visibleNotes.map(event => event.note!)));
  const trace = $derived(snapshot.waveform.map((value,index,array) => `${index ? 'L' : 'M'}${index * 640 / Math.max(1,array.length-1)},${50 - Math.max(-1,Math.min(1,value))*45}`).join(' '));
  onMount(() => {
    const request = typeof navigator.requestMIDIAccess === 'function' ? async () => await navigator.requestMIDIAccess({sysex:false}) as unknown as MidiAccess : undefined;
    midi = new MidiMirror(state => midiState = state,request);
    midiState = {...midi.state};
    const unsubscribe = playback.onEvent(event => midi.receive(event));
    const unsubscribeStop = playback.onStop(() => midi.panic());
    const hide = () => { if (document.hidden) midi.disable(); };
    const leave = () => midi.disable();
    document.addEventListener('visibilitychange',hide); window.addEventListener('pagehide',leave);
    return () => { unsubscribe(); unsubscribeStop(); midi.destroy(); playback.releaseMonitor(); document.removeEventListener('visibilitychange',hide); window.removeEventListener('pagehide',leave); };
  });
  $effect(() => {
    if (!show || !playing) { snapshot = {now:0,events:[],waveform:[]}; playback.releaseMonitor(); return; }
    let frame = 0, last = -Infinity;
    const tick = (time: number) => {
      if (time - last >= 33) {
        try { snapshot = playback.monitor(); visualError = ''; } catch (cause) { visualError = `Visualizer unavailable: ${cause instanceof Error ? cause.message : String(cause)}`; }
        last = time;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); playback.releaseMonitor(); };
  });
</script>
<section class="output-panel" aria-label="Runtime output">
  <div class="output-heading"><h2>Runtime output</h2><label class="output-toggle"><input type="checkbox" bind:checked={show} /> Show runtime visualizers</label></div>
  <p class="hint">Scope shows the audio mix; piano roll shows scheduled pitched events from the default output, including arrangements and modifiers. Custom output callbacks can bypass the event view. Sound previews are excluded.</p>
  {#if stale}<p class="badge">Showing the last playing version while code is unsynced.</p>{/if}
  {#if show}
    <div class="output-visualizers">
      <figure><figcaption>Audio scope</figcaption><svg class="output-scope" role="img" aria-label="Live audio output waveform" viewBox="0 0 640 100"><path class="scope-center" d="M0,50H640" /><path class="scope-trace" d={trace || 'M0,50H640'} /></svg><p class="hint">{playing ? 'Live mix, including audio tails.' : 'Stopped. Press Play to see output.'}</p></figure>
      <figure><figcaption>Runtime piano roll · last 4 seconds</figcaption><svg class="output-piano" role="img" aria-label="Scheduled pitched note gates over the last four seconds" viewBox="0 0 640 160">
        {#each [low,Math.round((low+high)/2),high] as note}<text x="4" y={152-(note-low)*140/(high-low+1)}>{pitchName(note).toUpperCase()}</text>{/each}
        {#each visibleNotes as event (event.id)}<rect x={50+Math.max(0,(event.start-snapshot.now+4000)/4000)*580} y={145-(event.note!-low)*140/(high-low+1)} width={Math.max(1,(Math.min(snapshot.now,event.end)-Math.max(snapshot.now-4000,event.start))/4000*580)} height={Math.max(2,130/(high-low+1))} />{/each}
        <path class="piano-now" d="M632,0V160" />
      </svg><p class="hint">Scheduled gates, not recorded sound or editable notes. {playing && !visibleNotes.length ? 'Waiting for pitched events; unpitched drums have no note lane.' : ''}</p><p class="output-notes">Sounding notes: {active.length ? active.map(note => `${pitchName(note).toUpperCase()} (${note})`).join(', ') : 'none'}</p></figure>
    </div>
    {#if visualError}<p class="error" role="alert">{visualError}</p>{/if}
  {/if}
  <div class="midi-output">
    <h3>MIDI note mirror</h3>
    <p class="hint">Mirror pitched default-output events to one device while browser audio continues. Pitch is rounded to the nearest MIDI note; unpitched drums are skipped. Channel and velocity apply to every mirrored note. Gate length follows the scheduled event, up to 60 seconds. Device settings last for this session; switching tabs disables MIDI.</p>
    <div class="midi-tools">
      <button class="flag" disabled={!midiState.available || midiState.requesting} onclick={() => midi.connect()}>{midiState.requesting ? 'Requesting MIDI…' : 'Connect MIDI'}</button>
      <label>MIDI output <select aria-label="MIDI output" value={midiState.selected} onchange={event => midi.select(event.currentTarget.value)}><option value="">Choose an output</option>{#each midiState.outputs as port}<option value={port.id}>{port.name}</option>{/each}</select></label>
      <label>MIDI channel <input aria-label="MIDI channel" type="number" min="1" max="16" step="1" bind:value={channel} onchange={() => midi.disable()} /></label>
      <label>MIDI velocity <input aria-label="MIDI velocity" type="number" min="1" max="127" step="1" bind:value={velocity} onchange={() => midi.disable()} /></label>
      <button class="flag" disabled={!midiState.selected || midiState.enabled} onclick={() => midi.enable(channel,velocity)}>Enable MIDI mirror</button>
      <button class="flag" disabled={!midiState.enabled} onclick={() => midi.disable()}>Disable MIDI mirror</button>
      <button class="flag" disabled={!midiState.enabled} onclick={() => midi.panic()}>MIDI panic</button>
    </div>
    <p class="hint" aria-live="polite">{!midiState.available ? 'Web MIDI is unavailable here. Use a browser with Web MIDI on HTTPS or localhost.' : midiState.enabled ? 'MIDI mirroring enabled. Stop and panic release queued and held notes.' : midiState.outputs.length ? 'MIDI mirroring off. Choose an output and enable it to send notes.' : 'MIDI mirroring off. Connect MIDI to request device access; no system-exclusive access is requested.'}</p>
    {#if midiState.error}<p class="error" role="alert">{midiState.error}</p>{/if}
  </div>
</section>
