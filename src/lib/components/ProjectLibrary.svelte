<script lang="ts">
  import { onMount } from 'svelte';
  import { ProjectLibrary, LIBRARY_PREFIX, type LibraryListing, type RemovedCopy, type BackupReview } from '../persistence/project-library';
  import { MAX_BACKUP_BYTES } from '../persistence/library-backup';
  import { downloadText, serializeProject, safeFilename, type ProjectFile, type RestoredProject } from '../persistence/project-file';
  let { snapshot, load }: {snapshot:()=>ProjectFile;load:(project:RestoredProject)=>void} = $props();
  let listing=$state.raw<LibraryListing>({copies:[],damaged:[]});
  let selectedId=$state(''),opened=$state(false),error=$state(''),message=$state('');
  let removed=$state.raw<RemovedCopy>();
  let review=$state.raw<BackupReview>();
  let restoreIds=$state.raw<string[]>([]);
  let backupText=$state(''),readingBackup=$state(false);
  let backupInput: HTMLInputElement;
  let backupRequest=0;
  let store: ProjectLibrary|undefined;
  const selected=$derived(listing.copies.find(copy => copy.id===selectedId));
  const selectedRestoreCount=$derived(restoreIds.length);
  const library=() => store ??= new ProjectLibrary(window.localStorage);
  function refresh() { const next=library().list(); listing=next; if(!next.copies.some(copy=>copy.id===selectedId)) selectedId=''; if(backupText){review=library().reviewBackup(backupText);restoreIds=restoreIds.filter(id=>review!.items.some(item=>item.entry.id===id&&item.status==='add'));} }
  function act(operation:()=>void) { error='';message='';try{operation();}catch(cause){error=cause instanceof Error ? cause.message : String(cause);} }
  function save() { const id=library().save(snapshot());refresh();selectedId=id;message='Saved a new project copy. Existing copies and your editor are unchanged.'; }
  function open() { if(!selected)return;load(library().open(selected.id,selected.raw));message='Opened saved copy. Undo restores the previous source; press Play when ready.'; }
  function remove(id:string,raw:string) { removed=library().remove(id,raw);refresh();message='Removed the saved copy. Your current editor is unchanged; Undo removal restores the copy.'; }
  function restore() { if(!removed)return;library().restore(removed);const id=removed.id;removed=undefined;refresh();selectedId=listing.copies.some(copy=>copy.id===id)?id:'';message='Saved copy restored.'; }
  function exportSelected() { if(!selected)return;const {file}=library().open(selected.id,selected.raw);downloadText(serializeProject(file),`${safeFilename(file.name)}.loopsmith.json`,'application/json');message='Saved copy exported without opening it.'; }
  function exportBackup() { downloadText(library().exportBackup(),'loopsmith-library.backup.json','application/json');message='Library backup downloaded, including damaged saved data. Unsaved editor changes are not included; save a project copy to include them.'; }
  function cancelBackup() { backupRequest++;readingBackup=false;backupText='';review=undefined;restoreIds=[];message='Backup review cleared. No copies were changed.'; }
  async function readBackup(event:Event) {
    const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;
    const request=++backupRequest;readingBackup=true;backupText='';review=undefined;restoreIds=[];error='';message='';
    try {
      if(file.size>MAX_BACKUP_BYTES)throw new Error('Library backups support up to 32 MiB.');
      const text=await file.text();if(request!==backupRequest)return;
      const next=library().reviewBackup(text);backupText=text;review=next;
      restoreIds=next.items.filter(item=>item.status==='add').map(item=>item.entry.id);
      message='Backup reviewed locally. Nothing has been restored. Existing copies will be kept.';
    }catch(cause){if(request===backupRequest)error=cause instanceof Error ? cause.message : String(cause);}
    finally{if(request===backupRequest)readingBackup=false;}
  }
  function restoreBackup() {
    if(!review||!backupText)return;
    const result=library().restoreBackup(backupText,restoreIds);
    message=`Restored: ${result.added}. Already saved: ${result.identical}. Conflicts kept: ${result.conflicts}. Not processed: ${result.pending}. Your editor and playback are unchanged.`;
    if(result.error)error=`${result.error} Some entries may have been restored. Keep this backup and retry; identical copies will be skipped.`;
    refresh();
  }
  onMount(()=>{
    const changed=(event:StorageEvent)=>{if(opened&&(event.key===null||event.key.startsWith(LIBRARY_PREFIX)))act(()=>{refresh();message='Library refreshed from another tab. Your editor is unchanged.';});};
    window.addEventListener('storage',changed);return()=>{backupRequest++;window.removeEventListener('storage',changed);};
  });
