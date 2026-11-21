<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorSync, type SyncState, type VisualEdit } from '../lib/editor/sync';
  import { INITIAL_CODE, drumRows, setBpm, hasRawTempo } from '../lib/editor/visual';
  import { Playback, type PlaybackState } from '../lib/editor/playback';
  import { createRuntime } from '../lib/runtime';
  import { parseDocument, setEffect, setTrackFlags, type Track } from '../lib/project';
  import { addTrack, deleteTrack, duplicateTrack, moveTrack, renameTrack, convertToRaw, melodicRows, effectParameter, canHighlight, type TrackKind } from '../lib/editor/composition';
  import PatternEditor from '../lib/components/PatternEditor.svelte';
  import ArrangementControls from '../lib/components/ArrangementControls.svelte';
  import { readArrangement, createArrangement, sectionProxy, outerProxy, editArrangementEffects } from '../lib/editor/arrangement';
  import { callIsCodeOnly } from '../lib/editor/modifiers';
  import OutputPanel from '../lib/components/OutputPanel.svelte';
  import ProjectBar from '../lib/components/ProjectBar.svelte';
  import { projectFile, readProjectFile, serializeProject, STORAGE_KEY, type RestoredProject } from '../lib/persistence/project-file';
  import type { ParsedDocument } from '../lib/project';

  const initial = parseDocument(INITIAL_CODE);
  if (!initial.ok) throw new Error('Invalid starter project');
  let sync = $state<SyncState>({ document: initial.document, error: '', editError: '', queued: 0, lastEditSource: 'code' });
  let audio = $state<PlaybackState>({ playing: false, loading: false, error: '', activeCode: '' });
  let projectName = $state('Untitled loop');
  let saveStatus = $state('Not yet saved on this device');
  let saveError = $state('');
  let recovery = $state('');
  let autosavePaused = $state(false);
  let storage: Storage | undefined;
  let selectedId = $state('');
  let newTrackKind = $state<TrackKind>('drums');
  let dock = $state<'side' | 'bottom'>('side');
  let collapsed = $state(false);
  let cycle = $state(0);
  let editorHost: HTMLDivElement;
  let editor: EditorSync;
  let playback = $state<Playback>(null!);
  const tracks = $derived(sync.document.project.items.filter((item): item is Track => item.kind === 'track'));
  const selected = $derived(tracks.find(track => track.id === selectedId) ?? tracks[0]);
  const arrangement = $derived(selected ? readArrangement(sync.document, selected.id) : undefined);
  const tempo = $derived(sync.document.project.items.findLast(item => item.kind === 'tempo'));
  const bpm = $derived(tempo?.kind === 'tempo' && tempo.value.kind === 'number' ? tempo.value.value * (tempo.unit === 'cpm' ? 4 : 240) : undefined);
  const tempoReadOnly = $derived(hasRawTempo(sync.document) || (tempo?.kind === 'tempo' && tempo.value.kind === 'expression'));
  function trackCodeOnly(document: ParsedDocument, track: Track): boolean {
    const arrangement = readArrangement(document, track.id);
    if (arrangement) return arrangement.totalCycles === null || trackCodeOnly(outerProxy(document, track.id).document, outerProxy(document, track.id).track) || arrangement.sections.some(section => { const proxy = sectionProxy(document, track.id, section.id); return trackCodeOnly(proxy.document, proxy.track); });
    return track.source.kind === 'raw' || !(drumRows(track) || melodicRows(track)) || track.calls.some((_, index) => callIsCodeOnly(track, index));
  }
  const codeOnly = $derived(sync.document.project.items.some(item => item.kind === 'raw' || (item.kind === 'tempo' && item.value.kind === 'expression') || (item.kind === 'track' && trackCodeOnly(sync.document, item))));

  const highlighting = $derived(!!selected && audio.playing && audio.activeCode === sync.document.code && !sync.error && canHighlight(selected) && (selected.key.includes('$') || tracks.filter(track => track.key === selected.key).length === 1) && (!tracks.some(track => track.solo && !track.muted) || selected.solo));
  function add() { const id = crypto.randomUUID(); selectedId = id; const kind = newTrackKind; edit(document => addTrack(document, kind, id)); }
  function duplicate(id: string) { const nextId = crypto.randomUUID(); selectedId = nextId; edit(document => duplicateTrack(document, id, nextId)); }


  onMount(() => {
    let frame = 0;
    const factory = import.meta.env.MODE === 'e2e' ? async () => (await import('../lib/editor/fake-runtime')).createFakeRuntime() : createRuntime;
    playback = new Playback(state => { audio = state; }, factory);
    let restored: RestoredProject | undefined;
    try {
      storage = window.localStorage;
      const text = storage.getItem(STORAGE_KEY);
      if (text !== null) {
        try { restored = readProjectFile(text); projectName = restored.file.name; saveStatus = 'Restored from this device'; }
        catch (cause) { recovery = text; autosavePaused = true; saveStatus = 'Autosave paused'; throw cause; }
      }
    } catch (cause) { saveError = `Could not restore saved work: ${cause instanceof Error ? cause.message : String(cause)}. Existing saved data has not been changed.`; }
    editor = new EditorSync(editorHost, restored?.file.code ?? INITIAL_CODE, (state, validCode) => {
      sync = state;
      if (validCode !== undefined) playback.update(validCode);
    }, { initialDocument: restored?.document, draftChanged: saveDraft, projectLoaded: () => playback.stop() });
    if (import.meta.env.MODE === 'e2e') void import('../lib/editor/fake-runtime').then(module => module.connectEditor(editor.view));
    function tick() { cycle = audio.playing ? playback.cycle() : 0; frame = requestAnimationFrame(tick); }
    tick();
    return () => { cancelAnimationFrame(frame); editor.destroy(); playback.destroy(); };
  });
  function saveDraft(code: string, document: ParsedDocument) {
    if (autosavePaused) return;
    try {
      (storage ?? window.localStorage).setItem(STORAGE_KEY, serializeProject(projectFile(projectName, code, document), false));
      saveStatus = 'Saved on this device'; saveError = '';
    } catch (cause) { saveStatus = 'Not saved on this device'; saveError = `Autosave failed: ${cause instanceof Error ? cause.message : String(cause)}`; }
  }
  function renameProject(name: string) { projectName = name; const current = editor?.snapshot(); if (current) saveDraft(current.code, current.document); }
  function loadProject(restored: RestoredProject) {
    projectName = restored.file.name; selectedId = '';
    editor.load(restored.file.code, restored.document);
  }
  function resumeAutosave() { autosavePaused = false; const current = editor.snapshot(); saveDraft(current.code, current.document); if (saveError) autosavePaused = true; else recovery = ''; }
  function edit(operation: VisualEdit) { editor?.edit(operation); }
  function play() { if (!sync.error) playback?.play(editor.view.state.doc.toString()); }
  function globalKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === ' ' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      const target = event.target as HTMLElement;
      if (!event.repeat && !target.closest('input, textarea, select, button, a, summary, [contenteditable], [role="textbox"]')) {
        event.preventDefault();
        audio.playing || audio.loading ? playback?.stop() : play();
      }
      return;
    }
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? editor?.redo() : editor?.undo(); }
    if (event.key === 'Enter') { event.preventDefault(); play(); }
  }

