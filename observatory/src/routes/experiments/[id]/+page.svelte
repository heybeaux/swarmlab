<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let exp = $derived(data.experiment);

  function fmtTime(ts: number | null): string {
    return ts === null ? '—' : new Date(ts).toLocaleString();
  }
  function fmtDur(run: { startedAt: number | null; endedAt: number | null }): string {
    if (run.startedAt === null || run.endedAt === null) return '—';
    return `${run.endedAt - run.startedAt}ms`;
  }
</script>

<svelte:head>
  <title>{exp.name} · SwarmLab</title>
</svelte:head>

<nav class="crumbs mono">
  <a href="/">experiments</a> <span>/</span> <span class="here">{exp.id}</span>
</nav>

<section class="head">
  <h1>{exp.name}</h1>
  <div class="meta">
    {#if exp.faculty}
      <span class="badge live">{exp.faculty}</span>
    {/if}
    <span class="badge">{exp.runCount} {exp.runCount === 1 ? 'run' : 'runs'}</span>
  </div>
</section>

<div class="columns">
  <article class="readme">
    <!-- eslint-disable-next-line svelte/no-at-html-tags — trusted local README -->
    {@html exp.readmeHtml}
  </article>

  <aside>
    <h2 class="kicker">Runs</h2>
    {#if exp.runs.length === 0}
      <p class="empty">
        No traces yet. Run the experiment from the repo root to produce one:
      </p>
      <pre class="mono">node experiments/{exp.id}/dist/main.js</pre>
    {:else}
      <ul class="runs">
        {#each exp.runs as run (run.id)}
          <li>
            <a class="run" href="/experiments/{exp.id}/runs/{run.id}">
              <div class="run-top">
                <span class="mono run-id">{run.id}</span>
                <span class="replay">replay ▸</span>
              </div>
              <div class="stats mono">
                <span>{run.agents} agents</span>
                <span>{run.messages} msgs</span>
                <span>{run.events} events</span>
                <span>{fmtDur(run)}</span>
              </div>
              {#if run.scores}
                <div class="scores mono">
                  {#each Object.entries(run.scores) as [k, v] (k)}
                    <span class="score"><em>{k}</em> {v}</span>
                  {/each}
                </div>
              {/if}
              <div class="when mono">{fmtTime(run.startedAt)}</div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
</div>

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
    display: flex;
    align-items: baseline;
    gap: 18px;
    flex-wrap: wrap;
    margin-bottom: 28px;
  }
  h1 {
    font-size: 34px;
    margin: 0;
    text-transform: capitalize;
  }
  .meta {
    display: flex;
    gap: 8px;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
    gap: 40px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }
  .readme {
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 28px 20px;
    font-size: 14.5px;
    color: var(--ink-dim);
    overflow-wrap: break-word;
  }
  .readme :global(h1),
  .readme :global(h2),
  .readme :global(h3) {
    color: var(--ink);
  }
  .readme :global(code) {
    background: var(--bg-panel);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 12.5px;
  }
  .readme :global(pre) {
    background: var(--bg-panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 14px;
    overflow-x: auto;
  }
  .readme :global(pre code) {
    border: 0;
    padding: 0;
    background: none;
  }
  .readme :global(blockquote) {
    border-left: 2px solid var(--line-bright);
    margin-left: 0;
    padding-left: 16px;
    color: var(--ink-faint);
  }
  aside h2 {
    margin: 0 0 14px;
  }
  .runs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .run {
    display: block;
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
    color: var(--ink);
    transition: border-color 0.18s ease;
  }
  .run:hover {
    text-decoration: none;
    border-color: var(--accent-dim);
  }
  .run-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .run-id {
    font-size: 14px;
    color: var(--accent);
  }
  .replay {
    font-family: var(--mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-faint);
  }
  .run:hover .replay {
    color: var(--accent);
  }
  .stats {
    display: flex;
    gap: 14px;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .scores {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .score {
    font-size: 11.5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent-dim);
    color: var(--accent);
  }
  .score em {
    font-style: normal;
    opacity: 0.7;
  }
  .when {
    margin-top: 8px;
    font-size: 11px;
    color: var(--ink-faint);
  }
  .empty {
    color: var(--ink-dim);
    font-size: 13.5px;
  }
  pre {
    background: var(--bg-panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px;
    font-size: 12px;
    overflow-x: auto;
  }
</style>
