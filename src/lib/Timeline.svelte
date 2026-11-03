<script lang="ts">
  import type { TimelineEvent } from './types'
  import type { TimeScale } from './scale'
  import type { Cluster, PlacedCard } from './layout'
  import { formatRange } from './dates'
  import { categoryColor } from './categories'

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
    dimIds: { has(id: string): boolean }
    /** Events that match the active filters; empty when no filter is on. */
    matchIds: Set<string>
    onselect: (id: string) => void
    onexpand: (cluster: Cluster<TimelineEvent>) => void
    /** Rendered height of each era's name, so the layout can keep cards off it. */
    labelHeights?: number[]
    /** Distance from the top of a band to its era name. */
    labelTop: number
    /** The on-screen part of the timeline, in timeline pixels. */
    viewTop?: number
    viewHeight?: number
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
    labelHeights = $bindable([]),
    labelTop,
    viewTop = 0,
    viewHeight = 100_000,
  }: Props = $props()

  // Only what is within half a screen of the view is rendered, so the page stays
  // light with thousands of events. The window snaps to whole chunks, so it
  // only changes every few hundred pixels of scrolling.
  const CHUNK = 256
  const winTop = $derived(Math.floor((viewTop - viewHeight / 2) / CHUNK) * CHUNK)
  const winBottom = $derived(Math.ceil((viewTop + 1.5 * viewHeight) / CHUNK) * CHUNK)

  /** Items whose `y` lies in [from, to); `list` is sorted by y. */
  function within<T extends { y: number }>(list: T[], from: number, to: number): T[] {
    const start = lowerBound(list, from)
    let end = start
    while (end < list.length && list[end].y < to) end++
    return list.slice(start, end)
  }
  function lowerBound(list: { y: number }[], y: number): number {
    let lo = 0
    let hi = list.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (list[mid].y < y) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  // Cards reach up `anchorOffset` and down the rest of their height from their date.
  const shownCards = $derived(within(placed, winTop - cardHeight, winBottom + cardHeight))
  const shownClusters = $derived(within(clusters, winTop, winBottom))
  const shownGaps = $derived(scale.gaps.filter((g) => g.top + g.height > winTop && g.top < winBottom))

  // Year labels sit on the spine, so skip any that would land on an event dot,
  // the Now marker, or another label just across an era boundary.
  // Which "+N" marker has its list of hidden events open.
  let openCluster = $state<string | null>(null)

  const ticks = $derived.by(() => {
    // Dots near the window, sorted by y, so each tick checks its neighbours with a binary search.
    const dots = [...shownCards, ...shownClusters].map((c) => ({ y: c.y })).sort((a, b) => a.y - b.y)
    const nearDot = (y: number) => {
      const i = lowerBound(dots, y - 18)
      return i < dots.length && dots[i].y < y + 18
    }
    const nowY = scale.y(scale.bands[0].end)
    const out: { year: number; y: number }[] = []
    for (const t of scale.ticks()) {
      if (t.y < winTop || t.y >= winBottom) continue
      if (Math.abs(t.y - nowY) < 20) continue
      if (nearDot(t.y)) continue
      if (out.length && t.y - out[out.length - 1].y < 24) continue
      out.push(t)
    }
    return out
  })

  // A gap's label goes beside the spine on whichever side no card covers; with
  // both sides taken it is left out, and the dotted break still shows the gap.
  function gapSide(gap: { top: number; height: number }): 'right' | 'left' | null {
    const mid = gap.top + gap.height / 2
    const free = (lane: number) => !shownCards.some((c) => c.lane === lane && c.top - 4 < mid + 10 && c.top + cardHeight + 4 > mid - 10)
    if (free(0)) return 'right'
    if (spineX >= 100 && free(1)) return 'left'
    return null
  }

  // A cluster can hold thousands of events when zoomed out; its key and menu stay small.
  const MENU_MAX = 12
  function clusterKey(c: Cluster<TimelineEvent>): string {
    return `${c.items[0].id}|${c.items.length}`
  }
  function menuItems(c: Cluster<TimelineEvent>): TimelineEvent[] {
    if (c.items.length <= MENU_MAX) return c.items
    return [...c.items].sort((a, b) => b.score - a.score).slice(0, MENU_MAX)
  }

  function cardLeft(lane: number): number {
    return lane === 0 ? spineX + 24 : spineX - 24 - cardWidth
  }
</script>

<div class="timeline" style:height="{scale.height}px" style:--spine="{spineX}px" style:--label-pad="{spineX < 100 ? spineX + 16 : 8}px" style:--label-max={spineX < 100 ? '100%' : `${spineX - 24}px`} style:--label-top="{labelTop}px">
  {#each scale.bands as band, i (band.era.id)}
    <section
      class="band"
      class:alt={i % 2 === 1}
      style:top="{band.top}px"
      style:height="{band.height}px"
      style:--h={band.era.hue ?? 220}
      aria-label={band.era.name}
    >
      <h2 class="era-label" bind:clientHeight={labelHeights[i]}>
        <span class="era-name">{band.era.name}</span>
        <span class="era-years">{band.start}–{band.era.end ?? 'now'}</span>
      </h2>
    </section>
  {/each}

  <div class="spine" style:top="{scale.y(scale.bands[0].end)}px" aria-hidden="true"></div>

  <div class="now" style:top="{scale.y(scale.bands[0].end)}px" aria-hidden="true">
    <span class="now-dot"><span class="pulse"></span></span><span class="now-label">Now</span>
  </div>

  {#each shownGaps as gap (gap.from)}
    {@const years = Math.round(gap.from - gap.to)}
    {@const side = gapSide(gap)}
    <div
      class="gap"
      style:top="{gap.top}px"
      style:height="{gap.height}px"
      role="note"
      aria-label="No events from {Math.floor(gap.to)} to {Math.floor(gap.from)}; this stretch is compressed"
    >
      <span class="gap-line" aria-hidden="true"></span>
      {#if side}
        <span class="gap-label {side}" aria-hidden="true">{years} {years === 1 ? 'year' : 'years'} with no events</span>
      {/if}
    </div>
  {/each}

  {#each ticks as tick (tick.year)}
    <span class="tick" style:top="{tick.y}px" aria-hidden="true">{tick.year}</span>
  {/each}

  {#each shownClusters as cluster (clusterKey(cluster))}
    {@const key = clusterKey(cluster)}
    <div class="cluster-wrap appear" style:top="{cluster.y}px">
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
          {#each menuItems(cluster) as ev (ev.id)}
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
            }}
            >{cluster.items.length > MENU_MAX ? `Zoom in to see all ${cluster.items.length}` : 'Zoom in here'}</button
          >
        </div>
      {/if}
    </div>
  {/each}

  <ol class="cards" aria-label="Events">
    {#each shownCards as card (card.item.id)}
      {@const ev = card.item}
      {@const left = cardLeft(card.lane)}
      <li class="appear">
        <!-- The dot and connector are extra click targets for the card; its button is the keyboard route. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <span
          onclick={() => onselect(ev.id)}
          class="dot tier-{ev.tier}"
          class:selected={selectedId === ev.id}
          class:dimmed={dimIds.has(ev.id) && selectedId !== ev.id}
          class:match={matchIds.has(ev.id)}
          style:top="{card.y}px"
          style:--c={categoryColor(ev.category)}
          aria-hidden="true"
        ></span>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <span
          onclick={() => onselect(ev.id)}
          class="connector"
          class:dimmed={dimIds.has(ev.id) && selectedId !== ev.id}
          style:--c={categoryColor(ev.category)}
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
          style:--c={categoryColor(ev.category)}
          style:left="{left}px"
          style:width="{cardWidth}px"
          style:height="{cardHeight}px"
          style:--anchor="{anchorOffset}px"
        >
          <button class="card-button" onclick={() => onselect(ev.id)} aria-pressed={selectedId === ev.id}>
            <span class="meta">
              <time datetime={ev.date}>{formatRange(ev.date, ev.end_date)}</time>
              <span class="category"><span class="swatch" aria-hidden="true"></span>{ev.category}</span>
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

  /* ----- Era bands ----- */
  .band {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid var(--line);
    background: linear-gradient(
      180deg,
      hsl(var(--h) 75% 55% / var(--band-alpha)) 0,
      hsl(var(--h) 75% 55% / calc(var(--band-alpha) * 0.35)) 100%
    );
  }
  .band.alt {
    border-top-style: dashed;
  }
  /* Era names sit in a strip at the top of their band that cards stay out of. */
  .era-label {
    position: absolute;
    top: var(--label-top);
    display: flex;
    width: fit-content;
    max-width: calc(var(--label-max, 100%) - var(--label-pad));
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 10px;
    margin: 0;
    left: var(--label-pad);
    padding: 4px 12px 5px;
    border: 1px solid hsl(var(--h) 60% 50% / 0.22);
    border-radius: 12px;
    background: var(--glass);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    box-shadow: var(--shadow-sm);
    pointer-events: none;
  }
  .era-name {
    font-family: var(--font-display);
    font-size: clamp(0.98rem, 1.5vw, 1.2rem);
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.15;
    color: hsl(var(--h) 45% 38%);
  }
  :global(:root[data-theme='dark']) .era-name {
    color: hsl(var(--h) 70% 78%);
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .era-name {
      color: hsl(var(--h) 70% 78%);
    }
  }
  .era-years {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  /* ----- Spine and Now ----- */
  .spine {
    position: absolute;
    bottom: 0;
    left: calc(var(--spine) - 1px);
    width: 2px;
    border-radius: 2px;
    background: linear-gradient(180deg, var(--accent) 0, var(--accent-2) 18%, var(--line-strong) 45%, var(--line) 100%);
  }

  .now {
    position: absolute;
    left: calc(var(--spine) - 8px);
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    z-index: 2;
  }
  .now-dot {
    position: relative;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    box-shadow: 0 0 0 4px var(--bg);
  }
  .pulse {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 2.4s ease-out infinite;
  }
  @keyframes pulse {
    0% {
      transform: scale(1);
      opacity: 0.55;
    }
    100% {
      transform: scale(3);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(:root:not([data-motion='full'])) .pulse {
      animation: none;
      opacity: 0;
    }
  }
  .now-label {
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 600;
    padding: 1px 10px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-sm);
  }

  .tick {
    position: absolute;
    left: var(--spine);
    transform: translate(-50%, -50%);
    font-size: 0.66rem;
    font-weight: 600;
    line-height: 1;
    padding: 3px 6px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--line);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  /* Cards and markers fade in as they appear. A CSS animation costs no script
     time, unlike a JS transition, which matters when many appear in one zoom frame. */
  .appear {
    animation: appear 0.18s ease-out;
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(:root:not([data-motion='full'])) .appear {
      animation: none;
    }
  }

  /* ----- Compressed stretches ----- */
  .gap {
    position: absolute;
    contain: layout style;
    left: 0;
    right: 0;
    pointer-events: none;
  }
  /* A dotted break in the spine, over a patch of background that hides the solid line. */
  .gap-line {
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: calc(var(--spine) - 3px);
    width: 6px;
    background:
      radial-gradient(circle, var(--muted) 1.2px, transparent 1.6px) center top / 6px 7px repeat-y,
      var(--bg);
  }
  .gap-label {
    position: absolute;
    top: 50%;
    left: calc(var(--spine) + 14px);
    transform: translateY(-50%);
    font-size: 0.7rem;
    font-weight: 500;
    font-style: italic;
    line-height: 1;
    white-space: nowrap;
    color: var(--muted);
  }

  .gap-label.left {
    left: auto;
    right: calc(100% - var(--spine) + 14px);
  }

  /* ----- Clusters ----- */
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
    font-weight: 700;
    min-width: 30px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px dashed var(--muted);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition:
      border-color 0.15s,
      transform 0.15s;
  }
  .cluster:hover,
  .cluster:focus-visible,
  .cluster[aria-expanded='true'] {
    border-style: solid;
    border-color: var(--accent);
    transform: translate(-50%, -50%) scale(1.08);
  }
  .cluster-menu {
    position: absolute;
    top: 16px;
    left: -12px;
    width: min(320px, calc(100vw - var(--spine) - 8px));
    display: grid;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow-lg);
  }
  .cluster-menu button {
    all: unset;
    display: block;
    padding: 7px 10px;
    border-radius: 8px;
    font-size: 0.86rem;
    line-height: 1.3;
    cursor: pointer;
  }
  .cluster-menu button:hover,
  .cluster-menu button:focus-visible {
    background: var(--accent-soft);
  }
  .menu-date {
    display: block;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .cluster-menu .menu-zoom {
    color: var(--accent);
    font-weight: 600;
    border-top: 1px solid var(--line);
    border-radius: 0 0 8px 8px;
    margin-top: 4px;
  }

  /* ----- Cards ----- */
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
    border: 2px solid var(--c);
    z-index: 1;
  }
  .dot.tier-1 {
    width: 16px;
    height: 16px;
    background: var(--c);
    box-shadow:
      0 0 0 3px var(--bg),
      0 0 0 5px color-mix(in srgb, var(--c) 35%, transparent);
  }
  .dot.tier-2 {
    width: 12px;
    height: 12px;
    background: var(--c);
    box-shadow: 0 0 0 3px var(--bg);
  }
  .dot.tier-4 {
    width: 8px;
    height: 8px;
  }
  .dot.selected {
    box-shadow:
      0 0 0 3px var(--bg),
      0 0 0 6px var(--accent-soft);
  }

  /* A tall, invisible hit area around a 1px line, so the connector is easy to click. */
  .connector {
    position: absolute;
    height: 15px;
    transform: translateY(-50%);
    cursor: pointer;
  }
  .connector::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 7px;
    height: 1px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--c) 55%, transparent), var(--line-strong));
    transition: height 0.15s, top 0.15s;
  }
  .connector:hover::before {
    top: 6.5px;
    height: 2px;
    background: color-mix(in srgb, var(--c) 70%, transparent);
  }
  .dot {
    cursor: pointer;
  }

  .card {
    position: absolute;
    /* Its size is set inline, so the browser can lay it out and paint it on its own
       when it moves during a zoom. */
    contain: strict;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--shadow-sm);
    transition:
      box-shadow 0.18s,
      border-color 0.18s,
      transform 0.18s,
      opacity 0.18s,
      left 0.25s ease;
    z-index: 1;
  }
  .card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--c);
    opacity: 0.85;
  }
  .card.tier-1::before {
    width: 4px;
    opacity: 1;
  }
  .card.tier-1 {
    background: linear-gradient(100deg, color-mix(in srgb, var(--c) 9%, var(--surface)) 0, var(--surface) 55%);
  }
  .card:hover,
  li:has(.connector:hover, .dot:hover) .card {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
    border-color: color-mix(in srgb, var(--c) 45%, var(--line));
  }
  .card.related {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .card.selected {
    border-color: var(--accent);
    box-shadow:
      0 0 0 2px var(--accent),
      var(--shadow-md);
  }

  /* Filters: matches get the accent, everything else fades to grey. */
  .card.dimmed,
  .dot.dimmed,
  .connector.dimmed,
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
  }
  .cluster.match {
    border-style: solid;
    border-color: var(--accent);
    color: var(--accent);
  }
  .cluster-menu button.match {
    font-weight: 600;
  }
  /* The open event must still stand out among highlighted matches. */
  .card.match.selected {
    box-shadow:
      0 0 0 3px var(--accent),
      0 6px 18px rgb(0 0 0 / 0.14);
  }
  .dot.match.selected {
    box-shadow: 0 0 0 5px var(--accent-soft);
  }
  .card.dimmed:hover,
  .card.dimmed:focus-within {
    opacity: 0.8;
    filter: none;
  }

  .card-button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    height: 100%;
    padding: calc(var(--anchor) - 8px) 14px 8px 16px;
    cursor: pointer;
  }
  .card-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    border-radius: 12px;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.74rem;
    line-height: 16px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
  }
  .meta time {
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .category {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    text-transform: capitalize;
  }
  .swatch {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--c);
    flex: none;
  }
  .badge {
    border: 1px solid currentColor;
    border-radius: 999px;
    padding: 0 6px;
    font-size: 0.68rem;
    font-weight: 600;
  }
  .badge.warn {
    color: var(--warn);
  }

  .title {
    font-weight: 600;
    font-size: 0.93rem;
    line-height: 1.3;
    letter-spacing: -0.005em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card.tier-1 .title {
    font-family: var(--font-display);
    font-size: 1rem;
    letter-spacing: -0.01em;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(:root:not([data-motion='full'])) .card,
    :global(:root:not([data-motion='full'])) .cluster {
      transition: none;
    }
    :global(:root:not([data-motion='full'])) .card:hover {
      transform: none;
    }
  }
</style>
