<script lang="ts">
  import TraceReplay from '$lib/components/TraceReplay.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.runId} · replay · SwarmLab</title>
</svelte:head>

<nav class="crumbs mono">
  <a href="/">experiments</a>
  <span>/</span>
  <a href="/experiments/{data.expId}">{data.expId}</a>
  <span>/</span>
  <span class="here">{data.runId}</span>
</nav>

<section class="head">
  <p class="kicker">trace replay</p>
  <h1>{data.runId}<span class="ext mono">.jsonl</span></h1>
  <p class="lede">
    {data.events.length} events. Press play — agents light up as they spawn, messages fly the
    bus, and scores pulse from the center as they fire.
  </p>
</section>

<TraceReplay events={data.events} />

<style>
  .crumbs {
    font-size: 13px;
    color: var(--ink-faint);
    margin-bottom: 20px;
  }
  .crumbs .here {
    color: var(--ink-dim);
  }
  .head {
    margin-bottom: 26px;
    max-width: 640px;
  }
  h1 {
    font-size: 32px;
    margin: 4px 0 10px;
  }
  .ext {
    color: var(--ink-faint);
    font-size: 18px;
    font-weight: 400;
    margin-left: 2px;
  }
  .lede {
    color: var(--ink-dim);
    margin: 0;
    font-size: 14.5px;
  }
</style>
