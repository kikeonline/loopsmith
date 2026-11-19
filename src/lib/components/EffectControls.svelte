<script lang="ts">
  import { EFFECTS, setEffect, type EffectName, type Track } from '../project';
  import { EFFECT_DEFAULTS, effectParameter } from '../editor/composition';
  import type { VisualEdit } from '../editor/sync';
  let { track, edit, labelPrefix = '' }: { labelPrefix?: string; track: Track; edit: (operation: VisualEdit) => void } = $props();
</script>
<div class="controls" aria-label={`${labelPrefix}Track effects`}>
  {#each Object.keys(EFFECTS) as key}
    {@const name = key as EffectName}
    {@const parameter = effectParameter(track, name)}
    <div class="effect-control">
      <label>{EFFECTS[name].label} <code>.{name}(…)</code><input aria-label={labelPrefix + EFFECTS[name].label} type="number" step={name === 'lpf' || name === 'hpf' ? '1' : '0.001'} value={parameter.kind === 'number' ? parameter.value : ''} placeholder="Expression" disabled={track.source.kind === 'raw' || parameter.kind === 'expression'} onchange={event => { const value = Number(event.currentTarget.value); const id = track.id; edit(document => setEffect(document, id, name, value)); }} /></label>
      {#if parameter.kind === 'expression'}
        <code class="expression-chip" title="Edited in code; retained exactly">{parameter.code}</code>
        <button class="text-button" onclick={() => { const id = track.id; edit(document => setEffect(document, id, name, EFFECT_DEFAULTS[name], true)); }}>Replace {EFFECTS[name].label.toLowerCase()} with value</button>
      {:else}<small>{name === 'lpf' || name === 'hpf' ? 'Frequency in Hz' : name === 'pan' ? '0 left · 1 right' : name === 'gain' ? 'Amplitude multiplier' : name === 'attack' || name === 'release' || name === 'delaytime' ? 'Time in seconds' : `Suggested: ${EFFECTS[name].min}–${EFFECTS[name].max}`}</small>{/if}
    </div>
  {/each}
</div>
