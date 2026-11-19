<script lang="ts">
  import type { Track } from '../project';
  import { melodicRows, midi, pitchName, setMelodicLength, setMelodicStep } from '../editor/composition';
  import type { VisualEdit } from '../editor/sync';
  let { track, edit, cycle, highlight }: { track: Track; edit: (operation: VisualEdit) => void; cycle: number; highlight: boolean } = $props();
  let rowIndex = $state(0);
  let octave = $state(4);
  const rows = $derived(melodicRows(track));
  const row = $derived(rows?.[rowIndex] ?? rows?.[0] ?? []);
  const index = $derived(rows?.[rowIndex] ? rowIndex : 0);
  const degrees = $derived(track.source.kind === 'notes' && track.source.mode === 'n');
  const pitches = $derived([...new Set([
    ...Array.from({ length: 13 }, (_, i) => degrees ? i : (octave + 1) * 12 + i),
    ...row.flatMap(node => node.kind === 'atom' ? [degrees ? +node.value : midi(node.value)!] : [])
  ])].sort((a,b) => b-a));
  const activeStep = $derived(highlight ? Math.floor(((cycle % 1 + 1) % 1) * row.length) : -1);
  function keyboard(event: KeyboardEvent) {
    const target = event.currentTarget as HTMLButtonElement;
    const buttons = Array.from(target.closest('.piano-roll')!.querySelectorAll<HTMLButtonElement>('.piano-note'));
    const current = buttons.indexOf(target);
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowUp' ? -row.length : event.key === 'ArrowDown' ? row.length : 0;
    if (delta) { event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, current + delta))]?.focus(); }
  }
</script>
{#if rows}
  <div class="melody-tools">
    <label>Note row <select aria-label="Note row" value={index} onchange={event => { rowIndex = +event.currentTarget.value; }}>{#each rows as _, i}<option value={i}>{i + 1}</option>{/each}</select></label>
    <label>Steps <select aria-label="Melody length" value={row.length} onchange={event => { const length = +event.currentTarget.value; const id = track.id; edit(document => setMelodicLength(document, id, index, length)); }}>{#each [...new Set([4,8,16,32,64,row.length])].sort((a,b) => a-b) as length}<option value={length}>{length}</option>{/each}</select></label>
    {#if !degrees}<label>Octave <select aria-label="Piano octave" bind:value={octave}>{#each [1,2,3,4,5,6,7] as value}<option value={value}>{value}</option>{/each}</select></label>{/if}
  </div>
  <div class="piano-roll" role="group" aria-label={degrees ? 'Scale degree piano roll' : 'Piano roll'}>
    <div class="piano-grid" style={`--columns: ${row.length}`}>
      <span class="piano-key">{degrees ? 'DEGREE' : 'PITCH'}</span>{#each row as _, step}<span class:playhead={activeStep === step} class="piano-time">{step + 1}</span>{/each}
      {#each pitches as pitch}
        {@const label = degrees ? String(pitch) : pitchName(pitch)}
        <span class="piano-key" class:sharp={label.includes('#')}>{label}</span>
        {#each row as node, step}
          {@const on = node.kind === 'atom' && (degrees ? +node.value === pitch : midi(node.value) === pitch)}
          <button class="piano-note" class:on class:playhead={activeStep === step} aria-label={`${degrees ? 'Degree' : 'Note'} ${label} step ${step + 1}`} aria-pressed={on} onkeydown={keyboard} onclick={() => { const id = track.id; edit(document => setMelodicStep(document, id, index, step, label)); }}><span aria-hidden="true">{on ? '●' : '·'}</span><span class="sr-only">{on ? 'On' : 'Off'}</span></button>
        {/each}
      {/each}
    </div>
  </div>
  <p class="hint">One note per step in each row. Rows play together. Arrow keys move; Space toggles. {degrees ? 'Degrees follow the scale below.' : 'Choose an octave to explore more pitches.'} Source slots span 1/{row.length} of a cycle before extra code transforms.</p>
{/if}
