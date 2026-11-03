<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { TimelineData, TimelineEvent, RemovedEvent } from './lib/types'
  import { ERAS } from './lib/eras'
  import { buildScale } from './lib/scale'
  import { layout, priorityOrder, type Cluster } from './lib/layout'
  import { nowYear, toYear } from './lib/time'
  import { MAX_ZOOM, MIN_ZOOM, clampZoom, formatHash, parseHash } from './lib/url'
  import Timeline from './lib/Timeline.svelte'
  import DetailPanel from './lib/DetailPanel.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import { NO_FILTERS, isActive, matches, only, type Filters } from './lib/filters'
  import { applyPrefs, loadPrefs, prefersReducedMotion, savePrefs, type Prefs } from './lib/prefs'

  const CARD_HEIGHT = 84
  const ANCHOR_OFFSET = 18
  // Where each era's name sits in the strip at the top of its band (see DEFAULT_SCALE.headerPx).
  const LABEL_TOP = 14
  const ZOOM_STEP = 1.5

  // Raw: the data is never mutated, and a deep reactive proxy would tax every read of thousands of events.
  let data = $state.raw<TimelineData | null>(null)
  let error = $state<string | null>(null)
  let zoom = $state(1)
  let selectedId = $state<string | null>(null)
  let missingId = $state<string | null>(null)
  let width = $state(0)
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
  // events.json is sorted by date string, which puts "2024" after "2024-03-01".
  const events = $derived.by(() => {
    if (!data) return []
    const year = new Map(data.events.map((e) => [e, toYear(e.date)]))
    return [...data.events].sort((a, b) => year.get(b)! - year.get(a)!)
  })
  const byId = $derived(new Map(events.map((e) => [e.id, e])))
  const aliasTo = $derived(new Map(events.flatMap((e) => (e.aliases ?? []).map((a) => [a, e.id] as const))))
  const years = $derived(new Map(events.map((e) => [e.id, toYear(e.date)])))

  const wide = $derived(width >= 720)
  const spineX = $derived(wide ? Math.round(width / 2) : 20)
  const cardWidth = $derived(wide ? Math.min(340, spineX - 48) : Math.max(160, width - 56))

  const NONE = new Set<string>()
  const filtering = $derived(isActive(filters))
  const matchIds = $derived(new Set(events.filter((e) => matches(e, filters)).map((e) => e.id)))
  // Non-matching events fade; with no filters nothing is dimmed.
  // A lookup rather than a second set of thousands of ids.
  const dimIds = $derived(filtering ? { has: (id: string) => !matchIds.has(id) } : NONE)


  // Per-event arrays in the same order as `events`, so a zoom frame only does
  // array lookups. Everything here changes with the data or filters, not zoom.
  const yearList = $derived(events.map((e) => years.get(e.id)!))
  // Matching events win cards over faded ones.
  const scoreList = $derived(events.map((e) => e.score + (filtering && matchIds.has(e.id) ? 1000 : 0)))
  // Placement order depends on scores and date order only, so it is sorted once, not every frame.
  const priority = $derived(priorityOrder(events.map((e, i) => ({ item: e, y: -yearList[i], score: scoreList[i] }))))

  const scale = $derived(buildScale(ERAS, yearList, now, zoom))

  // Reused across zoom frames: each frame only rewrites `y`, instead of allocating
  // an object per event.
  const layoutItems = $derived(events.map((e, i) => ({ item: e, y: 0, score: scoreList[i] })))

  const arranged = $derived.by(() => {
    const s = scale
    const items = layoutItems
    const ys = yearList
    for (let i = 0; i < items.length; i++) items[i].y = s.y(ys[i])
    return layout(
      items,
      {
        order: priority,
        lanes: wide ? 2 : 1,
        cardHeight: CARD_HEIGHT,
        gap: 10,
        anchorOffset: ANCHOR_OFFSET,
        clusterPx: 28,
        // The selected event always gets a card, without moving any card that is already shown.
        pin: selectedId ? byId.get(selectedId) : undefined,
        // Keep cards off each era's name, which sits on the left of the spine on wide screens.
        reserved: scale.bands.map((b, i) => ({
          lane: wide ? 1 : 0,
          top: b.top - 2,
          bottom: b.top + LABEL_TOP + (labelHeights[i] || 36) + 4,
        })),
      },
    )
  })

  const selected = $derived(selectedId ? byId.get(selectedId) ?? null : null)
  const backlinks = $derived(
    selectedId ? events.filter((e) => e.related?.some((r) => r.id === selectedId)) : [],
  )
  const highlightIds = $derived(
    new Set<string>([...(selected?.related ?? []).map((r) => r.id), ...backlinks.map((e) => e.id)]),
  )

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
    scrollTo({ top: timelineTop() + scale.y(year) - innerHeight / 3, behavior })
  }

  function select(id: string | null, scroll = true) {
    selectedId = id
    missingId = null
    if (id && scroll) tick().then(() => scrollToEvent(id))
  }

  function expand(cluster: Cluster<TimelineEvent>) {
    const top = timelineTop()
    const anchor = Math.min(Math.max(top + cluster.y - scrollY, 80), innerHeight - 80)
    zoomBy(cluster.items.length > 3 ? ZOOM_STEP * ZOOM_STEP : ZOOM_STEP * 1.4, anchor)
  }

  function applyHash(hash = location.hash) {
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
      select(id, false)
      tick().then(() => scrollToEvent(id, 'instant'))
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
    fetch(`${import.meta.env.BASE_URL}data/events.json`)
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

<svelte:window {onkeydown} />

<header class="site-header">
  <p class="eyebrow"><span class="live" aria-hidden="true"></span>Open, sourced and community-reviewed</p>
  <h1><span class="grad">AI</span> Timeline</h1>
  <p class="help">
    Scroll back in time. Zoom with <kbd>Ctrl</kbd> + scroll, a pinch, or <kbd>+</kbd> <kbd>−</kbd>. Press <kbd>/</kbd> to
    search. Missing something?
    <a href="https://github.com/ChrisBuilds/ai-timeline/issues/new/choose">Suggest an event</a>.
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

<main bind:clientWidth={width} style:--toolbar-h="{toolbarHeight}px">
  {#if error}
    <p class="notice">{error}</p>
  {:else if !data}
    <p class="muted">Loading…</p>
  {:else}
    <div bind:this={timelineEl}>
      <Timeline
        {scale}
        placed={arranged.placed}
        clusters={arranged.clusters}
        {spineX}
        {cardWidth}
        cardHeight={CARD_HEIGHT}
        anchorOffset={ANCHOR_OFFSET}
        {selectedId}
        {highlightIds}
        {dimIds}
        matchIds={filtering ? matchIds : NONE}
        onselect={(id) => select(id === selectedId ? null : id, false)}
        onexpand={expand}
        labelTop={LABEL_TOP}
        {viewTop}
        {viewHeight}
        bind:labelHeights
      />
    </div>
  {/if}
</main>

{#if data}
  <div class="zoom" role="group" aria-label="Zoom">
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
    {byId}
    {backlinks}
    {filters}
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
