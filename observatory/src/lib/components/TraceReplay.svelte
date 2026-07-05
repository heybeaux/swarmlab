<script lang="ts">
  import type { TraceEvent } from '$lib/types';
  import {
    buildTimeline,
    layoutAgents,
    easeOutCubic,
    clamp01,
    eventLabel,
    type TimedEvent
  } from '$lib/replay';

  let { events }: { events: TraceEvent[] } = $props();

  const W = 920;
  const H = 520;
  const MSG_WIN = 0.09; // fraction of timeline a message dot spends in flight
  const FADE = 0.12; // how long a fired edge keeps glowing
  const BASE_DURATION_MS = 9000;

  let progress = $state(0);
  let playing = $state(false);
  let speed = $state(1);

  let timeline = $derived(buildTimeline(events));
  let nodes = $derived(layoutAgents(timeline, W, H));
  let nodeList = $derived([...nodes.values()]);

  let messages = $derived(
    timeline.filter(
      (te): te is TimedEvent & { event: Extract<TraceEvent, { t: 'message' }> } =>
        te.event.t === 'message'
    )
  );
  let scoreEvents = $derived(
    timeline.filter(
      (te): te is TimedEvent & { event: Extract<TraceEvent, { t: 'score' }> } =>
        te.event.t === 'score'
    )
  );

  let activeIndex = $derived.by(() => {
    let idx = -1;
    for (const te of timeline) {
      if (te.at <= progress) idx = te.index;
      else break;
    }
    return idx;
  });

  let liveCount = $derived(
    nodeList.filter((n) => n.spawnAt <= progress && (n.killAt === null || n.killAt > progress))
      .length
  );

  // ── playback loop ──────────────────────────────────────────────
  $effect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      progress = clamp01(progress + (dt / BASE_DURATION_MS) * speed);
      if (progress >= 1) {
        playing = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function togglePlay(): void {
    if (progress >= 1) progress = 0;
    playing = !playing;
  }

  function restart(): void {
    progress = 0;
    playing = true;
  }

  function jumpTo(at: number): void {
    playing = false;
    progress = clamp01(at + 0.001);
  }

  // ── geometry helpers ───────────────────────────────────────────
  interface Flight {
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    dotX: number;
    dotY: number;
    inFlight: boolean;
    glow: number; // 0..1 residual edge glow
    topic: string;
  }

  let flights = $derived.by(() => {
    const out: Flight[] = [];
    for (const te of messages) {
      const from = nodes.get(te.event.from);
      if (!from) continue;
      const targets =
        te.event.to === '*'
          ? nodeList.filter((n) => n.id !== te.event.from)
          : ([nodes.get(te.event.to)].filter((n) => n !== undefined) as typeof nodeList);
      for (const to of targets) {
        const t = (progress - te.at) / MSG_WIN;
        if (t < 0) continue;
        const eased = easeOutCubic(clamp01(t));
        const residual = t <= 1 ? 1 : Math.max(0, 1 - (progress - (te.at + MSG_WIN)) / FADE);
        if (t > 1 && residual <= 0) continue;
        out.push({
          key: `${te.index}-${to.id}`,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          dotX: from.x + (to.x - from.x) * eased,
          dotY: from.y + (to.y - from.y) * eased,
          inFlight: t <= 1,
          glow: residual,
          topic: te.event.topic
        });
      }
    }
    return out;
  });

  function nodeScale(spawnAt: number): number {
    const t = clamp01((progress - spawnAt) / 0.04);
    return easeOutCubic(t);
  }

  function scorePulse(at: number): number {
    const t = (progress - at) / 0.1;
    if (t < 0 || t > 1) return 0;
    return 1 - t;
  }

  function fmtBody(body: unknown): string {
    const s = JSON.stringify(body);
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }
</script>

<div class="replay">
  <div class="stage-wrap">
    <svg viewBox="0 0 {W} {H}" class="stage" role="img" aria-label="Animated trace replay">
      <defs>
        <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="stagefloor" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stop-color="#12203055" />
          <stop offset="100%" stop-color="transparent" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill="url(#stagefloor)" />

      <!-- score pulses radiate from center -->
      {#each scoreEvents as se (se.index)}
        {@const p = scorePulse(se.at)}
        {#if p > 0}
          <circle
            cx={W / 2}
            cy={H / 2}
            r={30 + (1 - p) * 190}
            fill="none"
            stroke="var(--amber)"
            stroke-width={1.5}
            opacity={p * 0.55}
          />
        {/if}
      {/each}

      <!-- message edges + flying payloads -->
      {#each flights as f (f.key)}
        <line
          x1={f.x1}
          y1={f.y1}
          x2={f.x2}
          y2={f.y2}
          stroke="var(--accent)"
          stroke-width={f.inFlight ? 1.6 : 1}
          opacity={0.14 + f.glow * 0.4}
        />
        {#if f.inFlight}
          <circle cx={f.dotX} cy={f.dotY} r="5" fill="var(--accent)" filter="url(#glow)" />
          <text
            x={(f.x1 + f.x2) / 2}
            y={(f.y1 + f.y2) / 2 - 12}
            class="topic"
            text-anchor="middle">{f.topic}</text
          >
        {/if}
      {/each}

      <!-- agent nodes -->
      {#each nodeList as node (node.id)}
        {@const s = nodeScale(node.spawnAt)}
        {@const dead = node.killAt !== null && node.killAt <= progress}
        {#if s > 0}
          <g
            transform="translate({node.x} {node.y}) scale({s})"
            opacity={dead ? 0.35 : 1}
            class="agent"
          >
            <circle
              r="27"
              fill="var(--bg-panel)"
              stroke={dead ? 'var(--rose)' : 'var(--accent)'}
              stroke-width="1.5"
              filter={dead ? undefined : 'url(#glow)'}
            />
            <circle r="27" fill="none" stroke="#ffffff10" stroke-width="6" />
            <text y="5" text-anchor="middle" class="agent-glyph">{dead ? '✕' : '◉'}</text>
          </g>
          <text
            x={node.x}
            y={node.y + 48}
            text-anchor="middle"
            class="agent-label"
            opacity={s * (dead ? 0.5 : 1)}>{node.id}</text
          >
        {/if}
      {/each}
    </svg>

    <div class="hud mono">
      <span>{liveCount} live</span>
      <span>event {Math.max(0, activeIndex + 1)}/{timeline.length}</span>
    </div>
  </div>

  <!-- transport -->
  <div class="transport">
    <button class="play" onclick={togglePlay} aria-label={playing ? 'pause' : 'play'}>
      {playing ? '❚❚' : '▶'}
    </button>
    <button class="ghost" onclick={restart} aria-label="restart">⟲</button>
    <input
      class="scrubber"
      type="range"
      min="0"
      max="1000"
      value={Math.round(progress * 1000)}
      oninput={(e) => {
        playing = false;
        progress = Number(e.currentTarget.value) / 1000;
      }}
      aria-label="timeline scrubber"
    />
    <div class="speeds mono">
      {#each [0.5, 1, 2, 4] as s (s)}
        <button class:on={speed === s} onclick={() => (speed = s)}>{s}×</button>
      {/each}
    </div>
  </div>

  <!-- telemetry: scores surface as they fire -->
  <div class="panels">
    <section class="panel">
      <h3 class="kicker">Telemetry — scores</h3>
      {#if scoreEvents.length === 0}
        <p class="dim mono">no score events in this trace</p>
      {:else}
        <ul class="scorelist">
          {#each scoreEvents as se (se.index)}
            <li class="scorerow" class:fired={se.at <= progress} class:hot={scorePulse(se.at) > 0}>
              <span class="mono when">t+{se.event.ts - (timeline[0]?.event.ts ?? 0)}ms</span>
              <span class="chips">
                {#each Object.entries(se.event.scores) as [k, v] (k)}
                  <span class="chip mono">{k} <strong>{v}</strong></span>
                {/each}
              </span>
              {#if se.event.agentId}
                <span class="mono dim">@{se.event.agentId}</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel">
      <h3 class="kicker">Event log</h3>
      <ul class="log mono">
        {#each timeline as te (te.index)}
          <li>
            <button
              class="logrow"
              class:past={te.at <= progress}
              class:current={te.index === activeIndex}
              onclick={() => jumpTo(te.at)}
            >
              <span class="etype {te.event.t}">{te.event.t}</span>
              <span class="elabel">{eventLabel(te.event)}</span>
              {#if te.event.t === 'message'}
                <span class="ebody">{fmtBody(te.event.body)}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  </div>
</div>

<style>
  .replay {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .stage-wrap {
    position: relative;
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }
  .stage {
    display: block;
    width: 100%;
    height: auto;
  }
  .hud {
    position: absolute;
    top: 12px;
    right: 14px;
    display: flex;
    gap: 14px;
    font-size: 11px;
    color: var(--ink-faint);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .topic {
    font-family: var(--mono);
    font-size: 11px;
    fill: var(--accent);
    opacity: 0.85;
  }
  .agent-glyph {
    font-size: 15px;
    fill: var(--ink);
  }
  .agent-label {
    font-family: var(--mono);
    font-size: 13px;
    fill: var(--ink-dim);
    letter-spacing: 0.06em;
  }

  .transport {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .play,
  .ghost {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 1px solid var(--line-bright);
    background: var(--bg-panel);
    color: var(--ink);
    font-size: 14px;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }
  .play {
    border-color: var(--accent);
    color: var(--accent);
  }
  .play:hover,
  .ghost:hover {
    border-color: var(--accent);
  }
  .scrubber {
    flex: 1;
    accent-color: var(--accent);
    height: 4px;
  }
  .speeds {
    display: flex;
    gap: 4px;
  }
  .speeds button {
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--ink-faint);
    font-family: var(--mono);
    font-size: 12px;
    padding: 4px 8px;
    cursor: pointer;
  }
  .speeds button.on {
    color: var(--accent);
    border-color: var(--accent-dim);
    background: var(--accent-dim);
  }

  .panels {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(0, 1.4fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .panels {
      grid-template-columns: 1fr;
    }
  }
  .panel {
    background: var(--bg-raised);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 16px 18px;
  }
  .panel h3 {
    margin: 0 0 12px;
  }
  .dim {
    color: var(--ink-faint);
    font-size: 12px;
  }

  .scorelist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .scorerow {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    opacity: 0.25;
    transition: opacity 0.3s ease;
  }
  .scorerow.fired {
    opacity: 1;
  }
  .scorerow.hot .chip {
    box-shadow: 0 0 14px #fbbf2455;
  }
  .when {
    font-size: 11px;
    color: var(--ink-faint);
    min-width: 64px;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    font-size: 11.5px;
    padding: 2px 9px;
    border-radius: 999px;
    background: #fbbf2418;
    color: var(--amber);
    transition: box-shadow 0.2s ease;
  }
  .chip strong {
    font-weight: 700;
  }

  .log {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .logrow {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: baseline;
    background: none;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: 0 6px 6px 0;
    padding: 5px 10px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-faint);
    text-align: left;
    cursor: pointer;
  }
  .logrow:hover {
    background: var(--bg-panel);
  }
  .logrow.past {
    color: var(--ink-dim);
  }
  .logrow.current {
    border-left-color: var(--accent);
    background: var(--bg-panel);
    color: var(--ink);
  }
  .etype {
    min-width: 64px;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.12em;
  }
  .etype.spawn {
    color: var(--accent);
  }
  .etype.message {
    color: var(--violet);
  }
  .etype.score {
    color: var(--amber);
  }
  .etype.kill {
    color: var(--rose);
  }
  .elabel {
    white-space: nowrap;
  }
  .ebody {
    color: var(--ink-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
