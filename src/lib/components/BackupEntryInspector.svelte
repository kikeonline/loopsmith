<script lang="ts">
  import { onMount } from 'svelte';
  import type { BackupInspection, BackupComparison as Comparison } from '../persistence/project-library';
  import BackupComparison from './BackupComparison.svelte';
  import { downloadText, serializeProject, safeFilename } from '../persistence/project-file';
  import { serializeLibraryBackup } from '../persistence/library-backup';
  let { entry, close, saveCopy, compare, libraryRevision }: {entry:BackupInspection;close:()=>void;saveCopy:(id:string,name:string)=>string;compare:(id:string)=>Comparison;libraryRevision:number} = $props();
  let error=$state(''),message=$state('');
  let copyName=$state(''),createdId=$state('');
  let comparison=$state.raw<Comparison>(),comparedRevision=$state(-1),comparisonNotice=$state(''),comparisonError=$state('');
  let compareButton: HTMLButtonElement;
  let heading: HTMLHeadingElement;
  const previewLimit=20_000;
  function act(operation:()=>void){error='';message='';try{operation();}catch(cause){error=cause instanceof Error ? cause.message : String(cause);}}
  function exportProject(){if(entry.kind!=='project')return;const file=entry.restored.file;downloadText(serializeProject(file),`${safeFilename(file.name)}.loopsmith.json`,'application/json');message='Incoming project JSON downloaded. Use Import project JSON when ready to open it.';}
  function exportRaw(){const text=serializeLibraryBackup([{id:entry.id,raw:entry.raw}],new Date().toISOString());downloadText(text,'loopsmith-entry.backup.json','application/json');message='Original entry downloaded in a one-entry library backup, including all saved data.';}
  function saveIncoming(){if(createdId||entry.kind!=='project')return;createdId=saveCopy(entry.id,copyName);message='Saved as a new library copy. Choose Open saved project when ready; your editor and playback are unchanged.';}
  function compareSaved(){comparison=undefined;comparisonNotice='';comparisonError='';try{comparison=compare(entry.id);comparedRevision=libraryRevision;}catch(cause){comparisonError=cause instanceof Error ? cause.message : String(cause);}}
  function closeComparison(){comparison=undefined;comparisonNotice='';comparisonError='';compareButton.focus();}
  $effect(()=>{if(comparison&&comparedRevision!==libraryRevision){comparison=undefined;comparisonNotice='Library refreshed. Compare again to read the saved copy.';comparisonError='';}});
  onMount(()=>{if(entry.kind==='project')copyName=entry.restored.file.name;heading.focus();});
</script>
<section class="backup-inspection" aria-label="Backup entry inspection">
  <h4 tabindex="-1" bind:this={heading}>Inspect {entry.kind==='project'?(entry.restored.file.name||'Untitled loop'):'damaged saved data'}</h4>
  <p class="hint">This is the incoming backup entry, including when it conflicts with a saved copy on this browser. Inspection and downloads leave the library, current editor and playback unchanged.</p>
  <div class="library-tools"><button class="flag" bind:this={compareButton} onclick={compareSaved}>Compare with saved copy</button>{#if comparison}<button class="flag" onclick={closeComparison}>Close saved comparison</button>{/if}</div>
  {#if comparison}{#key comparison}<BackupComparison {comparison} />{/key}{/if}
  {#if comparisonNotice}<p class="hint" aria-live="polite">{comparisonNotice}</p>{/if}
  {#if comparisonError}<p class="error" role="alert">Comparison: {comparisonError} The incoming entry and your editor are unchanged.</p>{/if}
  {#if entry.kind==='project'}
    <p class="hint">Saved: {new Date(entry.savedAt).toLocaleString()}. Project JSON includes the full current draft, last-good source and saved track identities.</p>
    <label>Incoming project source <textarea class="backup-source" aria-label="Incoming project source" readonly spellcheck="false" rows="8" value={entry.restored.file.code.slice(0,previewLimit)}></textarea></label>
    {#if entry.restored.file.code.length>previewLimit}<p class="hint">Showing the first {previewLimit.toLocaleString()} of {entry.restored.file.code.length.toLocaleString()} source characters. Downloads contain the full data.</p>{/if}
    {#if entry.restored.file.code!==entry.restored.file.lastGoodCode}
      <p class="hint">The current draft differs from the last-good source. Both are included in project JSON.</p>
      <label>Incoming last-good source <textarea class="backup-source" aria-label="Incoming last-good source" readonly spellcheck="false" rows="6" value={entry.restored.file.lastGoodCode.slice(0,previewLimit)}></textarea></label>
      {#if entry.restored.file.lastGoodCode.length>previewLimit}<p class="hint">Showing the first {previewLimit.toLocaleString()} of {entry.restored.file.lastGoodCode.length.toLocaleString()} last-good source characters. Downloads contain the full data.</p>{/if}
    {/if}
    <button class="flag" onclick={()=>act(exportProject)}>Download incoming project JSON</button>
    <div class="incoming-copy">
      <p class="hint">Keep this incoming project alongside existing versions. Saving creates a new library copy and leaves the backup entry, existing copies and current editor intact.</p>
      <label>Recovered project name <input aria-label="Recovered project name" maxlength="160" bind:value={copyName} disabled={!!createdId} /></label>
      <button class="flag" disabled={!!createdId} onclick={()=>act(saveIncoming)}>Save incoming as new library copy</button>
    </div>
  {:else}
    <p class="hint">This entry cannot be opened as a project: {entry.error}. Its original data can still be downloaded for recovery.</p>
    <label>Incoming saved data <textarea class="backup-source" aria-label="Incoming saved data" readonly spellcheck="false" rows="8" value={entry.raw.slice(0,previewLimit)}></textarea></label>
    {#if entry.raw.length>previewLimit}<p class="hint">Showing the first {previewLimit.toLocaleString()} of {entry.raw.length.toLocaleString()} saved-data characters. Downloads contain the full data.</p>{/if}
  {/if}
  <p class="hint">An entry backup keeps the original saved data in a one-entry library backup. Use Review library backup to inspect or restore it later.</p>
  <div class="library-tools"><button class="flag" onclick={()=>act(exportRaw)}>Download entry backup</button><button class="flag" onclick={close}>Close entry inspection</button></div>
  {#if message}<p class="project-message" aria-live="polite">{message}</p>{/if}
  {#if error}<p class="error" role="alert">{error} The backup and your editor are unchanged.</p>{/if}
</section>
