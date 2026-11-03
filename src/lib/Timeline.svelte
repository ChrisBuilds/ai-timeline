<script lang="ts">
  import { tick } from 'svelte'
  import type { TimelineEvent } from './types'
  import type { TimeScale } from './scale'
  import type { Cluster, PlacedCard } from './layout'
  import { formatRange } from './dates'
  import { categoryColor } from './categories'
  import { buildRibbon, periodLabel, type RibbonBin } from './ribbon'
  import Ribbon from './Ribbon.svelte'

  interface Props {
    scale: TimeScale
    placed: PlacedCard<TimelineEvent>[]
    clusters: Cluster<TimelineEvent>[]
    spineX: number
    cardWidth: number
    selectedId: string | null
    highlightIds: Set<string>
    eventHeight: (ev: TimelineEvent) => number
    relationLabels: Map<string, string[]>
    years: Map<string, number>
    /** Events that don't match the active filters. */
    dimIds: { has(id: string): boolean }
    /** Events that match the active filters; empty when no filter is on. */
    matchIds: Set<string>
    onselect: (id: string) => void
    onexpand: (cluster: Cluster<TimelineEvent>) => void
    /** A card was hovered or focused, so it may be opened next. */
    onpreview?: (id: string) => void
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
    selectedId,
    highlightIds,
    eventHeight,
    relationLabels,
    years,
    dimIds,
    matchIds,
    onselect,
    onexpand,
    onpreview,
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

  // Include the largest entry height above the rendering window.
  const shownCards = $derived(within(placed, winTop - 320, winBottom + 320))
  const shownClusters = $derived(within(clusters, winTop, winBottom))
  const ribbon = $derived(buildRibbon(scale, clusters.flatMap((c) => c.items.map((item) => ({ item, year: years.get(item.id)! }))), spineX < 50 ? 12 : 16))
  let activeBin = $state<RibbonBin<TimelineEvent> | null>(null)
  // Layout changes invalidate the contents and dates of an open period menu.
  $effect(() => { void ribbon; activeBin = null })
  function activate(bin: RibbonBin<TimelineEvent>) {
    activeBin = activeBin?.top === bin.top ? null : bin
    if (activeBin) tick().then(() => document.querySelector<HTMLButtonElement>('.cluster-menu button')?.focus({ preventScroll: true }))
  }
  function closeMenu(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    activeBin = null
    document.querySelector<HTMLButtonElement>('.density-target.active')?.focus({ preventScroll: true })
  }
  function closeOutside(e: PointerEvent) {
    if (!(e.target as Element).closest('.density-target, .cluster-menu')) activeBin = null
  }
  const shownGaps = $derived(scale.gaps.filter((g) => g.top + g.height > winTop && g.top < winBottom))

  // Year labels sit beside the spine; skip any that would land near an event dot,
  // the Now marker, or another label just across an era boundary.
  let lastPreview = ''
  function previewFrom(e: Event) {
    const id = (e.target as Element).closest?.('article.card')?.id
    if (id && id !== lastPreview) {
      lastPreview = id
      onpreview?.(id)
    }
  }



  const ticks = $derived.by(() => {
    // Dots near the window, sorted by y, so each tick checks its neighbours with a binary search.
    const dots = [...shownCards, ...shownClusters].map((c) => ({ y: c.y })).sort((a, b) => a.y - b.y)
    const nearDot = (y: number) => {
      const i = lowerBound(dots, y - 18)
      return i < dots.length && dots[i].y < y + 18
    }
    const nowY = scale.y(scale.bands[0].end)
    const out: { year: number; y: number }[] = []
    // Within an era, ticks come oldest year first, so sort by position to check spacing.
    const near = scale.ticks().filter((t) => t.y >= winTop && t.y < winBottom)
    near.sort((a, b) => a.y - b.y)
    for (const t of near) {
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
    const free = (lane: number) => !shownCards.some((c) => c.lane === lane && c.top - 4 < mid + 10 && c.top + eventHeight(c.item) + 4 > mid - 10)
    if (free(0)) return 'right'
    if (spineX >= 100 && free(1)) return 'left'
    return null
  }

  // A cluster can hold thousands of events when zoomed out; its key and menu stay small.
  const MENU_MAX = 12
  function menuItems(c: Cluster<TimelineEvent>): TimelineEvent[] {
    if (c.items.length <= MENU_MAX) return c.items
    return [...c.items].sort((a, b) => b.score - a.score).slice(0, MENU_MAX)
  }

  function cardLeft(lane: number): number {
    return lane === 0 ? spineX + 24 : spineX - 24 - cardWidth
  }
</script>

<svelte:window onpointerdown={closeOutside} onkeydown={(e) => { if (e.key === 'Escape') activeBin = null }} />

<!-- Hovering or focusing a card starts loading its details, so opening it is instant. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="timeline"
  onpointerover={previewFrom}
  onfocusin={previewFrom}
  style:height="{scale.height}px" style:--spine="{spineX}px" style:--label-pad="{spineX + 28}px" style:--label-max={'100%'} style:--label-top="{labelTop}px">
  {#each scale.bands as band, i (band.era.id)}
    <section
      class="band"
      data-motion-key="era-{band.era.id}"
      style:top="{band.top}px"
      style:height="{band.height}px"
      aria-label={band.era.name}
    >
      <h2 class="era-label" bind:clientHeight={labelHeights[i]}>
        <span class="era-name">{band.era.name}</span>
        <span class="era-years">{band.start}–{band.era.end ?? 'now'}</span>
      </h2>
    </section>
  {/each}

  <Ribbon spans={ribbon} {spineX} viewTop={Math.max(0, winTop)} viewBottom={Math.min(scale.height, winBottom)} onactivate={activate} activeTop={activeBin?.top ?? null} />

  <div data-motion-key="now" class="now" style:top="{scale.y(scale.bands[0].end)}px" aria-hidden="true">
    <span class="now-dot"></span><span class="now-label">Now</span>
  </div>

  {#each shownGaps as gap (gap.from)}
    {@const years = Math.round(gap.from - gap.to)}
    {@const side = gapSide(gap)}
    <div
      class="gap"
      data-motion-key="gap-{gap.from}"
      style:top="{gap.top}px"
      style:height="{gap.height}px"
      role="note"
      aria-label="No events from {Math.floor(gap.to)} to {Math.floor(gap.from)}; this stretch is compressed"
    >
      <span class="gap-line" aria-hidden="true"></span>
      {#if side}
        <span class="gap-label {side}" aria-hidden="true">{Math.floor(gap.to)}–{Math.floor(gap.from)} · no recorded events</span>
      {/if}
    </div>
  {/each}

  {#each ticks as tick (tick.year)}
    <span data-motion-key="tick-{tick.year}" class="tick" style:top="{tick.y}px" aria-hidden="true">{tick.year}</span>
  {/each}

  {#if activeBin}
    <div class="cluster-menu" onkeydown={closeMenu} tabindex="-1" style:top="{activeBin.y + 20}px" style:left="{spineX + 22}px" role="dialog" aria-modal="false" aria-label="Hidden events">
      <p class="period-heading">{periodLabel(activeBin)} · {activeBin.items.length} hidden</p>
      {#each menuItems(activeBin) as ev (ev.id)}
        <button class:dimmed={dimIds.has(ev.id)} class:match={matchIds.has(ev.id)} onclick={() => { activeBin = null; onselect(ev.id) }}>
          <span class="menu-date">{formatRange(ev.date, ev.end_date)}</span>{ev.title}
        </button>
      {/each}
      <button class="menu-zoom" onclick={() => { const bin = activeBin!; activeBin = null; onexpand(bin) }}>Zoom into this period →</button>
    </div>
  {/if}

  <ol class="cards" aria-label="Events">
    {#each shownCards as card (card.item.id)}
      {@const ev = card.item}
      {@const left = cardLeft(card.lane)}
      <li class="appear">
        <!-- The dot and connector are extra click targets for the card; its button is the keyboard route. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <span
          onclick={() => onselect(ev.id)}
          data-motion-key="dot-{ev.id}"
          class="dot tier-{ev.tier}"
          class:selected={selectedId === ev.id}
          class:related={highlightIds.has(ev.id)}
          class:dimmed={dimIds.has(ev.id) && selectedId !== ev.id}
          class:match={matchIds.has(ev.id)}
          style:top="{card.y}px"
          style:--c={categoryColor(ev.category)}
          aria-hidden="true"
        ></span>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <span
          onclick={() => onselect(ev.id)}
          data-motion-key="connector-{ev.id}"
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
          data-motion-key="card-{ev.id}"
          class="card tier-{ev.tier}"
          class:selected={selectedId === ev.id}
          class:related={highlightIds.has(ev.id)}
          class:dimmed={dimIds.has(ev.id) && selectedId !== ev.id}
          class:match={matchIds.has(ev.id)}
          style:top="{card.top}px"
          style:--c={categoryColor(ev.category)}
          style:left="{left}px"
          style:width="{cardWidth}px"
          style:height="{eventHeight(ev)}px"

        >
          <button class="card-button" title={ev.title} onclick={() => onselect(ev.id)} aria-pressed={selectedId === ev.id}>
            {#if selectedId === ev.id}<span class="state-label">Selected</span>{/if}
            <span class="meta">
              <time datetime={ev.date}>{formatRange(ev.date, ev.end_date)}</time>
              <span class="category"><span class="swatch" aria-hidden="true"></span>{ev.category}</span>
              {#if ev.developing}<span class="badge">developing</span>{/if}
              {#if ev.disputed}<span class="badge warn">disputed</span>{/if}
            </span>
            <span class="title">{ev.title}</span>
            {#if selectedId === ev.id}
              <span class="event-summary">{ev.summary}</span>
              <span class="story-link">Details & sources</span>
            {:else if highlightIds.has(ev.id)}
              <span class="relation-label">Related · {relationLabels.get(ev.id)?.join(' · ') ?? 'Connected event'}</span>
            {/if}
          </button>
        </article>
      </li>
    {/each}
  </ol>
</div>

<style>
  .timeline { position: relative; width: 100%; touch-action: pan-y; }
  .band { position: absolute; left: 0; right: 0; border-top: 1px solid var(--line); pointer-events: none; }
  .era-label { position: absolute; top: var(--label-top); left: var(--label-pad); right: 8px; display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; margin: 0; line-height: 1.2; }
  .era-name { font-family: var(--font-display); font-size: clamp(1.1rem, 2.4vw, 1.65rem); font-weight: 600; letter-spacing: -0.025em; }
  .era-years { color: var(--muted); font-size: 0.7rem; font-weight: 500; white-space: nowrap; }
  .now { position: absolute; left: var(--spine); transform: translate(-50%, -50%); z-index: 3; }
  .now-dot { display: block; width: 8px; height: 8px; background: var(--muted); border: 2px solid var(--bg); border-radius: 50%; }
  .now-label { position: absolute; right: 24px; top: -2px; font-size: 0.7rem; color: var(--muted); }
  .tick { position: absolute; left: calc(var(--spine) - 20px); transform: translate(-100%, -50%); color: var(--muted); font-size: 0.7rem; font-variant-numeric: tabular-nums; pointer-events: none; }
  .gap { position: absolute; left: 0; right: 0; pointer-events: none; }
  .gap-line { position: absolute; inset: 4px auto 4px calc(var(--spine) - 1px); width: 2px; background: repeating-linear-gradient(to bottom, var(--line-strong) 0 3px, transparent 3px 8px); }
  .gap-line::after { content: '//'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; background: var(--bg); color: var(--muted); }
  .gap-label { position: absolute; left: calc(var(--spine) + 30px); top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 0.72rem; font-style: italic; }
  .cluster-menu { position: absolute; z-index: 8; width: min(340px, calc(100% - var(--spine) - 28px)); display: grid; padding: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow-lg); max-height: min(440px, 60vh); overflow-y: auto; }
  .period-heading { font-size: 0.72rem; color: var(--muted); padding: 2px 10px 8px; margin: 0; border-bottom: 1px solid var(--line); }
  .cluster-menu button { all: unset; display: block; padding: 9px 10px; font-size: 0.82rem; line-height: 1.4; border-radius: 5px; cursor: pointer; }
  .cluster-menu button:hover, .cluster-menu button:focus-visible { background: var(--accent-soft); outline: 2px solid var(--context-accent); outline-offset: -2px; }
  .menu-date { display: block; font-size: 0.68rem; color: var(--muted); }
  .cluster-menu .menu-zoom { color: var(--context-accent); font-weight: 600; border-top: 1px solid var(--line); border-radius: 0; }
  .cards { list-style: none; margin: 0; padding: 0; }
  .dot { position: absolute; left: var(--spine); width: 9px; height: 9px; transform: translate(-50%, -50%); background: var(--bg); border: 2px solid var(--muted); border-radius: 50%; z-index: 3; cursor: pointer; }
  .dot.related { border-color: var(--context-accent); }
  .dot.selected { width: 13px; height: 13px; border: 2px solid var(--bg); background: var(--context-accent); border-radius: 1px; transform: translate(-50%, -50%) rotate(45deg); }
  .connector { position: absolute; height: 16px; transform: translateY(-50%); cursor: pointer; }
  .connector::before { content: ''; position: absolute; left: 0; right: 0; top: 7px; height: 1px; background: var(--line); }
  li:has(.dot.selected) .connector::before { background: var(--context-accent); }
  .card { position: absolute; contain: strict; border: 1px solid transparent; border-radius: 7px; z-index: 1; background: transparent; overflow: hidden; }
  .card:hover { background: var(--surface-2); }
  .card.related { border-color: var(--context-accent); }
  .card.selected { background: var(--focus-surface); color: var(--focus-text); box-shadow: var(--shadow-sm); }
  .card-button { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; width: 100%; height: 100%; padding: 10px 16px; cursor: pointer; }
  .card-button:focus-visible { outline: 2px solid var(--context-accent); outline-offset: -3px; border-radius: 7px; }
  .card.selected .card-button { padding: 18px 22px; gap: 8px; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; font-size: 0.67rem; line-height: 1.4; color: var(--muted); }
  .meta time { font-variant-numeric: tabular-nums; }
  .category { display: inline-flex; align-items: center; gap: 5px; text-transform: capitalize; }
  .swatch { width: 5px; height: 5px; background: var(--c); border-radius: 1px; }
  .badge { font-size: 0.65rem; border-bottom: 1px solid currentColor; }
  .badge.warn { color: var(--warn); }
  .title { font-size: 1rem; font-weight: 600; line-height: 1.25; letter-spacing: -0.02em; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .card.tier-1 .title { font-family: var(--font-display); font-size: 1.2rem; }
  .card.selected .title { font-family: var(--font-display); font-size: clamp(1.25rem, 2.8vw, 1.85rem); }
  .card.selected .meta { color: var(--focus-muted); }
  .state-label { align-self: flex-start; color: #19242b; background: var(--focus-badge); font-size: 0.61rem; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700; padding: 3px 7px; border-radius: 4px; }
  .event-summary { font-size: 0.85rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .story-link { font-size: 0.73rem; font-weight: 600; margin-top: auto; }
  .relation-label { color: var(--context-accent); font-size: 0.65rem; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .card.dimmed, .dot.dimmed, .connector.dimmed, .cluster-menu button.dimmed { opacity: 0.32; }
  .card.dimmed:hover, .card.dimmed:focus-within { opacity: 1; }
  .card.match:not(.selected) .title { text-decoration: underline; text-decoration-color: var(--context-accent); text-underline-offset: 4px; }
  .cluster-menu button.match { font-weight: 600; }
  @media (max-width: 600px) {
    .tick { left: calc(var(--spine) - 10px); font-size: 0.57rem; }
    .now-label { right: 12px; font-size: 0.57rem; }
    .era-name { font-size: 1.05rem; }
    .era-years { font-size: 0.64rem; }
    .card-button { padding: 10px 12px; }
    .card.selected .card-button { padding: 14px; }
    .title, .card.tier-1 .title { font-size: 0.96rem; }
    .card.selected .title { font-size: 1.25rem; }
    .card.selected .event-summary { display: none; }
    .meta { font-size: 0.61rem; }
    .gap-label { font-size: 0.62rem; }
  }
</style>