</script>
<details class="project-library" ontoggle={event=>{opened=event.currentTarget.open;if(opened)act(refresh);}}>
  <summary>Project library</summary>
  <p class="hint">Keep named copies on this browser. Open a copy, edit it, then save a new copy to keep another version. The current editor still autosaves separately. Export JSON for a portable backup.</p>
  <div class="library-tools"><button class="flag" onclick={()=>act(save)}>Save a project copy</button><button class="flag" onclick={()=>act(refresh)}>Refresh library</button></div>
  <p class="hint">Saved copies: {listing.copies.length}.</p>
  <label>Saved project <select aria-label="Saved project" bind:value={selectedId}><option value="">Choose a saved copy</option>{#each listing.copies as copy (copy.id)}<option value={copy.id}>{copy.name||'Untitled loop'} · {new Date(copy.savedAt).toLocaleString()}</option>{/each}</select></label>
  {#if selected}<p class="hint">{selected.name||'Untitled loop'} · Tracks: {selected.tracks}. Opening stops playback and replaces the editor source.</p>{/if}
  <div class="library-tools"><button class="flag" disabled={!selected} onclick={()=>act(open)}>Open saved project</button><button class="flag" disabled={!selected} onclick={()=>act(exportSelected)}>Export saved project JSON</button><button class="flag" disabled={!selected} onclick={()=>{const copy=selected!;act(()=>remove(copy.id,copy.raw));}}>Remove saved project</button><button class="flag" disabled={!removed} onclick={()=>act(restore)}>Undo library removal</button></div>
  {#each listing.damaged as copy (copy.id)}<div class="library-damaged"><p class="hint">A saved copy could not be read ({copy.id}): {copy.error}. Its saved data is retained.</p><div class="library-tools"><button class="flag" aria-label={`Download damaged saved data: ${copy.id}`} onclick={()=>act(()=>downloadText(copy.raw,'loopsmith-library-recovery.json','application/json'))}>Download damaged saved data</button><button class="flag" disabled={!copy.removable} aria-label={`Remove damaged copy ${copy.id}`} onclick={()=>act(()=>remove(copy.id,copy.raw))}>Remove damaged copy</button></div></div>{/each}
  <details class="library-backup">
    <summary>Library backup and restore</summary>
    <p class="hint">Download all saved copies and damaged saved data together. Save a project copy first to include your current editor. Backups do not include workspace autosave, device settings or editor history. Restore adds missing entries without opening or running them.</p>
    <div class="library-tools"><button class="flag" onclick={()=>act(exportBackup)}>Download library backup</button><button class="flag" disabled={readingBackup} onclick={()=>backupInput.click()}>{readingBackup?'Reading backup…':'Review library backup'}</button><input class="file-input" type="file" accept=".json,application/json" aria-label="Review library backup file" bind:this={backupInput} onchange={readBackup} />{#if readingBackup||review}<button class="flag" onclick={()=>act(cancelBackup)}>Cancel backup review</button>{/if}</div>
    {#if review}
      <section class="backup-review" aria-label="Library backup review">
        <h3>Review library backup</h3>
        <p class="hint">Entries: {review.items.length}. To add: {review.additions}. Already saved: {review.identical}. Conflicts kept: {review.conflicts}. Free slots: {review.available}.</p>
        <p class="hint">Conflicting identities are kept on this browser; their backup data remains in your file. Damaged entries are retained for recovery and cannot be opened as projects. Keep the backup until you have checked the restored copies. If storage fills during restore, completed entries remain saved and you can retry.</p>
        <div class="library-tools"><button class="flag" disabled={!review.additions} onclick={()=>{restoreIds=review!.items.filter(item=>item.status==='add').map(item=>item.entry.id);}}>Select all missing entries</button><button class="flag" disabled={!selectedRestoreCount} onclick={()=>{restoreIds=[];}}>Clear restore selection</button></div>
        <p class="hint" aria-live="polite">Selected to restore: {selectedRestoreCount}. Counts after restore refer to this selection. Unselected entries remain in your backup file.</p>
        <ul>{#each review.items as item,index (item.entry.id)}<li>{#if item.status==='add'}<label class="backup-choice"><input type="checkbox" aria-label={`Restore entry ${index+1}: ${item.name}`} checked={restoreIds.includes(item.entry.id)} onchange={event=>{restoreIds=event.currentTarget.checked?[...restoreIds,item.entry.id]:restoreIds.filter(id=>id!==item.entry.id);}} /><span><strong>{item.name}</strong> · {item.entry.id.slice(0,80)||'(empty identity)'} · Add{item.damaged?' · recovery data':''}</span></label>{:else}<strong>{item.name}</strong> · {item.entry.id.slice(0,80)||'(empty identity)'} · {item.status==='identical'?'Already saved':'Conflict: keep existing'}{item.damaged?' · recovery data':''}{/if}</li>{/each}</ul>
        {#if selectedRestoreCount>review.available}<p class="hint">Not enough free slots. Select fewer entries, or export and remove copies. Nothing will be restored until the selection fits.</p>{/if}
        <button class="flag" disabled={!selectedRestoreCount||selectedRestoreCount>review.available} onclick={()=>act(restoreBackup)}>Restore missing library entries</button>
      </section>
    {/if}
  </details>
  {#if message}<p class="project-message" aria-live="polite">{message}</p>{/if}
  {#if error}<p class="error" role="alert">Library: {error} Your current editor is unchanged.</p>{/if}
</details>
