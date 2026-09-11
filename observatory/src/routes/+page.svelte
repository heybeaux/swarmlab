<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>SwarmLab Observatory</title>
</svelte:head>

<section class="hero">
  <p class="kicker">lab index</p>
  <h1>Experiments</h1>
  <p class="lede">
    Each experiment is a wind-tunnel test of a faculty in the heybeaux stack. Pick one, read
    what it tests, and replay its traces — agents as nodes, messages as light.
  </p>
</section>

<section class="evidence" aria-label="Evidence ledger summary">
  <div><strong>{data.evidence.verifiedClaims}</strong><span>verified claims</span></div>
  <div><strong>{data.evidence.traceCount}</strong><span>admitted traces</span></div>
  <div><strong>{data.evidence.assertionCount}</strong><span>score assertions</span></div>
  {#if data.evidence.latestClaimId}<div><strong>{data.evidence.latestClaimId}</strong><span>latest Aegis retest</span></div>{/if}
</section>

{#if data.experiments.length === 0}
  <p class="empty mono">No experiments found in <code>experiments/</code>.</p>
{:else}
  <div class="grid">
    {#each data.experiments as exp (exp.id)}
      <a class="card" href="/experiments/{exp.id}">
        <div class="card-top">
          <span class="mono id">{exp.id}</span>
          <span class="badge" class:live={exp.status === 'has-runs'}>
            {exp.runCount}
            {exp.runCount === 1 ? 'run' : 'runs'}
          </span>
        </div>
        <h2>{exp.name}</h2>
        <p class="desc">{exp.description}</p>
        {#if exp.faculty}
          <p class="faculty"><span class="kicker">faculty</span> <span>{exp.faculty}</span></p>
        {/if}
      </a>
    {/each}
  </div>
{/if}

<style>
  .hero {
    margin-bottom: 40px;
    max-width: 640px;
  }
  h1 {
    font-size: 40px;
    margin: 6px 0 12px;
  }
  .lede {
    color: var(--ink-dim);
    margin: 0;
  }
  .evidence {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1px;
    margin: -14px 0 32px;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--line);
  }
  .evidence div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 14px 18px;
    background: var(--bg-raised);
  }
  .evidence strong { color: var(--violet); font-family: var(--mono); font-size: 18px; }
  .evidence span { color: var(--ink-faint); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }
  .card {
    display: block;
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 20px 22px;
    color: var(--ink);
    transition:
      border-color 0.18s ease,
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }
  .card:hover {
    text-decoration: none;
    border-color: var(--line-bright);
    transform: translateY(-2px);
    box-shadow: 0 8px 30px #00000066;
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .id {
    font-size: 12px;
    color: var(--ink-faint);
  }
  h2 {
    font-size: 20px;
    margin: 0 0 8px;
    text-transform: capitalize;
  }
  .desc {
    color: var(--ink-dim);
    font-size: 13.5px;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .faculty {
    margin: 12px 0 0;
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 13px;
    color: var(--violet);
  }
  .empty {
    color: var(--ink-dim);
  }
</style>
