<script lang="ts">
  import { parseDocument, type ParsedDocument } from '../project';
  import { downloadText, MAX_FILE_BYTES, projectFile, readProjectFile, safeFilename, serializeProject, type RestoredProject } from '../persistence/project-file';
  import { TEMPLATES } from '../persistence/templates';
  let { name, rename, snapshot, load, saveStatus, saveError, recovery, paused, resume }: {
    name: string; rename: (name: string) => void;
    snapshot: () => { code: string; document: ParsedDocument };
    load: (project: RestoredProject) => void;
    saveStatus: string; saveError: string; recovery: string; paused: boolean; resume: () => void;
  } = $props();
  let templateId = $state('basic-beat');
  let error = $state('');
  let message = $state('');
  let importing = $state(false);
  let request = 0;
  let fileInput: HTMLInputElement;
  const template = $derived(TEMPLATES.find(item => item.id === templateId)!);
  function act(operation: () => void) { error = ''; message = ''; try { operation(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); } }
  function loadSource(code: string, title: string) {
    request++; importing = false;
    const parsed = parseDocument(code);
    if (!parsed.ok) throw new Error(`Template syntax error: ${parsed.error.message}`);
    load({ file: projectFile(title, code, parsed.document), document: parsed.document });
    message = `Loaded ${title}. Undo restores the previous source. Press Play when you’re ready.`;
  }
  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const current = ++request;
    importing = true; error = ''; message = '';
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Project file exceeds the 8 MiB limit');
      const text = await file.text();
      const restored = readProjectFile(text);
      if (current !== request) return;
      load(restored);
      message = `Imported ${restored.file.name || 'Untitled loop'}. Press Play to run its code.`;
    } catch (cause) { if (current === request) error = cause instanceof Error ? cause.message : String(cause); }
    finally { if (current === request) importing = false; input.value = ''; }
  }
  function exportJson() {
    const { code, document } = snapshot();
    const text = serializeProject(projectFile(name, code, document));
    downloadText(text, `${safeFilename(name)}.loopsmith.json`, 'application/json');
    message = 'Project JSON downloaded, including the draft and last good version.';
  }
  function exportCode() {
    const { code } = snapshot();
    downloadText(code, `${safeFilename(name)}.strudel`);
    message = 'Strudel code downloaded exactly as shown. Incomplete code will need fixing before it plays.';
  }
  async function copyCode() {
    error = ''; message = '';
    try { await navigator.clipboard.writeText(snapshot().code); message = 'Strudel code copied. Paste it into strudel.cc to play.'; }
    catch { error = 'Could not access the clipboard. Use Download code or select and copy text in the code pane.'; }
  }
</script>
<section class="project-bar" aria-label="Project files and templates">
  <div class="project-topline"><label class="project-name">Project name <input aria-label="Project name" maxlength="160" value={name} oninput={event => rename(event.currentTarget.value)} /></label><span class="save-status" aria-live="polite">{saveStatus}</span></div>
  <div class="project-actions">
    <button class="flag" onclick={() => act(() => loadSource('setcpm(30);\n\nnull;\n', 'Untitled loop'))}>New project</button>
    <button class="flag" disabled={importing} onclick={() => fileInput.click()}>{importing ? 'Reading project…' : 'Import project JSON'}</button>
    <input class="file-input" type="file" accept=".json,application/json" aria-label="Import project file" bind:this={fileInput} onchange={importFile} />
    <button class="flag" onclick={() => act(exportJson)}>Export project JSON</button>
    <button class="flag" onclick={copyCode}>Copy Strudel code</button>
    <button class="flag" onclick={() => act(exportCode)}>Download code</button>
  </div>
  <div class="template-tools"><label>Starter template <select aria-label="Starter template" bind:value={templateId}>{#each TEMPLATES as item}<option value={item.id}>{item.name}</option>{/each}</select></label><button class="flag" onclick={() => act(() => loadSource(template.code, template.name))}>Load template</button><p class="hint">{template.description}</p></div>
  <p class="hint">Saved on this browser only. Export JSON to keep a portable backup. Imports and templates stay stopped until you press Play; load only code you trust.</p>
  {#if message}<p class="project-message" aria-live="polite">{message}</p>{/if}
  {#if error}<p class="error" role="alert">{error} Your editor has not been cleared.</p>{/if}
  {#if saveError}
    <div class="error" role="alert">{saveError} Export JSON or download code to keep a copy.
      {#if paused}<div class="project-actions"><button class="flag" onclick={() => act(() => downloadText(recovery, 'loopsmith-recovery.json', 'application/json'))}>Download saved recovery data</button><button class="flag" onclick={resume}>Resume autosave with current project</button></div>{/if}
    </div>
  {/if}
</section>
