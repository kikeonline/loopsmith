<script lang="ts">
  import { onMount } from 'svelte';
  import type { BackupComparison } from '../persistence/project-library';
  let { comparison }: {comparison:BackupComparison} = $props();
  let heading: HTMLHeadingElement;
  const previewLimit=20_000;
  const sides=$derived([{label:'Incoming',entry:comparison.incoming},{label:'Saved',entry:comparison.saved}]);
  onMount(()=>heading.focus());
</script>
<section class="backup-comparison" aria-label="Saved copy comparison">
  <h5 tabindex="-1" bind:this={heading}>Incoming and saved copy</h5>
  {#if !comparison.saved}
    <p class="hint">No saved copy currently uses this backup entry's identity. Your editor is separate from this comparison.</p>
  {:else}
    <p class="hint">Comparisons use the complete stored strings, including line endings. Each preview shows at most {previewLimit.toLocaleString()} characters, so differences may be outside the visible text. Nothing is opened, played or overwritten.</p>
    <ul>{#each comparison.checks as check}<li>{check.label}: <strong>{check.equal?'Identical':'Different'}</strong></li>{/each}</ul>
    {#if comparison.incoming.kind==='damaged'||comparison.saved.kind==='damaged'}<p class="hint">One or both entries could not be validated as projects. Project fields cannot be compared; their saved data is shown for recovery.</p>{/if}
    <div class="comparison-columns">
      {#each sides as side (side.label)}
        {#if side.entry}
          <div class="comparison-side">
            <h6>{side.label}: {side.entry.kind==='project'?(side.entry.restored.file.name||'Untitled loop'):'damaged saved data'}</h6>
            {#if side.entry.kind==='project'}
              <p class="hint">Saved: {new Date(side.entry.savedAt).toLocaleString()}.</p>
              <label>{side.label} draft <textarea class="backup-source" aria-label={`Compare ${side.label.toLowerCase()} draft`} readonly spellcheck="false" rows="8" value={side.entry.restored.file.code.slice(0,previewLimit)}></textarea></label>
              <p class="hint">Draft: {side.entry.restored.file.code.length.toLocaleString()} characters{side.entry.restored.file.code.length>previewLimit?' (preview truncated)':''}.</p>
              {#if side.entry.restored.file.code!==side.entry.restored.file.lastGoodCode}
                <label>{side.label} last-good source <textarea class="backup-source" aria-label={`Compare ${side.label.toLowerCase()} last-good source`} readonly spellcheck="false" rows="6" value={side.entry.restored.file.lastGoodCode.slice(0,previewLimit)}></textarea></label>
                <p class="hint">Last-good source: {side.entry.restored.file.lastGoodCode.length.toLocaleString()} characters{side.entry.restored.file.lastGoodCode.length>previewLimit?' (preview truncated)':''}.</p>
              {/if}
            {:else}
              <p class="hint">{side.entry.error}</p>
              <label>{side.label==='Saved'?'Saved data':'Incoming saved data'} <textarea class="backup-source" aria-label={`Compare ${side.label==='Saved'?'saved data':'incoming saved data'}`} readonly spellcheck="false" rows="8" value={side.entry.raw.slice(0,previewLimit)}></textarea></label>
              <p class="hint">Saved data: {side.entry.raw.length.toLocaleString()} characters{side.entry.raw.length>previewLimit?' (preview truncated)':''}.</p>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</section>
