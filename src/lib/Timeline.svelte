<script lang="ts">
  import { untrack } from 'svelte'
  import type { TimelineEvent } from './types'
  import type { TimeScale } from './scale'
  import type { PlacedCard } from './layout'
  import { formatDate, formatRange } from './dates'
  import { categoryColor } from './categories'
  import { buildRibbon } from './ribbon'
  import { nearestNode, nodePath, RevealTracker, visibleNodes, type Node } from './nodes'
  import Ribbon from './Ribbon.svelte'

  const numbers = new Intl.NumberFormat('en')
  const formatCount = (count: number) => numbers.format(count)

  interface Props {
    scale: TimeScale
    placed: PlacedCard<TimelineEvent>[]
    /** Events without a card at this zoom, by y. They are drawn as nodes on the spine. */
    hidden: Node<TimelineEvent>[]
    /** The same events with their dates, for the density ribbon. */
    hiddenYears: { item: TimelineEvent; year: number }[]
    eraStats: Map<string, { total: number; shown: number }>
    /** Cards grow out of their node when they appear, and shrink back into it when they go. */
    animate: boolean
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
    hidden,
    hiddenYears,
    eraStats,
    animate,
    spineX,
    cardWidth,
    selectedId,
    highlightIds,
    eventHeight,
    relationLabels,
    dimIds,
    matchIds,
    onselect,
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
  // Include displaced overview cards by their displayed position as well as date.
  const inWindow = (c: PlacedCard<TimelineEvent>) =>
    (c.top + eventHeight(c.item) >= winTop && c.top <= winBottom) ||
    (c.y >= winTop - 320 && c.y <= winBottom + 320)
  const shownCards = $derived(placed.filter(inWindow))
  const ribbon = $derived(buildRibbon(scale, hiddenYears, spineX < 50 ? 12 : 16))

  // Hidden events as nodes: one SVG path for the window, so thousands of them
  // cost one element. Nodes within 2px of each other are drawn once.
  const NODE_R = 3
  // The window clipped to the timeline, so nothing drawn for it makes the page taller.
  const clipTop = $derived(Math.max(0, winTop))
  const clipBottom = $derived(Math.min(scale.height, winBottom))
  const nodes = $derived(visibleNodes(hidden, winTop, winBottom, 2))
  const nodePaths = $derived.by(() => {
    const dim = nodes.filter((n) => dimIds.has(n.item.id))
    return { shown: nodePath(dim.length ? nodes.filter((n) => !dimIds.has(n.item.id)) : nodes, NODE_R), dim: nodePath(dim, NODE_R) }
  })
  let hoverNode = $state.raw<Node<TimelineEvent> | null>(null)
  let root: HTMLDivElement | undefined = $state()
  function nodeAt(e: PointerEvent | MouseEvent, reach: number): Node<TimelineEvent> | null {
    if (!root) return null
    return nearestNode(nodes, e.clientY - root.getBoundingClientRect().top, reach)
  }
  // Keep the hover on the event, not on a y position, as zoom moves the nodes.
  const hovered = $derived(hoverNode && nodes.find((n) => n.item === hoverNode!.item) || null)

  // Cards that just got room grow out of their node; cards that just lost it
  // shrink back into it while the others close up. Time-based, so a card never
  // flickers with the zoom frame rate, and CSS transitions, so a card that
  // returns mid-animation turns around from where it is.
  const REVEAL_MS = 480
  const tracker = new RevealTracker<TimelineEvent>(REVEAL_MS)
  let expired = $state(0)
  // Only zooming reveals cards. A filter change replaces most cards at once,
  // and animating all of them would be noise, and slow.
  let motionFilter: unknown = null
  const motion = $derived.by(() => {
    void expired
    const filterChanged = motionFilter !== matchIds
    motionFilter = matchIds
    tracker.update(placed, performance.now(), animate && !filterChanged)
    return { entering: new Set(tracker.entering.keys()), leaving: [...tracker.leaving.values()] }
  })
  $effect(() => {
    void motion
    const next = tracker.nextExpiry()
    if (next === null) return
    const t = setTimeout(() => { if (tracker.prune(performance.now())) expired++ }, Math.max(0, next - performance.now()) + 20)
    return () => clearTimeout(t)
  })
  // A leaving card follows its date marker, so it shrinks into its node even mid-zoom.
  const rowOf = new WeakMap<PlacedCard<TimelineEvent>, { card: PlacedCard<TimelineEvent>; leaving: boolean }>()
  const rows = $derived.by(() => {
    void clock
    // Read the time here, so a zoom frame that rebuilds the rows anyway also
    // advances the shifts, and the shift loop below has nothing left to do.
    const now = performance.now()
    if (!ticked) rebuilt = true
    ticked = false
    // Rows keep their identity while their card is unchanged, so a frame that
    // only moves a few shifting cards doesn't update every row.
    const shifted = shownCards.map((card) => {
      const d = shifts.size ? shiftOf(card.item.id, now) : 0
      if (d) return { card: { ...card, top: card.top + d }, leaving: false }
      let row = rowOf.get(card)
      if (!row) rowOf.set(card, row = { card, leaving: false })
      return row
    })
    if (!motion.leaving.length) return shifted
    const yOf = new Map<TimelineEvent, number>()
    for (const l of motion.leaving) yOf.set(l.item, NaN)
    for (const h of hidden) if (yOf.has(h.item)) yOf.set(h.item, h.y)
    const out = shifted
    for (const l of motion.leaving) {
      const y = yOf.get(l.item)!
      // A card that leaves mid-shift starts shrinking from where it is drawn.
      const card = { item: l.item, y, lane: 0, top: y + l.offset + shiftOf(l.item.id, now) }
      if (Number.isFinite(y) && inWindow(card)) out.push({ card, leaving: true })
    }
    return out.sort((a, b) => a.card.y - b.card.y)
  })

  // When a card's neighbours change, the layout moves it by up to a few card
  // heights in one frame. Ease that jump out: the card keeps a shift that decays
  // to zero, and its leader is drawn to the shifted card, so the card never
  // comes loose from its node.
  const JUMP_PX = 40
  const JUMP_MAX = 360
  const SHIFT_MS = 320
  let offsets = new Map<string, number>()
  let offsetsFor: string | null = null
  let shifts = $state.raw(new Map<string, { from: number; start: number }>())
  let clock = $state(0)
  let rebuilt = false
  let ticked = false
  const easeOut = (t: number) => 1 - (1 - t) ** 3
  function shiftOf(id: string, now: number): number {
    const s = shifts.get(id)
    if (!s) return 0
    const t = (now - s.start) / SHIFT_MS
    return t >= 1 ? 0 : s.from * (1 - easeOut(Math.max(0, t)))
  }
  $effect(() => {
    const cards = shownCards
    // Selecting an event has its own layout animation (selection-motion.ts).
    const enabled = animate && offsetsFor === selectedId
    offsetsFor = selectedId
    untrack(() => {
      const now = performance.now()
      const next = new Map<string, number>()
      let changed: Map<string, { from: number; start: number }> | null = null
      for (const card of cards) {
        const offset = card.top - card.y
        next.set(card.item.id, offset)
        const before = offsets.get(card.item.id)
        // A longer jump would ease in from outside the rendered window, so it isn't eased.
        if (!enabled || before === undefined || Math.abs(offset - before) < JUMP_PX || Math.abs(offset - before) > JUMP_MAX) continue
        changed ??= new Map(shifts)
        changed.set(card.item.id, { from: before + shiftOf(card.item.id, now) - offset, start: now })
      }
      offsets = next
      if (changed) { shifts = changed; clock = now }
    })
  })
  // Drive the shifts while any is running, then drop them.
  $effect(() => {
    if (!shifts.size) return
    let frame = requestAnimationFrame(function step(now) {
      // When something else, such as a zoom frame, rebuilt the rows since the
      // last step, the shifts already moved; don't add a second render.
      if (rebuilt) rebuilt = false
      else { ticked = true; clock = now }
      const live = [...shifts].filter(([, s]) => now - s.start < SHIFT_MS)
      if (live.length !== shifts.size) shifts = new Map(live)
      else frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  })

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
    const dots = shownCards
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

  // A card grows out of its node, or, when the layout has moved it far from
  // its date, out of the end of its leader, so it never flies across the screen.
  function revealOrigin(card: PlacedCard<TimelineEvent>, left: number): string {
    const toNode = card.y - card.top
    return `${spineX - left}px ${Math.abs(toNode - 18) > 120 ? 18 : toNode}px`
  }

  function cardLeft(lane: number): number {
    return lane === 0 ? spineX + 24 : spineX - 24 - cardWidth
  }

  function gapLabel(gap: { from: number; to: number }): string {
    const month = (value: number) => {
      const year = Math.floor(value)
      const start = Date.UTC(year, 0, 1)
      return formatDate(new Date(start + (value - year) * (Date.UTC(year + 1, 0, 1) - start)).toISOString().slice(0, 7))
    }
    return `${month(gap.to)} – ${month(gap.from)}`
  }
</script>

<!-- Hovering or focusing a card starts loading its details, so opening it is instant. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="timeline"
  bind:this={root}
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

  <Ribbon spans={ribbon} {spineX} viewTop={clipTop} viewBottom={clipBottom} />

  <svg class="nodes" aria-hidden="true" width="16" height={Math.max(0, clipBottom - clipTop)}
    style:left="{spineX - 8}px" style:top="{clipTop}px" viewBox="-8 {clipTop} 16 {Math.max(1, clipBottom - clipTop)}">
    <path d={nodePaths.shown} /><path class="dim" d={nodePaths.dim} />
  </svg>
  <!-- Pointer route to a hidden event: the node nearest the pointer. Keyboard users reach the same events through search and the arrow keys. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="node-hits" style:top="{clipTop}px" style:height="{Math.max(0, clipBottom - clipTop)}px"
    class:active={hovered !== null}
    onpointermove={(e) => { if (e.pointerType === 'mouse') hoverNode = nodeAt(e, 8) }}
    onpointerleave={() => (hoverNode = null)}
    onclick={(e) => { const node = nodeAt(e, 12); if (node) { hoverNode = null; onselect(node.item.id) } }}
  ></div>
  {#if hovered}
    <div class="node-hover" style:top="{hovered.y}px" style:--c={categoryColor(hovered.item.category)} aria-hidden="true">
      <span class="node-ring"></span>
      <span class="node-tip"><time>{formatRange(hovered.item.date, hovered.item.end_date)}</time>{hovered.item.title}</span>
    </div>
  {/if}

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
      aria-label="No events during {gapLabel(gap)}; this stretch is compressed"
    >
      <span class="gap-line" aria-hidden="true"></span>
      {#if side}
        <span class="gap-label {side}" aria-hidden="true">{gapLabel(gap)} · no recorded events</span>
      {/if}
    </div>
  {/each}

  {#each ticks as tick (tick.year)}
    <span data-motion-key="tick-{tick.year}" class="tick" style:top="{tick.y}px" aria-hidden="true">{tick.year}</span>
  {/each}

  <ol class="cards" aria-label="Events">
    {#each rows as { card, leaving } (card.item.id)}
      {@const ev = card.item}
      {@const left = cardLeft(card.lane)}
      <li class:leaving class:reveal={motion.entering.has(ev.id) && selectedId !== ev.id} aria-hidden={leaving || undefined} inert={leaving}>
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
          class:shifted={Math.abs(card.top + 18 - card.y) > 1}
          class:shifted-up={card.top + 18 < card.y - 1}
          class:dimmed={dimIds.has(ev.id) && selectedId !== ev.id}
          style:--c={categoryColor(ev.category)}
          style:top="{Math.min(card.y, card.top + 18)}px"
          style:left="{Math.min(spineX, left + cardWidth)}px"
          style:width="{card.lane === 0 ? left - spineX : spineX - (left + cardWidth)}px"
          style:height="{Math.abs(card.top + 18 - card.y) > 1 ? Math.abs(card.top + 18 - card.y) : 16}px"
          aria-hidden="true"
        ></span>
        <!-- A card shown only for its date marker, displaced far from it, is left out until it is near. -->
        {#if selectedId === ev.id || (card.top + eventHeight(ev) >= winTop - 320 && card.top <= winBottom + 320)}
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
          style:transform-origin={revealOrigin(card, left)}
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
        {/if}
      </li>
    {/each}
  </ol>
</div>

<style>
  .connector.shifted { transform: none; background: transparent; border-left: 1px solid var(--c); border-bottom: 1px solid var(--c); opacity: 0.45; }
  .connector.shifted-up { border-bottom: 0; border-top: 1px solid var(--c); }
  .connector.shifted::before { display: none; }
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
  /* Hidden events: nodes on the spine, and the nearest one under the pointer. */
  .nodes { position: absolute; overflow: visible; pointer-events: none; z-index: 2; }
  .nodes path { fill: var(--muted); }
  .nodes path.dim { opacity: 0.35; }
  .node-hits { position: absolute; left: calc(var(--spine) - 12px); width: 24px; z-index: 2; }
  .node-hits.active { cursor: pointer; }
  .node-hover { position: absolute; left: var(--spine); z-index: 4; pointer-events: none; }
  .node-ring { position: absolute; width: 11px; height: 11px; transform: translate(-50%, -50%); border: 2px solid var(--c); background: var(--bg); border-radius: 50%; box-sizing: border-box; }
  .node-tip { position: absolute; left: 16px; top: 0; transform: translateY(-50%); width: max-content; max-width: min(320px, calc(100vw - var(--spine) - 40px)); padding: 6px 10px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); box-shadow: var(--shadow-sm); font-size: 0.78rem; font-weight: 600; line-height: 1.3; }
  .node-tip time { display: block; color: var(--muted); font-size: 0.65rem; font-weight: 400; }
  .cards { list-style: none; margin: 0; padding: 0; }
  /*
   * Reveal: a card that just got room grows out of its node (transform-origin is
   * set to the node), its leader and dot fading in. A card that just lost its
   * room shrinks and fades back into the node, under the cards closing up.
   */
  .reveal .card, .reveal .dot { transition: transform 460ms cubic-bezier(0.33, 1, 0.68, 1), opacity 140ms linear; }
  /* A leader only fades: its transform flips with its shape, and must not slide. */
  .reveal .connector { transition: opacity 140ms linear; }
  @starting-style {
    .reveal .card { transform: scale(0.05); opacity: 0; }
    .reveal .dot { transform: translate(-50%, -50%) scale(0.4); }
    .reveal .connector { opacity: 0; }
  }
  .leaving .card, .leaving .dot { transition: transform 420ms cubic-bezier(0.32, 0, 0.67, 0), opacity 420ms cubic-bezier(0.42, 0, 1, 1); pointer-events: none; }
  .leaving .connector { transition: opacity 420ms cubic-bezier(0.42, 0, 1, 1); pointer-events: none; }
  .leaving .card { transform: scale(0.05); opacity: 0; z-index: 0; }
  .leaving .dot { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
  .leaving .connector { opacity: 0; }
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
  .card.dimmed, .dot.dimmed, .connector.dimmed { opacity: 0.32; }
  .card.dimmed:hover, .card.dimmed:focus-within { opacity: 1; }
  .card.match:not(.selected) .title { text-decoration: underline; text-decoration-color: var(--context-accent); text-underline-offset: 4px; }
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
