<script lang="ts">
  import type { TimelineEvent } from './types'
  import type { RibbonSpan } from './ribbon'
  let { spans, spineX, viewTop, viewBottom, stops = [] }: {
    spans: RibbonSpan<TimelineEvent>[]
    /** Era hues down the spine, blended between era midpoints. */
    stops?: { y: number; hue: number }[]
    spineX: number
    viewTop: number
    viewBottom: number
  } = $props()
  const shown = $derived(spans.filter((s) => s.bottom >= viewTop && s.top <= viewBottom))
</script>

<svg class="ribbon" aria-hidden="true" width="24" height={Math.max(0, viewBottom - viewTop)}
  style:left="{spineX - 12}px" style:top="{viewTop}px" viewBox="-12 {viewTop} 24 {Math.max(1, viewBottom - viewTop)}">
  {#if stops.length}
    <defs>
      <linearGradient id="ribbon-ink" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={stops[0].y} y2={stops[stops.length - 1].y}>
        {#each stops as stop, i (i)}
          <stop offset={stops.length > 1 ? (stop.y - stops[0].y) / (stops[stops.length - 1].y - stops[0].y || 1) : 0} style:stop-color="oklch(var(--era-l) var(--era-c) {stop.hue})" />
        {/each}
      </linearGradient>
    </defs>
  {/if}
  {#each shown as span (span.top)}<path d={span.path} class:tinted={stops.length > 0} />{/each}
</svg>
<style>
  .ribbon { position: absolute; overflow: hidden; pointer-events: none; }
  path { fill: var(--ribbon-ink, var(--line-strong)); }
  path.tinted { fill: url(#ribbon-ink); opacity: var(--ribbon-opacity, 0.75); }
</style>
