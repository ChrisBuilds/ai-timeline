<script lang="ts">
  import type { TimelineEvent } from './types'
  import type { TimeScale } from './scale'
  import type { Cluster, PlacedCard } from './layout'
  import { formatRange } from './dates'

  interface Props {
    scale: TimeScale
    placed: PlacedCard<TimelineEvent>[]
    clusters: Cluster<TimelineEvent>[]
    spineX: number
    cardWidth: number
    cardHeight: number
    anchorOffset: number
    selectedId: string | null
    highlightIds: Set<string>
    /** Events that don't match the active filters. */
    dimIds: Set<string>
    /** Events that match the active filters; empty when no filter is on. */
    matchIds: Set<string>
    onselect: (id: string) => void
    onexpand: (cluster: Cluster<TimelineEvent>) => void
  }

  let {
    scale,
    placed,
    clusters,
    spineX,
    cardWidth,
    cardHeight,
    anchorOffset,
    selectedId,
    highlightIds,
    dimIds,
    matchIds,
    onselect,
    onexpand,
  }: Props = $props()

  // Year labels sit on the spine, so skip any that would land on an event dot,
  // the Now marker, or another label just across an era boundary.
  // Which "+N" marker has its list of hidden events open.
  let openCluster = $state<string | null>(null)

  const ticks = $derived.by(() => {
    const dots = [...placed.map((c) => c.y), ...clusters.map((c) => c.y)]
    const nowY = scale.y(scale.bands[0].end)
    const out: { year: number; y: number }[] = []
    for (const t of scale.ticks(56)) {
      if (Math.abs(t.y - nowY) < 20) continue
      if (dots.some((y) => Math.abs(t.y - y) < 14)) continue
      if (out.some((o) => Math.abs(o.y - t.y) < 24)) continue
      out.push(t)
    }
    return out
  })

  function cardLeft(lane: number): number {
    return lane === 0 ? spineX + 24 : spineX - 24 - cardWidth
  }
</script>

