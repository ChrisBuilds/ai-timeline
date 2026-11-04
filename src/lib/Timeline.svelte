<script lang="ts">
  import { tick } from 'svelte'
  import type { TimelineEvent } from './types'
  import type { TimeScale } from './scale'
  import type { Cluster, PlacedCard } from './layout'
  import { formatRange } from './dates'
  import { categoryColor } from './categories'
  import { buildRibbon } from './ribbon'
  import { formatCount, type EventGroup, type EraStats } from './groups'
  import Ribbon from './Ribbon.svelte'
  import { containScroll } from './scroll-containment'

  interface Props {
    scale: TimeScale
    placed: PlacedCard<TimelineEvent>[]
    groups: EventGroup<TimelineEvent>[]
    eraStats: Map<string, EraStats>
    hidden: { item: TimelineEvent; year: number }[]
    ribbonScale: TimeScale
    ribbonProject: (y: number, after?: boolean) => number
    spineX: number
    cardWidth: number
    selectedId: string | null
    highlightIds: Set<string>
    eventHeight: (ev: TimelineEvent) => number
    relationLabels: Map<string, string[]>
    /** Events that don't match the active filters. */
    dimIds: { has(id: string): boolean }
    /** Events that match the active filters; empty when no filter is on. */
    matchIds: Set<string>
    onselect: (id: string, scroll?: boolean) => void
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
    groups,
    eraStats,
    hidden,
    ribbonScale,
    ribbonProject,
    spineX,
    cardWidth,
    selectedId,
    highlightIds,
    eventHeight,
    relationLabels,
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
  const shownGroups = $derived(within(groups, winTop - 64, winBottom + 64))
  const ribbon = $derived(buildRibbon(ribbonScale, hidden, spineX < 50 ? 12 : 16, ribbonProject))
  let activeGroupId = $state<string | null>(null)
  let query = $state('')
  let page = $state(0)
  let menuTop = $state(0)
  let menuHeight = $state(480)
  const PAGE_SIZE = 12
  const activeGroup = $derived(groups.find((g) => g.id === activeGroupId) ?? null)
  const searchable = $derived(activeGroup?.items.map((item) => ({ item, text: `${item.title} ${item.date}`.toLowerCase() })) ?? [])
  const filtered = $derived(query.trim() ? searchable.filter((e) => e.text.includes(query.trim().toLowerCase())).map((e) => e.item) : activeGroup?.items ?? [])
  const pages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)))
  const menuItems = $derived(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE))
  // Scrolling never rebuilds groups. Layout changes invalidate an open browser.
  $effect(() => { void groups; activeGroupId = null; query = ''; page = 0 })
  $effect(() => {
    if (activeGroupId && !shownGroups.some((g) => g.id === activeGroupId)) activeGroupId = null
  })
  async function activate(group: EventGroup<TimelineEvent>) {
    if (activeGroupId === group.id) { activeGroupId = null; return }
    const target = document.getElementById(`group-${group.id}`)
    const timeline = target?.closest('.timeline')
    if (!target || !timeline) return
    const at = target.getBoundingClientRect()
    const toolbarBottom = document.querySelector('.toolbar-wrap')?.getBoundingClientRect().bottom ?? 0
    const sheetHeight = selectedId && innerWidth < 720 ? document.querySelector<HTMLElement>('aside.panel')?.offsetHeight ?? 0 : 0
    const bottom = innerHeight - sheetHeight - 12
    menuHeight = Math.max(120, Math.min(480, 116 + Math.min(group.items.length, PAGE_SIZE) * 64 + (group.items.length > PAGE_SIZE ? 72 : 0), bottom - toolbarBottom - 16))
    menuTop = Math.max(toolbarBottom + 8, Math.min(at.bottom + 6, bottom - menuHeight)) - timeline.getBoundingClientRect().top
    activeGroupId = group.id
    query = ''
    page = 0
    await tick()
    document.getElementById('group-browser')?.focus({ preventScroll: true })
  }
  function changePage(next: number) {
    page = next
    document.getElementById('group-browser')?.scrollTo({ top: 0, behavior: 'instant' })
  }
  function dismissGroup(refocus = false) {
    const id = activeGroupId
    activeGroupId = null
    if (refocus && id) document.getElementById(`group-${id}`)?.focus({ preventScroll: true })
  }
  function closeMenu(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    dismissGroup(true)
  }
  function closeOutside(e: PointerEvent) {
    if (!(e.target as Element).closest('.event-group, .cluster-menu')) dismissGroup()
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
    const dots = [...shownCards, ...shownGroups].map((c) => ({ y: c.y })).sort((a, b) => a.y - b.y)
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

  function cardLeft(lane: number): number {
    return lane === 0 ? spineX + 24 : spineX - 24 - cardWidth
  }
</script>

<svelte:window onpointerdown={closeOutside} onkeydown={(e) => { if (e.key === 'Escape') dismissGroup() }} />

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
        <span class="era-count" title="Individual milestones shown at this zoom">{formatCount(eraStats.get(band.era.id)?.total ?? 0)} {(eraStats.get(band.era.id)?.total ?? 0) === 1 ? 'event' : 'events'} · {formatCount(eraStats.get(band.era.id)?.shown ?? 0)} shown</span>
      </h2>
    </section>
  {/each}

  <Ribbon spans={ribbon} {spineX} viewTop={Math.max(0, winTop)} viewBottom={Math.min(scale.height, winBottom)} />

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

  {#each shownGroups as group (group.id)}
    <button id="group-{group.id}" data-motion-key="group-{group.id}" class="event-group"
      class:dimmed={group.items.every((e) => dimIds.has(e.id))}
      style:top="{group.top}px" style:left="{cardLeft(0)}px" style:width="{cardWidth}px" style:height="{group.height}px"
      aria-expanded={activeGroupId === group.id} aria-haspopup="dialog" aria-controls={activeGroupId === group.id ? 'group-browser' : undefined}
      onclick={() => activate(group)}>
      <svg class="stack" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 4h14M2 9h14M2 14h14" /></svg>
      <span class="group-copy"><strong>{formatCount(group.items.length)} more {group.items.length === 1 ? 'event' : 'events'}</strong><span>{group.label}</span></span>
      <span class="group-chevron" aria-hidden="true">›</span>
    </button>
  {/each}

  {#if activeGroup}
    <div use:containScroll id="group-browser" class="cluster-menu" onkeydown={closeMenu} tabindex="-1"
      style:top="{menuTop}px" style:left="{cardLeft(0)}px" style:width="{Math.min(cardWidth, 420)}px" style:max-height="{menuHeight}px"
      role="dialog" aria-modal="false" aria-label="Events in this group" aria-describedby="group-heading">
      <div class="menu-tools">
        <div class="menu-heading"><p id="group-heading">{formatCount(activeGroup.items.length)} {activeGroup.items.length === 1 ? 'event' : 'events'}<span>{activeGroup.label}</span></p>
          <button class="group-close" aria-label="Close group" onclick={() => dismissGroup(true)}>×</button>
        </div>
        {#if activeGroup.items.length > PAGE_SIZE}
          <input id="group-search" type="search" aria-label="Find an event in this group" placeholder="Find in this group…" bind:value={query} oninput={() => changePage(0)} />
          <p class="result-count">{query.trim() ? `${formatCount(filtered.length)} matching ${filtered.length === 1 ? 'event' : 'events'}` : 'Browse without changing zoom'}</p>
        {/if}
      </div>
      <ol class="group-events" start={page * PAGE_SIZE + 1}>
        {#each menuItems as ev (ev.id)}
          <li><button class:dimmed={dimIds.has(ev.id)} class:match={matchIds.has(ev.id)} onclick={() => { dismissGroup(); onselect(ev.id, true) }}>
            <time class="menu-date" datetime={ev.date}>{formatRange(ev.date, ev.end_date)}</time>{ev.title}
          </button></li>
        {:else}<li class="group-empty">No events match this search.</li>{/each}
      </ol>
      <div class="menu-footer">
        {#if pages > 1}<nav class="group-pagination" aria-label="Group pages">
          <button aria-label="Previous page" disabled={page === 0} onclick={() => changePage(page - 1)}>←</button>
          <span>{filtered.length ? `${formatCount(page * PAGE_SIZE + 1)}–${formatCount(Math.min((page + 1) * PAGE_SIZE, filtered.length))} of ${formatCount(filtered.length)}` : '0 events'}</span>
          <button aria-label="Next page" disabled={page >= pages - 1} onclick={() => changePage(page + 1)}>→</button>
        </nav>{/if}
        <button class="menu-zoom" onclick={() => { const group = activeGroup!; dismissGroup(); onexpand(group) }}>Zoom into this period →</button>
      </div>
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
  .era-count { flex-basis: 100%; color: var(--muted); font-family: var(--font-ui); font-size: 0.69rem; font-weight: 400; line-height: 1.4; }
  .era-years { color: var(--muted); font-size: 0.7rem; font-weight: 500; white-space: nowrap; }
  .now { position: absolute; left: var(--spine); transform: translate(-50%, -50%); z-index: 3; }
  .now-dot { display: block; width: 8px; height: 8px; background: var(--muted); border: 2px solid var(--bg); border-radius: 50%; }
  .now-label { position: absolute; right: 24px; top: -2px; font-size: 0.7rem; color: var(--muted); }
  .tick { position: absolute; left: calc(var(--spine) - 20px); transform: translate(-100%, -50%); color: var(--muted); font-size: 0.7rem; font-variant-numeric: tabular-nums; pointer-events: none; }
  .gap { position: absolute; left: 0; right: 0; pointer-events: none; }
  .gap-line { position: absolute; inset: 4px auto 4px calc(var(--spine) - 1px); width: 2px; background: repeating-linear-gradient(to bottom, var(--line-strong) 0 3px, transparent 3px 8px); }
  .gap-line::after { content: '//'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 16px; background: var(--bg); color: var(--muted); }
  .gap-label { position: absolute; left: calc(var(--spine) + 30px); top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 0.72rem; font-style: italic; }
  .event-group { box-sizing: border-box; position: absolute; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid transparent; border-radius: 6px; background: var(--surface-2); color: var(--text); text-align: left; cursor: pointer; z-index: 2; font: inherit; }
  .event-group::before { content: ''; position: absolute; left: -24px; width: 24px; height: 1px; top: 50%; background: var(--line-strong); }
  .event-group::after { content: ''; position: absolute; left: -28px; top: calc(50% - 4px); width: 7px; height: 7px; border: 1px solid var(--muted); border-radius: 1px; background: var(--bg); }
  .event-group:hover, .event-group[aria-expanded='true'] { border-color: var(--line-strong); }
  .event-group:focus-visible { outline: 2px solid var(--context-accent); outline-offset: 2px; }
  .stack { flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; }
  .group-copy { display: grid; gap: 3px; min-width: 0; }
  .group-copy strong { font-size: 0.85rem; font-weight: 600; }
  .group-copy > span { font-size: 0.66rem; color: var(--muted); line-height: 1.25; }
  .group-chevron { margin-left: auto; font-size: 1.5rem; color: var(--muted); }
  .event-group.dimmed { opacity: 0.55; }
  .event-group.dimmed:hover, .event-group.dimmed:focus-visible { opacity: 1; }
  .cluster-menu { position: absolute; z-index: 12; overflow-y: auto; overscroll-behavior: contain; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; box-shadow: var(--shadow-lg); }
  .menu-tools { position: sticky; top: 0; padding: 10px 12px 0; background: var(--surface); z-index: 1; }
  .menu-heading { display: flex; align-items: start; gap: 12px; }
  .menu-heading p { margin: 0 0 8px; font-size: 0.85rem; font-weight: 600; line-height: 1.4; }
  .menu-heading p span { display: block; color: var(--muted); font-weight: 400; font-size: 0.7rem; }
  .cluster-menu button { font: inherit; cursor: pointer; color: var(--text); }
  .group-close { flex: none; margin-left: auto; width: 30px; height: 30px; padding: 0; border: 0; background: transparent; font-size: 1.25rem !important; border-radius: 4px; }
  .cluster-menu button:focus-visible { outline: 2px solid var(--context-accent); outline-offset: -2px; }
  #group-search { width: 100%; min-width: 0; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--bg); color: var(--text); font: inherit; font-size: 0.8rem; }
  .result-count { margin: 6px 0 0; padding-bottom: 8px; font-size: 0.65rem; color: var(--muted); border-bottom: 1px solid var(--line); }
  .group-events { list-style: none; padding: 4px 6px; margin: 0; }
  .group-events button { display: block; width: 100%; padding: 9px 8px; text-align: left; border: 0; border-radius: 4px; background: transparent; font-size: 0.8rem; line-height: 1.4; }
  .group-events button:hover, .group-close:hover { background: var(--surface-2); }
  .menu-date { display: block; font-size: 0.66rem; color: var(--muted); }
  .group-empty { padding: 16px 8px; font-size: 0.8rem; color: var(--muted); }
  .menu-footer { position: sticky; bottom: 0; padding: 6px 12px; background: var(--surface); border-top: 1px solid var(--line); }
  .group-pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 0.65rem; }
  .group-pagination button { padding: 4px 8px; border: 0; border-radius: 4px; background: var(--surface-2); }
  .group-pagination button:disabled { opacity: 0.3; cursor: default; }
  .menu-zoom { display: block; padding: 7px 0 2px; border: 0; background: transparent; color: var(--context-accent) !important; font-size: 0.72rem !important; }
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
    .era-count { flex-basis: 100%; color: var(--muted); font-family: var(--font-ui); font-size: 0.69rem; font-weight: 400; line-height: 1.4; }
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
