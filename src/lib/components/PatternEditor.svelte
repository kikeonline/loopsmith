<script lang="ts">
  import type { Track, ParsedDocument, Span } from '../project';
  import type { SoundInfo } from '../runtime';
  import type { VisualEdit } from '../editor/sync';
  import { drumRows, changeStep, changeLength } from '../editor/visual';
  import { melodicRows, setRowSound, controlValue, setControl } from '../editor/composition';
  import { modifierView } from '../editor/modifiers';
  import { eventSteps } from '../editor/event-playheads';
  import PianoRoll from './PianoRoll.svelte';
  import SoundBrowser from './SoundBrowser.svelte';
  import ModifierControls from './ModifierControls.svelte';
  import EffectControls from './EffectControls.svelte';
  let { track, document, edit, cycle, highlight, loadSounds, previewSound, stopPreview, eventRanges, sourceOffset = 0 }: {
    eventRanges?: Span[]; sourceOffset?: number;
    track: Track; document: ParsedDocument; edit: (operation: VisualEdit) => void;
    cycle: number; highlight: boolean; loadSounds: () => Promise<SoundInfo[]>;
    previewSound: (name: string) => Promise<void>; stopPreview: () => void;
  } = $props();
  let soundRow = $state(0);
  const id = $derived(track.id);
  const rows = $derived(drumRows(track));
  const scheduledSteps = $derived(eventRanges ? eventSteps(document,track.id,eventRanges,sourceOffset) : undefined);
  function activeStep(length: number) { return highlight ? Math.floor(((cycle % 1 + 1) % 1) * length) : -1; }
  function useSound(name: string) {
    const id = track.id; const row = rows?.[soundRow] ? soundRow : 0;
    const drums = track.source.kind === 'drums';
    edit(document => drums ? setRowSound(document, id, row, name) : setControl(document, id, 's', name));
  }
  function gridKey(event: KeyboardEvent) {
    const button = event.target as HTMLButtonElement;
    const buttons = Array.from(button.closest('.steps')!.querySelectorAll<HTMLButtonElement>('button'));
    const index = buttons.indexOf(button);
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    else return;
    event.preventDefault(); buttons[next]?.focus();
  }
</script>
          {#if rows}
            {#each rows as row, rowIndex}
              {@const sound = row.find(node => node.kind === 'atom')}
              <div class="drum-row">
                <div class="row-heading"><span>ROW {rowIndex + 1} <strong>{sound?.kind === 'atom' ? sound.value : 'bd'}</strong></span><label>Steps <select aria-label={`Row ${rowIndex + 1} length`} value={row.length} onchange={event => { const length = Number(event.currentTarget.value); edit(document => changeLength(document, id, rowIndex, length)); }}>{#each [...new Set([4, 8, 16, 32, 64, row.length])].sort((a,b) => a-b) as length}<option value={length}>{length}</option>{/each}</select></label></div>
                <label class="row-sound">Row {rowIndex + 1} sound <input aria-label={`Row ${rowIndex + 1} sound`} value={sound?.kind === 'atom' ? sound.value + (sound.sampleIndex === undefined ? '' : `:${sound.sampleIndex}`) : 'bd'} onchange={event => { const name = event.currentTarget.value; edit(document => setRowSound(document, id, rowIndex, name)); }} /></label>
                <div class="steps" style={`--steps: ${Math.min(row.length, 8)}`}>
                  {#each row as node, step}<button class="step" class:on={node.kind === 'atom'} class:playhead={scheduledSteps ? !!scheduledSteps[rowIndex]?.[step] : activeStep(row.length) === step} aria-label={`Row ${rowIndex + 1} step ${step + 1}: ${(step + 1).toString().padStart(2, '0')} ${node.kind === 'atom' ? node.value + (node.sampleIndex === undefined ? '' : `:${node.sampleIndex}`) : '~'}`} aria-pressed={node.kind === 'atom'} title={node.kind === 'atom' ? 'Click to replace this sound with ~ (a rest)' : 'Click to add the row sound'} onclick={() => edit(document => changeStep(document, id, rowIndex, step))} onkeydown={gridKey}><span>{(step + 1).toString().padStart(2, '0')}</span>{' '}<strong>{node.kind === 'atom' ? node.value + (node.sampleIndex === undefined ? '' : `:${node.sampleIndex}`) : '~'}</strong></button>{/each}
                </div>
              </div>
            {/each}
            <p class="hint">A lit step plays a sound. <code>~</code> makes a rest. Arrow keys move; Space toggles. Rows play together. Choosing a sound for an empty row enables its first step.</p>
          {:else if melodicRows(track)}
            <PianoRoll track={track} {edit} {cycle} highlight={highlight} eventSteps={scheduledSteps} />
          {:else}<div class="code-only"><h3>{track.source.kind === 'raw' ? 'Edited in code · locked' : 'Keep this pattern in code'}</h3><p>Custom expressions and variable timing stay intact in the code pane. Mute and solo still work.</p>{#if track.source.kind === 'raw'}<pre>{track.source.code}</pre>{/if}</div>{/if}
          {#if track.source.kind === 'notes'}
            <div class="melody-controls">
              {#each (track.source.mode === 'n' || controlValue(track, 'scale').value ? ['s', 'scale'] : ['s']) as control}
                {@const name = control as 's' | 'scale'}
                {@const parameter = controlValue(track, name)}
                <label>{name === 's' ? 'Instrument' : 'Scale'} <input aria-label={name === 's' ? 'Instrument' : 'Scale'} value={parameter.expression ? '' : parameter.value} placeholder={name === 's' ? 'sine' : 'C:minor'} disabled={parameter.expression} onchange={event => { const value = event.currentTarget.value; edit(document => setControl(document, id, name, value)); }} /></label>
                {#if parameter.expression}<code class="expression-chip">{parameter.value}</code><button class="text-button" onclick={() => edit(document => setControl(document, id, name, name === 's' ? 'sine' : 'C:minor', true))}>Replace {name === 's' ? 'instrument' : 'scale'} with value</button>{/if}
              {/each}
            </div>
          {/if}
          {#if track.calls.some((call, index) => call.kind === 'opaque' && !modifierView(track, index))}
            <div class="unknown-calls"><span class="badge" title="These calls stay in their original order and exact text during visual edits">Code-only calls · preserved</span>{#each track.calls as call, index}{#if call.kind === 'opaque' && !modifierView(track, index)}<code class="expression-chip" title="Edit this call in code">{call.code}</code>{/if}{/each}</div>
          {/if}
          <SoundBrowser load={loadSounds} preview={previewSound} {stopPreview} useSound={useSound} canUse={track.source.kind !== 'raw' && (!!rows || track.source.kind === 'notes' && !controlValue(track, 's').expression)} target={rows ? `drum row ${rows[soundRow] ? soundRow + 1 : 1}` : 'the instrument'} />
          {#if rows && rows.length > 1}<label class="sound-target">Sound browser row <select aria-label="Sound browser row" bind:value={soundRow}>{#each rows as _, i}<option value={i}>Row {i + 1}</option>{/each}</select></label>{/if}
          <ModifierControls track={track} {document} {edit} />
          <EffectControls track={track} {edit} />
          <p class="hint">{eventRanges !== undefined ? 'Event playheads follow scheduled notes and source tokens. Silent steps and unsupported or unsynced source stay unhighlighted.' : highlight ? 'Playhead follows the audio cycle clock.' : 'Playhead is hidden for stopped, unsynced, muted, or modified/custom timing.'}</p>

