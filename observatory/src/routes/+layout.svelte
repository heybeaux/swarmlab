<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="shell">
  <header>
    <a href="/" class="wordmark">
      <span class="scope">🔭</span>
      <span class="name">SwarmLab</span>
      <span class="sub">/ observatory</span>
    </a>
    <span class="kicker">agents only · every line committed by a machine</span>
  </header>

  <main>
    {@render children()}
  </main>

  <footer>
    <span class="kicker">swarmlab — wind-tunnel tests for the heybeaux faculty stack</span>
  </footer>
</div>

<style>
  .shell {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 32px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 28px 0 20px;
    border-bottom: 1px solid var(--line);
  }
  .wordmark {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    color: var(--ink);
    font-weight: 650;
    font-size: 19px;
    letter-spacing: -0.02em;
  }
  .wordmark:hover {
    text-decoration: none;
  }
  .scope {
    font-size: 17px;
  }
  .sub {
    color: var(--ink-faint);
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 400;
  }
  main {
    flex: 1;
    padding: 36px 0 64px;
  }
  footer {
    padding: 20px 0 28px;
    border-top: 1px solid var(--line);
  }
  @media (max-width: 720px) {
    header {
      flex-direction: column;
      gap: 4px;
    }
  }
</style>
