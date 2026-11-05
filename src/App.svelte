<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import type { EventDetails, TimelineData, TimelineEvent, RemovedEvent } from './lib/types'
  import { createDetailsLoader } from './lib/details'
  import { ERAS } from './lib/eras'
  import { buildGroups } from './lib/groups'
  import { animateSelection, captureSelection, selectionScroll } from './lib/selection-motion'
  import { buildScale, DEFAULT_SCALE } from './lib/scale'
  import { layout, priorityOrder, type Cluster } from './lib/layout'
  import { nowYear, toYear } from './lib/time'
  import { MAX_ZOOM, MIN_ZOOM, clampZoom, formatHash, parseHash } from './lib/url'
  import Timeline from './lib/Timeline.svelte'
  import DetailPanel from './lib/DetailPanel.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import { NO_FILTERS, isActive, matches, only, type Filters } from './lib/filters'
  import { applyPrefs, loadPrefs, prefersReducedMotion, savePrefs, type Prefs } from './lib/prefs'

  const CARD_HEIGHT = 100
  const ANCHOR_OFFSET = 18
  // Where each era's name sits in the strip at the top of its band (see DEFAULT_SCALE.headerPx).
  const LABEL_TOP = 14
  const ZOOM_STEP = 1.5

  // Raw: the data is never mutated, and a deep reactive proxy would tax every read of thousands of events.
  let data = $state.raw<TimelineData | null>(null)
  let error = $state<string | null>(null)
  let zoom = $state(1)
  let selectedId = $state<string | null>(null)
  let animatePanel = $state(false)
  let selectionRun = 0
  let cancelSelectionMotion = () => {}
  let missingId = $state<string | null>(null)
  let width = $state(0)
  let viewportWidth = $state(1280)
  let timelineEl: HTMLDivElement | undefined = $state()
  let toolbar: ReturnType<typeof Toolbar> | undefined = $state()
  let toolbarHeight = $state(0)
  let labelHeights = $state<number[]>([])
  // The part of the timeline on screen, in timeline pixels; the timeline only
  // renders what is near it.
  let viewTop = $state(0)
  let viewHeight = $state(800)

  function syncView() {
    viewTop = scrollY - timelineTop()
    viewHeight = innerHeight
  }
  let filters = $state<Filters>({ ...NO_FILTERS })
  let prefs = $state<Prefs>(loadPrefs())
  // The URL is only written once the link we were opened with has been applied.
  let ready = $state(false)

  const now = nowYear()
  const reducedMotion = $derived(prefersReducedMotion(prefs))

  function setPrefs(p: Prefs) {
    prefs = p
    applyPrefs(p)
    savePrefs(p)
  }

  // Newest first by exact time, so events are in timeline order (top to bottom).
  // index.json is sorted by date string, which puts "2024" after "2024-03-01".
  const events = $derived.by(() => {
    if (!data) return []
    const year = new Map(data.events.map((e) => [e, toYear(e.date)]))
    return [...data.events].sort((a, b) => year.get(b)! - year.get(a)! || a.id.localeCompare(b.id))
  })
  const byId = $derived(new Map(events.map((e) => [e.id, e])))
  const aliasTo = $derived(new Map(events.flatMap((e) => (e.aliases ?? []).map((a) => [a, e.id] as const))))
  const years = $derived(new Map(events.map((e) => [e.id, toYear(e.date)])))

  const wide = $derived(width >= 720)
  const spineX = $derived(wide ? 88 : 24)
  const cardWidth = $derived(Math.max(160, Math.min(680, width - spineX - (wide ? 56 : 40))))
  const selectedHeight = $derived(viewportWidth < 720 ? 188 : cardWidth < 340 ? 292 : 260)
  const eventHeight = (ev: TimelineEvent) =>
    ev.id === selectedId ? selectedHeight : highlightIds.has(ev.id) ? CARD_HEIGHT + 28 : CARD_HEIGHT

  const NONE = new Set<string>()
  const filtering = $derived(isActive(filters))
  const matchIds = $derived(new Set(events.filter((e) => matches(e, filters)).map((e) => e.id)))
  // Non-matching events fade; with no filters nothing is dimmed.
  // A lookup rather than a second set of thousands of ids.
  const dimIds = $derived(filtering ? { has: (id: string) => !matchIds.has(id) } : NONE)


  // Per-event arrays in the same order as `events`, so a zoom frame only does
  // array lookups. Everything here changes with the data or filters, not zoom.
  const yearList = $derived(events.map((e) => years.get(e.id)!))
  const eraIndexes = $derived(new Map(events.map((event, i) => [event,
    ERAS.findIndex((era, index) => yearList[i] >= era.start && (index === 0 || yearList[i] < era.end!)),
  ])))
  // Matching events win cards over faded ones.
  const scoreList = $derived(events.map((e) => e.score + (filtering && matchIds.has(e.id) ? 1000 : 0)))
  // Placement order depends on scores and date order only, so it is sorted once, not every frame.
  const priority = $derived(priorityOrder(events.map((e, i) => ({ item: e, y: -yearList[i], score: scoreList[i] }))))

  // Required indexes depend on data and filters, not on zoom frames.
  const overviewOrder = $derived(Int32Array.from(events.flatMap((e, i) =>
    e.overview && (!filtering || matchIds.has(e.id)) ? [i] : [])))

  // Partial dates and today's midday anchor can lie ahead of the current instant.
  // Count them at the same newest marker that TimeScale.y already clamps them to.
  const scaleYears = $derived(yearList.map((year) => Math.min(year, now)))
  const overviewByEra = $derived(new Map(ERAS.map((era) => [era.id,
    events.filter((e) => e.overview && years.get(e.id)! >= era.start && years.get(e.id)! < (era.end ?? now + 1)),
  ])))
  const baseScale = $derived(buildScale(ERAS, scaleYears, now, zoom, {
    ...DEFAULT_SCALE,
    headerPx: Math.max(72, LABEL_TOP + Math.max(0, ...labelHeights) + ANCHOR_OFFSET + 12),
    footerPx: (era, time) => {
      const year = selectedId ? years.get(selectedId) : undefined
      const normal = (year !== undefined && year >= era.start && year < (era.end ?? now + 1) ? selectedHeight : CARD_HEIGHT + 28) - ANCHOR_OFFSET + 12
      // Simulate only mandatory cards to reserve their actual overflow. This
      // handles same-date milestones without large empty tails in quiet eras.
      let bottom = time.top + LABEL_TOP + (labelHeights[ERAS.indexOf(era)] || 36) + 4
      for (const event of overviewByEra.get(era.id) ?? []) {
        const top = Math.max(time.y(years.get(event.id)!) - ANCHOR_OFFSET, bottom + 10)
        bottom = top + eventHeight(event) + 10
      }
      return Math.max(normal, bottom + 10 - time.end)
    },
  }))

  // Reused across zoom frames: each frame only rewrites `y`, instead of allocating
  // an object per event.
  const layoutItems = $derived(events.map((e, i) => ({ item: e, y: 0, score: scoreList[i] })))

  const arranged = $derived.by(() => {
    const s = baseScale
    const items = layoutItems
    const ys = yearList
    const yearById = years
    const eraByEvent = eraIndexes
    for (let i = 0; i < items.length; i++) items[i].y = s.y(ys[i])
    return layout(
      items,
      {
        order: priority,
        requiredOrder: overviewOrder,
        lanes: 1,
        cardHeight: CARD_HEIGHT,
        heightFor: eventHeight,
        gap: 10,
        anchorOffset: ANCHOR_OFFSET,
        // Fill the actual display budget between milestones in date order.
        fillSpace: true,
        boundsFor: (event) => {
          const year = Math.min(yearById.get(event.id)!, now)
          const band = s.bands[eraByEvent.get(event)!]
          const segment = band.segments.find((part) => !part.gap &&
            year <= part.from && year >= part.to)
          return {
            top: segment?.top ?? band.top,
            bottom: segment && segment !== band.segments.at(-1)
              ? segment.top + segment.height : band.top + band.height,
          }
        },
        clusterPx: 28,
        // The selected event always gets a card, without moving any card that is already shown.
        pin: selectedId ? byId.get(selectedId) : undefined,
        // Keep entries off the full-width era heading.
        reserved: baseScale.bands.map((b, i) => ({
          lane: 0,
          top: b.top - 2,
          bottom: b.top + LABEL_TOP + (labelHeights[i] || 36) + 4,
        })),
      },
    )
  })

  const grouped = $derived(buildGroups(baseScale, arranged.placed, arranged.clusters, years, eventHeight))
  const scale = $derived(grouped.scale)

  const selected = $derived(selectedId ? byId.get(selectedId) ?? null : null)
  const backlinks = $derived(
    selectedId ? events.filter((e) => e.related?.some((r) => r.id === selectedId)) : [],
  )
  const highlightIds = $derived(
    new Set<string>([...(selected?.related ?? []).map((r) => r.id), ...backlinks.map((e) => e.id)]),
  )

  const relationLabels = $derived.by(() => {
    const labels = new Map<string, string[]>()
    const add = (id: string, label: string) => labels.set(id, [...(labels.get(id) ?? []), label])
    for (const link of selected?.related ?? []) {
      add(link.id, { builds_on: 'Foundation for selected event', responds_to: 'Prompted selected event', supersedes: 'Predecessor' }[link.relation])
    }
    for (const ev of backlinks) for (const link of ev.related ?? []) if (link.id === selectedId) {
      add(ev.id, { builds_on: 'Builds on selected event', responds_to: 'Responds to selected event', supersedes: 'Successor' }[link.relation])
    }
    return labels
  })

  // Descriptions, sources and artifacts are fetched when an event is opened.
  const loadDetails = createDetailsLoader(import.meta.env.BASE_URL)
  let details = $state.raw<{ id: string; value?: EventDetails; error?: string } | null>(null)
  let detailsAttempt = $state(0)
  $effect(() => {
    const id = selected?.id
    void detailsAttempt
    if (!id) {
      details = null
      return
    }
    let current = true
    details = { id }
    loadDetails(id).then(
      (value) => current && (details = { id, value }),
      (e: Error) => current && (details = { id, error: e.message }),
    )
    return () => (current = false)
  })
  /** Starts loading an event's details before it is opened, on hover or focus. */
  function preview(id: string) {
    loadDetails(id).catch(() => {})
  }

  const removedNote = $derived.by((): RemovedEvent | null => {
    if (!missingId || !data) return null
    return data.removed.find((r) => r.id === missingId) ?? null
  })

  // Keep the URL in step with the view, without adding history entries.
  $effect(() => {
    if (!ready) return
    // Keep an unknown or removed id in the URL so a refresh or a shared link still explains it.
    const hash = formatHash({ event: selectedId ?? missingId, zoom, filters })
    // Wait for zooming to settle: browsers limit how often the URL can change.
    const t = setTimeout(() => {
      if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search)
    }, 200)
    return () => clearTimeout(t)
  })

  function timelineTop(): number {
    return (timelineEl?.getBoundingClientRect().top ?? 0) + scrollY
  }

  /** Sets zoom at once, keeping the moment under `anchorClientY` in place on screen. */
  async function applyZoom(next: number, anchorClientY: number) {
    if (next === zoom) return
    const top = timelineTop()
    const year = scale.year(scrollY + anchorClientY - top)
    zoom = next
    await tick()
    scrollTo({ top: scale.y(year) + top - anchorClientY, behavior: 'instant' })
    // Update the rendered window now rather than on the scroll event, so the new view never paints empty.
    syncView()
  }

  // Zoom glides toward its target a little each frame, so events slide into
  // place instead of jumping. New input moves the target, so quick wheel
  // clicks or key presses blend into one smooth zoom.
  let zoomTarget = 1
  let zoomAnchor = 0
  let zoomFrame: number | null = null
  let lastFrame = 0

  /** Changes zoom while keeping the moment under `anchorClientY` in place on screen. */
  function setZoom(next: number, anchorClientY = innerHeight / 2, smooth = !reducedMotion) {
    cancelSelectionMotion()
    zoomTarget = clampZoom(next)
    zoomAnchor = anchorClientY
    if (!smooth) {
      stopZoomAnimation()
      applyZoom(zoomTarget, anchorClientY)
      return
    }
    if (zoomFrame === null) {
      lastFrame = performance.now()
      zoomFrame = requestAnimationFrame(zoomStep)
    }
  }

  /** Multiplies the zoom being headed for, not the one on screen mid-glide. */
  function zoomBy(factor: number, anchorClientY?: number, smooth?: boolean) {
    setZoom((zoomFrame === null ? zoom : zoomTarget) * factor, anchorClientY, smooth)
  }

  function stopZoomAnimation() {
    if (zoomFrame !== null) cancelAnimationFrame(zoomFrame)
    zoomFrame = null
  }

  async function zoomStep(now: number) {
    const dt = Math.min(64, now - lastFrame)
    lastFrame = now
    // Ease out in log space, so zooming in and out feel the same.
    const from = Math.log(zoom)
    const to = Math.log(zoomTarget)
    const close = Math.abs(to - from) < 0.003
    const next = close ? zoomTarget : Math.exp(from + (to - from) * (1 - Math.exp(-dt / 90)))
    await applyZoom(next, zoomAnchor)
    zoomFrame = close ? null : requestAnimationFrame(zoomStep)
  }

  function scrollToEvent(id: string, behavior?: ScrollBehavior) {
    behavior ??= reducedMotion ? 'instant' : 'smooth'
    const year = years.get(id)
    if (year === undefined) return
    // A zoom glide re-anchors the scroll every frame, which would cancel this scroll.
    stopZoomAnimation()
    const cardY = grouped.placed.find((p) => p.item.id === id)?.top
    scrollTo({ top: timelineTop() + (cardY === undefined ? scale.y(year) : cardY + ANCHOR_OFFSET) - (innerWidth < 720 ? toolbarHeight + 40 : innerHeight / 3), behavior })
  }

  async function select(id: string | null, scroll = true, animate = ready && !reducedMotion) {
    if (id === selectedId && (id === null || !scroll)) {
      missingId = null
      return
    }
    const run = ++selectionRun
    const root = timelineEl?.querySelector<HTMLElement>('.timeline')
    // Capture before cancelling: an interrupted transition starts where it is on screen.
    const before = animate && root ? captureSelection(root) : null
    cancelSelectionMotion()
    stopZoomAnimation()
    animatePanel = animate
    selectedId = id
    missingId = null
    await tick()
    if (run !== selectionRun) return
    // ResizeObserver bindings arrive on the next frame. Flush panel-induced
    // width and heading changes now so FLIP measures the final layout before paint.
    if (timelineEl && timelineEl.clientWidth !== width) {
      width = timelineEl.clientWidth
      await tick()
    }
    const headings = [...(timelineEl?.querySelectorAll<HTMLElement>('.era-label') ?? [])].map((el) => el.clientHeight)
    if (headings.length !== labelHeights.length || headings.some((height, i) => height !== labelHeights[i])) {
      labelHeights = headings
      await tick()
    }
    if (run !== selectionRun) return
    if (id && scroll) scrollToEvent(id, 'instant')
    else if (id && innerWidth < 720) {
      const card = document.getElementById(id)?.getBoundingClientRect()
      const toolbarBottom = document.querySelector('.toolbar-wrap')?.getBoundingClientRect().bottom ?? 0
      // offsetHeight ignores the sheet's entrance transform: fit the final resting position.
      const sheetHeight = document.querySelector<HTMLElement>('.panel')?.offsetHeight ?? innerHeight * 0.55
      if (card) scrollBy({
        top: selectionScroll(card.top, card.height, Math.max(toolbarBottom + 16, 32), innerHeight - sheetHeight - 16),
        behavior: 'instant',
      })
    }
    syncView()
    await tick()
    if (run !== selectionRun) return
    if (before && root?.isConnected) cancelSelectionMotion = animateSelection(root, before)
  }

  function expand(cluster: Cluster<TimelineEvent>) {
    const top = timelineTop()
    const anchor = Math.min(Math.max(top + cluster.y - scrollY, 80), innerHeight - 80)
    zoomBy(cluster.items.length > 3 ? ZOOM_STEP * ZOOM_STEP : ZOOM_STEP * 1.4, anchor)
  }

  function applyHash(hash = location.hash) {
    cancelSelectionMotion()
    ++selectionRun
    const state = parseHash(hash)
    stopZoomAnimation()
    zoom = zoomTarget = state.zoom
    filters = state.filters
    if (!state.event) {
      selectedId = null
      missingId = null
      return
    }
    const id = aliasTo.get(state.event) ?? state.event
    if (byId.has(id)) {
      select(id, true, false)
    } else {
      selectedId = null
      missingId = state.event
    }
  }

  // Every event, newest first, or only the matches while a filter is on. Stepping
  // can reach events hidden at this zoom, because the selected event always gets a card.
  const ordered = $derived(
    events.filter((e) => !filtering || matchIds.has(e.id)).sort((a, b) => years.get(b.id)! - years.get(a.id)!),
  )

  function step(dir: 1 | -1) {
    if (!ordered.length) return
    const i = ordered.findIndex((e) => e.id === selectedId)
    const next = i === -1 ? (dir === 1 ? 0 : ordered.length - 1) : Math.min(ordered.length - 1, Math.max(0, i + dir))
    select(ordered[next].id)
  }

  function onkeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (e.metaKey || e.ctrlKey || e.altKey || target.closest('input, textarea, select')) return
    if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP)
    else if (e.key === '-' || e.key === '_') zoomBy(1 / ZOOM_STEP)
    else if (e.key === '0') setZoom(1)
    else if (e.key === 'j') step(1)
    else if (e.key === 'k') step(-1)
    else if (e.key === 'Escape') select(null)
    else if (e.key === '/') toolbar?.focusSearch()
    else return
    e.preventDefault()
  }

  // A viewport change can swap the side panel for a sheet; keep the selection in view.
  $effect(() => {
    void viewportWidth
    ++selectionRun
    cancelSelectionMotion()
    untrack(() => {
      const id = selectedId
      if (id) tick().then(() => scrollToEvent(id, 'instant'))
    })
  })

  // Ctrl or Cmd + wheel, which is also what trackpad pinches send.
  function onwheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    // A mouse wheel click is a large delta and a trackpad pinch many small ones;
    // capping each step keeps a wheel click from leaping.
    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1
    const delta = Math.max(-60, Math.min(60, e.deltaY * lines))
    zoomBy(Math.exp(-delta * 0.006), e.clientY)
  }

  // Two-finger pinch on touch screens.
  let pinch: { dist: number; zoom: number } | null = null
  function touchDist(t: TouchList) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  }
  function ontouchstart(e: TouchEvent) {
    if (e.touches.length === 2) pinch = { dist: touchDist(e.touches), zoom }
  }
  function ontouchmove(e: TouchEvent) {
    if (!pinch || e.touches.length !== 2) return
    e.preventDefault()
    const mid = (e.touches[0].clientY + e.touches[1].clientY) / 2
    // Fingers are followed directly; easing here would lag behind them.
    setZoom(pinch.zoom * (touchDist(e.touches) / pinch.dist), mid, false)
  }
  function ontouchend(e: TouchEvent) {
    if (e.touches.length < 2) pinch = null
  }

  onMount(() => {
    const initialHash = location.hash
    fetch(`${import.meta.env.BASE_URL}data/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(async (d: TimelineData) => {
        data = d
        await tick()
        applyHash(initialHash)
        syncView()
        ready = true
      })
      .catch((e) => (error = `Could not load events: ${e.message}`))

    const onhashchange = () => applyHash()
    addEventListener('hashchange', onhashchange)
    addEventListener('wheel', onwheel, { passive: false })
    addEventListener('scroll', syncView, { passive: true })
    addEventListener('resize', syncView, { passive: true })
    return () => {
      cancelSelectionMotion()
      removeEventListener('hashchange', onhashchange)
      removeEventListener('wheel', onwheel)
      removeEventListener('scroll', syncView)
      removeEventListener('resize', syncView)
    }
  })

  $effect(() => {
    const el = timelineEl
    if (!el) return
    el.addEventListener('touchstart', ontouchstart, { passive: true })
    el.addEventListener('touchmove', ontouchmove, { passive: false })
    el.addEventListener('touchend', ontouchend)
    return () => {
      el.removeEventListener('touchstart', ontouchstart)
      el.removeEventListener('touchmove', ontouchmove)
      el.removeEventListener('touchend', ontouchend)
    }
  })
</script>

<svelte:window {onkeydown} bind:innerWidth={viewportWidth} />

<header class="site-header">
  <p class="eyebrow"><span class="live" aria-hidden="true"></span>Open, sourced and community-reviewed</p>
  <h1><span class="grad">AI</span> Timeline</h1>
  <p class="help">
    Scroll back in time. Zoom with <kbd>Ctrl</kbd> + scroll, a pinch, or <kbd>+</kbd> <kbd>−</kbd>. Press <kbd>/</kbd> to
    search. Missing something?
    <a href="https://github.com/ChrisBuilds/ai-timeline/issues/new/choose">Suggest an event</a>.
    <span class="ribbon-help">Open a group to browse the events hidden at this zoom.</span>
  </p>
</header>

{#if removedNote}
  <aside class="notice" role="status">
    This event was removed ({removedNote.reason}).
    {#if removedNote.duplicate_of}
      It was merged into <a href={`#e=${removedNote.duplicate_of}`}>another event</a>.
    {/if}
    {#if removedNote.note}{removedNote.note}{/if}
    <button class="dismiss" onclick={() => (missingId = null)}>Dismiss</button>
  </aside>
{:else if missingId && data}
  <aside class="notice" role="status">
    There's no event called “{missingId}” on the timeline.
    <button class="dismiss" onclick={() => (missingId = null)}>Dismiss</button>
  </aside>
{/if}

{#if data}
  <div class="toolbar-wrap" bind:clientHeight={toolbarHeight}>
    <Toolbar
      bind:this={toolbar}
      {events}
      {filters}
      matching={matchIds.size}
      {prefs}
      onpick={(id) => select(id)}
      onfilters={(f) => (filters = f)}
      onprefs={setPrefs}
    />
  </div>
{/if}

<main class:has-selection={selected !== null} bind:clientWidth={width} style:--toolbar-h="{toolbarHeight}px">
  {#if error}
    <p class="notice">{error}</p>
  {:else if !data}
    <p class="muted">Loading…</p>
  {:else}
    <div bind:this={timelineEl}>
      <Timeline
        {scale}
        placed={grouped.placed}
        groups={grouped.groups}
        eraStats={grouped.stats}
        hidden={grouped.hidden}
        ribbonScale={baseScale}
        ribbonProject={grouped.project}
        {spineX}
        {cardWidth}
        {selectedId}
        {highlightIds}
        {eventHeight}
        {relationLabels}
        {dimIds}
        matchIds={filtering ? matchIds : NONE}
        onselect={(id, scroll = false) => select(id, scroll)}
        onexpand={expand}
        onpreview={preview}
        labelTop={LABEL_TOP}
        {viewTop}
        {viewHeight}
        bind:labelHeights
      />
    </div>
  {/if}
</main>

{#if data}
  <div class="zoom" class:has-selection={selected !== null} role="group" aria-label="Zoom">
    <button onclick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
    <span class="zoom-level">{Math.round(zoom * 100)}%</span>
    <button onclick={() => zoomBy(1 / ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
    {#if Math.abs(zoom - 1) > 0.01}
      <button class="reset" onclick={() => setZoom(1)} aria-label="Reset zoom">1×</button>
    {/if}
  </div>
{/if}

{#if selected}
  <DetailPanel
    event={selected}
    reducedMotion={reducedMotion || !animatePanel}
    {byId}
    {backlinks}
    {filters}
    details={details?.id === selected.id ? (details.value ?? null) : null}
    detailsError={details?.id === selected.id ? (details.error ?? null) : null}
    onretry={() => detailsAttempt++}
    onselect={(id) => select(id)}
    onclose={() => select(null, false)}
    onfilter={(field, value) => (filters = only(filters, field, value))}
  />
{/if}

<footer class="muted">
  Data and code on <a href="https://github.com/ChrisBuilds/ai-timeline">GitHub</a>.
  {#if data}{data.events.length} events, updated {data.generated.slice(0, 10)}.{/if}
  Keys: <kbd>j</kbd>/<kbd>k</kbd> next and previous, <kbd>+</kbd>/<kbd>−</kbd> zoom, <kbd>0</kbd> reset,
  <kbd>/</kbd> search, <kbd>Esc</kbd> close.
</footer>
