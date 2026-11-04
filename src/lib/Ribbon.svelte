<script lang="ts">
  import type { TimelineEvent } from './types'
  import type { RibbonSpan } from './ribbon'
  let { spans, spineX, viewTop, viewBottom }: {
    spans: RibbonSpan<TimelineEvent>[]
    spineX: number
    viewTop: number
    viewBottom: number
  } = $props()
  const shown = $derived(spans.filter((s) => s.bottom >= viewTop && s.top <= viewBottom))
</script>

<svg class="ribbon" aria-hidden="true" width="24" height={Math.max(0, viewBottom - viewTop)}
  style:left="{spineX - 12}px" style:top="{viewTop}px" viewBox="-12 {viewTop} 24 {Math.max(1, viewBottom - viewTop)}">
  {#each shown as span (span.top)}<path d={span.path} />{/each}
</svg>
<style>
  .ribbon { position: absolute; overflow: hidden; pointer-events: none; }
  path { fill: var(--ribbon-ink, var(--line-strong)); }
</style>