</script>

<svelte:window onkeydown={globalKey} />
<svelte:head>
  <title>Loopsmith — build a loop, learn the code</title>
  <meta name="description" content="Build drum loops visually and discover the Strudel code behind every step." />
</svelte:head>

<main>
  <header>
    <a class="brand" href="/" aria-label="Loopsmith home"><span class="mark" aria-hidden="true">↻</span> loopsmith<span class="dot">.</span></a>
    <span class="stage">V1 / YOUR LOOP WORKSHOP</span>
  </header>
  <section class="intro">
    <p class="eyebrow">A SMALL IDEA. ON REPEAT.</p>
    <h1>Make a beat.<br />Meet the code<span class="dot">.</span></h1>
    <p>Tap a step to hear an idea. Watch the code change with you.</p>
  </section>
  <ProjectBar name={projectName} rename={renameProject} snapshot={() => editor.snapshot()} load={loadProject} {saveStatus} {saveError} {recovery} paused={autosavePaused} resume={resumeAutosave} />
  <section class="workspace" aria-label="Strudel playground">
    <div class="transport">
      <div class="actions">
        <button class="play" onclick={play} disabled={audio.loading || !!sync.error}>{audio.loading ? 'Loading audio…' : audio.playing ? '↻ Update loop' : '▶ Play loop'}</button>
        <button class="stop" onclick={() => playback?.stop()} disabled={!audio.playing && !audio.loading}>■ Stop</button>
      </div>
      <label class="tempo" title={tempoReadOnly ? 'Tempo includes code-only parts; edit in the code pane' : 'Four beats per cycle'}>Tempo <input aria-label="Tempo BPM" type="number" min="1" step="1" value={tempoReadOnly ? '' : bpm ?? ''} placeholder={tempoReadOnly ? 'Code' : '120'} disabled={tempoReadOnly} onchange={event => { const value = Number(event.currentTarget.value); edit(document => setBpm(document, value)); }} /> BPM</label>
      <div class="readout" role="status"><span class:lit={audio.playing} class="indicator"></span>{audio.loading ? 'Preparing audio / samples' : audio.playing ? `Playing · cycle ${Math.max(0, cycle).toFixed(1)}` : 'Ready when you are'}</div>
    </div>
    <div class="sync-bar" aria-live="polite"><span class:error-text={!!sync.error}>{sync.error ? 'Syntax error / using last good version' : 'In sync'}{codeOnly ? ' · Contains code-only parts' : ''}</span><span>{sync.queued ? `${sync.queued} visual edit(s) waiting for valid code and typing to pause` : 'Visual edits ↔ Strudel code'}</span></div>
    {#if sync.error}<div class="error" role="alert">{sync.error} The last good grid{audio.playing ? ' and loop remain' : ' remains'} in use.</div>{/if}
    {#if audio.error}<div class="error" role="alert"><strong>Couldn’t play that edit.</strong> {audio.error}{audio.playing ? ' The last good loop is still playing.' : ''}</div>{/if}
    {#if sync.editError}<div class="error" role="alert">{sync.editError}</div>{/if}
    <div class="workspace-body" class:bottom={dock === 'bottom'} class:code-hidden={collapsed}>
      <aside class="track-list" aria-label="Tracks">
        <p class="panel-label">YOUR TRACKS <span>{tracks.length.toString().padStart(2, '0')}</span></p>
        <div class="add-track"><label>New track <select aria-label="New track type" bind:value={newTrackKind}><option value="drums">Drums</option><option value="note">Melody · pitches</option><option value="n">Melody · scale</option></select></label><button class="flag" onclick={add}>+ Add track</button></div>
        {#each tracks as track (track.id)}
          <button class="track" class:selected={selected?.id === track.id} aria-pressed={selected?.id === track.id} onclick={() => { selectedId = track.id; }}><span>{track.name}</span><small>{track.source.kind === 'drums' ? 'Drums' : track.source.kind === 'notes' ? 'Melody' : readArrangement(sync.document, track.id) ? 'Arrangement' : 'Edited in code · locked'}{track.muted ? ' · muted' : ''}{track.solo ? ' · solo' : ''}</small></button>
        {/each}
        {#if !tracks.length}<p class="hint">Choose a track type and press Add track, or load a starter template above.</p>{/if}
      </aside>
      <section class="visual" aria-label="Visual editor">
        {#if selected}
          {@const id = selected.id}
          <div class="track-heading"><div><p class="panel-label">PATTERN / {arrangement ? 'ARRANGEMENT' : selected.source.kind === 'drums' ? 'DRUM STEPS' : 'CODE'}</p><h2>{selected.name}</h2></div><div class="actions"><button class="flag" aria-pressed={selected.muted} onclick={() => edit(document => setTrackFlags(document, id, { muted: !document.project.items.some(item => item.kind === 'track' && item.id === id && item.muted) }))}>Mute</button><button class="flag" aria-pressed={selected.solo} onclick={() => edit(document => setTrackFlags(document, id, { solo: !document.project.items.some(item => item.kind === 'track' && item.id === id && item.solo) }))}>Solo</button></div></div>
          <div class="track-tools">
            <label>Track name <input aria-label="Track name" value={selected.name} onchange={event => { const name = event.currentTarget.value; edit(document => renameTrack(document, id, name)); }} /></label>
            <div class="actions"><button class="flag" onclick={() => duplicate(id)}>Duplicate track</button><button class="flag" disabled={tracks[0]?.id === id} onclick={() => edit(document => moveTrack(document, id, -1))}>Move track up</button><button class="flag" disabled={tracks[tracks.length - 1]?.id === id} onclick={() => edit(document => moveTrack(document, id, 1))}>Move track down</button><button class="flag" onclick={() => edit(document => deleteTrack(document, id))}>Delete track</button></div>
            {#if selected.source.kind !== 'raw' || arrangement}<button class="text-button" title="Lock visual source/effect editing while keeping the complete expression unchanged. Undo to restore visual editing." onclick={() => edit(document => convertToRaw(document, id))}>Convert to raw</button>{/if}
            {#if selected.source.kind !== 'raw'}<button class="flag" onclick={() => { const sectionId = crypto.randomUUID(); edit(document => createArrangement(document, id, sectionId)); }}>Arrange this track</button>{/if}
          </div>
          {#if arrangement}
            <ArrangementControls document={sync.document} track={selected} {edit} {cycle} audible={audio.playing && audio.activeCode === sync.document.code && !sync.error && (selected.key.includes('$') || tracks.filter(track => track.key === selected.key).length === 1) && !selected.muted && (!tracks.some(track => track.solo && !track.muted) || selected.solo)} loadSounds={() => playback.sounds()} previewSound={name => playback.preview(name)} stopPreview={() => playback.stopPreview()} />
          {:else}
            <PatternEditor document={sync.document} track={selected} {edit} {cycle} highlight={highlighting} loadSounds={() => playback.sounds()} previewSound={name => playback.preview(name)} stopPreview={() => playback.stopPreview()} />
          {/if}
        {:else}<h2>Your next loop starts here</h2><p class="hint">Add a drum or melody track on the left, or choose a starter template above. Watch each visual edit become Strudel code.</p>{/if}
      </section>
      <section class="code-pane" aria-label="Code pane">
        <div class="code-toolbar"><span class="panel-label">STRUDEL CODE</span><div class="actions"><button aria-label="Undo" onclick={() => editor?.undo()}>↶</button><button aria-label="Redo" onclick={() => editor?.redo()}>↷</button><button aria-label={`Change code docking: ${dock === 'side' ? 'Dock below' : 'Dock beside'}`} onclick={() => { dock = dock === 'side' ? 'bottom' : 'side'; }}>{dock === 'side' ? 'Dock below' : 'Dock beside'}</button><button aria-expanded={!collapsed} onclick={() => { collapsed = !collapsed; }}>{collapsed ? 'Show code' : 'Hide code'}</button></div></div>
        <div class="code-content" hidden={collapsed}><div class="codemirror-host" bind:this={editorHost}></div><p class="hint">Type here to change the grid. Cmd/Ctrl+Z undoes both. Drag the corner to resize.</p></div>
      </section>
    </div>
    <section class="mixer" aria-label="Mixer">
      <p class="panel-label">MIXER / ALL TRACKS</p>
      <div class="mixer-strips">{#each tracks as track (track.id)}
        <div class="mixer-strip"><strong>{track.name}</strong><span class="badge">{track.muted ? 'Muted' : track.solo ? 'Solo' : 'Active'}{track.source.kind === 'raw' ? readArrangement(sync.document, track.id) ? ' · arrangement' : ' · edited in code' : ''}</span>
          {#each ['gain', 'pan'] as key}{@const name = key as 'gain' | 'pan'}{@const arranged = readArrangement(sync.document, track.id)}{@const parameter = effectParameter(arranged ? outerProxy(sync.document, track.id).track : track, name)}
            <label>{name === 'gain' ? 'Volume' : 'Pan'}<input aria-label={`${track.name} mixer ${name === 'gain' ? 'volume' : 'pan'}`} type="number" step="0.001" value={parameter.kind === 'number' ? parameter.value : ''} placeholder="Code" disabled={(track.source.kind === 'raw' && !arranged) || parameter.kind === 'expression'} onchange={event => { const value = +event.currentTarget.value; const id = track.id; edit(document => readArrangement(document, id) ? editArrangementEffects(document, id, proxy => setEffect(proxy, `${id}/outer`, name, value)) : setEffect(document, id, name, value)); }} /></label>
          {/each}
          <div class="actions"><button class="flag" aria-label={`Mute ${track.name}`} aria-pressed={track.muted} onclick={() => { const id = track.id; edit(document => setTrackFlags(document, id, { muted: !document.project.items.some(item => item.kind === 'track' && item.id === id && item.muted) })); }}>Mute</button><button class="flag" aria-label={`Solo ${track.name}`} aria-pressed={track.solo} onclick={() => { const id = track.id; edit(document => setTrackFlags(document, id, { solo: !document.project.items.some(item => item.kind === 'track' && item.id === id && item.solo) })); }}>Solo</button></div>
        </div>
      {/each}</div>
    </section>
    {#if playback}<OutputPanel {playback} playing={audio.playing} stale={audio.playing && (!!sync.error || audio.activeCode !== sync.document.code)} />{/if}
    <div class="editor-bottom"><span>Live changes apply on the next scheduling tick, with a short audio lookahead.</span><span>Space to play/stop outside controls · Cmd/Ctrl + Enter to play/update</span></div>
  </section>
  <section class="guide" aria-label="Getting started">
    <div><span class="number">01 / SEE IT</span><h2>A beat, one step at a time</h2><p><code>bd</code> is a kick, <code>sd</code> a snare, <code>hh</code> a hi-hat. The grid and code describe the same loop.</p></div>
    <div><span class="number">02 / HEAR IT</span><h2>Press play, then explore</h2><p>Your first play loads audio and internet samples. Valid edits update the playing loop automatically.</p></div>
    <div><span class="number">03 / LEARN IT</span><h2>Follow the connection</h2><p>Volume changes <code>.gain()</code>. Pan changes <code>.pan()</code>. Your custom code stays in place as you experiment.</p></div>
  </section>
  <footer><span>Made for curious ears. <span class="muted">Samples load from the internet on first play.</span></span><a href="https://github.com/kikeonline/loopsmith" target="_blank" rel="noreferrer">Source code ↗ <span class="muted">AGPL-3.0-or-later</span></a></footer>
</main>