<div class="timeline" style:height="{scale.height}px" style:--spine="{spineX}px" style:--label-pad="{spineX < 100 ? spineX + 16 : 8}px">
  {#each scale.bands as band, i (band.era.id)}
    <section
      class="band"
      class:alt={i % 2 === 1}
      style:top="{band.top}px"
      style:height="{band.height}px"
      aria-label={band.era.name}
    >
      <h2 class="era-label">
        {band.era.name}
        <span class="era-years">{band.start}–{band.era.end ?? 'now'}</span>
      </h2>
    </section>
  {/each}

  <div class="spine" aria-hidden="true"></div>

  <div class="now" style:top="{scale.y(scale.bands[0].end)}px" aria-hidden="true">
    <span class="now-dot"></span><span class="now-label">Now</span>
  </div>

  {#each ticks as tick (tick.year)}
    <span class="tick" style:top="{tick.y}px" aria-hidden="true">{tick.year}</span>
  {/each}

  {#each clusters as cluster (cluster.items.map((e) => e.id).join('|'))}
    {@const key = cluster.items.map((e) => e.id).join('|')}
    <div class="cluster-wrap" style:top="{cluster.y}px">
      <button
        class="cluster"
        class:dimmed={cluster.items.every((e) => dimIds.has(e.id))}
        class:match={cluster.items.some((e) => matchIds.has(e.id))}
        onclick={() => (openCluster = openCluster === key ? null : key)}
        aria-expanded={openCluster === key}
        aria-label="{cluster.items.length} more event{cluster.items.length === 1 ? '' : 's'} here"
      >
        +{cluster.items.length}
      </button>
      {#if openCluster === key}
        <div class="cluster-menu" role="menu">
          {#each cluster.items as ev (ev.id)}
            <button
              role="menuitem"
              class:dimmed={dimIds.has(ev.id)}
              class:match={matchIds.has(ev.id)}
              onclick={() => {
                openCluster = null
                onselect(ev.id)
              }}
            >
              <span class="menu-date">{formatRange(ev.date, ev.end_date)}</span>
              {ev.title}
            </button>
          {/each}
          <button
            role="menuitem"
            class="menu-zoom"
            onclick={() => {
              openCluster = null
              onexpand(cluster)
            }}>Zoom in here</button
          >
        </div>
      {/if}
    </div>
  {/each}

  <ol class="cards" aria-label="Events">
    {#each placed as card (card.item.id)}
      {@const ev = card.item}
      {@const left = cardLeft(card.lane)}
      <li>
        <span
          class="dot tier-{ev.tier}"
          class:selected={selectedId === ev.id}
          class:dimmed={dimIds.has(ev.id) && selectedId !== ev.id}
          class:match={matchIds.has(ev.id)}
          style:top="{card.y}px"
          aria-hidden="true"
        ></span>
        <span
          class="connector"
          style:top="{card.y}px"
          style:left="{Math.min(spineX, left + cardWidth)}px"
          style:width="{card.lane === 0 ? left - spineX : spineX - (left + cardWidth)}px"
          aria-hidden="true"
        ></span>
        <article
          id={ev.id}
          class="card tier-{ev.tier}"
          class:selected={selectedId === ev.id}
          class:related={highlightIds.has(ev.id)}
          class:dimmed={dimIds.has(ev.id) && selectedId !== ev.id}
          class:match={matchIds.has(ev.id)}
          style:top="{card.top}px"
          style:left="{left}px"
          style:width="{cardWidth}px"
          style:height="{cardHeight}px"
          style:--anchor="{anchorOffset}px"
        >
          <button class="card-button" onclick={() => onselect(ev.id)} aria-pressed={selectedId === ev.id}>
            <span class="meta">
              <time datetime={ev.date}>{formatRange(ev.date, ev.end_date)}</time>
              <span class="category">{ev.category}</span>
              {#if ev.developing}<span class="badge">developing</span>{/if}
              {#if ev.disputed}<span class="badge warn">disputed</span>{/if}
            </span>
            <span class="title">{ev.title}</span>
          </button>
        </article>
      </li>
    {/each}
  </ol>
</div>

<style>
  .timeline {
    position: relative;
    width: 100%;
    touch-action: pan-y;
  }

  .band {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--line);
  }
  .band.alt {
    background: var(--band);
  }
  .era-label {
    position: sticky;
    top: var(--toolbar-h, 0px);
    margin: 0;
    padding: 6px 8px 6px var(--label-pad);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--muted);
    text-transform: uppercase;
    pointer-events: none;
  }
  .era-years {
    font-weight: 400;
    margin-left: 0.4em;
  }

  .spine {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--spine) - 1px);
    width: 2px;
    background: var(--line-strong);
  }

  .now {
    position: absolute;
    left: calc(var(--spine) - 7px);
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
  .now-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--bg);
  }

  .tick {
    position: absolute;
    left: var(--spine);
    transform: translate(-50%, -50%);
    font-size: 0.65rem;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    background: var(--bg);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .cluster-wrap {
    position: absolute;
    left: var(--spine);
    z-index: 3;
  }
  .cluster {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(-50%, -50%);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    min-width: 28px;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px dashed var(--muted);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }
  .cluster:hover,
  .cluster:focus-visible,
  .cluster[aria-expanded='true'] {
    border-style: solid;
    border-color: var(--accent);
  }
  .cluster-menu {
    position: absolute;
    top: 14px;
    left: -12px;
    width: min(300px, calc(100vw - var(--spine) - 8px));
    display: grid;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
  }
  .cluster-menu button {
    all: unset;
    display: block;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 0.85rem;
    line-height: 1.3;
    cursor: pointer;
  }
  .cluster-menu button:hover,
  .cluster-menu button:focus-visible {
    background: var(--band);
  }
  .menu-date {
    display: block;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .cluster-menu .menu-zoom {
    color: var(--accent);
    border-top: 1px solid var(--line);
    border-radius: 0 0 6px 6px;
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .dot {
    position: absolute;
    left: var(--spine);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: var(--surface);
    border: 2px solid var(--muted);
    z-index: 1;
  }
  .dot.tier-1 {
    width: 14px;
    height: 14px;
    background: var(--accent);
    border-color: var(--accent);
  }
  .dot.tier-2 {
    border-color: var(--accent);
  }
  .dot.selected {
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .connector {
    position: absolute;
    height: 1px;
    background: var(--line-strong);
  }

  .card {
    position: absolute;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    transition: box-shadow 0.15s, border-color 0.15s, opacity 0.15s;
    z-index: 1;
  }
  .card.tier-1 {
    border-left: 3px solid var(--accent);
  }
  .card.related {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }

  .card-button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    height: 100%;
    padding: calc(var(--anchor) - 8px) 12px 8px;
    cursor: pointer;
  }
  .card-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .meta {
    display: flex;
    gap: 8px;
    font-size: 0.75rem;
    line-height: 16px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
  }
  .category {
    text-transform: capitalize;
  }
  .badge {
    border: 1px solid currentColor;
    border-radius: 999px;
    padding: 0 6px;
  }
  .badge.warn {
    color: var(--warn);
  }

  .title {
    font-weight: 600;
    font-size: 0.92rem;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Filters: matches get the accent, everything else fades to grey. */
  .card.dimmed,
  .dot.dimmed,
  .cluster.dimmed,
  .cluster-menu button.dimmed {
    opacity: 0.25;
    filter: grayscale(1);
  }
  .card.match {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
    background: color-mix(in srgb, var(--accent) 9%, var(--surface));
  }
  .dot.match {
    width: 14px;
    height: 14px;
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }
  .cluster.match {
    border-style: solid;
    border-color: var(--accent);
    color: var(--accent);
  }
  .cluster-menu button.match {
    font-weight: 600;
  }
  .card.dimmed:hover,
  .card.dimmed:focus-within {
    opacity: 0.75;
    filter: none;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(:root:not([data-motion='full'])) .card {
      transition: none;
    }
  }
</style>
