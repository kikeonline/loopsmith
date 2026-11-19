<script lang="ts">
  import type { ParsedDocument, Track } from '../project';
  import type { VisualEdit } from '../editor/sync';
  import { addModifier, modifierView, moveModifier, removeModifier, setEveryTransform, setModifierNumber, type ModifierName, type ModifierNumber, type ModifierView, type TransformName } from '../editor/modifiers';
  let { track, document, edit, labelPrefix = '' }: { labelPrefix?: string; track: Track; document: ParsedDocument; edit: (operation: VisualEdit) => void } = $props();
  const titles = { fast: 'Fast', slow: 'Slow', rev: 'Reverse', every: 'Every' };
  const chain = $derived(track.calls.map((call, index) => {
    const range = document.tracks[track.id].calls[index].range;
    return { call, index, text: document.code.slice(range.from, range.to), modifier: modifierView(track, index) };
  }));
</script>

{#snippet numberControl(view: ModifierView, parameter: ModifierNumber, field: 'factor' | 'period' | 'callbackFactor', label: string)}
  <div class="modifier-number">
    <label>{label}<input aria-label={`${labelPrefix}${label}, call ${view.index + 1}`} type="number" min={field === 'period' ? '1' : '0.125'} max={field === 'period' ? '1024' : '16'} step={field === 'period' ? '1' : '0.001'} value={parameter.value ?? ''} placeholder="Edited in code" disabled={parameter.value === null} onchange={event => { const value = Number(event.currentTarget.value); const reference = view.reference; edit(document => setModifierNumber(document, reference, field, value)); }} /></label>
    {#if parameter.value === null}
      <code class="expression-chip" title="Custom expression or value outside the visual range; preserved until explicitly replaced">{parameter.code}</code>
      <button class="text-button" aria-label={`${labelPrefix}Replace ${label.toLowerCase()} with ${field === 'period' ? '4' : '2'}, call ${view.index + 1}`} onclick={() => { const reference = view.reference; edit(document => setModifierNumber(document, reference, field, field === 'period' ? 4 : 2, true)); }}>Replace {label.toLowerCase()} with {field === 'period' ? '4' : '2'}</button>
    {/if}
  </div>
{/snippet}

<section class="modifier-controls" aria-label={`${labelPrefix}Pattern modifiers`}>
  <h3>Shape the pattern</h3>
  <p class="hint">Fast repeats the pattern sooner; slow stretches it out; reverse flips each cycle. These change rhythm, while Sample speed changes the recording’s playback.</p>
  <div class="modifier-add">
    {#each ['fast', 'slow', 'rev', 'every'] as name}
      {@const modifier = name as ModifierName}
      <button class="flag" aria-label={`${labelPrefix}Add ${modifier === 'rev' ? 'reverse' : modifier}`} disabled={track.source.kind === 'raw'} onclick={() => { const id = track.id; edit(document => addModifier(document, id, modifier)); }}>Add {modifier === 'rev' ? 'reverse' : modifier}</button>
    {/each}
  </div>
  {#if track.source.kind === 'raw'}
    <p class="hint">This track is locked for code editing. Its complete expression stays intact.</p>
  {:else}
    <p class="hint">Calls run in the order below. New modifiers go at the end. Earlier/later moves cross one neighboring call without rewriting its text.</p>
    {#if !chain.length}<p class="hint">No chained calls yet. Add a modifier and follow its code here.</p>{/if}
    <ol class="modifier-chain">
      {#each chain as entry}
        {#if entry.modifier}
          {@const view = entry.modifier}
          <li class="modifier-card" data-modifier={view.name}>
            <div class="modifier-heading"><strong>{entry.index + 1} · {titles[view.name]}</strong><code>{view.name === 'every' ? '.every(cycles, transform)' : view.name === 'rev' ? '.rev()' : `.${view.name}(factor)`}</code></div>
            <code class="chain-source">{entry.text}</code>
            {#if view.locked}
              <span class="badge">Edited in code · custom arguments</span>
            {:else if view.factor}
              {@render numberControl(view, view.factor, 'factor', `${titles[view.name]} factor`)}
              <p class="hint">{view.name === 'fast' ? '2 repeats the source pattern twice as fast.' : '2 stretches the source pattern over twice as much time.'} Visual factors: 0.125–16. Repeated modifiers stay separate.</p>
            {:else if view.name === 'every' && view.period && view.callback}
              {@render numberControl(view, view.period, 'period', 'Every cycle count')}
              {#if view.callback.name}
                <label class="modifier-transform">Transform <select aria-label={`${labelPrefix}Every transform, call ${view.index + 1}`} value={view.callback.name} onchange={event => { const name = event.currentTarget.value as TransformName; const reference = view.reference; edit(document => setEveryTransform(document, reference, name)); }}><option value="rev">Reverse</option><option value="fast">Fast</option><option value="slow">Slow</option></select></label>
                {#if view.callback.argument}{@render numberControl(view, view.callback.argument, 'callbackFactor', 'Transform factor')}{/if}
              {:else}
                <span class="badge">Callback edited in code · retained exactly</span><code class="expression-chip">{view.callback.code}</code>
                <button class="text-button" aria-label={`${labelPrefix}Replace callback with visual reverse, every call ${view.index + 1}`} onclick={() => { const reference = view.reference; edit(document => setEveryTransform(document, reference, 'rev', true)); }}>Replace callback with visual reverse</button>
              {/if}
              <p class="hint">Every applies the transform on the first cycle, then every N cycles: N=4 means cycles 0, 4, 8… It does not wait until the fourth cycle.</p>
            {/if}
            <div class="modifier-actions">
              <button class="flag" aria-label={`${labelPrefix}Move ${view.name} call ${view.index + 1} earlier`} disabled={entry.index === 0} onclick={() => { const reference = view.reference; edit(document => moveModifier(document, reference, -1)); }}>Earlier</button>
              <button class="flag" aria-label={`${labelPrefix}Move ${view.name} call ${view.index + 1} later`} disabled={entry.index === chain.length - 1} onclick={() => { const reference = view.reference; edit(document => moveModifier(document, reference, 1)); }}>Later</button>
              <button class="flag" aria-label={`${labelPrefix}Remove ${view.name} call ${view.index + 1}`} onclick={() => { const reference = view.reference; edit(document => removeModifier(document, reference)); }}>Remove</button>
            </div>
          </li>
        {:else}
          <li class="chain-context"><span class="badge">{entry.index + 1} · {entry.call.kind === 'opaque' ? 'Edited in code · preserved' : entry.call.kind === 'effect' ? 'Effect · controls below' : 'Instrument / scale'}</span><code class="chain-source">{entry.text}</code></li>
        {/if}
      {/each}
    </ol>
  {/if}
</section>
