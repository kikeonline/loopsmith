<script lang="ts">
  import type { SoundInfo } from '../runtime';
  let { load, preview, stopPreview, useSound, canUse, target }: { load: () => Promise<SoundInfo[]>; preview: (name: string) => Promise<void>; stopPreview: () => void; useSound: (name: string) => void; canUse: boolean; target: string } = $props();
  let sounds = $state<SoundInfo[]>([]);
  let filter = $state('');
  let limit = $state(40);
  let loading = $state(false);
  let previewing = $state('');
  let error = $state('');
  let message = $state('');
  let revision = 0;
  const filtered = $derived(sounds.filter(sound => sound.name.toLowerCase().includes(filter.toLowerCase())));
  async function refresh() {
    loading = true; error = '';
    try { sounds = await load(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { loading = false; }
  }
  async function hear(name: string) {
    const request = ++revision;
    previewing = name; message = ''; error = '';
    try { await preview(name); if (request === revision) message = `Previewed ${name}`; }
    catch (cause) { if (request === revision) error = cause instanceof Error ? cause.message : String(cause); }
    finally { if (request === revision) previewing = ''; }
  }
  function cancel() { revision++; stopPreview(); previewing = ''; message = 'Preview stopped'; }
</script>
<details class="sound-browser">
  <summary>Sound browser <small>Find a sound. Hear it. Use it.</small></summary>
  <div class="browser-toolbar"><button class="flag" onclick={refresh} disabled={loading}>{loading ? 'Loading sounds…' : sounds.length ? 'Refresh sounds' : 'Load available sounds'}</button><button class="flag" onclick={cancel}>Stop preview</button></div>
  <p class="hint">Loads audio on request. Play custom <code>samples(…)</code> declarations, then refresh to see those sounds. Choose a sound for {target}.</p>
  {#if sounds.length}
    <label class="sound-search">Search sounds <input aria-label="Search sounds" type="search" bind:value={filter} oninput={() => { limit = 40; }} /></label>
    <p class="hint">{filtered.length} matching sounds / {sounds.length} registered</p>
    <div class="sound-results">
      {#each filtered.slice(0, limit) as sound (sound.name)}
        <div class="sound-result"><div><strong>{sound.name}</strong><small>{sound.type}{sound.samples ? ` · ${sound.samples} samples` : ''}</small></div><button class="flag" aria-label={`Preview ${sound.name}`} disabled={!!previewing} onclick={() => hear(sound.name)}>{previewing === sound.name ? 'Loading…' : '▶ Preview'}</button><button class="flag" aria-label={`Use ${sound.name}`} disabled={!canUse} onclick={() => useSound(sound.name)}>Use</button></div>
      {/each}
    </div>
    {#if filtered.length > limit}<button class="text-button" onclick={() => { limit += 40; }}>Show more sounds</button>{/if}
  {/if}
  {#if loading || previewing || message}<p class="hint" role="status">{loading ? 'Loading registry / samples…' : previewing ? `Loading preview: ${previewing}` : message}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</details>
