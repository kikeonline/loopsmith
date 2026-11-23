<script lang="ts">
  import { onMount } from 'svelte';
  import { ProjectLibrary, LIBRARY_PREFIX, type LibraryListing, type RemovedCopy } from '../persistence/project-library';
  import { downloadText, serializeProject, safeFilename, type ProjectFile, type RestoredProject } from '../persistence/project-file';
  let { snapshot, load }: {snapshot:()=>ProjectFile;load:(project:RestoredProject)=>void} = $props();
  let listing=$state.raw<LibraryListing>({copies:[],damaged:[]});
  let selectedId=$state(''),opened=$state(false),error=$state(''),message=$state('');
  let removed=$state.raw<RemovedCopy>();
  let store: ProjectLibrary|undefined;
  const selected=$derived(listing.copies.find(copy => copy.id===selectedId));
  const library=() => store ??= new ProjectLibrary(window.localStorage);
  function refresh() { const next=library().list(); listing=next; if(!next.copies.some(copy=>copy.id===selectedId)) selectedId=''; }
  function act(operation:()=>void) { error='';message='';try{operation();}catch(cause){error=cause instanceof Error ? cause.message : String(cause);} }
  function save() { const id=library().save(snapshot());refresh();selectedId=id;message='Saved a new project copy. Existing copies and your editor are unchanged.'; }
  function open() { if(!selected)return;load(library().open(selected.id,selected.raw));message='Opened saved copy. Undo restores the previous source; press Play when ready.'; }
  function remove(id:string,raw:string) { removed=library().remove(id,raw);refresh();message='Removed the saved copy. Your current editor is unchanged; Undo removal restores the copy.'; }
  function restore() { if(!removed)return;library().restore(removed);const id=removed.id;removed=undefined;refresh();selectedId=listing.copies.some(copy=>copy.id===id)?id:'';message='Saved copy restored.'; }
  function exportSelected() { if(!selected)return;const {file}=library().open(selected.id,selected.raw);downloadText(serializeProject(file),`${safeFilename(file.name)}.loopsmith.json`,'application/json');message='Saved copy exported without opening it.'; }
  onMount(()=>{
    const changed=(event:StorageEvent)=>{if(opened&&(event.key===null||event.key.startsWith(LIBRARY_PREFIX)))act(()=>{refresh();message='Library refreshed from another tab. Your editor is unchanged.';});};
    window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
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
  {#if message}<p class="project-message" aria-live="polite">{message}</p>{/if}
  {#if error}<p class="error" role="alert">Library: {error} Your editor and other saved copies are unchanged.</p>{/if}
</details>
