<script lang="ts">
  import type { TimelineEvent } from './types'
  import type { RibbonSpan, RibbonBin } from './ribbon'
  import { periodLabel } from './ribbon'
  let { spans, spineX, viewTop, viewBottom, onactivate, activeTop }: {
    spans: RibbonSpan<TimelineEvent>[]
    spineX: number
    viewTop: number
    viewBottom: number
    onactivate: (bin: RibbonBin<TimelineEvent>) => void
    activeTop: number | null
  } = $props()
  const shown = $derived(spans.filter((s) => s.bottom >= viewTop && s.top <= viewBottom))
</script>

<svg class="ribbon" aria-hidden="true" width="24" height={Math.max(0, viewBottom - viewTop)}
  style:left="{spineX - 12}px" style:top="{viewTop}px" viewBox="-12 {viewTop} 24 {Math.max(1, viewBottom - viewTop)}">
  {#each shown as span (span.top)}<path d={span.path} />{/each}
</svg>
{#each shown as span (span.top)}
  {#each span.bins.filter((b) => b.items.length && b.top + b.height >= viewTop && b.top <= viewBottom) as bin (bin.top)}
    <button class="density-target" class:active={activeTop === bin.top}
      style:left="{spineX - 22}px" style:top="{bin.top}px" style:height="{bin.height}px"
      aria-label="{periodLabel(bin)}: {bin.items.length} hidden events. Explore this period."
      aria-expanded={activeTop === bin.top} onclick={() => onactivate(bin)}>
      <span class="hint">{periodLabel(bin)}<strong>+{bin.items.length} hidden</strong></span>
    </button>
  {/each}
{/each}

<style>
  .ribbon { position: absolute; overflow: hidden; pointer-events: none; }
  path { fill: var(--ribbon-ink, var(--line-strong)); }
  .density-target { position: absolute; width: 44px; padding: 0; border: 0; background: transparent; cursor: zoom-in; z-index: 2; }
  .density-target:focus-visible { outline: 2px solid var(--context-accent); outline-offset: 1px; border-radius: 6px; }
  .hint { position: absolute; pointer-events: none; top: 50%; left: 42px; transform: translateY(-50%); background: var(--surface); border: 1px solid var(--line); color: var(--text); padding: 8px 12px; white-space: nowrap; font-size: 0.72rem; text-align: left; box-shadow: var(--shadow-sm); border-radius: 6px; opacity: 0; }
  .hint strong { display: block; margin-top: 2px; font-weight: 600; }
  .density-target:hover .hint, .density-target:focus-visible .hint { opacity: 1; }
  .density-target.active .hint { opacity: 0; }
</style>
