<script lang="ts">
  import { createShareUrl } from '../persistence/share-url';
  import { downloadText, safeFilename } from '../persistence/project-file';
  let { code, name, snapshot }: {code:string;name:string;snapshot:()=>string} = $props();
  let created=$state.raw<{source:string;url:string}>();
  let error=$state(''),message=$state('');
  $effect(()=>{if(created&&created.source!==code){created=undefined;error='';message='Source changed. Create a fresh link to share the current editor.';}});
  function create() {
    error='';message='';created=undefined;
    try {const source=snapshot();created={source,url:createShareUrl(source)};message='Share link created locally from the current source. Copy or download it below.';}
    catch(cause){error=cause instanceof Error ? cause.message : String(cause);}
  }
  async function copy() {
    const current=created;if(!current||current.source!==code)return;
    error='';message='';
    try {await navigator.clipboard.writeText(current.url);if(created===current)message='Strudel share link copied.';}
    catch {if(created===current)error='Clipboard unavailable. Select and copy the generated link, or download it.';}
  }
  function download() {if(created&&created.source===code){downloadText(created.url,`${safeFilename(name)}.strudel-url.txt`);message='Share link downloaded.';}}
</script>
<details class="share-export">
  <summary>Export Strudel share link</summary>
  <p class="hint">Create a strudel.cc link containing the entire editor source. Nothing is uploaded or played. Use project JSON to keep the draft recovery data and project details too.</p>
  <div class="library-tools"><button class="flag" onclick={create}>Create Strudel share link</button><button class="flag" disabled={!created} onclick={copy}>Copy Strudel share link</button><button class="flag" disabled={!created} onclick={download}>Download Strudel share link</button></div>
  {#if created}<label>Generated Strudel share URL <textarea class="share-url" aria-label="Generated Strudel share URL" readonly rows="4" spellcheck="false" value={created.url} onfocus={event=>event.currentTarget.select()}></textarea></label>{/if}
  {#if message}<p class="project-message" aria-live="polite">{message}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</details>
