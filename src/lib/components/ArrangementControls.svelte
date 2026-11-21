<script lang="ts">
  import type { ParsedDocument, Track, Span } from '../project';
  import type { VisualEdit } from '../editor/sync';
  import type { SoundInfo } from '../runtime';
  import { readArrangement, sectionProxy, outerProxy, editSection, editArrangementEffects, arrangementPosition, renameSection, setSectionCycles, addSection, moveSection, removeSection, flattenSection } from '../editor/arrangement';
  import { overlaps } from '../editor/event-playheads';
  import { canHighlight } from '../editor/composition';
  import PatternEditor from './PatternEditor.svelte';
  import ModifierControls from './ModifierControls.svelte';
  import EffectControls from './EffectControls.svelte';
  let { document, track, edit, cycle, audible, loadSounds, previewSound, stopPreview, eventRanges }: {
    eventRanges?: Span[];
    document: ParsedDocument; track: Track; edit: (operation: VisualEdit) => void;
    cycle: number; audible: boolean; loadSounds: () => Promise<SoundInfo[]>;
    previewSound: (name: string) => Promise<void>; stopPreview: () => void;
  } = $props();
  let selectedId = $state('');
  const view = $derived(readArrangement(document, track.id)!);
  const selected = $derived(view.sections.find(section => section.id === selectedId) ?? view.sections[0]);
  const proxy = $derived(sectionProxy(document, track.id, selected.id));
  const outer = $derived(outerProxy(document, track.id));
  const position = $derived(audible && canHighlight(outer.track) ? arrangementPosition(view, cycle) : null);
  function sectionActive(id: string) {
    const section = view.sections.find(section => section.id === id)!;
    return eventRanges !== undefined ? eventRanges.some(range => overlaps(range,section.pattern)) : position?.section.id === id;
  }
  function sectionEdit(operation: VisualEdit) { const reference = selected.reference; edit(document => editSection(document, reference, operation)); }
  function outerEdit(operation: VisualEdit) { const id = track.id; edit(document => editArrangementEffects(document, id, operation)); }
  function add(copy: boolean) { const id = crypto.randomUUID(), trackId = track.id, reference = copy ? selected.reference : undefined; selectedId = id; edit(document => addSection(document, trackId, id, reference)); }
  function timelineKey(event: KeyboardEvent) {
    const buttons = Array.from((event.currentTarget as HTMLElement).parentElement!.querySelectorAll<HTMLButtonElement>('button'));
    const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowRight' ? (index + 1) % buttons.length : event.key === 'ArrowLeft' ? (index - 1 + buttons.length) % buttons.length : -1;
    if (next < 0) return; event.preventDefault(); buttons[next].focus(); buttons[next].click();
  }
</script>
<section class="arrangement" aria-label="Track arrangement">
  <h3>Arrange sections</h3>
  <p class="hint">Sections play in order, then repeat. Each pattern keeps its native Strudel phase across repeats. Cycle lengths apply before track-wide modifiers.</p>
  <div class="arrangement-timeline" aria-label="Section timeline">
    {#each view.sections as section, index (section.id)}
      <button class="arrangement-section" class:selected={section.id === selected.id} class:current={sectionActive(section.id)} style={`flex-grow:${section.cycles.value ?? 1}`} aria-label={`Select section ${index + 1}: ${section.name} ${section.cycles.value === null ? 'Cycles in code' : `${section.cycles.value} cycles`}${sectionActive(section.id) ? ' Playing' : ''}`} aria-pressed={section.id === selected.id} onclick={() => selectedId = section.id} onkeydown={timelineKey}>
        <strong>{section.name}</strong>{' '}<span>{section.cycles.value === null ? 'Cycles in code' : `${section.cycles.value} cycles`}</span>{#if sectionActive(section.id)}{' '}<span>Playing</span>{/if}
      </button>
    {/each}
  </div>
  <p class="hint">{view.totalCycles === null ? 'Total duration is edited in code.' : `${view.totalCycles} cycles per arrangement loop.`} {eventRanges !== undefined ? 'Sections light up when reported source events belong to their pattern; silent or shared/computed patterns may have no section highlight.' : position ? '' : 'Timeline playhead is hidden when timing is custom, modified, stopped, or unsynced.'}</p>
  <div class="section-tools">
    <label>Section name <input aria-label="Section name" value={selected.name} maxlength="160" onchange={event => { const name = event.currentTarget.value, reference = selected.reference; edit(document => renameSection(document, reference, name)); }} /></label>
    <label>Section cycles <input aria-label="Section cycles" type="number" min="1" max="1024" step="1" value={selected.cycles.value ?? ''} placeholder="Code" disabled={selected.cycles.value === null} onchange={event => { const value = Number(event.currentTarget.value), reference = selected.reference; edit(document => setSectionCycles(document, reference, value)); }} /></label>
    {#if selected.cycles.value === null}<code class="expression-chip">{selected.cycles.code}</code><button class="text-button" onclick={() => { const reference = selected.reference; edit(document => setSectionCycles(document, reference, 4, true)); }}>Replace cycle expression with 4</button>{/if}
    <div class="actions">
      <button class="flag" disabled={view.sections.length >= 32} onclick={() => add(true)}>Duplicate section</button>
      <button class="flag" disabled={view.sections.length >= 32 || view.shadowedSources} onclick={() => add(false)}>Add rest section</button>
      <button class="flag" disabled={selected.id === view.sections[0].id} onclick={() => { const reference = selected.reference; edit(document => moveSection(document, reference, -1)); }}>Section earlier</button>
      <button class="flag" disabled={selected.id === view.sections[view.sections.length - 1].id} onclick={() => { const reference = selected.reference; edit(document => moveSection(document, reference, 1)); }}>Section later</button>
      <button class="flag" disabled={view.sections.length === 1} onclick={() => { const reference = selected.reference; edit(document => removeSection(document, reference)); }}>Remove section</button>
    </div>
    <button class="text-button" title="Replace the arrangement with this section’s pattern and the track-wide effects. Undo restores all sections." onclick={() => { const reference = selected.reference; edit(document => flattenSection(document, reference)); }}>Keep selected pattern only</button>
  </div>
  <section class="arrangement-pattern" aria-label="Selected section pattern">
    <h3>{selected.name} · pattern</h3>
    <PatternEditor document={proxy.document} track={proxy.track} edit={sectionEdit} cycle={position?.sourceCycle ?? 0} highlight={eventRanges === undefined && position?.section.id === selected.id && canHighlight(proxy.track)} {eventRanges} sourceOffset={selected.pattern.from-proxy.prefix.length} {loadSounds} {previewSound} {stopPreview} />
  </section>
  <details class="arrangement-outer"><summary>Track-wide modifiers and effects</summary><p class="hint">These run after the whole arrangement. Section controls above affect only the selected pattern.</p><ModifierControls document={outer.document} track={outer.track} edit={outerEdit} labelPrefix="Track-wide " /><EffectControls track={outer.track} edit={outerEdit} labelPrefix="Track-wide " /></details>
</section>
