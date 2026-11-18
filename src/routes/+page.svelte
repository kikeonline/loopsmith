<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createRuntime, type Runtime } from '../lib/runtime';

  let code = $state('s("bd sd cp hh")');
  let playing = $state(false);
  let busy = $state(false);
  let error = $state('');
  let activeCode = $state('');
  let cycle = $state(0);
  let runtime: Runtime | undefined;
  let loading: Promise<Runtime> | undefined;
  let revision = 0;
  let frame = 0;
  const dirty = $derived(playing && code !== activeCode);

  function tick() {
    cycle = runtime?.cycle() ?? 0;
    if (playing) frame = requestAnimationFrame(tick);
  }

  async function play() {
    if (busy) return;
    const request = ++revision;
    const submittedCode = code;
    busy = true;
    error = '';
    try {
      runtime = await (loading ??= createRuntime().catch((cause) => {
        loading = undefined;
        throw cause;
      }));
      if (request !== revision) return;
      await runtime.evaluate(submittedCode);
      if (request !== revision) { runtime.stop(); return; }
      activeCode = submittedCode;
      playing = true;
      cancelAnimationFrame(frame);
      tick();
    } catch (cause) {
      if (request === revision) error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = false;
    }
  }

  function stop() {
    revision++;
    runtime?.stop();
    playing = false;
    cycle = 0;
    cancelAnimationFrame(frame);
  }

  onDestroy(stop);
</script>

<svelte:head>
  <title>Loopsmith — Strudel playground</title>
  <meta name="description" content="Learn Strudel by editing and playing a live loop in your browser." />
</svelte:head>

<main>
  <header>
    <a class="brand" href="/" aria-label="Loopsmith home"><span class="mark" aria-hidden="true">↻</span> loopsmith<span class="dot">.</span></a>
    <span class="stage">M0 / PLAYBACK SPIKE</span>
  </header>

  <section class="intro">
    <p class="eyebrow">A SMALL IDEA. ON REPEAT.</p>
    <h1>Your first loop<br />starts with a line<span class="dot">.</span></h1>
    <p>Edit the pattern. Press play. Hear what changes.<br />A little playground for learning Strudel, one loop at a time.</p>
  </section>

  <section class="workspace" aria-label="Strudel playground">
    <div class="transport">
      <div class="actions">
        <button class="play" onclick={play} disabled={busy}>{busy ? 'Loading audio…' : playing ? '↻ Update loop' : '▶ Play loop'}</button>
        <button class="stop" onclick={stop} disabled={!playing && !busy}>■ Stop</button>
      </div>
      <div class="readout" role="status" aria-live="polite">
        <span class:lit={playing} class="indicator"></span>
        {busy ? 'Preparing sounds' : playing ? dirty ? 'Playing · edits waiting' : 'Playing' : 'Ready when you are'}
      </div>
    </div>

    <div class="editor-heading"><label for="code">YOUR STRUDEL CODE</label><span>{playing ? `CYCLE ${Math.max(0, cycle).toFixed(1)}` : 'LIVE LOOP / 01'}</span></div>
    <div class="editor">
      <span class="line-number" aria-hidden="true">01</span>
      <textarea id="code" bind:value={code} spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="code-help" onkeydown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); play(); } }}></textarea>
    </div>
    <div class="editor-bottom"><span>Strudel / JavaScript</span><span>⌘ / Ctrl + Enter to {playing ? 'update' : 'play'}</span></div>
    {#if error}<div class="error" role="alert"><strong>Couldn’t play that edit.</strong> {error}{playing ? ' The last good loop is still playing.' : ''}</div>{/if}
  </section>

  <section class="guide" id="code-help" aria-label="Getting started">
    <div><span class="number">01</span><h2>Meet the sounds</h2><p><code>bd</code> kick · <code>sd</code> snare · <code>cp</code> clap · <code>hh</code> hi-hat. Each word is a step in the loop.</p></div>
    <div><span class="number">02</span><h2>Make a little space</h2><p>Replace a sound with <code>~</code> for a rest. Try <code>s("bd ~ sd ~")</code>, then update the loop.</p></div>
    <div><span class="number">03</span><h2>Keep experimenting</h2><p>Add <code>.fast(2)</code> to double the pace. Edits apply when you press Update loop.</p></div>
  </section>

  <footer><span>Made for curious ears. <span class="muted">Samples load from the internet on first play.</span></span><a href="https://github.com/kikeonline/loopsmith" target="_blank" rel="noreferrer">Source code ↗ <span class="muted">AGPL-3.0-or-later</span></a></footer>
</main>
